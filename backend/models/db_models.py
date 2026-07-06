import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "shadow_it_db"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def ensure_auth_schema():
    """Ensure the JWT revocation (denylist) table exists. Fresh Docker
    volumes get it from schema.sql; this is a fallback for databases created
    before it was added. Checks existence first so it's a safe no-op under
    the restricted role (which has USAGE but not CREATE on the schema)."""
    exists = execute(
        "SELECT 1 AS x FROM information_schema.tables WHERE table_name = 'token_denylist'",
        fetch="one",
    )
    if not exists:
        execute(
            """CREATE TABLE token_denylist (
                   jti        TEXT PRIMARY KEY,
                   expires_at TIMESTAMPTZ NOT NULL
               )"""
        )


def execute(query: str, params=None, fetch: str = None):
    """
    fetch = None  → execute only (INSERT/UPDATE/DELETE)
    fetch = 'one' → fetchone()
    fetch = 'all' → fetchall()
    """
    conn = get_connection()
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            if fetch == "one":
                result = cur.fetchone()
            elif fetch == "all":
                result = cur.fetchall()
            else:
                result = None
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
