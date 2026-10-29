#!/usr/bin/env python3
"""Adversarial stress-test runner for Snort 3 timestamp parsing and LinuxSnortController.
Executed by Challenger 1.
"""
from __future__ import annotations

import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

# Ensure backend package is in pythonpath
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.controllers.linux import LinuxSnortController, _parse_timestamp, _parse_priority, _int_or_none
from app.models import Alert


class TestReporter:
    def __init__(self):
        self.passes = 0
        self.fails = 0
        self.findings = []
        self.results = []

    def record(self, category: str, test_name: str, passed: bool, detail: str = ""):
        if passed:
            self.passes += 1
            status = "PASS"
        else:
            self.fails += 1
            status = "FAIL"
            self.findings.append((category, test_name, detail))
        self.results.append((category, test_name, status, detail))
        print(f"[{status}] {category} :: {test_name} - {detail}")


reporter = TestReporter()


# ============================================================================ #
# 1. Snort 3 Timestamp Boundary Cases
# ============================================================================ #
print("\n" + "="*80)
print("1. Snort 3 Timestamp Boundary Cases")
print("="*80)

# 1.1 Leap Day Handling across leap & non-leap years
leap_day_str = "02/29-12:00:00.000000"
test_years = [
    (2024, True, 2024),   # Leap year -> keeps 2024
    (2025, False, 2024),  # Non-leap year -> rolls back to 2024
    (2026, False, 2024),  # Non-leap year -> rolls back to 2024
    (2027, False, 2024),  # Non-leap year -> rolls back to 2024
    (2028, True, 2028),   # Leap year -> keeps 2028
    (2100, False, 2096),  # Century non-leap -> rolls back to 2096
    (2101, False, 2096),  # Non-leap year -> rolls back to 2096
    (2104, True, 2104),   # Leap year -> keeps 2104
]

for yr, is_leap, expected_year in test_years:
    class MockDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(yr, 6, 1, 12, 0, 0)

    with patch("app.controllers.linux.datetime", MockDatetime):
        ts = _parse_timestamp(leap_day_str)
        passed = (ts is not None and ts.year == expected_year and ts.month == 2 and ts.day == 29)
        detail = f"Mock year {yr} (leap={is_leap}) -> parsed year {ts.year if ts else None} (expected {expected_year})"
        reporter.record("1.1 Leap Day", f"year_{yr}", passed, detail)

# 1.2 Microsecond Variations
microsecond_cases = [
    ("09/25-12:32:47.1", 100000, "1 digit fraction (0.1s -> 100,000 us)"),
    ("09/25-12:32:47.12", 120000, "2 digit fraction (0.12s -> 120,000 us)"),
    ("09/25-12:32:47.123", 123000, "3 digit fraction (0.123s -> 123,000 us)"),
    ("09/25-12:32:47.047605", 47605, "6 digit nominal Snort 3 fraction (47,605 us)"),
    ("09/25-12:32:47.123456789", 123456, "9 digit nanoseconds (truncated to 6 us digits 123456)"),
    ("09/25-12:32:47", 0, "No microseconds -> 0 us"),
]

for ts_input, expected_us, desc in microsecond_cases:
    ts = _parse_timestamp(ts_input)
    passed = (ts is not None and ts.microsecond == expected_us)
    reporter.record("1.2 Microseconds", desc, passed, f"Input: '{ts_input}' -> us={ts.microsecond if ts else None}")

# 1.3 Out-of-Bounds Dates
oob_cases = [
    ("13/01-12:00:00", "Invalid month 13"),
    ("00/01-12:00:00", "Invalid month 0"),
    ("02/30-12:00:00", "Feb 30 out of bounds"),
    ("04/31-12:00:00", "April 31 (April has 30 days)"),
    ("00/00-00:00:00", "Month 0 Day 0"),
    ("01/00-12:00:00", "Day 0"),
    ("01/32-12:00:00", "Day 32"),
    ("09/25-24:00:00", "Hour 24"),
    ("09/25-12:60:00", "Minute 60"),
    ("09/25-12:00:60", "Second 60"),
    ("-1/01-12:00:00", "Negative month"),
]

