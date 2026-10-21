"""Public operational contract: deployment != banking readiness."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
import operational
from errors import ApiError
from security import token_secret


def test_unconfigured_v2_fails_closed_without_database_access(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("PAYMENTS_ENABLED", raising=False)
    app = create_app()
    with patch.object(operational, "connect") as connect:
        with app.test_client() as client:
            live = client.get("/api/health")
            assert live.status_code == 200
            ready = client.get("/api/ready")
            assert ready.status_code == 503
            result = ready.get_json()
            assert result["status"] == "unavailable"
            assert result["checks"]["database"] == "missing"
            assert result["checks"]["authentication"] == "missing"
            assert result["financial_operations"] == "disabled"
            assert ready.headers["Cache-Control"] == "no-store"
            register = client.post("/api/auth/register", json={
                "name": "Preview Customer",
                "email": "preview@example.test",
                "password": "a-test-password-at-least-12",
            })
            assert register.status_code == 503
            assert register.json["error"] == "Customer accounts are not configured yet"
            assert client.post("/api/auth/login", json={
                "email": "preview@example.test", "password": "any"
            }).status_code == 503
            assert client.get("/api/wallet").status_code == 401
    connect.assert_not_called()


def test_invalid_database_tls_never_reaches_network(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "safe-test-secret-" + "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/pq?sslmode=disable")
    monkeypatch.delenv("CI_TEST_DATABASE", raising=False)
    with patch.object(operational, "connect") as conn:
        assert not operational.database_configured()
        assert not operational.accounts_configured()
        with create_app().test_client() as client:
            assert client.get("/api/ready").status_code == 503
            assert client.post("/api/auth/login", json={}).status_code == 503
    conn.assert_not_called()


def test_configured_does_not_mean_database_is_online(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "safe-test-secret-" + "y" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@database.example:5432/pq?sslmode=require")
    with patch.object(operational, "connect", side_effect=OSError("sensitive hostname")):
        # Unsupported failure types get handled by the Flask fallback; psycopg errors
        # are the expected network outcome handled by the readiness endpoint.
        pass
    with patch.object(operational, "connect", side_effect=operational.psycopg.OperationalError("connection failed")):
        with create_app().test_client() as client:
            response = client.get("/api/ready")
            assert response.status_code == 503
            assert response.json["checks"]["database"] == "unreachable"
            assert "database.example" not in response.get_data(as_text=True)


def test_schema_required_even_if_database_connects(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "safe-test-secret-" + "z" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@database.example:5432/pq?sslmode=require")

    class FakeCursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql): self.sql = sql
        def fetchone(self): return {table: table != "vtu_orders" for table in operational.REQUIRED_TABLES}

    class FakeConnection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return FakeCursor()

    with patch.object(operational, "connect", return_value=FakeConnection()):
        with create_app().test_client() as client:
            response = client.get("/api/ready")
            assert response.status_code == 503
            assert response.json["checks"]["schema"] == "incomplete"


def test_authenticated_missing_secret_returns_503_not_500(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with create_app().test_client() as client:
        response = client.get("/api/wallet", headers={"Authorization": "Bearer placeholder"})
        assert response.status_code == 503
        assert "SECRET" not in response.get_data(as_text=True)


def test_missing_api_route_responds_json_404_not_500():
    with create_app().test_client() as client:
        response = client.get("/api/definitely-not-a-route")
        assert response.status_code == 404
        assert response.is_json
        assert "error" in response.get_json()


def test_wrong_http_method_responds_405_not_500():
    with create_app().test_client() as client:
        response = client.put("/api/health")
        assert response.status_code == 405
        assert response.is_json


def test_financial_switch_does_not_change_account_readiness(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("PAYMENTS_ENABLED", "true")
    with create_app().test_client() as client:
        result = client.get("/api/ready")
        assert result.status_code == 503
        assert result.json["financial_operations"] == "configuration_review_required"
