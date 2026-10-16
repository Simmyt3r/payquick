"""Payquick v2 foundation: registration, wallet visibility, verified funding, meter registry.

Deliberately NO automatic payment or remote-load side effects until provider
integration, strong transaction authorization and reconciliation are certified.
"""
import hashlib
import hmac
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, g, request
from flask_cors import CORS
from psycopg.errors import UniqueViolation

from db import connect
from errors import ApiError
from ledger import apply_wallet_delta
from meter import capability, validate_meter
from paystack import initialize as paystack_initialize, verify as paystack_verify
from security import new_token, password_hash, password_verify, require_auth
from vending import prepare_quote, verify_saved_meter, create_order, describe_order


def json_body():
    if not request.is_json:
        raise ApiError(415, "Expected JSON content")
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Expected a JSON object")
    return data


def naira_to_kobo(value, *, minimum=100, maximum=200000):
    # Accept positive whole-naira inputs only, never floats or arbitrary strings.
    if type(value) is not int or not minimum <= value <= maximum:
        raise ApiError(400, "Amount must be a whole naira value within allowed limits")
    return value * 100


def create_app():
    app = Flask(__name__)
    allowed = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    CORS(app, resources={r"/api/*": {"origins": [s.strip() for s in allowed]}},
         allow_headers=["Authorization", "Content-Type"], methods=["GET", "POST", "OPTIONS"])
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

    @app.errorhandler(ApiError)
    def fail(error):
        return jsonify({"error": error.message}), error.status

    @app.errorhandler(UniqueViolation)
    def duplicate(_error):
        return jsonify({"error": "This record already exists"}), 409

    @app.errorhandler(Exception)
    def unexpected(error):
        app.logger.exception("Unhandled exception")
        return jsonify({"error": "Unexpected server error"}), 500

    @app.get("/api/health")
    def health():
        return {"status": "ok", "service": "payquick-v2-api", "payments_enabled": os.getenv("PAYMENTS_ENABLED") == "true"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        email = str(body.get("email", "")).strip().lower()
        name = str(body.get("name", "")).strip()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or not 2 <= len(name) <= 100:
            raise ApiError(400, "Valid name and email required")
        hashed = password_hash(body.get("password"))
        with connect() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO users(name,email,password_hash) VALUES (%s,%s,%s) RETURNING id",
                        (name, email, hashed),
                    )
                    user_id = cur.fetchone()["id"]
                    cur.execute(
                        "INSERT INTO ledger_accounts(code,kind,user_id) VALUES (%s,'wallet',%s) RETURNING id",
                        ("wallet:" + str(user_id), user_id),
                    )
                    account_id = cur.fetchone()["id"]
                    cur.execute("INSERT INTO wallets(user_id,account_id) VALUES (%s,%s)", (user_id, account_id))
        return jsonify({"access_token": new_token(user_id), "user": {"id": str(user_id), "name": name, "email": email}}), 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        email = str(body.get("email", "")).strip().lower()
        password = body.get("password")
        if not isinstance(password, str):
            raise ApiError(401, "Invalid credentials")
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id,name,email,password_hash FROM users WHERE email=%s", (email,))
            user = cur.fetchone()
        if not user or not password_verify(user["password_hash"], password):
            raise ApiError(401, "Invalid credentials")
        return {"access_token": new_token(user["id"]), "user": {
            "id": str(user["id"]), "name": user["name"], "email": user["email"],
        }}

    @app.get("/api/me")
    @require_auth
    def me():
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT id,name,email FROM users WHERE id=%s", (g.user_id,))
            user = cur.fetchone()
        if not user:
            raise ApiError(401, "Account not found")
        return {"id": str(user["id"]), "name": user["name"], "email": user["email"]}

    @app.get("/api/wallet")
    @require_auth
    def wallet():
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT balance_kobo FROM wallets WHERE user_id=%s", (g.user_id,))
            row = cur.fetchone()
        if row is None:
            raise ApiError(404, "Wallet not found")
        return {"balance_kobo": row["balance_kobo"], "currency": "NGN"}

    @app.post("/api/wallet/funding-intents")
    @require_auth
    def start_funding():
        if os.getenv("PAYMENTS_ENABLED") != "true":
            raise ApiError(503, "Payment processing disabled until sandbox verification")
        body = json_body()
        amount = naira_to_kobo(body.get("amount_naira"))
        reference = "PQF_" + uuid.uuid4().hex
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT email FROM users WHERE id=%s", (g.user_id,))
            user = cur.fetchone()
        if not user:
            raise ApiError(401, "Account not found")
        with connect() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "INSERT INTO funding_intents(reference,user_id,amount_kobo,status) VALUES (%s,%s,%s,'initiated')",
                (reference, g.user_id, amount),
            )
        checkout = paystack_initialize(email=user["email"], amount_kobo=amount, reference=reference)
        with connect() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "UPDATE funding_intents SET status='pending' WHERE reference=%s AND status='initiated'",
                (reference,),
            )
        return jsonify({"reference": reference, "authorization_url": checkout.get("authorization_url")}), 201

    @app.post("/api/webhooks/paystack")
    def paystack_webhook():
        secret = os.getenv("PAYSTACK_SECRET_KEY", "")
        if os.getenv("PAYMENTS_ENABLED") != "true" or not secret:
            raise ApiError(503, "Payments disabled")
        raw = request.get_data(cache=True)
        supplied = request.headers.get("x-paystack-signature", "")
        expected = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(supplied, expected):
            raise ApiError(401, "Invalid webhook signature")
        event = json_body()
        if event.get("event") != "charge.success":
            return {"received": True}
        reference = (event.get("data") or {}).get("reference", "")
        if not isinstance(reference, str) or not reference.startswith("PQF_"):
            return {"received": True}
        # Verify via provider API. A signed webhook alone is not settlement evidence.
        verified = paystack_verify(reference)
        if verified.get("status") != "success" or verified.get("currency") != "NGN":
            raise ApiError(409, "Provider transaction not settled")
        with connect() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM funding_intents WHERE reference=%s FOR UPDATE", (reference,))
                    intent = cur.fetchone()
                    if intent is None:
                        raise ApiError(404, "Unknown funding reference")
                    if intent["status"] == "credited":
                        return {"received": True, "duplicate": True}
                    if intent["status"] not in ("pending", "initiated"):
                        raise ApiError(409, "Funding intent not payable")
                    if (verified.get("reference") != reference or
                            type(verified.get("amount")) is not int or
                            verified["amount"] != intent["amount_kobo"]):
                        raise ApiError(409, "Verified payment does not match original intent")
                    provider_id = str(verified.get("id", ""))
                    if not provider_id:
                        raise ApiError(409, "Missing provider transaction identifier")
                    cur.execute("SELECT id FROM ledger_accounts WHERE code='paystack:clearing'")
                    clearing = cur.fetchone()
                    if not clearing:
                        raise ApiError(503, "Ledger settlement account missing")
                    apply_wallet_delta(
                        cur, user_id=intent["user_id"], delta_kobo=intent["amount_kobo"],
                        reference="fund:" + reference, kind="funding",
                        contra_account=clearing["id"],
                    )
                    cur.execute(
                        "UPDATE funding_intents SET status='credited',provider_transaction_id=%s,credited_at=now() WHERE reference=%s",
                        (provider_id, reference),
                    )
        return {"received": True, "credited": True}

    @app.get("/api/meters")
    @require_auth
    def list_meters():
        with connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id,disco,meter_number,nickname,meter_type,remote_loading_verified "
                "FROM meter_profiles WHERE user_id=%s ORDER BY created_at DESC", (g.user_id,),
            )
            rows = cur.fetchall()
        return {"meters": [{
            "id": str(row["id"]), "disco": row["disco"],
            "meter_number": row["meter_number"], "nickname": row["nickname"],
            "meter_type": row["meter_type"], "capability": capability(row),
        } for row in rows]}

    @app.post("/api/meters")
    @require_auth
    def save_meter():
        body = json_body()
        number, nickname = validate_meter(
            disco=body.get("disco"), meter_number=body.get("meter_number"), nickname=body.get("nickname"),
        )
        if body.get("meter_type") not in ("prepaid", "postpaid"):
            raise ApiError(400, "Invalid meter type")
        with connect() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "INSERT INTO meter_profiles(user_id,disco,meter_number,nickname,meter_type) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (g.user_id, body["disco"], number, nickname, body["meter_type"]),
            )
            meter_id = str(cur.fetchone()["id"])
        return jsonify({"id": meter_id, "remote_loading": False, "status": "requires_provider_verification"}), 201

    @app.post("/api/meters/<uuid:meter_id>/verify")
    @require_auth
    def verify_meter(meter_id):
        return jsonify(verify_saved_meter(g.user_id, str(meter_id)))

    @app.post("/api/electricity/quotes")
    @require_auth
    def quote_electricity():
        body = json_body()
        meter_id = body.get("meter_id")
        try:
            meter_id = str(uuid.UUID(meter_id))
        except (TypeError, AttributeError, ValueError) as exc:
            raise ApiError(400, "A valid saved meter ID is required") from exc
        amount = naira_to_kobo(body.get("amount_naira"), minimum=500)
        return jsonify(prepare_quote(g.user_id, meter_id, amount)), 201

    @app.post("/api/electricity/orders")
    @require_auth
    def order_electricity():
        body = json_body()
        try:
            body["quote_id"] = str(uuid.UUID(body.get("quote_id", "")))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ApiError(400, "A valid quote ID is required") from exc
        order = create_order(g.user_id, body)
        return jsonify(order), 200 if order.get("duplicate") else 201

    @app.get("/api/electricity/orders/<uuid:order_id>")
    @require_auth
    def electricity_order_status(order_id):
        return jsonify(describe_order(g.user_id, str(order_id)))

    return app


app = create_app()