for ts_input, desc in oob_cases:
    ts = _parse_timestamp(ts_input)
    # Must return None and not raise exception
    now_before = datetime.now()
    alert = LinuxSnortController._to_alert({"timestamp": ts_input})
    now_after = datetime.now()
    fallback_ok = (now_before <= alert.timestamp <= now_after)
    passed = (ts is None and fallback_ok)
    reporter.record("1.3 Out-of-Bounds", desc, passed, f"'{ts_input}' -> ts is None and alert falls back to now()")

# 1.4 Whitespace, Control Characters, Unicode
str_cases = [
    ("  09/25-12:32:47.047605  \t", True, 9, 25, 47605, "Extra spaces and tab"),
    ("\r\n09/25-12:32:47.047605\n", True, 9, 25, 47605, "Surrounding newlines"),
    (" \t\n 09/25-12:32:47.047605 \t\r\n ", True, 9, 25, 47605, "Mixed whitespace"),
    ("09/25\x00-12:32:47.047605", False, None, None, None, "Null byte embedded"),
    ("09/25-12:32:47\x1b[31m", False, None, None, None, "ANSI escape code"),
    ("09/25-12:32:47.047605🔥", False, None, None, None, "Trailing emoji"),
    ("\u200b09/25-12:32:47.047605", False, None, None, None, "Leading zero-width space"),
    ("۰۹/۲۵-۱۲:۳۲:۴۷.۰۴۷۶۰۵", True, 9, 25, 47605, "Arabic-Indic digits"),
]

for val, should_parse, exp_mo, exp_d, exp_us, desc in str_cases:
    try:
        ts = _parse_timestamp(val)
        alert = LinuxSnortController._to_alert({"timestamp": val})
        if should_parse:
            passed = (ts is not None and ts.month == exp_mo and ts.day == exp_d and ts.microsecond == exp_us)
            detail = f"Parsed cleanly: {ts}"
        else:
            passed = (ts is None and isinstance(alert.timestamp, datetime))
            detail = f"Safely rejected (None), fallback to now()"
    except Exception as e:
        passed = False
        detail = f"CRASH: {type(e).__name__}: {e}"
    reporter.record("1.4 Strings & Unicode", desc, passed, detail)

# 1.5 Types and unexpected objects in timestamp
type_cases = [
    (None, "None type -> None"),
    ("", "Empty string -> None"),
    ("   ", "Whitespace string -> None"),
    (1727267567, "Unix epoch int in timestamp field -> parsed"),
    (1727267567.047605, "Unix epoch float in timestamp field -> parsed"),
    ([], "Empty list -> None"),
    ([1, 2], "Non-empty list -> None"),
    ({}, "Empty dict -> None"),
    ({"sub": "val"}, "Dict -> None"),
    (object(), "Arbitrary object -> None"),
    (1 + 2j, "Complex number -> None"),
    (float("nan"), "Float NaN -> None"),
    (float("inf"), "Float Infinity -> None"),
    (float("-inf"), "Float -Infinity -> None"),
]

for obj, desc in type_cases:
    try:
        ts = _parse_timestamp(obj)
        alert = LinuxSnortController._to_alert({"timestamp": obj})
        if isinstance(obj, (int, float)) and not math.isnan(obj) and not math.isinf(obj):
            passed = (ts is not None and isinstance(alert.timestamp, datetime))
            detail = f"Numeric timestamp parsed to {ts}"
        else:
            passed = (ts is None and isinstance(alert.timestamp, datetime))
            detail = f"Object returned None and alert fallback to now()"
    except Exception as e:
        passed = False
        detail = f"CRASH: {type(e).__name__}: {e}"
    reporter.record("1.5 Types & Objects", desc, passed, detail)

