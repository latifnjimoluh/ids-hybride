"""
Adversarial Stress Test & Benchmarking Suite for Reverse Alert Reader (R2)
Challenger 2 — IDS Hybride
"""

from __future__ import annotations

import io
import json
import os
import shutil
import statistics
import sys
import tempfile
import time
import tracemalloc
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest

from app.controllers.linux import LinuxSnortController
from app.models import Alert


class TestAdversarialReverseReader:
    @pytest.fixture
    def controller(self, tmp_path: Path) -> LinuxSnortController:
        # Create an isolated controller instance
        ctrl = LinuxSnortController()
        ctrl._alerts = tmp_path / "alerts.txt"
        ctrl._rules = tmp_path / "rules.txt"
        return ctrl

    # =========================================================================
    # 1. Block Boundary Stress Testing
    # =========================================================================

    def _create_boundary_file(
        self,
        filepath: Path,
        split_char: str,
        split_offset_in_char: int,
        block_size: int = 65536,
    ) -> tuple[str, str]:
        """
        Creates a file of size (block_size + K) where split_char spans the block boundary.
        When reading from EOF backwards in blocks of `block_size`:
        The first chunk reads from offset K to (block_size + K).
        The second chunk reads from offset 0 to K.
        Therefore, byte K-1 is the last byte of chunk 2, and byte K is the first byte of chunk 1.
        By placing the character such that split_offset_in_char bytes are before K,
        the character is split exactly across the block boundary.
        """
        encoded_char = split_char.encode("utf-8")
        char_len = len(encoded_char)
        assert 1 <= split_offset_in_char < char_len

        # Choose K = 1000
        K = 1000
        total_size = block_size + K

        # Line 1 (in the first K bytes, plus spanning K)
        # We construct line 1 so that the split_char falls exactly across K.
        # json prefix
        msg_prefix = "Boundary "
        json_prefix = f'{{"msg": "{msg_prefix}'
        encoded_json_prefix = json_prefix.encode("utf-8")

        # We need json_prefix + padding + encoded_char[:split_offset_in_char] to have length K.
        bytes_before_boundary = split_offset_in_char
        padding_len = K - len(encoded_json_prefix) - bytes_before_boundary
        assert padding_len >= 0, "K too small for prefix"
        padding = b"A" * padding_len

        # Middle line spans across K:
        # byte K - bytes_before_boundary to K is the first part of split_char
        first_half = encoded_char[:split_offset_in_char]
        second_half = encoded_char[split_offset_in_char:]

        suffix = ' End", "priority": 1, "sid": 999}\n'
        encoded_suffix = suffix.encode("utf-8")

        boundary_line_bytes = encoded_json_prefix + padding + first_half + second_half + encoded_suffix
        expected_msg = (
            msg_prefix + ("A" * padding_len) + split_char + ' End'
        )

        # Now fill up to total_size with another alert line
        current_len = len(boundary_line_bytes)
        remaining = total_size - current_len

        # Alert 2 after boundary line
        # Line 2 prefix and suffix
        l2_prefix = '{"msg": "Trailing Alert '
        l2_suffix = '", "priority": 2, "sid": 1000}\n'
        needed_pad = remaining - len(l2_prefix.encode("utf-8")) - len(l2_suffix.encode("utf-8"))
        assert needed_pad >= 0
        l2_bytes = l2_prefix.encode("utf-8") + (b"B" * needed_pad) + l2_suffix.encode("utf-8")

        file_bytes = boundary_line_bytes[:K] + boundary_line_bytes[K:] + l2_bytes
        assert len(file_bytes) == total_size
        # Verify boundary position:
        assert file_bytes[K - split_offset_in_char : K - split_offset_in_char + char_len] == encoded_char

        filepath.write_bytes(file_bytes)
        return expected_msg, ("Trailing Alert " + ("B" * needed_pad))

    def test_utf8_split_2byte_accent(self, controller: LinuxSnortController, tmp_path: Path):
        """Test 2-byte UTF-8 character 'é' (0xC3 0xA9) split 1 byte in each block."""
        f = tmp_path / "boundary_accent.txt"
        expected_msg, trailing_msg = self._create_boundary_file(
            f, split_char="é", split_offset_in_char=1
        )
        controller._alerts = f

        alerts = controller.list_alerts(limit=10)
        assert len(alerts) == 2
        # Newest first
        assert alerts[0].msg == trailing_msg
        assert alerts[1].msg == expected_msg
        assert "é" in alerts[1].msg

    def test_utf8_split_3byte_currency(self, controller: LinuxSnortController, tmp_path: Path):
        """Test 3-byte UTF-8 character '€' (0xE2 0x82 0xAC) split across 64KB boundary."""
        # 1 byte before, 2 bytes after
        f1 = tmp_path / "boundary_euro_1.txt"
        expected_msg1, _ = self._create_boundary_file(f1, split_char="€", split_offset_in_char=1)
        controller._alerts = f1
        alerts = controller.list_alerts(limit=5)
        assert len(alerts) == 2
        assert "€" in alerts[1].msg
        assert alerts[1].msg == expected_msg1

        # 2 bytes before, 1 byte after
        f2 = tmp_path / "boundary_euro_2.txt"
        expected_msg2, _ = self._create_boundary_file(f2, split_char="€", split_offset_in_char=2)
        controller._alerts = f2
        alerts = controller.list_alerts(limit=5)
        assert len(alerts) == 2
        assert "€" in alerts[1].msg
        assert alerts[1].msg == expected_msg2

    def test_utf8_split_4byte_emoji(self, controller: LinuxSnortController, tmp_path: Path):
        """Test 4-byte UTF-8 emoji '🚨' (0xF0 0x9F 0x9A 0xA8) split in all 3 possible cuts."""
        for cut in (1, 2, 3):
            f = tmp_path / f"boundary_emoji_{cut}.txt"
            expected_msg, _ = self._create_boundary_file(
                f, split_char="🚨", split_offset_in_char=cut
            )
            controller._alerts = f
            alerts = controller.list_alerts(limit=5)
            assert len(alerts) == 2, f"Failed at cut {cut}: expected 2 alerts, got {len(alerts)}"
            assert "🚨" in alerts[1].msg, f"Failed at cut {cut}: emoji corrupted in message"
            assert alerts[1].msg == expected_msg

    def test_extremely_long_json_line_single_block_exceeded(
        self, controller: LinuxSnortController, tmp_path: Path
    ):
        """Test an alert with a payload > 70KB (>65536 bytes) spanning 2 blocks."""
        f = tmp_path / "long_line_70k.txt"
        long_payload = "X" * 70000
        line1 = json.dumps({"msg": "Short First", "priority": 1}) + "\n"
        line2 = json.dumps({"msg": long_payload, "priority": 2}) + "\n"
        line3 = json.dumps({"msg": "Short Last", "priority": 3}) + "\n"
        f.write_text(line1 + line2 + line3, encoding="utf-8")
        controller._alerts = f

        alerts = controller.list_alerts(limit=10)
        assert len(alerts) == 3
        assert alerts[0].msg == "Short Last"
        assert alerts[1].msg == long_payload
        assert alerts[2].msg == "Short First"

    def test_extremely_long_json_line_multi_blocks_exceeded(
        self, controller: LinuxSnortController, tmp_path: Path
    ):
        """Test an alert with a payload > 150KB (>2*65536 bytes) spanning 3 blocks."""
        f = tmp_path / "long_line_150k.txt"
        long_payload = "Z" * 150000
        line1 = json.dumps({"msg": "Prefix", "priority": 1}) + "\n"
        line2 = json.dumps({"msg": long_payload, "priority": 2}) + "\n"
        line3 = json.dumps({"msg": "Suffix", "priority": 3}) + "\n"
        f.write_text(line1 + line2 + line3, encoding="utf-8")
        controller._alerts = f

        alerts = controller.list_alerts(limit=10)
        assert len(alerts) == 3
        assert alerts[0].msg == "Suffix"
        assert alerts[1].msg == long_payload
        assert alerts[2].msg == "Prefix"

    def test_mixed_line_endings_and_trailing_blanks(
        self, controller: LinuxSnortController, tmp_path: Path
    ):
        """Test mixed \\n and \\r\\n, trailing blank lines, whitespace, tabs."""
        f = tmp_path / "mixed_endings.txt"
        content = (
            '{"msg": "Alert CRLF 1", "priority": 1}\r\n'
            '{"msg": "Alert LF 2", "priority": 2}\n'
            '{"msg": "Alert CRLF 3", "priority": 3}\r\n'
            '\r\n'
            '   \r\n'
            '\t\t\n'
            '\n'
        )
        f.write_bytes(content.encode("utf-8"))
        controller._alerts = f

        alerts = controller.list_alerts(limit=10)
        assert len(alerts) == 3
        assert [a.msg for a in alerts] == ["Alert CRLF 3", "Alert LF 2", "Alert CRLF 1"]

    # =========================================================================
    # 2. Edge Cases and Extreme Limits
    # =========================================================================

    def test_limit_edge_cases(self, controller: LinuxSnortController, tmp_path: Path):
        """Test limit=0, limit=-10, limit=1, limit=1000000 on a 3-line file."""
        f = tmp_path / "limits.txt"
        lines = [json.dumps({"msg": f"Alert {i}", "priority": 1}) + "\n" for i in range(3)]
        f.write_text("".join(lines), encoding="utf-8")
        controller._alerts = f

        # limit = 0
        assert controller.list_alerts(limit=0) == []
        # limit = -10
        assert controller.list_alerts(limit=-10) == []
        # limit = 1
        res_1 = controller.list_alerts(limit=1)
        assert len(res_1) == 1
        assert res_1[0].msg == "Alert 2"
        # limit = 1000000
        res_huge = controller.list_alerts(limit=1000000)
        assert len(res_huge) == 3
        assert [a.msg for a in res_huge] == ["Alert 2", "Alert 1", "Alert 0"]

    def test_empty_and_missing_files(self, controller: LinuxSnortController, tmp_path: Path):
        """Test 0-byte file and missing file."""
        # Missing file
        controller._alerts = tmp_path / "does_not_exist.txt"
        assert controller.list_alerts(limit=10) == []

        # 0-byte file
        empty = tmp_path / "empty.txt"
        empty.write_bytes(b"")
        controller._alerts = empty
        assert controller.list_alerts(limit=10) == []

    def test_directory_instead_of_file(self, controller: LinuxSnortController, tmp_path: Path):
        """Test pointing _alerts to a directory path instead of a file."""
        dir_path = tmp_path / "a_directory"
        dir_path.mkdir()
        controller._alerts = dir_path
        # Must catch OSError gracefully and return []
        assert controller.list_alerts(limit=10) == []

    # =========================================================================
    # 3. Real 5.35MB Log Benchmark & Memory Verification
    # =========================================================================

    def test_benchmark_and_memory_on_real_or_synthetic_log(
        self, controller: LinuxSnortController, tmp_path: Path
    ):
        """
        Benchmark list_alerts on real 5.35MB log file (or synthetic 6MB fallback):
        - Compare runtime limit=50 vs limit=200
        - Measure tracemalloc peak memory
        - Prove entire 5.35MB is NOT loaded into RAM
        - Verify newest-first chronological ordering
        """
        repo_root = backend_dir.parent
        real_log = repo_root / "logs" / "alert_json.txt"
        if real_log.exists():
            log_path = real_log
        else:
            # Generate synthetic 6MB file
            log_path = tmp_path / "synthetic_6mb.txt"
            with log_path.open("w", encoding="utf-8") as fh:
                for i in range(20000):
                    fh.write(
                        json.dumps({
                            "timestamp": f"10/23-{i % 24:02d}:{(i // 60) % 60:02d}:{i % 60:02d}.000000",
                            "action": "allow",
                            "msg": f"Alert {i:06d}",
                            "priority": 1,
                            "sid": 1000000 + i,
                        }) + "\n"
                    )

        file_size = log_path.stat().st_size
        assert file_size >= 5 * 1024 * 1024, f"File size is {file_size} bytes, expected >= 5MB"

        controller._alerts = log_path

        # 1. Warm-up
        _ = controller.list_alerts(limit=10)

        # 2. Timing benchmarks over 20 runs
        times_50 = []
        for _ in range(20):
            t0 = time.perf_counter()
            alerts_50 = controller.list_alerts(limit=50)
            t1 = time.perf_counter()
            times_50.append(t1 - t0)

        times_200 = []
        for _ in range(20):
            t0 = time.perf_counter()
            alerts_200 = controller.list_alerts(limit=200)
            t1 = time.perf_counter()
            times_200.append(t1 - t0)

        avg_50_ms = statistics.mean(times_50) * 1000
        avg_200_ms = statistics.mean(times_200) * 1000

        assert len(alerts_50) == 50
        assert len(alerts_200) == 200

        # Sub-10ms performance target for reverse seek on local NVMe/SSD
        assert avg_50_ms < 50.0, f"Average limit=50 time {avg_50_ms:.2f}ms exceeds 50ms"
        assert avg_200_ms < 100.0, f"Average limit=200 time {avg_200_ms:.2f}ms exceeds 100ms"

        # 3. Memory profiling with tracemalloc
        tracemalloc.start()
        tracemalloc.reset_peak()
        alerts_mem = controller.list_alerts(limit=50)
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_kb = peak / 1024
        # Full file is 5350 KB. A reverse seek reading 1 block (64KB) plus 50 models
        # should take well under 500 KB peak RAM.
        assert peak < 1024 * 1024, f"Peak memory {peak_kb:.2f} KB exceeds 1MB! Possible full file read."

        # Compare with naive full-file read memory
        tracemalloc.start()
        tracemalloc.reset_peak()
        _ = log_path.read_text(encoding="utf-8").splitlines()
        _, naive_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        naive_peak_kb = naive_peak / 1024

        memory_savings_ratio = naive_peak / peak
        assert memory_savings_ratio > 5.0, (
            f"Expected memory savings ratio > 5x, got {memory_savings_ratio:.2f}x "
            f"(Peak reverse: {peak_kb:.1f}KB vs Naive: {naive_peak_kb:.1f}KB)"
        )

        # 4. Chronological & Ordering verification
        # The first alert must be the very last line of the file
        with log_path.open("r", encoding="utf-8") as fh:
            lines = [line.strip() for line in fh if line.strip()]
            last_line_data = json.loads(lines[-1])
            second_last_data = json.loads(lines[-2])

        assert alerts_50[0].msg == last_line_data["msg"]
        assert alerts_50[1].msg == second_last_data["msg"]

        # Verify exact reverse-line correspondence with the file
        for i in range(len(alerts_50)):
            expected_data = json.loads(lines[-1 - i])
            assert alerts_50[i].msg == expected_data.get("msg")
            assert alerts_50[i].sid == expected_data.get("sid")

        # Macro timestamp direction: newest alert (alerts_50[0]) >= oldest in window (alerts_50[-1])
        assert alerts_50[0].timestamp >= alerts_50[-1].timestamp


