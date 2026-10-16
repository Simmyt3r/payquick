"""Exactly-once *local* reservation and conservative VTpass fulfilment.

A provider request is dispatched once with a persisted ID. If the process
crashes/receives no reply, only /requery is attempted. We never resend /pay.
A provisional debit remains reserved until confirmed delivery or a verified
negative response. Never credit a refund on network uncertainty.
"""
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken

from db import connect
from errors import ApiError
from ledger import apply_wallet_delta, post_journal
from security import password_verify
import vtpass


def enabled():
    if os.getenv("ELECTRICITY_VENDING_ENABLED") != "true":
        raise ApiError(503, "Electricity vending is not enabled")
    if os.getenv("PAYMENTS_ENABLED") != "true":
        raise ApiError(503, "Wallet transaction engine is not enabled")
    vtpass.environment()  # enforce additional live gate
    if not os.getenv('VTPASS_API_KEY') or not os.getenv('VTPASS_SECRET_KEY'):
        raise ApiError(503, 'VTpass vending credentials are not configured')


def cipher():
    key = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise ApiError(503, "Secure token storage is not configured") from exc


def valid_phone(value):
    return isinstance(value, str) and re.fullmatch(r"0[789][01]\d{8}", value) is not None


def valid_idempotency(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{16,96}", value) is not None


def verify_saved_meter(user_id, meter_id):
    if os.getenv("METER_VERIFICATION_ENABLED") != "true":
        raise ApiError(503, "Meter verification has not been enabled")
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id,disco,meter_number FROM meter_profiles "
            "WHERE id=%s AND user_id=%s AND meter_type='prepaid'", (meter_id, user_id),
        )
        meter = cur.fetchone()
    if meter is None:
        raise ApiError(404, "Prepaid meter not found")
    try:
        verified = vtpass.verify_meter(meter["disco"], meter["meter_number"])
    except vtpass.ProviderUncertain as exc:
        raise ApiError(503, "Meter provider temporarily unavailable") from exc
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "UPDATE meter_profiles SET verified_customer_name=%s,"
                "verified_service_band=%s,minimum_purchase_kobo=%s,verified_at=now() "
                "WHERE id=%s AND user_id=%s",
                (verified["customer_name"], verified["service_band"],
                 verified["minimum_kobo"], meter_id, user_id),
            )
    return {**verified, "verified": True, "remote_loading_supported": False}


def prepare_quote(user_id, meter_id, amount_kobo):
    if type(amount_kobo) is not int or amount_kobo < 50000 or amount_kobo > 20000000:
        raise ApiError(400, "Invalid electricity purchase amount")
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM meter_profiles WHERE id=%s AND user_id=%s "
                "AND meter_type='prepaid'", (meter_id, user_id),
            )
            meter = cur.fetchone()
            if not meter:
                raise ApiError(404, "Saved prepaid meter not found")
            if not meter["verified_at"] or meter["verified_at"] < datetime.now(timezone.utc) - timedelta(minutes=15):
                raise ApiError(409, "Verify this meter with the provider before requesting a quote")
            if amount_kobo < (meter["minimum_purchase_kobo"] or 50000):
                raise ApiError(400, "Amount is below provider minimum for this meter")
            # Charges require a server-authoritative pricing policy. No customer
            # fee is configured in this initial release; merchant absorbs cost.
            total_kobo = amount_kobo
            cur.execute(
                "INSERT INTO electricity_quotes "
                "(user_id,meter_id,amount_kobo,expires_at,verified_customer_name,"
                "service_band,total_kobo,verified_at) "
                "VALUES (%s,%s,%s,now()+ interval '10 minutes',%s,%s,%s,%s)"
                "RETURNING id,expires_at",
                (user_id, meter_id, amount_kobo, meter["verified_customer_name"],
                 meter["verified_service_band"], total_kobo, meter["verified_at"]),
            )
            quote = cur.fetchone()
    return {
        "quote_id": str(quote["id"]), "amount_kobo": amount_kobo,
        "total_kobo": total_kobo, "fee_kobo": 0,
        "currency": "NGN", "meter_number": meter["meter_number"],
        "disco": meter["disco"], "verified_customer_name": meter["verified_customer_name"],
        "service_band": meter["verified_service_band"],
        "expires_at": quote["expires_at"].isoformat(),
        "remote_loading_supported": bool(meter["remote_loading_verified"]),
        "execution_enabled": os.getenv("ELECTRICITY_VENDING_ENABLED") == "true",
        "message": "Payquick can vend an authorized token; remote loading requires separate verified meter integration.",
    }


