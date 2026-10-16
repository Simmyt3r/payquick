"""Paystack TEST credentials probe: read-only list, no payment initiation."""
import json
import os
from datetime import datetime, timezone
from errors import ApiError
import paystack_settlement


def probe():
    if os.getenv("PAYSTACK_MODE", "test") != "test":
        raise ApiError(503, "Sandbox certification strictly requires PAYSTACK_MODE=test")
    mode, key = paystack_settlement._mode_key()
    if mode != "test":
        raise ApiError(503, "Live credentials prohibited")
    data = paystack_settlement._get("/transaction", {"perPage": 1, "page": 1})
    records = data["data"]
    return {
        "provider": "Paystack", "environment": "test",
        "status": "reachable", "read_only": True,
        "sample_count": len(records),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "live_funds_moved": False,
        "remark": "API reachability does not prove webhook, funding, payout or licensing certification",
    }


if __name__ == "__main__":
    print(json.dumps(probe(), sort_keys=True))
