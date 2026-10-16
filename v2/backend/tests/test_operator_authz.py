"""Authz regression against fresh PostgreSQL service, no elevated public access."""
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from db import connect

pytestmark = pytest.mark.skipif(
    not os.getenv("CI_TEST_DATABASE") or not os.getenv("DATABASE_URL"),
    reason="Requires isolated CI PostgreSQL",
)


def test_operator_reports_are_private_and_roles_cannot_be_self_assigned(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "integration-roles-" + "x" * 64)
    client = create_app().test_client()
    anonymous = client.get("/api/operator/reconciliation")
    assert anonymous.status_code == 401
    registration = client.post("/api/auth/register", json={
        "email": f"customer-{uuid.uuid4().hex}@example.invalid",
        "name": "Audit Customer",
        "password": "A-long-development-test-password",
        "role": "operator",  # ignored, as it must be
    })
    assert registration.status_code == 201
    payload = registration.get_json()
    token = payload["access_token"]
    user_id = payload["user"]["id"]
    headers = {"Authorization": "Bearer " + token}
    assert client.get("/api/operator/reconciliation", headers=headers).status_code == 403
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT role FROM users WHERE id=%s", (user_id,))
        assert cur.fetchone()["role"] == "customer"

    try:
        # Trusted operator bootstrap is an administrative DB action only.
        with connect() as conn:
            with conn.transaction(), conn.cursor() as cur:
                cur.execute("UPDATE users SET role='operator' WHERE id=%s", (user_id,))
        response = client.get("/api/operator/reconciliation", headers=headers)
        assert response.status_code == 200, response.get_json()
        assert "critical" in response.get_json()
        assert "warnings" in response.get_json()
        # Aggregate warning keys may mention "token", but never expose a
        # token value, encrypted token, meter number or personal identity.
        assert "token_ciphertext" not in response.get_json()
        assert "meter_number" not in response.get_json()
        assert "password_hash" not in response.get_json()
    finally:
        with connect() as conn:
            with conn.transaction(), conn.cursor() as cur:
                cur.execute("UPDATE users SET role='customer' WHERE id=%s", (user_id,))
    # Same JWT, but role revoked in DB: access disappears immediately.
    assert client.get("/api/operator/reconciliation", headers=headers).status_code == 403
