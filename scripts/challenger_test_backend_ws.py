#!/usr/bin/env python3
"""Adversarial stress-test for Backend WebSocket and Auth Guards.
Executed by challenger_m2_2.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import jwt

from app.main import app
from app.auth import create_token, _ALGO
from app.config import settings


class Reporter:
    def __init__(self):
        self.passes = 0
        self.fails = 0
        self.results = []

    def record(self, category: str, test_name: str, passed: bool, detail: str = ""):
        status = "PASS" if passed else "FAIL"
        if passed:
            self.passes += 1
        else:
            self.fails += 1
        print(f"[{status}] {category} :: {test_name} - {detail}")
        self.results.append((category, test_name, status, detail))


reporter = Reporter()
client = TestClient(app)

print("\n" + "=" * 80)
print("1. Backend WebSocket (/api/ws/alerts) Security & Token Validation")
print("=" * 80)

# 1.1 Missing token parameter
try:
    with client.websocket_connect("/api/ws/alerts") as ws:
        reporter.record("WebSocket Auth", "Missing Token", False, "Connection accepted unexpectedly")
except WebSocketDisconnect as e:
    reporter.record("WebSocket Auth", "Missing Token", e.code == 1008, f"Rejected with code {e.code}")
except Exception as e:
    reporter.record("WebSocket Auth", "Missing Token", False, f"Unexpected exception: {e}")

# 1.2 Empty token parameter
try:
    with client.websocket_connect("/api/ws/alerts?token=") as ws:
        reporter.record("WebSocket Auth", "Empty Token", False, "Connection accepted unexpectedly")
except WebSocketDisconnect as e:
    reporter.record("WebSocket Auth", "Empty Token", e.code == 1008, f"Rejected with code {e.code}")
except Exception as e:
    reporter.record("WebSocket Auth", "Empty Token", False, f"Unexpected exception: {e}")

# 1.3 Garbage / Malformed token parameter
for malformed in ["not_a_token", "invalid.jwt.token", "12345", "Bearer null", "undefined", "' OR '1'='1"]:
    try:
        with client.websocket_connect(f"/api/ws/alerts?token={malformed}") as ws:
            reporter.record("WebSocket Auth", f"Malformed Token ({malformed})", False, "Accepted invalid token")
    except WebSocketDisconnect as e:
        reporter.record("WebSocket Auth", f"Malformed Token ({malformed})", e.code == 1008, f"Rejected with code {e.code}")
    except Exception as e:
        reporter.record("WebSocket Auth", f"Malformed Token ({malformed})", False, f"Unexpected exception: {e}")

# 1.4 Expired JWT token
past_time = datetime.now(timezone.utc) - timedelta(hours=2)
expired_payload = {
    "sub": "admin",
    "iat": past_time - timedelta(minutes=10),
    "exp": past_time,
}
expired_token = jwt.encode(expired_payload, settings.secret_key, algorithm=_ALGO)
try:
    with client.websocket_connect(f"/api/ws/alerts?token={expired_token}") as ws:
        reporter.record("WebSocket Auth", "Expired Token", False, "Accepted expired token")
except WebSocketDisconnect as e:
    reporter.record("WebSocket Auth", "Expired Token", e.code == 1008, f"Rejected with code {e.code}")
except Exception as e:
    reporter.record("WebSocket Auth", "Expired Token", False, f"Unexpected exception: {e}")

# 1.5 Token signed with invalid secret key
tampered_token = jwt.encode({"sub": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, "wrong-secret-key", algorithm=_ALGO)
try:
    with client.websocket_connect(f"/api/ws/alerts?token={tampered_token}") as ws:
        reporter.record("WebSocket Auth", "Tampered Secret Token", False, "Accepted forged token")
except WebSocketDisconnect as e:
    reporter.record("WebSocket Auth", "Tampered Secret Token", e.code == 1008, f"Rejected with code {e.code}")
except Exception as e:
    reporter.record("WebSocket Auth", "Tampered Secret Token", False, f"Unexpected exception: {e}")

# 1.6 Valid Token -> Must connect and stream
valid_token = create_token("admin")
try:
    with client.websocket_connect(f"/api/ws/alerts?token={valid_token}") as ws:
        reporter.record("WebSocket Auth", "Valid Token Connect", True, "Successfully established WebSocket session")
except Exception as e:
    reporter.record("WebSocket Auth", "Valid Token Connect", False, f"Failed with valid token: {e}")


print("\n" + "=" * 80)
print("2. Backend REST Endpoints 401 Guard Validation")
print("=" * 80)

protected_endpoints = [
    ("GET", "/api/auth/me"),
    ("POST", "/api/auth/change-password"),
    ("GET", "/api/rules"),
    ("POST", "/api/rules"),
    ("GET", "/api/alerts"),
    ("GET", "/api/alerts/stats"),
    ("GET", "/api/service/status"),
    ("POST", "/api/service/action"),
    ("GET", "/api/service/run-options"),
    ("GET", "/api/config"),
    ("PUT", "/api/config"),
    ("GET", "/api/system/info"),
    ("GET", "/api/system/interfaces"),
    ("GET", "/api/pcap"),
    ("GET", "/api/logs"),
    ("GET", "/api/ml/status"),
]

for method, endpoint in protected_endpoints:
    # A: No token
    res_no_tok = client.request(method, endpoint)
    passed_no = res_no_tok.status_code == 401
    reporter.record("REST 401 Guard", f"No Token: {method} {endpoint}", passed_no, f"HTTP {res_no_tok.status_code}")

    # B: Invalid token
    res_bad_tok = client.request(method, endpoint, headers={"Authorization": "Bearer invalid_token"})
    passed_bad = res_bad_tok.status_code == 401
    reporter.record("REST 401 Guard", f"Invalid Token: {method} {endpoint}", passed_bad, f"HTTP {res_bad_tok.status_code}")

    # C: Expired token
    res_exp_tok = client.request(method, endpoint, headers={"Authorization": f"Bearer {expired_token}"})
    passed_exp = res_exp_tok.status_code == 401
    reporter.record("REST 401 Guard", f"Expired Token: {method} {endpoint}", passed_exp, f"HTTP {res_exp_tok.status_code}")

    # D: Valid token -> Not 401
    res_valid = client.request(method, endpoint, headers={"Authorization": f"Bearer {valid_token}"})
    passed_valid = res_valid.status_code != 401
    reporter.record("REST 401 Guard", f"Valid Token: {method} {endpoint}", passed_valid, f"HTTP {res_valid.status_code}")


print("\n" + "=" * 80)
print(f"Summary: {reporter.passes} PASSED, {reporter.fails} FAILED")
print("=" * 80)

if reporter.fails > 0:
    sys.exit(1)
sys.exit(0)
