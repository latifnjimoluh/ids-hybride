from __future__ import annotations

from datetime import datetime
import pytest
from pydantic import ValidationError

from app.models import (
    Alert,
    AlertStats,
    ConsoleCommand,
    ConsoleResult,
    DaqModule,
    ImportResult,
    LogsResponse,
    NetworkInterface,
    PcapResult,
    PcapSummary,
    Plugin,
    RawConfig,
    Rule,
    RuleCategory,
    RuleCreate,
    RuleToggle,
    RunOptions,
    ServiceAction,
    ServiceStatus,
    SnortConfig,
    SystemInfo,
    ValidationResult,
)


class TestModels:
    def test_alert_model_valid(self):
        now = datetime.now()
        alert = Alert(
            timestamp=now,
            msg="Test Alert",
            priority=1,
            proto="TCP",
            src_addr="1.2.3.4",
            src_port=8080,
            dst_addr="5.6.7.8",
            dst_port=443,
            sid=1000001,
            classtype="trojan-activity",
            action="drop",
        )
        assert alert.timestamp == now
        assert alert.msg == "Test Alert"
        assert alert.priority == 1
        assert alert.src_port == 8080
        assert alert.action == "drop"

    def test_alert_model_defaults(self):
        now = datetime.now()
        alert = Alert(timestamp=now)
        assert alert.msg == ""
        assert alert.priority == 3
        assert alert.src_port is None
        assert alert.dst_port is None
        assert alert.sid is None
        assert alert.action == ""

    def test_alert_model_invalid_timestamp_raises(self):
        with pytest.raises(ValidationError):
            Alert(timestamp="not-a-valid-datetime")

    def test_alert_stats_model(self):
        stats = AlertStats(
            total=10,
            by_priority={1: 5, 2: 3, 3: 2},
            by_signature=[{"msg": "Ping", "count": 10}],
            by_src=[{"src": "10.0.0.1", "count": 10}],
            timeline=[{"time": "12:00", "count": 5}],
        )
        assert stats.total == 10
        assert stats.by_priority[1] == 5

    def test_rule_model_valid(self):
        rule = Rule(
            sid=1000001,
            raw='alert tcp any any -> any 80 ( msg:"Test"; sid:1000001; )',
        )
        assert rule.sid == 1000001
        assert rule.enabled is True
        assert rule.action == "alert"
        assert rule.proto == "ip"
        assert rule.rev == 1

    def test_rule_model_missing_raw_raises(self):
        with pytest.raises(ValidationError):
            Rule(sid=1000001)

    def test_rule_create_model(self):
        rc = RuleCreate(msg="New rule", sid=1000002)
        assert rc.action == "alert"
        assert rc.proto == "tcp"
        assert rc.source == "$EXTERNAL_NET"
        assert rc.enabled is True
        assert rc.sid == 1000002

    def test_rule_toggle_model(self):
        rt = RuleToggle(enabled=False)
        assert rt.enabled is False
        with pytest.raises(ValidationError):
            RuleToggle(enabled="not_a_bool")

    def test_validation_result_model(self):
        vr = ValidationResult(ok=True, output="Snort successfully validated the configuration!")
        assert vr.ok is True
        assert "Snort" in vr.output

    def test_service_status_model(self):
        st = ServiceStatus(
            running=True,
            backend="linux",
            version="3.1.75",
            interface="eth0",
            uptime_seconds=3600,
            pid=1234,
            packets_analyzed=50000,
            packets_dropped=0,
        )
        assert st.running is True
        assert st.backend == "linux"
        assert st.pid == 1234

    def test_service_action_valid_literals(self):
        for act in ["start", "stop", "restart"]:
            sa = ServiceAction(action=act)
            assert sa.action == act

    def test_service_action_invalid_literal_raises(self):
        with pytest.raises(ValidationError):
            ServiceAction(action="destroy")

    def test_snort_config_valid_and_defaults(self):
        cfg = SnortConfig()
        assert cfg.home_net == "192.168.1.0/24"
        assert cfg.external_net == "!$HOME_NET"
        assert cfg.interface == "eth0"
        assert cfg.tweak_profile == "balanced"

    def test_snort_config_invalid_tweak_raises(self):
        with pytest.raises(ValidationError):
            SnortConfig(tweak_profile="ultra_aggressive")

    def test_system_info_model(self):
        info = SystemInfo(
            version="3.1.75.0",
            build="build 123",
            backend="linux",
            inspectors=45,
            daq_modules=4,
            lua_version="Lua 5.3",
            hyperscan=True,
        )
        assert info.version == "3.1.75.0"
        assert info.hyperscan is True

    def test_run_options_model(self):
        ro = RunOptions()
        assert "ids" in ro.modes
        assert "pcap" in ro.daqs
        assert "alert_json" in ro.alert_modes
        assert "balanced" in ro.tweaks

    def test_auxiliary_models(self):
        nic = NetworkInterface(name="eth0", up=True, addresses=["192.168.1.10"])
        assert nic.name == "eth0"
        assert nic.up is True

        daq = DaqModule(name="pcap", mode="read-file", description="PCAP file reader")
        assert daq.name == "pcap"

        plug = Plugin(name="stream_tcp", type="inspector")
        assert plug.name == "stream_tcp"

        cat = RuleCategory(name="malware", total=10, enabled=8)
        assert cat.name == "malware"

        imp = ImportResult(imported=42, message="Success")
        assert imp.imported == 42

        logs = LogsResponse(lines=["Line 1", "Line 2"], source="snort.log")
        assert len(logs.lines) == 2

        cmd_res = ConsoleResult(command="snort -V", output="Snort 3", ok=True)
        assert cmd_res.ok is True
