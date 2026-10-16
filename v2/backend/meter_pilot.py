"""Partner-neutral prepaid meter remote loading protocol. No live transport."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Mapping, Protocol
from errors import ApiError


@dataclass(frozen=True)
class PilotAuthorization:
    meter_id: str
    provider_name: str
    meter_model: str
    partner_agreement_reference: str
    capability_reference: str
    customer_consented_at: datetime
    expires_at: datetime


class RemoteMeterAdapter(Protocol):
    def check_capability(self, *, meter_id: str) -> Mapping: ...
    def submit_existing_token(self, *, meter_id: str, order_id: str, token: str,
                              idempotency_key: str) -> Mapping: ...
    def requery_loading(self, *, load_reference: str) -> Mapping: ...


def validate_authorization(approval, *, now=None):
    now = now or datetime.now(timezone.utc)
    for value in (
        approval.meter_id, approval.provider_name, approval.meter_model,
        approval.partner_agreement_reference, approval.capability_reference,
    ):
        if not isinstance(value, str) or not value.strip():
            raise ApiError(409, "Approved partner and meter evidence are required")
    if (
        approval.customer_consented_at.tzinfo is None
        or approval.expires_at.tzinfo is None
        or approval.customer_consented_at > now
        or approval.expires_at <= now
        or approval.expires_at <= approval.customer_consented_at
    ):
        raise ApiError(409, "Current, timestamped customer consent is required")
    return True


def can_attempt_load(*, approval, meter_id, vend_status, token, now=None):
    """Use an existing legitimate token: never mint or purchase another."""
    validate_authorization(approval, now=now)
    if str(meter_id) != approval.meter_id:
        raise ApiError(409, "Approval is for a different meter")
    if vend_status != "delivered":
        raise ApiError(409, "Token must be successfully vended first")
    if not isinstance(token, str) or len(token) != 20 or not token.isdigit():
        raise ApiError(409, "Existing STS token is missing or malformed")
    return True


def interpret_partner_ack(*, expected_meter, expected_load_reference, response,
                          verify_partner_signature: Callable[[Mapping], bool]):
    """A transport submission is NOT evidence of meter credit acceptance.

    A future partner-specific verifier must check real signed evidence using
    the partner's supplied documentation. Never trust an arbitrary boolean
    flag from a remote response as signature proof.
    """
    if not isinstance(response, Mapping):
        return "unknown"
    if str(response.get("meter_id", "")) != str(expected_meter):
        return "unknown"
    if str(response.get("load_reference", "")) != str(expected_load_reference):
        return "unknown"
    state = response.get("status")
    if state == "rejected":
        return "rejected"
    if state == "submitted":
        return "submitted"
    if state == "accepted":
        if not response.get("meter_acceptance_reference"):
            return "unknown"
        if verify_partner_signature(response) is not True:
            return "unknown"
        return "loaded"
    return "unknown"


class NoPartnerAdapter:
    """Fail-closed placeholder until a utility authorizes physical loading."""

    def check_capability(self, *, meter_id: str):
        return {"meter_id": meter_id, "remote_loading": False, "reason": "no_authorized_partner"}

    def submit_existing_token(self, **kwargs):
        raise ApiError(503, "Remote meter loading unavailable: partner integration missing")

    def requery_loading(self, **kwargs):
        raise ApiError(503, "Remote meter loading unavailable: partner integration missing")
