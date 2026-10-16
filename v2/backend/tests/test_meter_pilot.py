from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from errors import ApiError
from meter_pilot import NoPartnerAdapter, PilotAuthorization, can_attempt_load, interpret_partner_ack


def authorization():
    now = datetime.now(timezone.utc)
    return PilotAuthorization(
        meter_id="meter-01", provider_name="Authorized Example",
        meter_model="Supported-Test-Model", partner_agreement_reference="PILOT-CONTRACT-1",
        capability_reference="MODEL-CAPABILITY-1",
        customer_consented_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=5),
    )


def test_unverified_partner_transport_cannot_submit_tokens():
    adapter = NoPartnerAdapter()
    assert adapter.check_capability(meter_id="meter-01")["remote_loading"] is False
    with pytest.raises(ApiError):
        adapter.submit_existing_token(meter_id="meter-01", token="12345678901234567890")


def test_only_vended_token_and_matching_meter_may_be_attempted():
    approval = authorization()
    assert can_attempt_load(approval=approval, meter_id="meter-01", vend_status="delivered",
                            token="12345678901234567890")
    with pytest.raises(ApiError):
        can_attempt_load(approval=approval, meter_id="other", vend_status="delivered",
                         token="12345678901234567890")
    with pytest.raises(ApiError):
        can_attempt_load(approval=approval, meter_id="meter-01", vend_status="pending",
                         token="12345678901234567890")


def test_expired_pilot_cannot_qualify():
    now = datetime.now(timezone.utc)
    expired = PilotAuthorization(**{
        **authorization().__dict__, "expires_at": now - timedelta(hours=1),
    })
    with pytest.raises(ApiError):
        can_attempt_load(approval=expired, meter_id="meter-01", vend_status="delivered",
                         token="12345678901234567890")


def ack(state="accepted"):
    return {
        "meter_id": "meter-01", "load_reference": "ref-01", "status": state,
        "meter_acceptance_reference": "partner-accept-01",
    }


def interpret(response, verifier=lambda x: False):
    return interpret_partner_ack(
        expected_meter="meter-01", expected_load_reference="ref-01",
        response=response, verify_partner_signature=verifier,
    )


def test_submitted_is_not_loaded():
    assert interpret(ack("submitted"), verifier=lambda r: True) == "submitted"


def test_spoofed_acceptance_is_not_loaded():
    assert interpret(ack(), verifier=lambda r: False) == "unknown"


def test_partner_signed_acceptance_is_loaded():
    assert interpret(ack(), verifier=lambda r: True) == "loaded"


def test_wrong_meter_or_load_reference_is_not_loaded():
    payload = ack()
    payload["meter_id"] = "someone-elses-meter"
    assert interpret(payload, verifier=lambda r: True) == "unknown"
    payload = ack()
    payload["load_reference"] = "wrong"
    assert interpret(payload, verifier=lambda r: True) == "unknown"
