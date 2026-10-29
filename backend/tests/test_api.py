from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings


class TestAPIEndpoints:
    def test_health_public(self, client: TestClient):
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data.get("status") == "ok"
        assert "backend" in data
        assert "version" in data

    def test_login_success(self, client: TestClient):
        res = client.post(
            "/api/auth/login",
            data={"username": settings.admin_user, "password": settings.admin_password},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data.get("token_type") == "bearer"
        assert data.get("username") == settings.admin_user

    def test_login_invalid_password(self, client: TestClient):
        res = client.post(
            "/api/auth/login",
            data={"username": settings.admin_user, "password": "completely_wrong_password"},
        )
        assert res.status_code == 401
        assert "detail" in res.json()

    @pytest.mark.parametrize(
        "endpoint",
        [
            "/api/auth/me",
            "/api/alerts",
            "/api/alerts/stats",
            "/api/rules",
            "/api/service/status",
            "/api/config",
            "/api/system/info",
            "/api/logs",
            "/api/ml/status",
        ],
    )
    def test_unauthenticated_request_returns_401(self, client: TestClient, endpoint: str):
        res = client.get(endpoint)
        assert res.status_code == 401

    def test_auth_me_authenticated(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/auth/me", headers=auth_headers)
        assert res.status_code == 200
        assert res.json().get("username") == "admin"

    def test_get_alerts_authenticated(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/alerts", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    def test_get_alerts_with_limit_query(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/alerts?limit=5", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) <= 5

    def test_get_alert_stats(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/alerts/stats", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "total" in data
        assert "by_priority" in data
        assert "timeline" in data

    def test_get_rules(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/rules", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_create_and_delete_rule(self, client: TestClient, auth_headers: dict):
        raw_rule = 'alert tcp any any -> any 8888 ( msg:"Automated Test Rule"; sid:8888888; rev:1; )'
        res = client.post("/api/rules", json={"raw": raw_rule}, headers=auth_headers)
        assert res.status_code == 201
        created = res.json()
        assert created.get("sid") == 8888888
        assert created.get("msg") == "Automated Test Rule"

        # Cleanup: delete the rule
        del_res = client.delete("/api/rules/8888888", headers=auth_headers)
        assert del_res.status_code == 204

    def test_get_rule_categories(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/rules/categories", headers=auth_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_validate_rules(self, client: TestClient, auth_headers: dict):
        res = client.post("/api/rules/validate", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "ok" in data
        assert "output" in data

    def test_get_service_status(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/service/status", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "running" in data
        assert "backend" in data

    def test_get_service_run_options(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/service/run-options", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "modes" in data
        assert "daqs" in data

    def test_get_config(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/config", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "home_net" in data
        assert "interface" in data

    def test_get_system_info(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/system/info", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "version" in data
        assert "backend" in data

    def test_get_logs(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/logs", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "lines" in data
        assert "source" in data

    def test_get_ml_status(self, client: TestClient, auth_headers: dict):
        res = client.get("/api/ml/status", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "installed" in data
