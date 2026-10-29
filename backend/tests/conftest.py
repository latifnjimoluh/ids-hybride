from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Generator

import pytest
from fastapi.testclient import TestClient

from app.auth import create_token
from app.controllers.linux import LinuxSnortController
from app.main import app
from app.models import Alert


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_token() -> str:
    return create_token("admin")


@pytest.fixture
def auth_headers(auth_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def sample_snort_alert_dict() -> dict:
    return {
        "timestamp": "09/25-12:32:47.047605",
        "action": "allow",
        "class": "none",
        "msg": "ICMP Ping detecte",
        "priority": 0,
        "proto": "ICMP",
        "src_addr": "172.17.26.2",
        "src_port": None,
        "dst_addr": "8.8.8.8",
        "dst_port": None,
        "service": "unknown",
        "rule": "1:1000001:1",
        "sid": 1000001,
        "gid": 1,
        "rev": 1,
        "dir": "C2S",
    }


@pytest.fixture
def isolated_controller(tmp_path: Path) -> LinuxSnortController:
    ctrl = LinuxSnortController()
    ctrl._alerts = tmp_path / "alert_json.txt"
    ctrl._rules = tmp_path / "local.rules"
    ctrl._config = tmp_path / "snort.lua"
    ctrl._alert_offset = 0
    return ctrl


@pytest.fixture
def generate_synthetic_log() -> Callable[[Path, int, str], Path]:
    def _gen(file_path: Path, count: int = 18000, prefix: str = "") -> Path:
        base_line = (
            '{{"timestamp": "09/25-12:32:47.{us:06d}", "action": "allow", '
            '"class": "bad-unknown", "msg": "{prefix}Alert {idx} detected malicious activity on network interface", '
            '"priority": 1, "proto": "TCP", "src_addr": "10.0.0.{src}", "src_port": {sport}, '
            '"dst_addr": "192.168.1.1", "dst_port": 80, "service": "http", "rule": "1:{sid}:1", '
            '"sid": {sid}, "gid": 1, "rev": 1, "dir": "C2S"}}\n'
        )
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with file_path.open("w", encoding="utf-8") as f:
            for i in range(count):
                f.write(base_line.format(
                    us=(i % 1000000),
                    prefix=prefix,
                    idx=i,
                    src=(i % 250) + 1,
                    sport=1024 + (i % 60000),
                    sid=1000000 + i,
                ))
        return file_path
    return _gen