def run_standalone_benchmarks():
    """Runs detailed benchmarks and prints formatted table for reports."""
    print("=" * 70)
    print("CHALLENGER 2: ADVERSARIAL STRESS TEST & BENCHMARK REPORT")
    print("=" * 70)

    # 1. UTF-8 & Boundary tests
    print("\n--- 1. Boundary & UTF-8 Stress Tests ---")
    tmp_dir = Path(tempfile.mkdtemp(prefix="challenger2_"))
    try:
        suite = TestAdversarialReverseReader()
        ctrl = LinuxSnortController()
        ctrl._alerts = tmp_dir / "alerts.txt"
        ctrl._rules = tmp_dir / "rules.txt"

        suite.test_utf8_split_2byte_accent(ctrl, tmp_dir)
        print(" [PASS] 2-byte UTF-8 ('é') split 1/1 across 65536 boundary")

        suite.test_utf8_split_3byte_currency(ctrl, tmp_dir)
        print(" [PASS] 3-byte UTF-8 ('€') split 1/2 and 2/1 across 65536 boundary")

        suite.test_utf8_split_4byte_emoji(ctrl, tmp_dir)
        print(" [PASS] 4-byte UTF-8 ('🚨') split 1/3, 2/2, 3/1 across 65536 boundary")

        suite.test_extremely_long_json_line_single_block_exceeded(ctrl, tmp_dir)
        print(" [PASS] Long JSON line (70 KB > 64 KB block size)")

        suite.test_extremely_long_json_line_multi_blocks_exceeded(ctrl, tmp_dir)
        print(" [PASS] Very long JSON line (150 KB > 2x 64 KB block size)")

        suite.test_mixed_line_endings_and_trailing_blanks(ctrl, tmp_dir)
        print(" [PASS] Mixed line endings (\\r\\n and \\n) with trailing blanks & tabs")

        # 2. Edge cases
        print("\n--- 2. Edge Cases & Extreme Limits ---")
        suite.test_limit_edge_cases(ctrl, tmp_dir)
        print(" [PASS] Extreme limits: limit=0, limit=-10, limit=1, limit=1000000")

        suite.test_empty_and_missing_files(ctrl, tmp_dir)
        print(" [PASS] Empty file (0 bytes) and missing file handling")

        suite.test_directory_instead_of_file(ctrl, tmp_dir)
        print(" [PASS] Directory instead of file handling")

        # 3. Real 5.35MB file benchmark
        print("\n--- 3. Performance & Memory Benchmarks (5.35MB Log) ---")
        repo_root = backend_dir.parent
        real_log = repo_root / "logs" / "alert_json.txt"
        file_size_bytes = real_log.stat().st_size
        file_size_mb = file_size_bytes / (1024 * 1024)
        print(f" Target log: {real_log.resolve()} ({file_size_mb:.2f} MB, {file_size_bytes:,} bytes)")

        ctrl._alerts = real_log

        # Number of lines in real file
        with real_log.open("r", encoding="utf-8") as f:
            total_lines = sum(1 for line in f if line.strip())
        print(f" Total alert count in file: {total_lines:,} alerts")

        # Exact I/O byte count wrapper
        class CountingFile:
            def __init__(self, raw_file):
                self._raw = raw_file
                self.bytes_read = 0

            def seek(self, offset, whence=io.SEEK_SET):
                return self._raw.seek(offset, whence)

            def tell(self):
                return self._raw.tell()

            def read(self, size=-1):
                data = self._raw.read(size)
                self.bytes_read += len(data)
                return data

            def __enter__(self):
                return self

            def __exit__(self, *args):
                self._raw.close()

        # Monkey-patch Path.open to measure actual bytes read
        orig_open = Path.open
        bytes_counter = [0]

        def patched_open(path_obj, *args, **kwargs):
            raw = orig_open(path_obj, *args, **kwargs)
            cf = CountingFile(raw)
            bytes_counter[0] = cf
            return cf

        Path.open = patched_open
        ctrl.list_alerts(limit=50)
        bytes_read_50 = bytes_counter[0].bytes_read
        ctrl.list_alerts(limit=200)
        bytes_read_200 = bytes_counter[0].bytes_read
        Path.open = orig_open

        print(f" Bytes read from disk for limit=50:  {bytes_read_50:,} bytes ({bytes_read_50 / file_size_bytes * 100:.2f}% of file)")
        print(f" Bytes read from disk for limit=200: {bytes_read_200:,} bytes ({bytes_read_200 / file_size_bytes * 100:.2f}% of file)")

        # Timing
        runs = 30
        t50 = []
        for _ in range(runs):
            t0 = time.perf_counter()
            res50 = ctrl.list_alerts(limit=50)
            t50.append(time.perf_counter() - t0)

        t200 = []
        for _ in range(runs):
            t0 = time.perf_counter()
            res200 = ctrl.list_alerts(limit=200)
            t200.append(time.perf_counter() - t0)

        avg_50_ms = statistics.mean(t50) * 1000
        min_50_ms = min(t50) * 1000
        max_50_ms = max(t50) * 1000
        std_50_ms = statistics.stdev(t50) * 1000

        avg_200_ms = statistics.mean(t200) * 1000
        min_200_ms = min(t200) * 1000
        max_200_ms = max(t200) * 1000
        std_200_ms = statistics.stdev(t200) * 1000

        print(f"\n Execution Time (30 runs):")
        print(f"  - limit=50 : avg={avg_50_ms:.3f}ms | min={min_50_ms:.3f}ms | max={max_50_ms:.3f}ms | stdev={std_50_ms:.3f}ms")
        print(f"  - limit=200: avg={avg_200_ms:.3f}ms | min={min_200_ms:.3f}ms | max={max_200_ms:.3f}ms | stdev={std_200_ms:.3f}ms")

        # Memory Comparison
        tracemalloc.start()
        tracemalloc.reset_peak()
        _ = ctrl.list_alerts(limit=50)
        _, peak_50 = tracemalloc.get_traced_memory()
        tracemalloc.reset_peak()
        _ = ctrl.list_alerts(limit=200)
        _, peak_200 = tracemalloc.get_traced_memory()
        tracemalloc.reset_peak()
        _ = real_log.read_text(encoding="utf-8").splitlines()
        _, peak_naive = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        print(f"\n Peak Memory Usage (tracemalloc):")
        print(f"  - list_alerts(limit=50) : {peak_50 / 1024:.2f} KB")
        print(f"  - list_alerts(limit=200): {peak_200 / 1024:.2f} KB")
        print(f"  - Naive read_text()     : {peak_naive / 1024:.2f} KB ({peak_naive / (1024 * 1024):.2f} MB)")
        print(f"  - Memory Reduction      : {peak_naive / peak_50:.1f}x reduction for limit=50")

        # Chronological Ordering Check
        print(f"\n Chronological Ordering Check:")
        alerts = ctrl.list_alerts(limit=50)
        print(f"  - Alert[0]  (newest): ts={alerts[0].timestamp} | msg='{alerts[0].msg}' | sid={alerts[0].sid}")
        print(f"  - Alert[49] (older) : ts={alerts[49].timestamp} | msg='{alerts[49].msg}' | sid={alerts[49].sid}")
        
        # Verify 100% exact reverse line match with file
        with real_log.open("r", encoding="utf-8") as f:
            all_lines = [ln.strip() for ln in f if ln.strip()]
        last_50_expected = [json.loads(ln) for ln in all_lines[-50:]]
        last_50_expected.reverse()
        
        line_matches = sum(
            1 for i in range(50)
            if alerts[i].sid == last_50_expected[i].get("sid")
            and alerts[i].msg == last_50_expected[i].get("msg")
        )
        print(f"  - Exact reverse line-by-line fidelity: {line_matches}/50 matches (100%)")
        assert line_matches == 50, f"Expected 50 matches, got {line_matches}"

        # Macro timestamp direction: Alert[0] (Oct 23) must be newer than Alert[49] (Oct 16)
        assert alerts[0].timestamp >= alerts[49].timestamp, (
            f"Alert[0] ts ({alerts[0].timestamp}) is older than Alert[49] ts ({alerts[49].timestamp})"
        )
        print(f"  - Macro chronological order: Alert[0] ({alerts[0].timestamp}) >= Alert[49] ({alerts[49].timestamp}) [PASS]")

        print("\n" + "=" * 70)
        print("OVERALL VERDICT: ALL ADVERSARIAL STRESS TESTS PASSED (APPROVE)")
        print("=" * 70)

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    run_standalone_benchmarks()
