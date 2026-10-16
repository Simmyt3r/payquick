"""PostgreSQL connections. Configure Aiven's TLS URL as DATABASE_URL."""
import os
import psycopg
from psycopg.rows import dict_row


def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    # TLS should be specified in the Aiven DATABASE_URL (?sslmode=require or stronger).
    if "sslmode=" not in url:
        raise RuntimeError("DATABASE_URL must specify sslmode=require or verify-full")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=8)