def create_order(user_id, data):
    enabled()
    cipher()  # do not allow dispatch without encrypted token storage
    quote_id = data.get("quote_id")
    idempotency = data.get("idempotency_key")
    phone = data.get("phone")
    password = data.get("confirmation_password")
    if not valid_idempotency(idempotency):
        raise ApiError(400, "An idempotency key of 16–96 safe characters is required")
    if not valid_phone(phone):
        raise ApiError(400, "Enter a valid Nigerian recipient number")
    if not isinstance(password, str) or len(password) > 200:
        raise ApiError(401, "Password confirmation required")

    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE id=%s", (user_id,))
            user = cur.fetchone()
            if not user or not password_verify(user["password_hash"], password):
                raise ApiError(401, "Transaction authorization failed")

            cur.execute(
                "SELECT id,quote_id,status FROM electricity_orders "
                "WHERE user_id=%s AND idempotency_key=%s FOR UPDATE",
                (user_id, idempotency),
            )
            existing = cur.fetchone()
            if existing:
                if str(existing["quote_id"]) != str(quote_id):
                    raise ApiError(409, "The idempotency key was already used for another quote")
                return {"order_id": str(existing["id"]), "status": existing["status"], "duplicate": True}

            cur.execute(
                "SELECT q.*,m.disco,m.meter_number,m.verified_at AS current_verified_at,"
                "m.verified_customer_name AS current_customer FROM electricity_quotes q "
                "JOIN meter_profiles m ON m.id=q.meter_id "
                "WHERE q.id=%s AND q.user_id=%s AND m.user_id=%s "
                "AND m.meter_type='prepaid' FOR UPDATE OF q,m",
                (quote_id, user_id, user_id),
            )
            quote = cur.fetchone()
            now = datetime.now(timezone.utc)
            if not quote or quote["expires_at"] <= now:
                raise ApiError(409, "Quote is missing or has expired")
            if not quote["verified_at"] or quote["verified_at"] != quote["current_verified_at"]:
                raise ApiError(409, "Meter verification has changed; request a fresh quote")
            if not quote["current_verified_at"] or quote["current_verified_at"] < now - timedelta(minutes=15):
                raise ApiError(409, "Verify this meter again before payment")
            if quote["verified_customer_name"] != quote["current_customer"]:
                raise ApiError(409, "Meter customer details have changed")
            if not quote["total_kobo"] or quote["total_kobo"] < quote["amount_kobo"]:
                raise ApiError(409, "Quote requires an authoritative total")
            cur.execute(
                "INSERT INTO electricity_orders(user_id,meter_id,quote_id,idempotency_key,"
                "amount_kobo,total_kobo,phone) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (user_id, quote["meter_id"], quote_id, idempotency,
                 quote["amount_kobo"], quote["total_kobo"], phone),
            )
            order_id = cur.fetchone()["id"]
            cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
            suspense = cur.fetchone()
            if not suspense:
                raise ApiError(503, "Purchase reservation account unavailable")
            # Under user wallet row lock: negative wallet and positive suspense.
            apply_wallet_delta(
                cur, user_id=user_id, delta_kobo=-quote["total_kobo"],
                reference="reserve:" + str(order_id), kind="purchase",
                contra_account=suspense["id"],
            )
    return {"order_id": str(order_id), "status": "queued", "duplicate": False}


def claim_dispatch():
    """Persist request ID *before* HTTP call. Never send twice, even after crash."""
    enabled()
    cipher()
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "SELECT o.id,o.amount_kobo,o.phone,m.disco,m.meter_number "
                "FROM electricity_orders o JOIN meter_profiles m ON m.id=o.meter_id "
                "WHERE o.status='queued' AND o.next_check_at <= now() "
                "ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1"
            )
            order = cur.fetchone()
            if not order:
                return None
            provider_id = vtpass.request_id()
            cur.execute(
                "UPDATE electricity_orders SET status='submitting',provider_request_id=%s,"
                "attempts=attempts+1,next_check_at=now()+interval '3 minutes',"
                "updated_at=now() WHERE id=%s",
                (provider_id, order["id"]),
            )
    return {**order, "provider_request_id": provider_id}


def claim_requery():
    """Lease due uncertain orders; same request ID, no second POST /pay."""
    enabled()
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "SELECT id,provider_request_id FROM electricity_orders "
                "WHERE status IN ('pending','submitting') AND provider_request_id IS NOT NULL "
                "AND next_check_at <= now() ORDER BY next_check_at "
                "FOR UPDATE SKIP LOCKED LIMIT 1"
            )
            order = cur.fetchone()
            if not order:
                return None
            cur.execute(
                "UPDATE electricity_orders SET next_check_at=now()+interval '5 minutes',"
                "last_checked_at=now(),updated_at=now() WHERE id=%s", (order["id"],),
            )
    return order


def _provider_matches(order, response):
    provided = response.get("requestId")
    if provided and str(provided) != order["provider_request_id"]:
        return False
    tx = (response.get("content") or {}).get("transactions") or {}
    if isinstance(tx, dict):
        meter_number = tx.get("unique_element")
        if meter_number and str(meter_number) != str(order["meter_number"]):
            return False
    return True


