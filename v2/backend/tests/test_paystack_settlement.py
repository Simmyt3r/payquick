import sys
from pathlib import Path
from unittest.mock import patch, Mock

import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paystack_settlement import compare_funding, _mode_key, _pages, _dates
from errors import ApiError


def local(ref="PQF_abc", **kwargs):
    return {"reference": ref, "amount_kobo": 200000, "status": "credited", "provider_transaction_id": "42", **kwargs}


def external(ref="PQF_abc", **kwargs):
    return {"reference": ref, "amount": 200000, "status": "success", "currency": "NGN", "domain": "test", "id": 42, **kwargs}


def test_matching_gross_amount_and_settlement_pass():
    outcome = compare_funding([local()], [external()], {"PQF_abc"}, environment="test")
    assert outcome["status"] == "ok"


def test_detects_missing_external_and_never_autocredits():
    outcome = compare_funding([local()], [], set(), environment="test")
    assert outcome["status"] == "failed"
    assert outcome["exceptions"][0]["type"] == "credited_but_not_on_statement"


def test_provider_principal_mismatch_is_critical():
    tx = external()
    tx["amount"] = 100000
    assert "funding_principal_mismatch" in [i["type"] for i in compare_funding([local()], [tx], {"PQF_abc"}, environment="test")["exceptions"]]


def test_not_settled_yet_is_warning():
    outcome = compare_funding([local()], [external()], set(), environment="test")
    assert outcome["status"] == "attention"
    assert outcome["counts"]["warnings"] == 1


def test_external_success_with_no_wallet_credit_is_critical():
    x = local()
    x["status"] = "pending"
    outcome = compare_funding([x], [external()], {"PQF_abc"}, environment="test")
    assert outcome["status"] == "failed"


def test_test_live_domain_mix_is_critical():
    tx = external()
    tx["domain"] = "live"
    report = compare_funding([local()], [tx], {"PQF_abc"}, environment="test")
    assert report["status"] == "failed"


def test_secret_environment_pair_must_match(monkeypatch):
    monkeypatch.setenv("PAYSTACK_MODE", "test")
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_live_invalid")
    with pytest.raises(ApiError):
        _mode_key()
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test_valid")
    assert _mode_key()[0] == "test"
    monkeypatch.setenv("PAYSTACK_MODE", "live")
    with pytest.raises(ApiError):
        _mode_key()


def test_date_window_cannot_include_current_day():
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with pytest.raises(ValueError):
        _dates(now, now)


def test_ref_hash_not_raw_customer_reference():
    output = compare_funding([local()], [], set(), environment="test")
    assert "PQF_abc" not in str(output)


def test_pagination_does_not_silently_truncate():
    fake = {"status": True, "data": [{"reference": "x"}] * 100}
    with patch("paystack_settlement._get", return_value=fake):
        with pytest.raises(ApiError):
            _pages("/transaction", {}, max_pages=2)


def test_pagination_stops_on_partial_page():
    with patch("paystack_settlement._get", return_value={"data": [{"reference": "x"}], "status": True}) as request:
        result = _pages("/transaction", {})
    assert len(result) == 1
    request.assert_called_once()
