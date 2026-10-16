"""Paystack external reconciliation, strictly read-only and fail-closed.

Paystack funding is a gross customer liability. The provider's payout is NET
of fees/adjustments; neither its net payout nor its merchant wallet is a
substitute for verifying each customer's gross funded transaction.

Only call this module in an authorized, private operational environment.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone

import requests
from db import connect
from errors import ApiError

BASE = "https://api.paystack.co"
PAGE_SIZE = 100
MAX_PAGES = 30


def _mode_key():
    mode = os.getenv("PAYSTACK_MODE", "test")
    key = os.getenv("PAYSTACK_SECRET_KEY", "")
    if mode not in ("test", "live"):
        raise ApiError(503, "PAYSTACK_MODE must be test or live")
    if not key.startswith("sk_" + mode + "_"):
        raise ApiError(503, "Paystack key does not match configured environment")
    if mode == "live" and os.getenv("PAYSTACK_LIVE_READ_ENABLED") != "true":
        raise ApiError(503, "Live settlement inspection requires explicit approval")
    return mode, key


def _get(path, params):
    mode, key = _mode_key()
    if path not in ("/transaction", "/settlement") and not (
        path.startswith("/settlement/") and path.endswith("/transactions")
        and path[12:-13].isdigit()
    ):
        raise ValueError("Settlement path is not allowlisted")
    try:
        resp = requests.get(
            BASE + path, headers={"Authorization": "Bearer " + key},
            params=params, timeout=(5, 20),
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise ApiError(502, "Paystack external statement fetch failed") from exc
    if not isinstance(data, dict) or data.get("status") is not True or not isinstance(data.get("data"), list):
        raise ApiError(502, "Unexpected Paystack statement response")
    return data


def _pages(path, filters, *, max_pages=MAX_PAGES):
    if not 1 <= max_pages <= MAX_PAGES:
        raise ValueError("Invalid bounded pagination")
    output = []
    for page in range(1, max_pages + 1):
        data = _get(path, {"perPage": PAGE_SIZE, "page": page, **filters})
        batch = data["data"]
        output.extend(batch)
        meta = data.get("meta") or {}
        if (isinstance(meta, dict) and isinstance(meta.get("pageCount"), int)
                and page >= meta["pageCount"]):
            return output
        if len(batch) < PAGE_SIZE:
            return output
    raise ApiError(503, "Statement pagination limit reached; results incomplete")


def _dates(from_date, to_date):
    try:
        start = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end = datetime.strptime(to_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError) as exc:
        raise ValueError("Dates must be YYYY-MM-DD") from exc
    if end < start or end - start > timedelta(days=7):
        raise ValueError("A statement window must be 1 to 8 calendar days")
    if end >= datetime.now(timezone.utc):
        raise ValueError("Use completed historical dates, not today or future")
    return start, end + timedelta(days=1)


def fetch_provider_snapshot(from_date, to_date):
    """Paginate every external page, or fail rather than reporting false completeness."""
    start, end = _dates(from_date, to_date)
    params = {"from": from_date, "to": to_date}
    transactions = _pages("/transaction", {**params, "status": "success"})
    settlements = _pages("/settlement", params)
    settled_refs = set()
    for s in settlements:
        if not isinstance(s, dict) or s.get("status") != "success":
            continue
        sid = s.get("id")
        if not str(sid).isdigit():
            raise ApiError(502, "Paystack settlement missing ID")
        members = _pages(f"/settlement/{sid}/transactions", {})
        for tx in members:
            if isinstance(tx, dict) and isinstance(tx.get("reference"), str):
                settled_refs.add(tx["reference"])
    return start, end, transactions, settlements, settled_refs


def get_local_funding(start, end):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT reference,amount_kobo,status,provider_transaction_id "
            "FROM funding_intents WHERE created_at >= %s AND created_at < %s",
            (start, end),
        )
        return cur.fetchall()


def _fingerprint(ref):
    return hashlib.sha256(ref.encode("utf-8")).hexdigest()[:16]


def compare_funding(local, transactions, settled_refs, *, environment):
    """Report exceptions without returning raw user identities or changing money."""
    local_by_ref = {r["reference"]: r for r in local}
    provider_by_ref = {}
    issues = []
    for tx in transactions:
        if not isinstance(tx, dict):
            raise ApiError(502, "Malformed Paystack transaction record")
        ref = tx.get("reference")
        if not isinstance(ref, str):
            raise ApiError(502, "Missing Paystack reference")
        if not ref.startswith("PQF_"):
            continue
        fingerprint = _fingerprint(ref)
        if ref in provider_by_ref:
            issues.append({"type": "duplicate_provider_reference", "reference_hash": fingerprint})
        provider_by_ref[ref] = tx
        if tx.get("domain") != environment or tx.get("currency") != "NGN":
            issues.append({"type": "provider_environment_or_currency_mismatch", "reference_hash": fingerprint})
    for ref, local_row in local_by_ref.items():
        external = provider_by_ref.get(ref)
        mark = _fingerprint(ref)
        if external is None:
            if local_row["status"] == "credited":
                issues.append({"type": "credited_but_not_on_statement", "reference_hash": mark})
            continue
        if external.get("status") != "success" or type(external.get("amount")) is not int:
            issues.append({"type": "invalid_provider_success", "reference_hash": mark})
            continue
        if external["amount"] != local_row["amount_kobo"]:
            issues.append({"type": "funding_principal_mismatch", "reference_hash": mark})
        if (local_row["provider_transaction_id"] is not None
                and str(external.get("id")) != str(local_row["provider_transaction_id"])):
            issues.append({"type": "provider_transaction_id_mismatch", "reference_hash": mark})
        if local_row["status"] == "credited" and ref not in settled_refs:
            issues.append({"type": "credited_not_in_successful_settlement_yet", "reference_hash": mark, "severity": "warning"})
        elif local_row["status"] != "credited":
            issues.append({"type": "external_success_not_wallet_credited", "reference_hash": mark})
    for ref in provider_by_ref.keys() - local_by_ref.keys():
        issues.append({"type": "unmatched_external_success", "reference_hash": _fingerprint(ref)})
    hard = sum(1 for i in issues if i.get("severity") != "warning")
    return {
        "status": "failed" if hard else ("attention" if issues else "ok"),
        "mode": environment,
        "counts": {
            "local_funding_intents": len(local_by_ref),
            "external_payquick_transactions": len(provider_by_ref),
            "externally_settled_references": len(settled_refs & provider_by_ref.keys()),
            "critical_exceptions": hard,
            "warnings": len(issues) - hard,
        },
        "exceptions": issues[:200],
        "exceptions_truncated": len(issues) > 200,
    }


def run(from_date, to_date):
    mode, _ = _mode_key()
    start, end, txs, settlements, settled = fetch_provider_snapshot(from_date, to_date)
    report = compare_funding(get_local_funding(start, end), txs, settled, environment=mode)
    report["from"] = from_date
    report["to"] = to_date
    report["settlement_records"] = len(settlements)
    report["source"] = "Paystack REST /transaction + /settlement"
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-date", required=True)
    parser.add_argument("--to-date", required=True)
    args = parser.parse_args()
    result = run(args.from_date, args.to_date)
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result["status"] == "ok" else 2)
