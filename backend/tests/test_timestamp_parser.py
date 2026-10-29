from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch
import pytest

from app.controllers.linux import LinuxSnortController, _parse_timestamp
from app.models import Alert


class TestSnortTimestampParser:
    def test_nominal_snort3_timestamp(self, sample_snort_alert_dict: dict):
        alert = LinuxSnortController._to_alert(sample_snort_alert_dict)

        assert isinstance(alert, Alert)
        current_year = datetime.now().year
        assert alert.timestamp.year == current_year
        assert alert.timestamp.month == 9
        assert alert.timestamp.day == 25
        assert alert.timestamp.hour == 12
        assert alert.timestamp.minute == 32
        assert alert.timestamp.second == 47
        assert alert.timestamp.microsecond == 47605

    def test_snort3_timestamp_without_microseconds(self):
        raw = {"timestamp": "10/24-14:05:09", "msg": "Test Alert"}
        alert = LinuxSnortController._to_alert(raw)

        current_year = datetime.now().year
        assert alert.timestamp.year == current_year
        assert alert.timestamp.month == 10
        assert alert.timestamp.day == 24
        assert alert.timestamp.hour == 14
        assert alert.timestamp.minute == 5
        assert alert.timestamp.second == 9
        assert alert.timestamp.microsecond == 0

    def test_unix_seconds_numeric_float(self):
        epoch = 1695645167.047605
        raw = {"seconds": epoch, "msg": "Epoch test"}
        alert = LinuxSnortController._to_alert(raw)

        expected = datetime.fromtimestamp(epoch)
        assert alert.timestamp == expected

    def test_unix_seconds_numeric_int(self):
        epoch = 1695645167
        raw = {"seconds": epoch, "msg": "Epoch int test"}
        alert = LinuxSnortController._to_alert(raw)

        expected = datetime.fromtimestamp(float(epoch))
        assert alert.timestamp == expected

    def test_unix_seconds_string(self):
        raw = {"seconds": "1695645167.500", "msg": "Epoch str test"}
        alert = LinuxSnortController._to_alert(raw)

        expected = datetime.fromtimestamp(1695645167.5)
        assert alert.timestamp == expected

    def test_timestamp_priority_over_seconds(self):
        # If both are present, Snort 3 "timestamp" takes precedence
        raw = {
            "timestamp": "05/10-08:15:30.123456",
            "seconds": 1600000000,
            "msg": "Precedence test",
        }
        alert = LinuxSnortController._to_alert(raw)

        current_year = datetime.now().year
        assert alert.timestamp.year == current_year
        assert alert.timestamp.month == 5
        assert alert.timestamp.day == 10
        assert alert.timestamp.hour == 8
        assert alert.timestamp.minute == 15
        assert alert.timestamp.second == 30
        assert alert.timestamp.microsecond == 123456

    def test_fallback_to_now_when_empty_dict(self):
        before = datetime.now()
        alert = LinuxSnortController._to_alert({})
        after = datetime.now()

        assert before <= alert.timestamp <= after

    def test_fallback_to_now_when_missing_timestamp_and_seconds(self):
        before = datetime.now()
        alert = LinuxSnortController._to_alert({"msg": "No timestamp", "priority": 2})
        after = datetime.now()

        assert before <= alert.timestamp <= after

    def test_fallback_to_now_when_timestamp_invalid_format(self):
        invalid_cases = [
            "invalid_timestamp",
            "99/99-99:99:99",
            "13/01-12:00:00",  # invalid month 13
            "",
            "   ",
            None,
        ]
        for val in invalid_cases:
            before = datetime.now()
            alert = LinuxSnortController._to_alert({"timestamp": val, "msg": f"Case {val}"})
            after = datetime.now()
            assert before <= alert.timestamp <= after

    def test_fallback_to_now_when_seconds_invalid(self):
        invalid_seconds = ["not_a_number", None, "", []]
        for val in invalid_seconds:
            before = datetime.now()
            alert = LinuxSnortController._to_alert({"seconds": val, "msg": f"Case {val}"})
            after = datetime.now()
            assert before <= alert.timestamp <= after

    def test_leap_day_handling(self):
        # Should parse leap day without Python 3.14 DeprecationWarning or ValueError
        ts = _parse_timestamp("02/29-12:00:00.000000")
        assert ts is not None
        assert ts.month == 2
        assert ts.day == 29
        assert ts.hour == 12

    def test_iso_8601_support(self):
        iso_str = "2026-08-15T10:20:30.123456"
        ts = _parse_timestamp(iso_str)
        assert ts == datetime.fromisoformat(iso_str)

    def test_all_alert_fields_mapping(self, sample_snort_alert_dict: dict):
        alert = LinuxSnortController._to_alert(sample_snort_alert_dict)

        assert alert.msg == "ICMP Ping detecte"
        assert alert.priority == 0
        assert alert.proto == "ICMP"
        assert alert.src_addr == "172.17.26.2"
        assert alert.src_port is None
        assert alert.dst_addr == "8.8.8.8"
        assert alert.dst_port is None
        assert alert.sid == 1000001
        assert alert.classtype == "none"
        assert alert.action == "allow"

    def test_priority_handling(self):
        # Test priority 0 preserved (not overridden to 3)
        a0 = LinuxSnortController._to_alert({"priority": 0})
        assert a0.priority == 0

        # Test priority from string integer
        a1 = LinuxSnortController._to_alert({"priority": "1"})
        assert a1.priority == 1

        # Test priority default when missing or invalid
        a_default = LinuxSnortController._to_alert({})
        assert a_default.priority == 3

        a_invalid = LinuxSnortController._to_alert({"priority": "high"})
        assert a_invalid.priority == 3

    def test_boolean_in_timestamp_and_seconds_rejected(self):
        # Booleans must not be parsed as Unix epoch (1970-01-01)
        assert _parse_timestamp(True) is None
        assert _parse_timestamp(False) is None

        before = datetime.now()
        a_true = LinuxSnortController._to_alert({"timestamp": True})
        a_false = LinuxSnortController._to_alert({"seconds": False})
        after = datetime.now()

        assert before <= a_true.timestamp <= after
        assert before <= a_false.timestamp <= after

    def test_null_string_fields_in_to_alert(self):
        # In JSON logs, fields can be null -> should not raise ValidationError
        raw = {
            "msg": None,
            "proto": None,
            "src_addr": None,
            "dst_addr": None,
            "class": None,
            "action": None,
        }
        alert = LinuxSnortController._to_alert(raw)
        assert isinstance(alert, Alert)
        assert alert.msg == ""
        assert alert.proto == ""
        assert alert.src_addr == ""
        assert alert.dst_addr == ""
        assert alert.classtype == ""
        assert alert.action == ""

    def test_float_inf_and_nan_in_integer_and_priority_fields(self):
        # float('inf') or float('-inf') should not raise OverflowError
        raw = {
            "src_port": float("inf"),
            "dst_port": float("-inf"),
            "sid": float("inf"),
            "priority": float("inf"),
        }
        alert = LinuxSnortController._to_alert(raw)
        assert isinstance(alert, Alert)
        assert alert.src_port is None
        assert alert.dst_port is None
        assert alert.sid is None
        assert alert.priority == 3

    def test_non_dict_input_to_alert(self):
        # Non-dict inputs should safely return an Alert with current timestamp without raising TypeError or AttributeError
        for invalid_input in [None, "string", 123, True, [1, 2, 3]]:
            alert = LinuxSnortController._to_alert(invalid_input)
            assert isinstance(alert, Alert)
            assert alert.msg == ""

    def test_iso_8601_with_timezone_offset_and_alert_stats(self, tmp_path):
        # ISO-8601 with "Z" or offset should strip tzinfo to prevent offset-naive/aware TypeError in alert_stats
        iso_str = "2024-09-25T12:32:47.047605Z"
        ts = _parse_timestamp(iso_str)
        assert ts is not None
        assert ts.tzinfo is None
        assert ts.year == 2024
        assert ts.month == 9
        assert ts.day == 25
        assert ts.hour == 12
        assert ts.minute == 32
        assert ts.second == 47
        assert ts.microsecond == 47605

        ctrl = LinuxSnortController()
        aware_alert = LinuxSnortController._to_alert({"timestamp": iso_str, "msg": "ISO UTC Alert"})
        with patch.object(ctrl, "list_alerts", return_value=[aware_alert]):
            stats = ctrl.alert_stats()
            assert stats.total == 1
            assert stats.by_signature[0]["msg"] == "ISO UTC Alert"
