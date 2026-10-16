"""Read-only comparison of locally booked electricity orders to VTpass requery.

A VTpass requery confirms *vend* status, not payment to the merchant bank or
remote application of a meter token. This script never adjusts any balance.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone

from db import connect
from errors import ApiError
from provider_evidence import validate_provider_result
import vtpass


def _hash(value):
    return hashlib.sha256(str(value).encode()).hexdigest()[:16]


def evaluate_order(order, response):
    """Strictly classify evidence: no query side effects, no token exposure."""
    status, token = vtpass.classify(response)
    finding = {
        "order_hash": _hash(order["id"]),
        "local_status": order["status"],
        "external_status": status,
        "token_present": bool(token),
        "remote_meter_loaded": False,
    }
    if status in ("delivered", "failed"):
        reason = validate_provider_result(order, response, expected_kind=status)
        if reason:
            finding.update(severity="critical", issue=reason)
            return finding
    if status == "delivered":
        if not token:
            finding.update(severity="critical", issue="provider_delivered_without_usable_token")
        elif order["status"] != "delivered":
            finding.update(severity="critical", issue="external_delivered_local_unsettled")
        else:
            finding.update(severity="ok", issue="matched_vend")
    elif status == "failed":
        if order["status"] == "delivered":
            finding.update(severity="critical", issue="external_failed_local_delivered")
        elif order["status"] == "failed":
            finding.update(severity="ok", issue="matched_failure")
        else:
            finding.update(severity="warning", issue="provider_failure_pending_local_review")
    else:
        finding.update(
            severity="warning" if order["status"] not in ("delivered", "failed") else "critical",
            issue="external_unresolved",
        )
    return finding


def collect_orders(*, hours=24, max_orders=100):
    if not isinstance(hours, int) or not 1 <= hours <= 168:
        raise ValueError("Hours must be 1..168")
    if not isinstance(max_orders, int) or not 1 <= max_orders <= 100:
        raise ValueError("Max orders must be 1..100")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT o.id,o.status,o.provider_request_id,o.amount_kobo,"
            "m.meter_number FROM electricity_orders o "
            "JOIN meter_profiles m ON m.id=o.meter_id "
            "WHERE o.created_at >= %s AND o.provider_request_id IS NOT NULL "
            "ORDER BY o.created_at DESC LIMIT %s",
            (since, max_orders + 1),
        )
        rows = cur.fetchall()
    if len(rows) > max_orders:
        raise ApiError(503, "Order window is larger than the requested reconciliation cap")
    return rows


def run(*, hours=24, max_orders=100):
    if os.getenv("VTPASS_RECON_READ_ENABLED") != "true":
        raise ApiError(503, "External VTpass reconciliation is not authorized")
    if vtpass.environment() == "live" and os.getenv("VTPASS_LIVE_READ_ENABLED") != "true":
        raise ApiError(503, "Live requery needs its own approval")
    results = []
    for order in collect_orders(hours=hours, max_orders=max_orders):
        try:
            external = vtpass.requery(order["provider_request_id"])
            results.append(evaluate_order(order, external))
        except vtpass.ProviderUncertain:
            results.append({
                "order_hash": _hash(order["id"]), "severity": "warning",
                "issue": "provider_unreachable", "remote_meter_loaded": False,
            })
    summary = {severity: sum(1 for x in results if x["severity"] == severity)
               for severity in ("ok", "warning", "critical")}
    return {
        "status": "failed" if summary["critical"] else ("attention" if summary["warning"] else "ok"),
        "source": "VTpass /requery, not bank settlement",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "counts": summary,
        "findings": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--max-orders", type=int, default=100)
    args = parser.parse_args()
    result = run(hours=args.hours, max_orders=args.max_orders)
    print(json.dumps(result))
    raise SystemExit(0 if result["status"] == "ok" else 2)
