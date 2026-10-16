"""PostgreSQL-backed end-to-end vending regression tests.

Uses a fresh, ephemeral GitHub Actions PostgreSQL service. Provider HTTP calls
are mocked; never send real funds or transmit tokens in this test suite.
"""
import os
import sys
import uuid
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from db import connect
from ledger import apply_wallet_delta
import vending
import vtpass


pytestmark = pytest.mark.skipif(
    not os.getenv("CI_TEST_DATABASE") or not os.getenv("DATABASE_URL"),
    reason="Isolated CI PostgreSQL required; no production DB access",
)


def new_customer(client):
    email = f"test-{uuid.uuid4().hex}@example.invalid"
    password = "CI-Secure-Password-Of-20-Chars"
    response = client.post("/api/auth/register", json={
        "name": "CI Electricity Tester", "email": email, "password": password,
    })
    assert response.status_code == 201, response.get_json()
    user = response.get_json()
    headers = {"Authorization": "Bearer " + user["access_token"]}
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.get_json()
    return user, headers, password


def setup_order(client, monkeypatch, *, expected_amount=2000):
    monkeypatch.setenv("JWT_SECRET", "ci-session-secret-" + "z" * 64)
    monkeypatch.setenv("METER_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("ELECTRICITY_VENDING_ENABLED", "true")
    monkeypatch.setenv("PAYMENTS_ENABLED", "true")
    monkeypatch.setenv("VTPASS_ENV", "sandbox")
    monkeypatch.setenv("VTPASS_API_KEY", "ci-api-key")
    monkeypatch.setenv("VTPASS_SECRET_KEY", "ci-secret-key")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())

    user, headers, password = new_customer(client)
    user_id = user["user"]["id"]
    wallet = client.get("/api/wallet", headers=headers)
    assert wallet.status_code == 200
    assert wallet.get_json()["balance_kobo"] == 0

    # Test fixture credit through the same server-owned double-entry ledger.
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT id FROM ledger_accounts WHERE code='paystack:clearing'")
            clearing_id = cur.fetchone()["id"]
            apply_wallet_delta(
                cur, user_id=user_id, delta_kobo=expected_amount * 100,
                reference="testfund:" + uuid.uuid4().hex,
                kind="funding", contra_account=clearing_id,
            )

    meter = client.post("/api/meters", headers=headers, json={
        "nickname": "CI Home", "disco": "ibadan-electric",
        "meter_type": "prepaid", "meter_number": "1111111111111",
    })
    assert meter.status_code == 201, meter.get_json()
    meter_id = meter.get_json()["id"]

    # Must verify owner+meter before quote.
    preverify_quote = client.post("/api/electricity/quotes", headers=headers, json={
        "meter_id": meter_id, "amount_naira": expected_amount,
    })
    assert preverify_quote.status_code == 409

    def fake_verify(disco, number):
        assert disco == "ibadan-electric"
        assert number == "1111111111111"
        return {"customer_name": "CI VERIFIED", "service_band": "B", "minimum_kobo": 200000}
    monkeypatch.setattr(vtpass, "verify_meter", fake_verify)
    verification = client.post(f"/api/meters/{meter_id}/verify", headers=headers, json={})
    assert verification.status_code == 200, verification.get_json()

    quote_response = client.post("/api/electricity/quotes", headers=headers, json={
        "meter_id": meter_id, "amount_naira": expected_amount,
    })
    assert quote_response.status_code == 201, quote_response.get_json()
    quote = quote_response.get_json()
    assert quote["total_kobo"] == expected_amount * 100
    assert quote["verified_customer_name"] == "CI VERIFIED"
    assert not quote["remote_loading_supported"]

    idem = uuid.uuid4().hex
    payload = {
        "quote_id": quote["quote_id"], "phone": "08012345678",
        "idempotency_key": idem, "confirmation_password": password,
    }
    first = client.post("/api/electricity/orders", headers=headers, json=payload)
    assert first.status_code == 201, first.get_json()
    order_id = first.get_json()["order_id"]
    duplicate = client.post("/api/electricity/orders", headers=headers, json=payload)
    assert duplicate.status_code == 200
    assert duplicate.get_json()["order_id"] == order_id
    assert duplicate.get_json()["duplicate"] is True
    assert client.get("/api/wallet", headers=headers).get_json()["balance_kobo"] == 0
    return headers, user_id, order_id


def prove_ledgers_balanced():
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT transaction_id,SUM(amount_kobo) AS total FROM ledger_entries "
            "GROUP BY transaction_id HAVING SUM(amount_kobo)<>0"
        )
        assert cur.fetchall() == []


def test_pending_then_requery_delivers_once(monkeypatch):
    client = create_app().test_client()
    headers, user_id, order_id = setup_order(client, monkeypatch)
    pay_ids = []

    def fake_pay(**kw):
        pay_ids.append(kw["request_id_value"])
        assert kw["amount_kobo"] == 200000
        return {"code": "099", "response_description": "processing"}
    monkeypatch.setattr(vtpass, "buy_electricity", fake_pay)
    assert vending.process_once()["status"] == "pending"
    assert len(pay_ids) == 1
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "UPDATE electricity_orders SET next_check_at=now() WHERE id=%s",
                (order_id,),
            )

    def fake_requery(ref):
        assert ref == pay_ids[0]
        return {
            "code": "000", "requestId": ref,
            "content": {"transactions": {
                "status": "delivered", "unique_element": "1111111111111",
                "transactionId": "provider-test-123",
            }},
            "Token": "2821 4114 9170 6793 0943",
        }
    monkeypatch.setattr(vtpass, "requery", fake_requery)
    assert vending.process_once()["status"] == "delivered"
    receipt = client.get(f"/api/electricity/orders/{order_id}", headers=headers)
    assert receipt.status_code == 200, receipt.get_json()
    assert receipt.get_json()["status"] == "delivered"
    assert receipt.get_json()["token"] == "28214114917067930943"
    assert receipt.get_json()["token_loading_status"] == "not_attempted"
    assert len(pay_ids) == 1
    history = client.get("/api/electricity/orders", headers=headers)
    assert history.status_code == 200
    assert any(row["id"] == order_id for row in history.get_json()["orders"])
    prove_ledgers_balanced()


def test_explicit_requery_failure_refunds_once(monkeypatch):
    client = create_app().test_client()
    headers, user_id, order_id = setup_order(client, monkeypatch)
    monkeypatch.setattr(vtpass, "buy_electricity", lambda **kw: {"code": "091"})
    # Direct failure is pending until an independently queried definitive result.
    assert vending.process_once()["status"] == "pending"
    assert client.get("/api/wallet", headers=headers).get_json()["balance_kobo"] == 0
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("UPDATE electricity_orders SET next_check_at=now() WHERE id=%s", (order_id,))
    monkeypatch.setattr(vtpass, "requery", lambda ref: {"code": "016", "requestId": ref})
    assert vending.process_once()["status"] == "failed"
    assert client.get("/api/wallet", headers=headers).get_json()["balance_kobo"] == 200000
    assert vending.apply_result(order_id, {"code": "016"}, from_requery=True) == "failed"
    assert client.get("/api/wallet", headers=headers).get_json()["balance_kobo"] == 200000
    prove_ledgers_balanced()
