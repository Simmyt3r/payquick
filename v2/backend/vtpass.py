"""VTpass electricity adapter. POST requests require API and secret key.

The VTpass result code alone is NOT proof of delivery. Unknown/timeouts must be
queried using the exact original request ID; NEVER blindly retry /pay.
Documentation:
https://vtpass.com/documentation/authentication/
https://vtpass.com/documentation/response-codes/
https://vtpass.com/documentation/how-to-generate-request-id/
"""
import os
import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from errors import ApiError


class ProviderUncertain(Exception):
    """We do not know whether money was taken by VTpass."""


def environment():
    env = os.getenv("VTPASS_ENV", "sandbox").lower()
    if env not in ("sandbox", "live"):
        raise RuntimeError("VTPASS_ENV must be sandbox or live")
    if env == "live" and os.getenv("VTPASS_LIVE_ENABLED") != "true":
        raise RuntimeError("Live VTpass vending requires an explicit second gate")
    return env


def endpoint():
    return "https://vtpass.com/api" if environment() == "live" else "https://sandbox.vtpass.com/api"


def request_id():
    # VTpass requires a YYYYMMDDHHII numeric prefix in Africa/Lagos timezone.
    prefix = datetime.now(ZoneInfo("Africa/Lagos")).strftime("%Y%m%d%H%M")
    return prefix + uuid.uuid4().hex


def _post(path, payload):
    api_key = os.getenv("VTPASS_API_KEY", "")
    secret = os.getenv("VTPASS_SECRET_KEY", "")
    if not api_key or not secret:
        raise ApiError(503, "VTpass credentials not configured")
    if path not in ("merchant-verify", "pay", "requery"):
        raise ValueError("Unapproved VTpass path")
    try:
        resp = requests.post(
            endpoint() + "/" + path,
            json=payload,
            headers={"api-key": api_key, "secret-key": secret, "Content-Type": "application/json"},
            timeout=(5, 25),
        )
        resp.raise_for_status()
        value = resp.json()
        if not isinstance(value, dict):
            raise ValueError("Provider response was not an object")
        return value
    except (requests.RequestException, ValueError) as exc:
        # Could have been processed even when the client received no response.
        raise ProviderUncertain("VTpass response unavailable or malformed") from exc


def verify_meter(disco, meter_number):
    result = _post("merchant-verify", {
        "billersCode": meter_number, "serviceID": disco, "type": "prepaid",
    })
    content = result.get("content")
    if result.get("code") not in ("000", "020") or not isinstance(content, dict):
        raise ApiError(422, "Meter verification failed; check number and distribution company")
    if content.get("WrongBillersCode") is True or str(content.get("Can_Vend", "yes")).lower() == "no":
        raise ApiError(422, "This meter is not eligible for vending")
    meter_type = str(content.get("Meter_Type", "prepaid")).lower()
    if meter_type and meter_type != "prepaid":
        raise ApiError(422, "The provider reports that this is not a prepaid meter")
    customer = str(content.get("Customer_Name") or content.get("CustomerName") or "").strip()
    if not customer or len(customer) > 200:
        raise ApiError(422, "Provider did not return a usable customer name")
    band = str(content.get("Service_Band") or "").strip().upper()[:32]
    try:
        provider_min = float(content.get("Min_Purchase_Amount") or content.get("Minimum_Amount") or 0)
    except (TypeError, ValueError):
        provider_min = 0
    min_naira = max(500, int(provider_min) if provider_min > 0 else 500)
    if disco == "ibadan-electric":
        # IBEDC specifies Band A >= ₦5,000, other bands >= ₦2,000.
        min_naira = max(min_naira, 5000 if band.startswith("A") else 2000)
    return {"customer_name": customer, "service_band": band, "minimum_kobo": min_naira * 100}


def buy_electricity(*, request_id_value, disco, meter_number, amount_kobo, phone):
    if not re.fullmatch(r"\d{12}[a-f0-9]{32}", request_id_value):
        raise ValueError("Invalid VTpass request_id format")
    if type(amount_kobo) is not int or amount_kobo % 100:
        raise ValueError("VTpass electricity amount must be whole naira")
    return _post("pay", {
        "request_id": request_id_value,
        "serviceID": disco,
        "billersCode": meter_number,
        "variation_code": "prepaid",
        "amount": amount_kobo // 100,
        "phone": phone,
    })


def requery(request_id_value):
    if not re.fullmatch(r"\d{12}[a-f0-9]{32}", request_id_value):
        raise ValueError("Invalid VTpass request_id")
    return _post("requery", {"request_id": request_id_value})


def classify(response):
    """Return (state, token). Fail only on explicitly final negative evidence.

    A 'delivered' provider state is successful vending, not evidence that a
    remote meter has loaded the generated token.
    """
    code = str(response.get("code", ""))
    body = response.get("content") or {}
    if not isinstance(body, dict):
        body = {}
    transaction = body.get("transactions") or {}
    if not isinstance(transaction, dict):
        transaction = {}
    status = str(transaction.get("status", "")).lower()
    if code in ("000", "001") and status == "delivered":
        return "delivered", extract_token(response)
    if code in ("091", "016", "040") or status in ("failed", "reversed"):
        return "failed", None
    return "pending", None


def extract_token(response):
    """Never invent tokens: accept only exactly 20 digits from trusted fields."""
    body = response.get("content") or {}
    tx = body.get("transactions") if isinstance(body, dict) else {}
    candidates = [
        response.get("Token"), response.get("token"), response.get("purchased_code"),
        tx.get("token") if isinstance(tx, dict) else None,
        tx.get("extras") if isinstance(tx, dict) else None,
    ]
    for item in candidates:
        if not isinstance(item, str):
            continue
        # Token often appears as "Token : 2821 4114 9170 6793 0943".
        match = re.search(r"(?<!\d)((?:\d[\s-]*){20})(?!\d)", item)
        if match:
            value = re.sub(r"\D", "", match.group(1))
            if len(value) == 20:
                return value
    return None
