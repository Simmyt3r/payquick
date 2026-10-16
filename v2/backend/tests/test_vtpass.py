"""Provider protocol tests without secret keys or outbound calls."""
import re
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import vtpass
from errors import ApiError


def test_request_id_obeys_lagos_format():
    value = vtpass.request_id()
    assert re.fullmatch(r"\d{12}[a-f0-9]{32}", value)
    assert value[:8] == vtpass.datetime.now(vtpass.ZoneInfo("Africa/Lagos")).strftime("%Y%m%d")


def test_post_headers_use_secret_key_not_username(monkeypatch):
    monkeypatch.setenv("VTPASS_API_KEY", "test_api_key")
    monkeypatch.setenv("VTPASS_SECRET_KEY", "test_secret_key")
    monkeypatch.setenv("VTPASS_ENV", "sandbox")
    fake = Mock()
    fake.raise_for_status.return_value = None
    fake.json.return_value = {"code": "099"}
    with patch.object(vtpass.requests, "post", return_value=fake) as send:
        vtpass.requery("202610161245" + "a" * 32)
        assert send.call_args.kwargs["headers"]["api-key"] == "test_api_key"
        assert send.call_args.kwargs["headers"]["secret-key"] == "test_secret_key"
        assert send.call_args.args[0] == "https://sandbox.vtpass.com/api/requery"


def test_live_vending_fails_closed(monkeypatch):
    monkeypatch.setenv("VTPASS_ENV", "live")
    monkeypatch.delenv("VTPASS_LIVE_ENABLED", raising=False)
    with pytest.raises(RuntimeError):
        vtpass.endpoint()


@pytest.mark.parametrize("response", [
    {"code": "099"}, {"code": "014"}, {"code": "015"}, {"code": "083"},
    {"code": "000", "content": {"transactions": {"status": "pending"}}},
    {"code": "000", "content": {"transactions": {"status": "initiated"}}},
])
def test_uncertain_provider_responses_are_pending(response):
    assert vtpass.classify(response) == ("pending", None)


def test_delivered_extracts_token():
    response = {"code": "000", "Token": "2821 4114 9170 6793 0943", "content": {"transactions": {"status": "delivered"}}}
    assert vtpass.classify(response) == ("delivered", "28214114917067930943")


def test_delivered_without_token_is_not_invented():
    response = {"code": "000", "content": {"transactions": {"status": "delivered"}}}
    assert vtpass.classify(response) == ("delivered", None)


@pytest.mark.parametrize("code", ["091", "016", "040"])
def test_definitive_failure_codes(code):
    assert vtpass.classify({"code": code}) == ("failed", None)


def test_long_numeric_string_not_a_token():
    assert vtpass.extract_token({"Token": "1234567890123456789012"}) is None


def test_ibadan_service_band_minimum(monkeypatch):
    monkeypatch.setattr(vtpass, "_post", lambda *_: {"code": "000", "content": {
        "Customer_Name": "A CUSTOMER", "WrongBillersCode": False, "Service_Band": "A",
    }})
    result = vtpass.verify_meter("ibadan-electric", "1111111111111")
    assert result["minimum_kobo"] == 500000


def test_ibadan_other_band_minimum(monkeypatch):
    monkeypatch.setattr(vtpass, "_post", lambda *_: {"code": "000", "content": {
        "Customer_Name": "A CUSTOMER", "WrongBillersCode": False, "Service_Band": "B",
    }})
    assert vtpass.verify_meter("ibadan-electric", "1111111111111")["minimum_kobo"] == 200000


def test_wrong_meter_fails(monkeypatch):
    monkeypatch.setattr(vtpass, "_post", lambda *_: {
        "code": "000", "content": {"WrongBillersCode": True, "Customer_Name": "X"},
    })
    with pytest.raises(ApiError):
        vtpass.verify_meter("ibadan-electric", "1111111111111")


def test_timeout_is_not_failure(monkeypatch):
    monkeypatch.setenv("VTPASS_API_KEY", "x")
    monkeypatch.setenv("VTPASS_SECRET_KEY", "y")
    with patch.object(vtpass.requests, "post", side_effect=vtpass.requests.Timeout):
        with pytest.raises(vtpass.ProviderUncertain):
            vtpass._post("pay", {"request_id": "202610161245" + "a" * 32})
