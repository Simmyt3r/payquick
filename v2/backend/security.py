"""Short-lived authentication. Production requires rate limits and MFA before enabling payments."""
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from argon2 import PasswordHasher
from flask import g, request

from errors import ApiError

_hasher = PasswordHasher()


def password_hash(value):
    if not isinstance(value, str) or len(value) < 12 or len(value) > 200:
        raise ApiError(400, "Password must contain 12 to 200 characters")
    return _hasher.hash(value)


def password_verify(hash_value, value):
    try:
        return _hasher.verify(hash_value, value)
    except Exception:
        return False


def token_secret():
    value = os.getenv("JWT_SECRET", "")
    if len(value) < 48 or value.startswith("CHANGE_"):
        raise ApiError(503, "Authentication services are not configured yet")
    return value


def new_token(user_id):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id), "iss": "payquick-v2", "aud": "payquick-app",
        "iat": now, "exp": now + timedelta(minutes=15),
    }
    return jwt.encode(payload, token_secret(), algorithm="HS256")


def require_auth(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise ApiError(401, "Authentication required")
        try:
            data = jwt.decode(
                header[7:], token_secret(), algorithms=["HS256"],
                issuer="payquick-v2", audience="payquick-app",
                options={"require": ["sub", "exp", "iss", "aud"]},
            )
            g.user_id = data["sub"]
        except jwt.PyJWTError as exc:
            raise ApiError(401, "Invalid or expired session") from exc
        return fn(*args, **kwargs)
    return wrapped



def require_operator(fn):
    """Enforce an authoritative database role for aggregate financial review.

    A JWT doesn't carry operator privilege. Revocation takes effect on the
    next request. There is intentionally no user-facing role-grant endpoint.
    """
    from db import connect

    @wraps(fn)
    @require_auth
    def wrapped(*args, **kwargs):
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT role FROM users WHERE id=%s", (g.user_id,))
            user = cur.fetchone()
        if not user or user["role"] != "operator":
            raise ApiError(403, "Operator access required")
        return fn(*args, **kwargs)

    return wrapped
