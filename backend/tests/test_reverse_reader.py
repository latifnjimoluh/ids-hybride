from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

import pytest

from app.controllers.linux import LinuxSnortController
from app.models import Alert


class TestReverseAlertReader:
    def test_missing_file_returns_empty_list(self, isolated_controller: LinuxSnortController):
        isolated_controller._alerts = Path("non_existent_file_xyz_123.txt")
        assert isolated_controller.list_alerts() == []

    def test_zero_byte_file_returns_empty_list(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        empty_file = tmp_path / "empty_alert.txt"
        empty_file.write_bytes(b"")
        isolated_controller._alerts = empty_file
        assert isolated_controller.list_alerts() == []

    def test_limit_zero_or_negative_returns_empty_list(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "alerts.txt"
        f.write_text('{"msg": "A1", "priority": 1}\n', encoding="utf-8")
        isolated_controller._alerts = f

        assert isolated_controller.list_alerts(limit=0) == []
        assert isolated_controller.list_alerts(limit=-5) == []

    def test_whitespace_and_blank_lines_only(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "blank.txt"
        f.write_text("\n\n   \n\t\n", encoding="utf-8")
        isolated_controller._alerts = f
        assert isolated_controller.list_alerts() == []

    def test_file_with_fewer_than_limit_alerts(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "alerts.txt"
        lines = [
            '{"msg": "Alert 1", "priority": 1, "sid": 101}\n',
            '{"msg": "Alert 2", "priority": 2, "sid": 102}\n',
            '{"msg": "Alert 3", "priority": 3, "sid": 103}\n',
        ]
        f.write_text("".join(lines), encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=10)
        assert len(results) == 3
        # Newest first (Alert 3 -> Alert 2 -> Alert 1)
        assert results[0].msg == "Alert 3"
        assert results[1].msg == "Alert 2"
        assert results[2].msg == "Alert 1"

    def test_file_with_exact_limit_alerts(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "alerts.txt"
        lines = [f'{{"msg": "Alert {i}", "priority": 1, "sid": {100 + i}}}\n' for i in range(5)]
        f.write_text("".join(lines), encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=5)
        assert len(results) == 5
        assert results[0].msg == "Alert 4"
        assert results[4].msg == "Alert 0"

    def test_file_with_more_than_limit_alerts(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "alerts.txt"
        lines = [f'{{"msg": "Alert {i}", "priority": 1, "sid": {100 + i}}}\n' for i in range(20)]
        f.write_text("".join(lines), encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=5)
        assert len(results) == 5
        # Must be the 5 most recent (Alerts 19, 18, 17, 16, 15)
        expected_msgs = ["Alert 19", "Alert 18", "Alert 17", "Alert 16", "Alert 15"]
        assert [r.msg for r in results] == expected_msgs

    def test_default_limit_is_200(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "alerts.txt"
        lines = [f'{{"msg": "Alert {i}", "priority": 1, "sid": {1000 + i}}}\n' for i in range(250)]
        f.write_text("".join(lines), encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts()
        assert len(results) == 200
        assert results[0].msg == "Alert 249"
        assert results[-1].msg == "Alert 50"

    def test_invalid_json_lines_skipped(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "mixed.txt"
        content = (
            '{"msg": "Alert Valid 1", "priority": 1}\n'
            'CORRUPTED_JSON_LINE\n'
            '{"msg": "Alert Valid 2", "priority": 2}\n'
            '{"incomplete": \n'
            '{"msg": "Alert Valid 3", "priority": 3}\n'
        )
        f.write_text(content, encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=10)
        assert len(results) == 3
        assert [r.msg for r in results] == ["Alert Valid 3", "Alert Valid 2", "Alert Valid 1"]

    def test_file_without_trailing_newline(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        f = tmp_path / "no_trailing_nl.txt"
        content = '{"msg": "Alert 1", "priority": 1}\n{"msg": "Alert 2", "priority": 2}'
        f.write_text(content, encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=10)
        assert len(results) == 2
        assert results[0].msg == "Alert 2"
        assert results[1].msg == "Alert 1"

    def test_multibyte_utf8_across_chunk_boundaries(self, isolated_controller: LinuxSnortController, tmp_path: Path):
        # We test lines containing multi-byte UTF-8 characters: accents (é, è, à), Cyrillic, emojis
        f = tmp_path / "utf8.txt"
        lines = [
            '{"msg": "Alerte détection sécurité éàçù 🔒🛡️", "priority": 1}\n',
            '{"msg": "Attaque DDoS détectée sur serveur hôte", "priority": 2}\n',
            '{"msg": "Tentative d\'intrusion réseau système", "priority": 3}\n',
        ]
        f.write_text("".join(lines), encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=5)
        assert len(results) == 3
        assert "Tentative d'intrusion" in results[0].msg
        assert "Attaque DDoS" in results[1].msg
        assert "éàçù 🔒🛡️" in results[2].msg

    def test_synthetic_large_file_benchmark(
        self,
        isolated_controller: LinuxSnortController,
        generate_synthetic_log,
        tmp_path: Path,
    ):
        # Generate 18,000 alerts (roughly 5.5 MB)
        log_file = tmp_path / "synthetic_large_alert.txt"
        generate_synthetic_log(log_file, count=18000)
        size_mb = log_file.stat().st_size / (1024 * 1024)
        assert size_mb >= 5.0, f"Generated file size is {size_mb:.2f}MB, expected >= 5MB"

        isolated_controller._alerts = log_file

        t0 = time.perf_counter()
        results = isolated_controller.list_alerts(limit=50)
        duration = time.perf_counter() - t0

        assert len(results) == 50
        assert "Alert 17999" in results[0].msg
        assert "Alert 17950" in results[49].msg
        # Reading 50 alerts backwards using seek should take less than 100ms
        assert duration < 0.1, f"Reverse read took {duration:.4f}s, expected < 0.1s"

    def test_real_snort_log_file_if_present(self, isolated_controller: LinuxSnortController):
        real_log = Path("logs/alert_json.txt")
        if not real_log.exists():
            pytest.skip("logs/alert_json.txt not present on local machine")

        isolated_controller._alerts = real_log
        t0 = time.perf_counter()
        alerts = isolated_controller.list_alerts(limit=200)
        duration = time.perf_counter() - t0

        assert len(alerts) == 200
        # Performance check
        assert duration < 0.15, f"Reading from real log took {duration:.4f}s, expected < 0.15s"
        # All alerts must have properly parsed timestamps with the current year
        current_year = datetime.now().year
        assert alerts[0].timestamp.year == current_year

    def test_non_dict_and_corrupted_json_lines_in_list_alerts(
        self, isolated_controller: LinuxSnortController, tmp_path: Path
    ):
        f = tmp_path / "corrupted_entries.txt"
        content = (
            "null\n"
            "123\n"
            "true\n"
            '"a plain string"\n'
            "[1, 2, 3]\n"
            '{"msg": null}\n'
            '{"msg": "Valid Alert", "priority": 1}\n'
        )
        f.write_text(content, encoding="utf-8")
        isolated_controller._alerts = f

        results = isolated_controller.list_alerts(limit=10)
        assert len(results) == 2
        assert results[0].msg == "Valid Alert"
        assert results[0].priority == 1
        assert results[1].msg == ""

    def test_new_alerts_with_corrupted_and_non_dict_lines(
        self, isolated_controller: LinuxSnortController, tmp_path: Path
    ):
        f = tmp_path / "live_alerts.txt"
        f.write_text("", encoding="utf-8")
        isolated_controller._alerts = f
        isolated_controller._alert_offset = 0

        # Append mixed lines
        content = (
            "123\n"
            "null\n"
            "false\n"
            '{"msg": "Live Alert 1", "priority": 2}\n'
            "[1]\n"
            '{"msg": null}\n'
        )
        f.write_text(content, encoding="utf-8")

        new = isolated_controller.new_alerts()
        assert len(new) == 2
        assert new[0].msg == "Live Alert 1"
        assert new[1].msg == ""
