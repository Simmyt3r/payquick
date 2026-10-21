"""One-time admin & migrations: isolated fresh PostgreSQL only, never production.

The fresh database is CREATED and DROPPED by this test, so existing CI migration
fixtures cannot conceal first-install failures.
"""
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
import migration_manager as manager

pytestmark = pytest.mark.skipif(
    not os.getenv("CI_TEST_DATABASE") or not os.getenv("DATABASE_URL"),
    reason="Requires isolated disposable PostgreSQL on CI",
)


@pytest.fixture
def empty_database(monkeypatch):
    original = os.environ["DATABASE_URL"]
    database = "pq_admin_test_" + uuid.uuid4().hex[:14]
    # Run with the existing CI database role, which can create an isolated
    # database. Never use this test against a customer/production database.
    with psycopg.connect(original, autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
    monkeypatch.setenv("DATABASE_URL", make_conninfo(original, dbname=database))
    try:
        yield database
    finally:
        monkeypatch.setenv("DATABASE_URL", original)
        with psycopg.connect(original, autocommit=True) as conn:
            conn.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()", (database,))
            conn.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(database)))


def setup(monkeypatch):
    secret = "CI-setup-token-" + "z" * 64
    password = "A-very-strong-temporary-admin-password"
    monkeypatch.setenv("PAYQUICK_SETUP_ENABLED", "true")
    monkeypatch.setenv("PAYQUICK_SETUP_TOKEN", secret)
    monkeypatch.setenv("PAYQUICK_ADMIN_EMAIL", "owner@example.invalid")
    monkeypatch.setenv("PAYQUICK_ADMIN_PASSWORD", password)
    monkeypatch.setenv("JWT_SECRET", "auth-" + "q" * 64)
    monkeypatch.setenv("PAYQUICK_ADMIN_MIGRATIONS_ENABLED", "false")
    monkeypatch.setenv("PAYMENTS_ENABLED", "false")
    monkeypatch.setenv("ELECTRICITY_VENDING_ENABLED", "false")
    monkeypatch.setenv("VTU_VENDING_ENABLED", "false")
    return {"X-Payquick-Setup-Token": secret}, password


def test_setup_token_protected_and_not_exposed(monkeypatch, empty_database):
    headers, _ = setup(monkeypatch)
    client = create_app().test_client()
    for url in ("/api/setup/status", "/api/setup/apply-next", "/api/setup/create-admin"):
        assert client.post(url).status_code == 403
        assert client.post(url, headers={"X-Payquick-Setup-Token": "wrong"}).status_code == 403
    assert client.get("/api/admin/migrations").status_code == 401
    response = client.post("/api/setup/status", headers=headers)
    assert response.status_code == 200, response.get_json()
    assert len(response.json["migrations"]) == 7
    assert response.json["next_migration"] == "0001_initial.sql"
    assert not response.json["bootstrap_completed"]
    assert "password" not in str(response.get_json()).lower()


def test_first_setup_migration_sequence_and_admin_lifecycle(monkeypatch, empty_database):
    headers, password = setup(monkeypatch)
    client = create_app().test_client()
    # No customer registration before the one-time bootstrap.
    assert client.post("/api/auth/register", json={
        "email": "before@example.invalid", "name": "Before Setup",
        "password": "a strong test password",
    }).status_code == 503

    names = [p.name for p in manager.migration_files()]
    assert names[-1] == "0007_admin_setup.sql"
    for name in names:
        response = client.post("/api/setup/apply-next", headers=headers)
        assert response.status_code == 200, (name, response.get_json())
        assert response.json == {"status": "applied", "applied": name}
        inspected = client.post("/api/setup/status", headers=headers)
        assert inspected.status_code == 200
        assert len([m for m in inspected.json["migrations"] if m["status"] == "applied"]) == names.index(name) + 1

    assert client.post("/api/setup/apply-next", headers=headers).json["status"] == "up_to_date"
    assert client.get("/api/ready").status_code == 503
    created = client.post("/api/setup/create-admin", headers=headers)
    assert created.status_code == 201, created.get_json()
    assert created.json["status"] == "complete"
    assert client.get("/api/ready").status_code == 200

    # The setup token is rejected after completion, even before env is cleared.
    for path in ("/api/setup/status", "/api/setup/apply-next", "/api/setup/create-admin"):
        assert client.post(path, headers=headers).status_code == 403

    login = client.post("/api/auth/login", json={
        "email": "owner@example.invalid", "password": password,
    })
    assert login.status_code == 200, login.get_json()
    assert login.json["user"]["role"] == "admin"
    token = {"Authorization": "Bearer " + login.json["access_token"]}
    status = client.get("/api/admin/migrations", headers=token)
    assert status.status_code == 200
    assert status.json["bootstrap_completed"]
    assert all(x["status"] == "applied" for x in status.json["migrations"])
    assert status.json["admin_migrations_enabled"] is False
    assert client.post("/api/admin/migrations/apply-next", json={"confirmation_password": password}, headers=token).status_code == 403

    monkeypatch.setenv("PAYQUICK_ADMIN_MIGRATIONS_ENABLED", "true")
    assert client.post("/api/admin/migrations/apply-next", json={"confirmation_password": "wrong"}, headers=token).status_code == 403
    ok = client.post("/api/admin/migrations/apply-next", json={"confirmation_password": password}, headers=token)
    assert ok.status_code == 200, ok.get_json()
    assert ok.json["status"] == "up_to_date"

    # A normal user cannot gain admin merely by submitting role=admin.
    customer = client.post("/api/auth/register", json={
        "email": "user@example.invalid", "name": "Normal User",
        "password": "a strong test password", "role": "admin",
    })
    assert customer.status_code == 201, customer.get_json()
    customer_token = {"Authorization": "Bearer " + customer.json["access_token"]}
    assert client.get("/api/admin/migrations", headers=customer_token).status_code == 403

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT filename, sha256 FROM payquick_schema_migrations ORDER BY filename")
            rows = cur.fetchall()
            assert [r[0] for r in rows] == names
            assert all(len(r[1]) == 64 for r in rows)
            cur.execute("SELECT count(*) FROM payquick_setup_state")
            assert cur.fetchone()[0] == 1


def test_initial_setup_disabled_by_default(monkeypatch, empty_database):
    headers, _ = setup(monkeypatch)
    monkeypatch.setenv("PAYQUICK_SETUP_ENABLED", "false")
    with create_app().test_client() as client:
        assert client.post("/api/setup/apply-next", headers=headers).status_code == 403
        assert client.post("/api/setup/create-admin", headers=headers).status_code == 403
        assert client.get("/api/admin/migrations").status_code == 401


def test_setup_does_not_accept_client_selected_sql(monkeypatch, empty_database):
    headers, _ = setup(monkeypatch)
    with create_app().test_client() as client:
        result = client.post("/api/setup/apply-next", headers=headers,
                             json={"sql": "DROP TABLE users", "migration": "../../../../secret"})
        assert result.status_code == 200, result.get_json()
        assert result.json["applied"] == "0001_initial.sql"
