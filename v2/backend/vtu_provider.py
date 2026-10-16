"""Conventional VTU catalog and provider adapters.

Standard airtime, data and TV purchases must work without voice AI,
smart meters, automation rules, or knowledge of any advanced feature.
No pricing is ever accepted from the browser for fixed-price products.
"""
import os
import re
from decimal import Decimal, InvalidOperation

import requests

import vtpass
from errors import ApiError
from vending import valid_phone

AIRTIME = {"mtn": "MTN", "airtel": "Airtel", "glo": "Glo", "etisalat": "9mobile"}
DATA = {"mtn-data": "MTN", "airtel-data": "Airtel", "glo-data": "Glo", "etisalat-data": "9mobile"}
TV = {"dstv": "DStv", "gotv": "GOtv", "startimes": "StarTimes"}
CATALOG = {"airtime": AIRTIME, "data": DATA, "tv": TV}


def details(category, service_id):
    if category not in CATALOG or service_id not in CATALOG[category]:
        raise ApiError(400, "Choose a supported VTU service")
    return {"category": category, "service_id": service_id,
            "provider_name": CATALOG[category][service_id]}


def catalog():
    return {
        "categories": [
            {"id": category, "name": {"airtime": "Airtime", "data": "Mobile data",
             "tv": "Cable TV"}[category],
             "services": [{"id": key, "name": value} for key, value in services.items()]}
            for category, services in CATALOG.items()
        ],
        "manual_checkout": True,
        "requires_ai": False,
        "requires_meter_auto_loading": False,
        "message": "Normal VTU checkout is available independently of advanced services.",
    }


def _money(value):
    try:
        if isinstance(value, bool):
            return None
        amount = Decimal(str(value))
        kobo = amount * 100
        if not amount.is_finite() or amount <= 0 or kobo != kobo.to_integral_value():
            return None
        return int(kobo)
    except (InvalidOperation, TypeError, ValueError):
        return None


def _public_get(service):
    api_key = os.getenv("VTPASS_API_KEY", "")
    public = os.getenv("VTPASS_PUBLIC_KEY", "")
    if not api_key or not public:
        raise ApiError(503, "VTU catalogue provider not configured")
    try:
        response = requests.get(
            vtpass.endpoint() + "/service-variations",
            params={"serviceID": service},
            headers={"api-key": api_key, "public-key": public},
            timeout=(5, 15),
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ApiError(503, "Provider plans temporarily unavailable") from exc
    if not isinstance(payload, dict):
        raise ApiError(503, "Provider catalogue malformed")
    return payload


def variations(category, service_id):
    details(category, service_id)
    if category == "airtime":
        return {"plans": [], "type": "amount"}
    payload = _public_get(service_id)
    content = payload.get("content")
    items = content.get("variations") if isinstance(content, dict) else None
    if not isinstance(items, list):
        raise ApiError(503, "Provider did not provide valid plans")
    plans = []
    for item in items:
        if not isinstance(item, dict):
            continue
        code, name = item.get("variation_code"), item.get("name")
        amount = _money(item.get("variation_amount"))
        if (not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", code)
                or not isinstance(name, str) or not 1 <= len(name) <= 160
                or not amount or not 10000 <= amount <= 20000000):
            continue
        if str(item.get("fixedPrice", "Yes")).lower() not in ("yes", "true"):
            continue
        plans.append({"code": code, "name": name, "amount_kobo": amount})
    if not plans:
        raise ApiError(503, "No valid fixed-price plans available")
    return {"type": "fixed", "plans": plans[:200]}


def verify_tv(service_id, beneficiary):
    details("tv", service_id)
    if not isinstance(beneficiary, str) or not re.fullmatch(r"\d{8,16}", beneficiary):
        raise ApiError(400, "Enter a valid smartcard or IUC number")
    try:
        resp = vtpass._post("merchant-verify", {"serviceID": service_id, "billersCode": beneficiary})
    except vtpass.ProviderUncertain as exc:
        raise ApiError(503, "TV account verification temporarily unavailable") from exc
    content = resp.get("content")
    if resp.get("code") not in ("000", "020") or not isinstance(content, dict):
        raise ApiError(422, "Smartcard or TV account could not be verified")
    if content.get("WrongBillersCode") is True:
        raise ApiError(422, "Smartcard was rejected by provider")
    name = content.get("Customer_Name") or content.get("CustomerName")
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        raise ApiError(422, "TV subscriber name not provided by the operator")
    return {"customer_name": name.strip()}


def validate_beneficiary(category, beneficiary):
    if category in ("airtime", "data"):
        if not valid_phone(beneficiary):
            raise ApiError(400, "Enter an 11-digit Nigerian recipient number")
    elif category == "tv":
        if not isinstance(beneficiary, str) or not re.fullmatch(r"\d{8,16}", beneficiary):
            raise ApiError(400, "Enter a valid smartcard or IUC number")
    else:
        raise ApiError(400, "Unsupported service category")
    return beneficiary


def buy_vtu(*, request_id, category, service_id, beneficiary, phone, amount_kobo, variation_code):
    """Send the *frozen* server-side quote, never values supplied by the UI."""
    details(category, service_id)
    validate_beneficiary(category, beneficiary)
    if not valid_phone(phone):
        raise ValueError("Invalid customer contact phone")
    if category == "airtime":
        payload = {
            "request_id": request_id, "serviceID": service_id,
            "amount": amount_kobo // 100, "phone": beneficiary,
        }
    else:
        payload = {
            "request_id": request_id, "serviceID": service_id,
            "billersCode": beneficiary, "variation_code": variation_code,
            "phone": phone, "amount": amount_kobo // 100,
        }
        if category == "tv":
            payload["subscription_type"] = "change"
            payload["quantity"] = 1
    return vtpass._post("pay", payload)


def evidence(order, response, *, failure=False):
    """Check provider ID, beneficiary and amount; never infer from 'code' alone."""
    if not isinstance(response, dict) or str(response.get("requestId", "")) != order["provider_request_id"]:
        return "reference_mismatch"
    if failure:
        return None
    content = response.get("content")
    tx = content.get("transactions") if isinstance(content, dict) else None
    if not isinstance(tx, dict):
        return "transaction_details_missing"
    if str(tx.get("unique_element", "")) != str(order["beneficiary"]):
        return "beneficiary_mismatch"
    prices = [v for v in (response.get("amount"), tx.get("amount")) if v is not None]
    if not prices or any(_money(p) != order["amount_kobo"] for p in prices):
        return "amount_mismatch"
    return None
