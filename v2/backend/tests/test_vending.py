"""Unit checks for fail-closed vending, without DB credentials or network."""
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import vending
from errors import ApiError


def configured(monkeypatch):
    monkeypatch.setenv("ELECTRICITY_VENDING_ENABLED", "true")
    monkeypatch.setenv("PAYMENTS_ENABLED", "true")
    monkeypatch.setenv("VTPASS_ENV", "sandbox")
    monkeypatch.setenv("VTPASS_API_KEY", "test-api")
    monkeypatch.setenv("VTPASS_SECRET_KEY", "test-secret")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())


def test_default_disables_vending(monkeypatch):
    monkeypatch.delenv("ELECTRICITY_VENDING_ENABLED", raising=False)
    with pytest.raises(ApiError):
        vending.enabled()


def test_payment_gate_also_required(monkeypatch):
    configured(monkeypatch)
    monkeypatch.setenv("PAYMENTS_ENABLED", "false")
    with pytest.raises(ApiError):
        vending.enabled()


def test_encryption(monkeypatch):
    configured(monkeypatch)
    ciphertext = vending.cipher().encrypt(b"28214114917067930943")
    assert b"28214114917067930943" not in ciphertext
    assert vending.cipher().decrypt(ciphertext) == b"28214114917067930943"


def test_input_gates():
    assert vending.valid_phone("08012345678")
    assert not vending.valid_phone("invalid")
    assert not vending.valid_idempotency("../evil")
    assert vending.valid_idempotency(uuid.uuid4().hex)


def test_uncertain_vend_marks_pending_not_retry(monkeypatch):
    configured(monkeypatch)
    order_id = uuid.uuid4()
    order = {"id": order_id, "provider_request_id": "202610161200" + "a" * 32,
             "disco": "ibadan-electric", "meter_number": "1111111111111",
             "amount_kobo": 200000, "phone": "08012345678"}
    with patch.object(vending, "claim_dispatch", return_value=order), \
         patch.object(vending.vtpass, "buy_electricity", side_effect=vending.vtpass.ProviderUncertain), \
         patch.object(vending, "mark_uncertain") as pending, \
         patch.object(vending.vtpass, "requery") as requery:
        assert vending.process_once()["status"] == "pending"
    pending.assert_called_once_with(order_id)
    requery.assert_not_called()


def test_requery_never_resends_purchase(monkeypatch):
    configured(monkeypatch)
    order_id = uuid.uuid4()
    order = {"id": order_id, "provider_request_id": "202610161200" + "b" * 32}
    with patch.object(vending, "claim_dispatch", return_value=None), \
         patch.object(vending, "claim_requery", return_value=order), \
         patch.object(vending.vtpass, "requery", return_value={"code": "099"}) as requery, \
         patch.object(vending, "apply_result", return_value="pending"), \
         patch.object(vending.vtpass, "buy_electricity") as pay:
        assert vending.process_once()["operation"] == "requery"
    requery.assert_called_once_with(order["provider_request_id"])
    pay.assert_not_called()


def test_response_must_match_original_meter():
    order = {"provider_request_id": "202610161200" + "c" * 32,
             "meter_number": "1111111111111"}
    assert not vending._provider_matches(order, {"requestId": "different"})
    assert not vending._provider_matches(order, {
        "content": {"transactions": {"unique_element": "2222222222222"}}})
    assert vending._provider_matches(order, {"requestId": order["provider_request_id"]})


def test_live_vending_double_gated(monkeypatch):
    configured(monkeypatch)
    monkeypatch.setenv("VTPASS_ENV", "live")
    monkeypatch.delenv("VTPASS_LIVE_ENABLED", raising=False)
    with pytest.raises(RuntimeError):
        vending.enabled()
