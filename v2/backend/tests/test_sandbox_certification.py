import sys
from pathlib import Path
from unittest.mock import patch

import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import sandbox_certification as cert
from errors import ApiError


def env(monkeypatch):
    monkeypatch.setenv("VTPASS_ENV", "sandbox")
    monkeypatch.setenv("VTPASS_API_KEY", "sandbox-api")
    monkeypatch.setenv("VTPASS_SECRET_KEY", "sandbox-secret")


def test_default_verify_is_read_only(monkeypatch):
    env(monkeypatch)
    with patch.object(cert.vtpass, "verify_meter", return_value={"minimum_kobo": 200000, "customer_name": "Sandbox"}) as verify, \
         patch.object(cert.vtpass, "buy_electricity") as pay:
        report = cert.verify_ibedc_sandbox()
    assert report["status"] == "passed"
    assert report["verified_physical_meter"] is False
    verify.assert_called_once()
    pay.assert_not_called()


def test_forbidden_in_live_env(monkeypatch):
    env(monkeypatch)
    monkeypatch.setenv("VTPASS_ENV", "live")
    monkeypatch.setenv("VTPASS_LIVE_ENABLED", "true")
    with pytest.raises(RuntimeError):
        cert.sandbox_only()


def test_purchase_requires_two_opt_ins(monkeypatch):
    env(monkeypatch)
    with pytest.raises(ApiError):
        cert.purchase_probe(amount_naira=2000, phone="08012345678", approved=True)
    monkeypatch.setenv("VTPASS_SANDBOX_SPEND_APPROVED", "true")
    with pytest.raises(ApiError):
        cert.purchase_probe(amount_naira=2000, phone="08012345678", approved=False)


def test_approved_sandbox_purchase_never_claims_meter_load(monkeypatch):
    env(monkeypatch)
    monkeypatch.setenv("VTPASS_SANDBOX_SPEND_APPROVED", "true")
    with patch.object(cert.vtpass, "buy_electricity", return_value={
        "code": "000", "content": {"transactions": {"status": "delivered"}},
        "purchased_code": "Token : 2821 4114 9170 6793 0943"
    }) as pay:
        result = cert.purchase_probe(amount_naira=2000, phone="08012345678", approved=True)
    assert result["physical_meter_loaded"] is False
    assert result["token_present"] is True
    assert "28214114917067930943" not in str(result)
    pay.assert_called_once()


def test_requery_retains_reference_privacy(monkeypatch):
    env(monkeypatch)
    ref = "202610161245" + "a" * 32
    with patch.object(cert.vtpass, "requery", return_value={"code": "099"}) as rq:
        result = cert.status_probe(ref)
    rq.assert_called_once_with(ref)
    assert result["provider_classification"] == "pending"
    assert ref not in str(result)
