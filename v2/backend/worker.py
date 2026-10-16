"""Scheduled worker process, deployed separately from the Vercel web API."""
import json
from vending import process_once

if __name__ == "__main__":
    print(json.dumps(process_once()))
