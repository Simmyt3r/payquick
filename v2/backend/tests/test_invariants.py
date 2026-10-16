"""Unit tests for fail-closed primitives, runnable without credentials."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import naira_to_kobo, create_app
from errors import ApiError
from ledger import post_journal
from meter import validate_meter, capability
from security import password_hash, password_verify


class FakeCursor:
    def __init__(self):
        self.commands = []
    def execute(self, sql, params):
        self.commands.append((sql, params))
    def fetchone(self):
        return {"id": "journal-id"}


def test_rejects_float_amounts():
    for amount in (2000.01, "2000", True, -5, 0):
        with pytest.raises(ApiError):
            naira_to_kobo(amount)


def test_integer_naira_conversion():
    assert naira_to_kobo(2000) == 200000


def test_unbalanced_journal_blocked_before_database():
    cur = FakeCursor()
    with pytest.raises(ValueError):
        post_journal(cur, reference="abc", kind="funding", postings=[("a", 150), ("b", -100)])
    assert cur.commands == []


def test_balanced_journal():
    cur = FakeCursor()
    post_journal(cur, reference="abc", kind="funding", postings=[("a", 150), ("b", -150)])
    assert len(cur.commands) == 3


def test_meter_remote_defaults_closed():
    assert capability({"id": "m1", "remote_loading_verified": False})["load_mode"] == "manual"


def test_meter_validation():
    with pytest.raises(ApiError):
        validate_meter(disco="unknown", meter_number="12345678", nickname="Home")
    assert validate_meter(disco="ikeja-electric", meter_number="12345678", nickname="Home") == ("12345678", "Home")


def test_password_hash_roundtrip():
    password = "a strong test password"
    assert password_verify(password_hash(password), password)
    assert not password_verify(password_hash(password), "bad password")


def test_health_without_database():
    app = create_app()
    with app.test_client() as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json["payments_enabled"] is False


def test_funding_disabled_before_auth_is_accepted():
    app = create_app()
    with app.test_client() as client:
        response = client.post("/api/wallet/funding-intents", json={"amount_naira": 500})
        assert response.status_code == 401