# Special check for bool
try:
    ts_false = _parse_timestamp(False)
    ts_true = _parse_timestamp(True)
    # Document boolean behavior
    print(f"[INFO] Boolean False in _parse_timestamp -> {ts_false}")
    print(f"[INFO] Boolean True in _parse_timestamp -> {ts_true}")
    # bool doesn't crash
    reporter.record("1.5 Types & Objects", "Boolean False & True", True, f"Non-crashing (parses as epoch {ts_false})")
except Exception as e:
    reporter.record("1.5 Types & Objects", "Boolean False & True", False, f"CRASH: {e}")


# ============================================================================ #
# 2. Unix Epoch Timestamp Stress Cases
# ============================================================================ #
print("\n" + "="*80)
print("2. Unix Epoch Timestamp Stress Cases")
print("="*80)

epoch_cases = [
    (1727267567.047605, True, 2024, 9, 25, 47605, "Float seconds (nominal)"),
    ("1727267567", True, 2024, 9, 25, 0, "String epoch integer"),
    ("1727267567.047605", True, 2024, 9, 25, 47605, "String epoch float"),
    (0, True, 1970, 1, 1, 0, "Epoch 0 (int)"),
    ("0", True, 1970, 1, 1, 0, "Epoch '0' (str)"),
    (0.0, True, 1970, 1, 1, 0, "Epoch 0.0 (float)"),
    (-1000, False, None, None, None, None, "Negative int -1000 (Windows OSError caught)"),
    ("-1000", False, None, None, None, None, "Negative str '-1000' (Windows OSError caught)"),
    (1e25, False, None, None, None, None, "Overflow float 1e25 (OverflowError caught)"),
    ("1e25", False, None, None, None, None, "Overflow str '1e25' (OverflowError caught)"),
    (99999999999999999999999999, False, None, None, None, None, "Very large int 99...99 (OverflowError caught)"),
    ("99999999999999999999999999", False, None, None, None, None, "Very large str 99...99 (OverflowError caught)"),
    (-1e25, False, None, None, None, None, "Negative overflow -1e25 (OverflowError caught)"),
    ("not_a_number", False, None, None, None, None, "Non-numeric string 'not_a_number'"),
    ("1727267567e99999", False, None, None, None, None, "String scientific exponent overflow"),
    ("9" * 10000, False, None, None, None, None, "10,000 digit string"),
]

for sec_input, should_parse, exp_yr, exp_mo, exp_d, exp_us, desc in epoch_cases:
    try:
        ts = _parse_timestamp(sec_input)
        alert = LinuxSnortController._to_alert({"seconds": sec_input})
        if should_parse:
            passed = (ts is not None and ts.year == exp_yr and ts.month == exp_mo and ts.day == exp_d and ts.microsecond == exp_us)
            detail = f"Parsed cleanly to {ts}"
        else:
            now_before = datetime.now()
            passed = (ts is None and isinstance(alert.timestamp, datetime))
            detail = f"Returned None safely, alert fell back to now()"
    except Exception as e:
        passed = False
        detail = f"CRASH: {type(e).__name__}: {e}"
    reporter.record("2. Unix Epoch", desc, passed, detail)


# ============================================================================ #
# 3. Real Log Verification on logs/alert_json.txt (1,000 alerts)
# ============================================================================ #
print("\n" + "="*80)
print("3. Real Log Verification on logs/alert_json.txt")
print("="*80)

log_path = Path("logs/alert_json.txt")
if not log_path.exists():
    reporter.record("3. Real Log Verification", "File existence", False, "logs/alert_json.txt not found")
