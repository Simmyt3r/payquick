import sys
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import vtpass_external_audit as audit
from errors import ApiError


ORDER = {
    "id": "fake-test-order", "provider_request_id": "202610161200" + "a" * 32,
    "amount_kobo": 200000, "meter_number": "1111111111111", "status": "delivered",
}


def requery(*, state="delivered", token=True):
    return {
        "code": "000", "requestId": ORDER["provider_request_id"], "amount": 2000,
        "content": {"transactions": {"status": state, "amount": "2000", "unique_element": ORDER["meter_number"]}},
        **({"Token": "2821 4114 9170 6793 0943"} if token else {}),
    }


def test_matched_requery_never_claims_meter_loaded():
    row = audit.evaluate_order(ORDER, requery())
    assert row["severity"] == "ok"
    assert row["remote_meter_loaded"] is False
    assert ORDER["provider_request_id"] not in str(row)


def test_mismatched_external_principal_requires_review():
    response = requery()
    response["amount"] = 1000
    assert audit.evaluate_order(ORDER, response)["severity"] == "critical"


def test_pending_requery_is_not_funding_failure():
    x = {**ORDER, "status": "pending"}
    assert audit.evaluate_order(x, {"code": "099"})["severity"] == "warning"


def test_invalid_environment_or_missing_approval_blocks_requests(monkeypatch):
    monkeypatch.delenv("VTPASS_RECON_READ_ENABLED", raising=False)
    with patch.object(audit.vtpass, "requery") as requery_call:
        with pytest.raises(ApiError):
            audit.run()
    requery_call.assert_not_called()


def test_external_queries_only_known_request_ids(monkeypatch):
    monkeypatch.setenv("VTPASS_RECON_READ_ENABLED", "true")
    monkeypatch.setenv("VTPASS_ENV", "sandbox")
    with patch.object(audit, "collect_orders", return_value=[ORDER]), \
         patch.object(audit.vtpass, "requery", return_value=requery()) as call:
        result = audit.run()
    assert result["status"] == "ok"
    call.assert_called_once_with(ORDER["provider_request_id"])
    assert "28214114917067930943" not in str(result)
