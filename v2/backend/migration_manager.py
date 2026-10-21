"""Allowlisted transactional migrations and one-time Vercel-env admin bootstrap.

Never accepts SQL, file paths, migration IDs or passwords from a customer.
Vercel's DATABASE_URL MUST point to an isolated TLS PostgreSQL database with
DDL permissions during setup. Keep all financial feature gates off.
"""
import hashlib
import hmac
import os
from pathlib import Path
import re

from psycopg import sql as pgsql
from psycopg.errors import UndefinedTable

from db import connect
from errors import ApiError
from operational import database_configured, authentication_configured
from security import password_hash, password_verify

MIGRATION_DIR = Path(__file__).resolve().parent / "migrations"
# Stable, process-wide and database-wide lock. Xact advisory locks release on
# commit/rollback, including when an invocation fails or times out.
LOCK_ID = 492811725740
MIGRATION_NAME = re.compile(r"^\d{4}_[a-z0-9_]+\.sql$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def migration_files():
    files = sorted(p for p in MIGRATION_DIR.glob("*.sql")
                   if MIGRATION_NAME.fullmatch(p.name) and p.is_file())
    if len(files) == 0 or len({p.name[:4] for p in files}) != len(files):
        raise ApiError(503, "Approved migration bundle unavailable")
    return files


def _sql_body(path):
    text = path.read_text(encoding="utf-8")
    # Existing committed migration scripts contain BEGIN/COMMIT wrappers.
    # Remove only these standalone SQL transaction delimiters so the
    # psycopg transaction owns the atomic DDL + schema ledger entry.
    body = re.sub(r"(?im)^\s*(BEGIN|COMMIT)\s*;\s*$", "", text)
    return text, body


def _record_table_exists(cur):
    cur.execute("SELECT to_regclass('public.payquick_schema_migrations') IS NOT NULL AS present")
    return cur.fetchone()["present"]


def _legacy_without_ledger(cur):
    cur.execute("SELECT to_regclass('public.users') IS NOT NULL AS present")
    return cur.fetchone()["present"]


def _records(cur):
    if not _record_table_exists(cur):
        return {}
    cur.execute("SELECT filename, sha256, applied_at FROM payquick_schema_migrations ORDER BY filename")
    return {r["filename"]: r for r in cur.fetchall()}


def _plan(cur):
    current = _records(cur)
    files = migration_files()
    allowed = {p.name for p in files}
    if set(current) - allowed:
        raise ApiError(409, "Unknown applied migration detected; manual review required")
    if not current and not _record_table_exists(cur) and _legacy_without_ledger(cur):
        raise ApiError(409, "Existing schema has no migration history; manual reconciliation required")
    plan = []
    already_pending = False
    for path in files:
        text, _ = _sql_body(path)
        fingerprint = hashlib.sha256(text.encode("utf-8")).hexdigest()
        seen = current.get(path.name)
        if seen and not hmac.compare_digest(fingerprint, seen["sha256"]):
            raise ApiError(409, "Applied migration checksum mismatch; manual review required")
        if not seen:
            already_pending = True
        elif already_pending:
            raise ApiError(409, "Out-of-order migration history; manual review required")
        plan.append({
            "filename": path.name, "sha256": fingerprint,
            "status": "applied" if seen else "pending",
            "applied_at": seen["applied_at"].isoformat() if seen else None,
        })
    return plan


def _completed(cur):
    cur.execute("SELECT to_regclass('public.payquick_setup_state') IS NOT NULL AS present")
    if not cur.fetchone()["present"]:
        return False
    cur.execute("SELECT EXISTS(SELECT 1 FROM payquick_setup_state WHERE singleton=true) AS completed")
    return cur.fetchone()["completed"]


def ensure_setup_token(value):
    if os.getenv("PAYQUICK_SETUP_ENABLED") != "true":
        raise ApiError(403, "Initial setup is disabled")
    token = os.getenv("PAYQUICK_SETUP_TOKEN", "")
    if len(token) < 48 or token.startswith("CHANGE_") or not isinstance(value, str) or not hmac.compare_digest(token, value):
        raise ApiError(403, "Invalid setup authorization")
    if not database_configured() or not authentication_configured():
        raise ApiError(503, "Configure TLS database and authentication before setup")


def _connect():
    if not database_configured():
        raise ApiError(503, "An isolated PostgreSQL database must be configured")
    return connect()


def status():
    with _connect() as conn, conn.cursor() as cur:
        plan = _plan(cur)
        done = _completed(cur)
        return {
            "migrations": plan,
            "next_migration": next((x["filename"] for x in plan if x["status"] == "pending"), None),
            "bootstrap_completed": done,
            "admin_configured": bool(os.getenv("PAYQUICK_ADMIN_EMAIL")) and
                                bool(os.getenv("PAYQUICK_ADMIN_PASSWORD")),
            "financial_services_enabled": False,  # status never licenses money movement
        }


def apply_next(*, actor_id=None):
    # One allowlisted file per invocation so Vercel requests are bounded.
    with _connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            if _completed(cur):
                raise ApiError(403, "Initial setup completed; use the administrator dashboard")
            plan = _plan(cur)
            pending = next((x for x in plan if x["status"] == "pending"), None)
            if pending is None:
                return {"status": "up_to_date", "applied": None}
            path = MIGRATION_DIR / pending["filename"]
            if not _record_table_exists(cur):
                cur.execute("""
                    CREATE TABLE payquick_schema_migrations (
                        filename text PRIMARY KEY,
                        sha256 char(64) NOT NULL,
                        applied_at timestamptz NOT NULL DEFAULT now(),
                        applied_by uuid NULL
                    )
                """)
            _text, body = _sql_body(path)
            # This input is read ONLY from allowlisted, committed files.
            cur.execute(body)
            cur.execute(
                "INSERT INTO payquick_schema_migrations(filename,sha256,applied_by) VALUES (%s,%s,%s)",
                (pending["filename"], pending["sha256"], actor_id),
            )
            if actor_id:
                cur.execute(
                    "INSERT INTO operator_audit_events(operator_id,action) VALUES (%s,%s)",
                    (actor_id, "schema_migration:" + pending["filename"]),
                )
    return {"status": "applied", "applied": pending["filename"]}


def bootstrap_admin():
    """One-time creation after 0001–0007; never promotes an existing account."""
    email = os.getenv("PAYQUICK_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("PAYQUICK_ADMIN_PASSWORD", "")
    if not EMAIL.fullmatch(email) or len(email) > 240 or not 16 <= len(password) <= 200:
        raise ApiError(503, "Configure valid initial admin email and strong password in Vercel")
    hashed = password_hash(password)
    with _connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            plan = _plan(cur)
            if any(p["status"] != "applied" for p in plan):
                raise ApiError(409, "Apply all approved migrations before creating administrator")
            if _completed(cur):
                raise ApiError(409, "Initial setup already completed")
            cur.execute("SELECT EXISTS(SELECT 1 FROM users WHERE role='admin') AS present")
            if cur.fetchone()["present"]:
                raise ApiError(409, "An administrator already exists; manual review required")
            cur.execute("SELECT EXISTS(SELECT 1 FROM users WHERE email=%s) AS present", (email,))
            if cur.fetchone()["present"]:
                raise ApiError(409, "Admin email is already registered; manual review required")
            cur.execute(
                "INSERT INTO users(name,email,password_hash,role) "
                "VALUES (%s,%s,%s,'admin') RETURNING id",
                ("Payquick Administrator", email, hashed),
            )
            uid = cur.fetchone()["id"]
            cur.execute(
                "INSERT INTO ledger_accounts(code,kind,user_id) "
                "VALUES (%s,'wallet',%s) RETURNING id",
                ("wallet:" + str(uid), uid),
            )
            account_id = cur.fetchone()["id"]
            cur.execute("INSERT INTO wallets(user_id,account_id) VALUES (%s,%s)", (uid, account_id))
            cur.execute(
                "INSERT INTO payquick_setup_state(singleton,admin_user_id) VALUES (true,%s)", (uid,)
            )
            cur.execute(
                "INSERT INTO operator_audit_events(operator_id,action) VALUES (%s,%s)",
                (uid, "initial_admin_bootstrap"),
            )
    return {"status": "complete", "message": "Administrator created. Disable and remove setup secrets in Vercel."}


def check_setup_open():
    with _connect() as conn, conn.cursor() as cur:
        if _completed(cur):
            raise ApiError(403, "Initial setup completed; use the administrator dashboard")


def admin_password_check(cur, user_id, password):
    if not isinstance(password, str):
        raise ApiError(403, "Administrator password confirmation required")
    cur.execute("SELECT password_hash FROM users WHERE id=%s AND role='admin'", (user_id,))
    row = cur.fetchone()
    if not row or not password_verify(row["password_hash"], password):
        raise ApiError(403, "Administrator password confirmation failed")


def admin_apply_next(user_id, password):
    if os.getenv("PAYQUICK_ADMIN_MIGRATIONS_ENABLED") != "true":
        raise ApiError(403, "Administrator migration execution is disabled")
    with _connect() as conn:
        with conn.transaction(), conn.cursor() as cur:
            # Serialize with first-setup work and concurrent admin requests.
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            admin_password_check(cur, user_id, password)
            if not _completed(cur):
                raise ApiError(409, "Finish initial setup first")
            plan = _plan(cur)
            pending = next((x for x in plan if x["status"] == "pending"), None)
            if pending is None:
                return {"status": "up_to_date", "applied": None}
            path = MIGRATION_DIR / pending["filename"]
            _text, body = _sql_body(path)
            cur.execute(body)
            cur.execute("INSERT INTO payquick_schema_migrations(filename,sha256,applied_by) VALUES (%s,%s,%s)",
                        (pending["filename"], pending["sha256"], user_id))
            cur.execute("INSERT INTO operator_audit_events(operator_id,action) VALUES (%s,%s)",
                        (user_id, "schema_migration:" + pending["filename"]))
            return {"status": "applied", "applied": pending["filename"]}


def admin_status():
    result = status()
    result["admin_migrations_enabled"] = os.getenv("PAYQUICK_ADMIN_MIGRATIONS_ENABLED") == "true"
    return result
