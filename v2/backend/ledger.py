"""Signed immutable journal: credits positive, debits negative.

The wallet account is a customer-liability account. Every journal sums to zero.
Caller holds a PostgreSQL transaction and the relevant wallet row lock.
"""
from errors import ApiError


def post_journal(cur, *, reference, kind, postings):
    if len(postings) < 2 or any(
        type(amount) is not int or amount == 0 for _, amount in postings
    ):
        raise ValueError("Journal must have two or more non-zero integer postings")
    if sum(amount for _, amount in postings) != 0:
        raise ValueError("Unbalanced journal")
    if len({str(account) for account, _ in postings}) < 2:
        raise ValueError("Journal must use distinct accounts")
    cur.execute(
        "INSERT INTO ledger_transactions(reference,kind) VALUES (%s,%s) RETURNING id",
        (reference, kind),
    )
    tx_id = cur.fetchone()["id"]
    for account_id, amount in postings:
        cur.execute(
            "INSERT INTO ledger_entries(transaction_id,account_id,amount_kobo) VALUES (%s,%s,%s)",
            (tx_id, account_id, amount),
        )
    return tx_id


def apply_wallet_delta(cur, *, user_id, delta_kobo, reference, kind, contra_account):
    if type(delta_kobo) is not int or delta_kobo == 0:
        raise ValueError("Invalid wallet adjustment")
    cur.execute(
        "SELECT balance_kobo,account_id FROM wallets WHERE user_id=%s FOR UPDATE",
        (user_id,),
    )
    wallet = cur.fetchone()
    if not wallet:
        raise ApiError(404, "Wallet not found")
    new_balance = wallet["balance_kobo"] + delta_kobo
    if new_balance < 0:
        raise ApiError(409, "Insufficient funds")
    tx_id = post_journal(
        cur, reference=reference, kind=kind,
        postings=[(wallet["account_id"], delta_kobo), (contra_account, -delta_kobo)],
    )
    cur.execute("UPDATE wallets SET balance_kobo=%s WHERE user_id=%s", (new_balance, user_id))
    return tx_id, new_balance
