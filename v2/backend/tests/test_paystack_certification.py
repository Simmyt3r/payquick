import sys
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import paystack_certification as cert
from errors import ApiError


def test_refuses_live_mode_even_if_read_enabled(monkeypatch):
    monkeypatch.setenv("PAYSTACK_MODE", "live")
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_live_test")
    monkeypatch.setenv("PAYSTACK_LIVE_READ_ENABLED", "true")
    with patch.object(cert.paystack_settlement, "_get") as get:
        with pytest.raises(ApiError):
            cert.probe()
    get.assert_not_called()


def test_only_lists_transactions_in_sandbox(monkeypatch):
    monkeypatch.setenv("PAYSTACK_MODE", "test")
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test_dummy")
    with patch.object(cert.paystack_settlement, "_get", return_value={"data": [{"reference": "not-visible"}]}) as get:
        result = cert.probe()
    assert result["read_only"] is True
    assert result["live_funds_moved"] is False
    assert "not-visible" not in str(result)
    get.assert_called_once_with("/transaction", {"perPage": 1, "page": 1})
