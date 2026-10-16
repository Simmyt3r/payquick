"""Paystack hosted checkout and server-side transaction verification."""
import os
import requests

from errors import ApiError


def _secret():
    key = os.getenv("PAYSTACK_SECRET_KEY", "")
    if not key:
        raise ApiError(503, "Payment provider is not configured")
    return key


def _request(method, path, body=None):
    base = os.getenv("PAYSTACK_BASE_URL", "https://api.paystack.co").rstrip("/")
    if base != "https://api.paystack.co":
        raise ApiError(503, "Unapproved Paystack API host")
    try:
        response = requests.request(
            method, base + path, json=body,
            headers={"Authorization": "Bearer " + _secret()},
            timeout=(5, 15),
        )
        response.raise_for_status()
        value = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ApiError(502, "Payment provider unavailable") from exc
    if not value.get("status"):
        raise ApiError(502, "Payment provider rejected request")
    return value.get("data") or {}


def initialize(*, email, amount_kobo, reference, callback_url=None):
    data = {"email": email, "amount": amount_kobo, "reference": reference, "currency": "NGN"}
    if callback_url:
        data["callback_url"] = callback_url
    return _request("POST", "/transaction/initialize", data)


def verify(reference):
    # References are generated internally from hex UUIDs.
    if not reference.startswith("PQF_") or len(reference) != 36:
        raise ApiError(400, "Invalid payment reference")
    return _request("GET", "/transaction/verify/" + reference)