else:
    controller = LinuxSnortController()
    alerts_1k = []
    before_test = datetime.now()

    with open(log_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= 1000:
                break
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            a = controller._to_alert(data)
            alerts_1k.append((data, a))

    after_test = datetime.now()

    total_1k = len(alerts_1k)
    non_now_count = 0
    correct_month_count = 0
    us_preserved_count = 0

    for data, a in alerts_1k:
        # 1. Non-now()
        if not (before_test <= a.timestamp <= after_test):
            non_now_count += 1
        # 2. Month 9 or 10
        if a.timestamp.month in (9, 10):
            correct_month_count += 1
        # 3. Microseconds preserved
        raw_ts = data.get("timestamp")
        if raw_ts and "." in raw_ts:
            expected_us = int(raw_ts.split(".")[1])
            if a.timestamp.microsecond == expected_us:
                us_preserved_count += 1

    p_1k = (total_1k == 1000)
    reporter.record("3. Real Log Verification", "1,000 alerts read", p_1k, f"Read {total_1k} alerts")

    p_non_now = (non_now_count == 1000)
    reporter.record("3. Real Log Verification", "100% non-now() timestamps", p_non_now, f"{non_now_count}/1000 ({non_now_count/10:.1f}%)")

    p_months = (correct_month_count == 1000)
    reporter.record("3. Real Log Verification", "100% correct month (9/10)", p_months, f"{correct_month_count}/1000 ({correct_month_count/10:.1f}%)")

    p_us = (us_preserved_count == 1000)
    reporter.record("3. Real Log Verification", "100% microseconds preserved", p_us, f"{us_preserved_count}/1000 ({us_preserved_count/10:.1f}%)")

    # Full file audit check
    print("\n--- Extended Full File Audit (15,646 alerts) ---")
    full_total = 0
    full_non_now = 0
    full_us_ok = 0
    full_months = set()
    full_errors = 0

    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            full_total += 1
            try:
                d = json.loads(line)
                a = controller._to_alert(d)
                full_months.add(a.timestamp.month)
                if not (before_test <= a.timestamp <= datetime.now()):
                    full_non_now += 1
                raw_ts = d.get("timestamp")
                if raw_ts and "." in raw_ts:
                    if a.timestamp.microsecond == int(raw_ts.split(".")[1]):
                        full_us_ok += 1
            except Exception:
                full_errors += 1

    p_full = (full_total == 15646 and full_non_now == 15646 and full_errors == 0)
    reporter.record("3. Real Log Verification", "Full file audit (15,646 alerts)", p_full,
                    f"Total: {full_total}, Non-now: {full_non_now}, Months: {sorted(list(full_months))}, Errors: {full_errors}")


# ============================================================================ #
# 4. Exception Safety & Crash Resistance of _to_alert and list_alerts
# ============================================================================ #
print("\n" + "="*80)
print("4. Exception Safety & Crash Resistance Analysis")
print("="*80)

# 4.1 Missing / empty fields nominal safety
safe_alert_cases = [
    ({}, "Empty dict -> falls back to now(), defaults applied"),
    ({"msg": "ICMP alert"}, "Only msg present"),
    ({"priority": 0}, "Priority 0 preserved"),
    ({"priority": "0"}, "Priority '0' parsed as 0"),
    ({"priority": None}, "Priority None -> defaults to 3"),
    ({"priority": "invalid"}, "Priority 'invalid' -> defaults to 3"),
    ({"src_port": 80, "dst_port": "443", "sid": "1001"}, "Numeric string ports/sid parsed"),
    ({"src_port": "not_int", "dst_port": None, "sid": []}, "Invalid ports/sid -> None"),
]

for d, desc in safe_alert_cases:
    try:
        a = LinuxSnortController._to_alert(d)
        passed = isinstance(a, Alert)
        detail = f"Handled safely: alert timestamp={a.timestamp}, prio={a.priority}"
    except Exception as e:
        passed = False
        detail = f"CRASH: {type(e).__name__}: {e}"
    reporter.record("4.1 Nominal Dict Safety", desc, passed, detail)

# 4.2 Adversarial edge cases: Null string fields in dict
# Notice: In JSON, fields can be null: {"msg": null}, {"proto": null}, etc.
null_field_cases = [
    ({"msg": None}, "Field 'msg' is None -> Pydantic ValidationError"),
    ({"proto": None}, "Field 'proto' is None -> Pydantic ValidationError"),
    ({"class": None}, "Field 'class' is None -> Pydantic ValidationError"),
    ({"action": None}, "Field 'action' is None -> Pydantic ValidationError"),
    ({"src_addr": None}, "Field 'src_addr' is None -> Pydantic ValidationError"),
    ({"dst_addr": None}, "Field 'dst_addr' is None -> Pydantic ValidationError"),
]

for d, desc in null_field_cases:
    try:
        a = LinuxSnortController._to_alert(d)
        reporter.record("4.2 Null String Fields", desc, True, "Handled safely without crash")
    except Exception as e:
        # This is a confirmed vulnerability: d.get('msg', '') returns None if 'msg': None
        reporter.record("4.2 Null String Fields", desc, False, f"VULNERABILITY: Unhandled {type(e).__name__}: {e}")

# 4.3 Adversarial edge cases: Numeric overflow in ports and priority
overflow_fields = [
    ({"src_port": float("inf")}, "src_port = float('inf') -> OverflowError in _int_or_none"),
    ({"dst_port": float("inf")}, "dst_port = float('inf') -> OverflowError in _int_or_none"),
    ({"sid": float("inf")}, "sid = float('inf') -> OverflowError in _int_or_none"),
    ({"priority": float("inf")}, "priority = float('inf') -> OverflowError in _parse_priority"),
]

for d, desc in overflow_fields:
    try:
        a = LinuxSnortController._to_alert(d)
        reporter.record("4.3 Float Inf Overflow", desc, True, "Handled safely")
    except Exception as e:
        reporter.record("4.3 Float Inf Overflow", desc, False, f"VULNERABILITY: Unhandled {type(e).__name__}: {e}")

# 4.4 Non-dict JSON lines in list_alerts
corrupted_lines = [
    "null\n",
    "123\n",
    "true\n",
    "\"a plain string\"\n",
    "[1, 2, 3]\n",
    "{\"msg\": null}\n",
]

for raw_line in corrupted_lines:
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as tmp:
        tmp.write(raw_line)
        tmp_file = Path(tmp.name)

    ctrl = LinuxSnortController()
    ctrl._alerts = tmp_file
    try:
        res = ctrl.list_alerts()
        reporter.record("4.4 list_alerts Robustness", f"Line: {raw_line.strip()}", True, f"Returned {len(res)} alerts without crashing")
    except Exception as e:
        reporter.record("4.4 list_alerts Robustness", f"Line: {raw_line.strip()}", False, f"VULNERABILITY: list_alerts crashed on corrupted line with {type(e).__name__}: {e}")
    finally:
        tmp_file.unlink(missing_ok=True)

# 4.5 Timezone awareness incompatibility in alert_stats
try:
    ctrl = LinuxSnortController()
    aware_alert = LinuxSnortController._to_alert({"timestamp": "2024-09-25T12:32:47.047605Z"})
    with patch.object(ctrl, "list_alerts", return_value=[aware_alert]):
        stats = ctrl.alert_stats()
        reporter.record("4.5 Timezone Safety", "ISO-8601 UTC timestamp in alert_stats", True, "Successfully computed stats")
except Exception as e:
    reporter.record("4.5 Timezone Safety", "ISO-8601 UTC timestamp in alert_stats", False, f"VULNERABILITY: alert_stats crashed with {type(e).__name__}: {e}")


# ============================================================================ #
# Final Summary
# ============================================================================ #
print("\n" + "="*80)
print(f"ADVERSARIAL SUITE SUMMARY: {reporter.passes} PASSED, {reporter.fails} FAILED / VULNERABILITIES")
print("="*80)

for cat, name, detail in reporter.findings:
    print(f"  * [{cat}] {name} -> {detail}")

sys.exit(0 if reporter.fails == 0 else 1)
