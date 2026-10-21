"""Safe operational probes for Payquick deployments.

Liveness is separate from readiness. These probes disclose no values, hostnames,
provider credentials, database URLs, or customer information.
"""
import os

import psycopg
from psycopg.conninfo import conninfo_to_dict

from db import connect


REQUIRED_TABLES = (
    "users",
    "wallets",
    "ledger_accounts",
    "meter_profiles",
    "electricity_orders",
    "vtu_orders",
)


def database_configured():
    """Require a syntactically valid PostgreSQL DSN with mandatory TLS."""
    raw = os.getenv("DATABASE_URL", "")
    if not raw:
        return False
    try:
        fields = conninfo_to_dict(raw)
    except (psycopg.Error, ValueError, TypeError):
        return False
    if not (fields.get("dbname") or fields.get("database")) or not fields.get("host"):
        return False
    return fields.get("sslmode") in ("require", "verify-ca", "verify-full") or (
        os.getenv("CI_TEST_DATABASE") == "true" and fields.get("sslmode") == "disable"
    )


def authentication_configured():
    raw = os.getenv("JWT_SECRET", "")
    return len(raw) >= 48 and not raw.startswith("CHANGE_")


def accounts_configured():
    return database_configured() and authentication_configured()


def customer_readiness():
    """A bounded, read-only DB probe. Never mutate data or enable vending."""
    auth = authentication_configured()
    db_config = database_configured()
    result = {
        "service": "payquick-v2-api",
        "status": "unavailable",
        "customer_api_ready": False,
        "checks": {
            "authentication": "configured" if auth else "missing",
            "database": "missing" if not db_config else "unreachable",
            "schema": "not_checked",
        },
        "financial_operations": "disabled" if os.getenv("PAYMENTS_ENABLED") != "true" else "configuration_review_required",
    }
    if not auth or not db_config:
        return result, 503
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT " + ", ".join(
                    "to_regclass('public." + table + "') IS NOT NULL AS " + table
                    for table in REQUIRED_TABLES
                )
            )
            tables = cur.fetchone()
        result["checks"]["database"] = "connected"
        if not all(tables[table] for table in REQUIRED_TABLES):
            result["checks"]["schema"] = "incomplete"
            return result, 503
        result["checks"]["schema"] = "ready"
        if os.getenv("PAYQUICK_SETUP_ENABLED") == "true":
            cur = None
            with connect() as conn, conn.cursor() as cur:
                cur.execute("SELECT to_regclass('public.payquick_setup_state') IS NOT NULL AS present")
                if not cur.fetchone()["present"]:
                    result["checks"]["administrator"] = "setup_incomplete"
                    return result, 503
                cur.execute("SELECT EXISTS(SELECT 1 FROM payquick_setup_state WHERE singleton=true) AS completed")
                if not cur.fetchone()["completed"]:
                    result["checks"]["administrator"] = "setup_incomplete"
                    return result, 503
            result["checks"]["administrator"] = "ready"
        result["status"] = "ready"
        result["customer_api_ready"] = True
        return result, 200
    except (psycopg.Error, RuntimeError):
        # Never return a raw exception, DSN, hostname or SQL error to callers.
        result["checks"]["database"] = "unreachable"
        return result, 503
