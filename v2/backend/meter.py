"""Explicit meter-automation boundary. No silent claims of remote availability."""
from errors import ApiError

DISCOS = frozenset({
    "ikeja-electric", "eko-electric", "abuja-electric", "kano-electric",
    "portharcourt-electric", "jos-electric", "ibadan-electric",
    "kaduna-electric", "enugu-electric", "benin-electric",
})


def validate_meter(*, disco, meter_number, nickname):
    if disco not in DISCOS:
        raise ApiError(400, "Unsupported distribution company")
    if not isinstance(meter_number, str) or not meter_number.isdigit() or not 8 <= len(meter_number) <= 18:
        raise ApiError(400, "Meter number must contain 8–18 digits")
    if not isinstance(nickname, str) or not 1 <= len(nickname.strip()) <= 40:
        raise ApiError(400, "Meter nickname is required")
    return meter_number.strip(), nickname.strip()


def capability(meter):
    # Never turn on remote loading simply because a user selects a DisCo/model.
    return {
        "meter_id": str(meter["id"]),
        "remote_loading": bool(meter["remote_loading_verified"]),
        "load_mode": "remote" if meter["remote_loading_verified"] else "manual",
        "status": "eligible" if meter["remote_loading_verified"] else "requires_provider_verification",
    }
