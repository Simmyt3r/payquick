"""Independent standard VTU and electricity worker entry point.

Run outside Vercel in a monitored scheduler. Each call can service one
ordinary VTU item and one electricity item. A disabled advanced feature
must not prevent ordinary VTU from working.
"""
import json
import os
import vtu_service
import vending


def run_once():
    outcome = {}
    if os.getenv("VTU_VENDING_ENABLED") == "true":
        outcome["standard_vtu"] = vtu_service.process_once()
    else:
        outcome["standard_vtu"] = {"operation": "disabled"}
    if os.getenv("ELECTRICITY_VENDING_ENABLED") == "true":
        outcome["electricity"] = vending.process_once()
    else:
        outcome["electricity"] = {"operation": "disabled"}
    return outcome


if __name__ == "__main__":
    print(json.dumps(run_once()))
