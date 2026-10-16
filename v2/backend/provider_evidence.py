"""Validate VTpass evidence against a recorded electricity order.

Provider responses are untrusted inputs. The displayed meter, reference and
vended principal must match the order before we recognize delivery. Fees,
commissions and total_amount are NOT the customer's vending principal.
"""
from decimal import Decimal, InvalidOperation


def naira_to_kobo(value):
    """Return an exact integer in kobo, or None for malformed or fractional-kobo input."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        money = Decimal(str(value))
        kobo = money * 100
        if not money.is_finite() or kobo != kobo.to_integral_value():
            return None
        return int(kobo)
    except (InvalidOperation, ValueError, TypeError):
        return None


def validate_provider_result(order, response, *, expected_kind):
    """Return a human-readable hold reason or None when finality is trustworthy.

    Failure evidence needs the original request ID and an explicit final
    negative result from /requery. Successful vending also requires a matching
    meter number, matching principal, and token. We never use total_amount for
    comparison because provider fees and commissions change that figure.
    """
    if not isinstance(response, dict):
        return "malformed_provider_result"
    if str(response.get("requestId", "")) != str(order["provider_request_id"]):
        return "missing_or_mismatched_request_id"
    if expected_kind == "failed":
        return None

    body = response.get("content")
    tx = body.get("transactions") if isinstance(body, dict) else None
    if not isinstance(tx, dict):
        return "missing_transaction_details"
    if str(tx.get("unique_element", "")) != str(order["meter_number"]):
        return "missing_or_mismatched_meter"
    expected_amount = order["amount_kobo"]
    # VTpass documents both top-level amount and transactions.amount.
    # Validate both when present, and require at least one.
    recorded = [x for x in (response.get("amount"), tx.get("amount")) if x is not None]
    if not recorded:
        return "missing_vend_amount"
    if any(naira_to_kobo(x) != expected_amount for x in recorded):
        return "incorrect_vend_amount"
    return None
