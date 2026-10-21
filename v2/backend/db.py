"""PostgreSQL connections. Configure Aiven's TLS URL as DATABASE_URL."""
import os
import psycopg
from psycopg.rows import dict_row


class DatabaseConfigurationError(RuntimeError):
    """Configuration failure, distinct from an unexpected programming error."""



def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise DatabaseConfigurationError("DATABASE_URL is not configured")
    # TLS should be specified in the Aiven DATABASE_URL (?sslmode=require or stronger).
    secure = "sslmode=require" in url or "sslmode=verify-full" in url
    if not secure and os.getenv("CI_TEST_DATABASE") != "true":
        raise DatabaseConfigurationError("DATABASE_URL must specify TLS")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=8)