def apply_result(order_id, response, *, from_requery):
    """Finalize only after evidence. Payment failures require requery proof."""
    kind, token = vtpass.classify(response)
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "SELECT o.*,m.meter_number FROM electricity_orders o "
                "JOIN meter_profiles m ON m.id=o.meter_id WHERE o.id=%s FOR UPDATE OF o",
                (order_id,),
            )
            order = cur.fetchone()
            if not order:
                raise ApiError(404, "Order missing")
            if order["status"] in ("delivered", "failed", "manual_review"):
                return order["status"]
            if not _provider_matches(order, response):
                cur.execute(
                    "UPDATE electricity_orders SET status='manual_review',"
                    "provider_code=%s,updated_at=now() WHERE id=%s",
                    (str(response.get("code", ""))[:12], order_id),
                )
                return "manual_review"
            if kind == "delivered":
                encrypted = cipher().encrypt(token.encode()).decode() if token else None
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
                suspense = cur.fetchone()["id"]
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:clearing'")
                clearing = cur.fetchone()["id"]
                post_journal(
                    cur, reference="settle:" + str(order_id), kind="purchase",
                    postings=[(suspense, -order["total_kobo"]), (clearing, order["total_kobo"])],
                )
                tx = (response.get("content") or {}).get("transactions") or {}
                provider_transaction_id = str(tx.get("transactionId") or "") if isinstance(tx, dict) else ""
                cur.execute(
                    "UPDATE electricity_orders SET status='delivered',token_ciphertext=%s,"
                    "provider_transaction_id=%s,provider_code=%s,updated_at=now() "
                    "WHERE id=%s",
                    (encrypted, provider_transaction_id[:120],
                     str(response.get("code", ""))[:12], order_id),
                )
                return "delivered"
            if kind == "failed" and from_requery:
                cur.execute("SELECT id FROM ledger_accounts WHERE code='vtpass:suspense'")
                suspense = cur.fetchone()["id"]
                apply_wallet_delta(
                    cur, user_id=order["user_id"], delta_kobo=order["total_kobo"],
                    reference="refund:" + str(order_id), kind="refund",
                    contra_account=suspense['id'],
                )
                cur.execute(
                    "UPDATE electricity_orders SET status='failed',provider_code=%s,"
                    "updated_at=now() WHERE id=%s",
                    (str(response.get("code", ""))[:12], order_id),
                )
                return "failed"
            cur.execute(
                "UPDATE electricity_orders SET status='pending',provider_code=%s,"
                "next_check_at=now()+interval '5 minutes',updated_at=now() WHERE id=%s",
                (str(response.get("code", ""))[:12], order_id),
            )
            return "pending"


def mark_uncertain(order_id):
    with connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "UPDATE electricity_orders SET status='pending',"
                "next_check_at=now()+interval '5 minutes',updated_at=now() "
                "WHERE id=%s AND status IN ('submitting','pending')", (order_id,),
            )


def describe_order(user_id, order_id):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT o.id,o.status,o.amount_kobo,o.total_kobo,o.provider_request_id,"
            "o.token_ciphertext,o.created_at,m.meter_number,m.disco "
            "FROM electricity_orders o JOIN meter_profiles m ON m.id=o.meter_id "
            "WHERE o.id=%s AND o.user_id=%s", (order_id, user_id),
        )
        row = cur.fetchone()
    if not row:
        raise ApiError(404, "Electricity order not found")
    token = None
    if row["status"] == "delivered" and row["token_ciphertext"]:
        try:
            token = cipher().decrypt(row["token_ciphertext"].encode()).decode()
        except InvalidToken as exc:
            raise ApiError(503, "Stored token temporarily unavailable") from exc
    return {
        "id": str(row["id"]), "status": row["status"],
        "amount_kobo": row["amount_kobo"], "total_kobo": row["total_kobo"],
        "meter_number": row["meter_number"], "disco": row["disco"],
        "reference": row["provider_request_id"], "token": token,
        "token_loading_status": "not_attempted" if row["status"] == "delivered" else "not_applicable",
        "message": "Enter token manually until a remote meter integration is verified." if token else
                   "Provider delivery may be pending; do not repurchase while this order is unresolved.",
        "created_at": row["created_at"].isoformat(),
    }


def process_once():
    """Single iteration intended for a separately hosted scheduled worker."""
    enabled()
    item = claim_dispatch()
    if item:
        try:
            reply = vtpass.buy_electricity(
                request_id_value=item["provider_request_id"],
                disco=item["disco"], meter_number=item["meter_number"],
                amount_kobo=item["amount_kobo"], phone=item["phone"],
            )
            status = apply_result(item["id"], reply, from_requery=False)
        except vtpass.ProviderUncertain:
            mark_uncertain(item["id"])
            status = "pending"
        return {"operation": "vend", "order_id": str(item["id"]), "status": status}
    item = claim_requery()
    if item:
        try:
            reply = vtpass.requery(item["provider_request_id"])
            status = apply_result(item["id"], reply, from_requery=True)
        except vtpass.ProviderUncertain:
            mark_uncertain(item["id"])
            status = "pending"
        return {"operation": "requery", "order_id": str(item["id"]), "status": status}
    return {"operation": "idle"}


if __name__ == "__main__":
    import json
    print(json.dumps(process_once()))
