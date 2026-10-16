"""Read-only financial checks. Never mutate balances, refunds, or provider states.

Run in an authorized operator environment separately from the public API.
Outputs aggregate counts only. No customer data, meter numbers, or tokens.
"""
import json
from datetime import datetime, timezone

from db import connect


def calculate_report():
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) AS n FROM (
                SELECT t.id FROM ledger_transactions t
                LEFT JOIN ledger_entries e ON e.transaction_id=t.id
                GROUP BY t.id
                HAVING COALESCE(SUM(e.amount_kobo),0)<>0 OR COUNT(e.id)<2
            ) broken
        """)
        unbalanced_journals = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(*) AS n FROM (
                SELECT w.user_id FROM wallets w
                JOIN ledger_accounts a ON a.id=w.account_id
                LEFT JOIN ledger_entries e ON e.account_id=a.id
                GROUP BY w.user_id,w.balance_kobo
                HAVING COALESCE(SUM(e.amount_kobo),0)<>w.balance_kobo
            ) mismatch
        """)
        wallet_divergences = cur.fetchone()["n"]
        cur.execute("""
            SELECT COALESCE(SUM(e.amount_kobo),0) AS n
            FROM ledger_accounts a
            LEFT JOIN ledger_entries e ON e.account_id=a.id
            WHERE a.code='vtpass:suspense'
        """)
        suspense_balance = cur.fetchone()["n"]
        cur.execute("""
            SELECT COALESCE(SUM(total_kobo),0) AS n
            FROM electricity_orders
            WHERE status IN ('queued','submitting','pending','manual_review')
        """)
        unresolved_reservations = cur.fetchone()["n"]
        cur.execute("""
            SELECT COALESCE(SUM(q.total_kobo),0) AS n
            FROM vtu_orders o JOIN vtu_quotes q ON q.id=o.quote_id
            WHERE o.status IN ('queued','submitting','pending','manual_review')
        """)
        unresolved_vtu = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(*) AS n FROM electricity_orders
            WHERE status='delivered' AND token_ciphertext IS NULL
        """)
        missing_tokens = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(*) AS n FROM (
                SELECT provider_transaction_id FROM electricity_orders
                WHERE provider_transaction_id IS NOT NULL AND provider_transaction_id <> ''
                GROUP BY provider_transaction_id HAVING COUNT(*)>1
            ) duplicates
        """)
        duplicate_provider_ids = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(*) AS n FROM electricity_orders
            WHERE status IN ('queued','submitting','pending')
              AND updated_at < now() - interval '45 minutes'
        """)
        stalled_orders = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM electricity_orders WHERE status='manual_review'")
        manual_review = cur.fetchone()["n"]
        cur.execute("""
            SELECT COUNT(*) AS n FROM funding_intents WHERE status='credited'
            AND (provider_transaction_id IS NULL OR credited_at IS NULL)
        """)
        invalid_credits = cur.fetchone()["n"]
    critical = {
        "unbalanced_journals": unbalanced_journals,
        "wallet_balance_divergences": wallet_divergences,
        "suspense_vs_unresolved_delta_kobo": suspense_balance - unresolved_reservations - unresolved_vtu,
        "delivered_without_token": missing_tokens,
        "duplicate_provider_transaction_ids": duplicate_provider_ids,
        "credited_without_settlement_reference": invalid_credits,
    }
    warnings = {"stalled_electricity_orders": stalled_orders, "manual_review_orders": manual_review}
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "status": "failed" if any(critical.values()) else ("attention" if any(warnings.values()) else "ok"),
        "critical": critical, "warnings": warnings,
        "metrics": {
            "suspense_balance_kobo": suspense_balance,
            "unresolved_reservations_kobo": unresolved_reservations + unresolved_vtu,
            "standard_vtu_reservations_kobo": unresolved_vtu,
        },
    }


if __name__ == "__main__":
    result = calculate_report()
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(1 if result["status"] != "ok" else 0)
