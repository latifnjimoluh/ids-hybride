from __future__ import annotations

import pytest

from app.models import Rule
from app.rule_parser import build_rule, parse_rule, set_enabled


class TestRuleParser:
    def test_parse_active_rule_complete(self):
        line = 'alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( msg:"SQL Injection Attempt"; sid:1000001; rev:2; classtype:web-application-attack; )'
        rule = parse_rule(line)

        assert isinstance(rule, Rule)
        assert rule.sid == 1000001
        assert rule.enabled is True
        assert rule.action == "alert"
        assert rule.proto == "tcp"
        assert rule.msg == "SQL Injection Attempt"
        assert rule.classtype == "web-application-attack"
        assert rule.rev == 2
        assert rule.raw == line

    def test_parse_disabled_rule(self):
        line = '# alert udp any any -> 192.168.1.1 53 ( msg:"DNS Query Flood"; sid:1000002; )'
        rule = parse_rule(line)

        assert isinstance(rule, Rule)
        assert rule.sid == 1000002
        assert rule.enabled is False
        assert rule.action == "alert"
        assert rule.proto == "udp"
        assert rule.msg == "DNS Query Flood"
        assert rule.rev == 1  # default rev
        assert rule.classtype is None

    def test_parse_comment_line_returns_none(self):
        comments = [
            "# Configuration rules for internal network",
            "# ----------------------------------------",
            "# Author: Admin",
            "#",
        ]
        for c in comments:
            assert parse_rule(c) is None

    def test_parse_empty_or_whitespace_line_returns_none(self):
        assert parse_rule("") is None
        assert parse_rule("   \n\t") is None

    def test_parse_rule_without_sid_returns_none(self):
        line = 'alert tcp any any -> any 80 ( msg:"Missing SID rule"; rev:1; )'
        assert parse_rule(line) is None

    def test_parse_invalid_action_returns_none(self):
        line = 'detect tcp any any -> any 80 ( msg:"Invalid Action"; sid:1000003; )'
        assert parse_rule(line) is None

    @pytest.mark.parametrize("action", ["alert", "log", "pass", "drop", "reject", "sdrop", "block"])
    def test_parse_all_valid_actions(self, action: str):
        line = f'{action} ip any any -> any any ( msg:"Test Action {action}"; sid:1000010; )'
        rule = parse_rule(line)
        assert rule is not None
        assert rule.action == action
        assert rule.sid == 1000010

    def test_build_rule_canonical(self):
        built = build_rule(
            action="drop",
            proto="tcp",
            source="$EXTERNAL_NET",
            sport="any",
            direction="->",
            dest="$HOME_NET",
            dport="443",
            msg="Malicious TLS Handshake",
            sid=2000001,
            rev=3,
        )
        assert built == 'drop tcp $EXTERNAL_NET any -> $HOME_NET 443 ( msg:"Malicious TLS Handshake"; sid:2000001; rev:3; )'

        # Verify parsed back matches
        parsed = parse_rule(built)
        assert parsed is not None
        assert parsed.action == "drop"
        assert parsed.proto == "tcp"
        assert parsed.sid == 2000001
        assert parsed.rev == 3
        assert parsed.msg == "Malicious TLS Handshake"

    def test_build_rule_msg_quote_sanitization(self):
        built = build_rule(
            action="alert",
            proto="tcp",
            source="any",
            sport="any",
            direction="->",
            dest="any",
            dport="80",
            msg='Injection detected with "SELECT" payload',
            sid=2000002,
        )
        assert 'msg:"Injection detected with \'SELECT\' payload"' in built
        parsed = parse_rule(built)
        assert parsed is not None
        assert parsed.msg == "Injection detected with 'SELECT' payload"

    def test_set_enabled_toggle(self):
        raw_rule = 'alert tcp any any -> any 80 ( msg:"Test"; sid:1000001; )'

        # Disabling
        disabled = set_enabled(raw_rule, enabled=False)
        assert disabled.startswith("# ")
        assert raw_rule in disabled

        # Enabling
        enabled = set_enabled(disabled, enabled=True)
        assert not enabled.startswith("#")
        assert enabled == raw_rule

        # Idempotent enable
        assert set_enabled(raw_rule, enabled=True) == raw_rule

        # Idempotent disable
        assert set_enabled(disabled, enabled=False) == disabled
