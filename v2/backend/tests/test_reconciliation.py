"""Reconciliation checks execute on the isolated CI PostgreSQL database."""
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from db import connect
from reconciliation import calculate_report
from ledger import apply_wallet_delta

pytestmark = pytest.mark.skipif(
    not os.getenv("CI_TEST_DATABASE") or not os.getenv("DATABASE_URL"),
    reason="Isolated CI PostgreSQL required",
)


def register_account(client):
    response = client.post("/api/auth/register", json={
        "email": f"reconcile-{uuid.uuid4().hex}@example.invalid",
        "name": "CI Reconciliation", "password": "CI-Passphrase-With-Enough-Entropy",
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()["user"]["id"]


def test_balanced_journals_and_wallet_match(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-jwt-" + "b" * 64)
    user_id = register_account(create_app().test_client())
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT id FROM ledger_accounts WHERE code='paystack:clearing'")
            clearing_id = cur.fetchone()["id"]
            apply_wallet_delta(
                cur, user_id=user_id, delta_kobo=500000,
                reference="reconcile-credit:" + uuid.uuid4().hex,
                kind="funding", contra_account=clearing_id,
            )
    report = calculate_report()
    assert report["critical"]["unbalanced_journals"] == 0
    assert report["critical"]["wallet_balance_divergences"] == 0
    assert report["critical"]["suspense_vs_unresolved_delta_kobo"] == 0


def test_detects_balance_tampering_without_self_repair(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-jwt-" + "c" * 64)
    user_id = register_account(create_app().test_client())
    try:
        with connect() as conn:
            with conn.transaction(), conn.cursor() as cur:
                cur.execute("UPDATE wallets SET balance_kobo=100 WHERE user_id=%s", (user_id,))
        report = calculate_report()
        assert report["critical"]["wallet_balance_divergences"] >= 1
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT balance_kobo FROM wallets WHERE user_id=%s", (user_id,))
            assert cur.fetchone()["balance_kobo"] == 100
    finally:
        with connect() as conn:
            with conn.transaction(), conn.cursor() as cur:
                cur.execute("UPDATE wallets SET balance_kobo=0 WHERE user_id=%s", (user_id,))
