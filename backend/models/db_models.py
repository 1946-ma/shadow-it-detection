import os
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv

load_dotenv()


def _conninfo() -> str:
    return psycopg.conninfo.make_conninfo(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "shadow_it_db"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


# Lazily-created singleton pool — created on first query, not at import, so
# scripts that never touch the DB (or run before it is up) still import fine.
_pool = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(conninfo=_conninfo(), min_size=1, max_size=10, open=True)
    return _pool


def get_connection():
    """Direct (non-pooled) connection — kept for standalone scripts."""
    return psycopg.connect(_conninfo())


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
    # The pool's connection() context manager commits on success, rolls back
    # on exception, and returns the connection to the pool either way.
    with _get_pool().connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            if fetch == "one":
                return cur.fetchone()
            if fetch == "all":
                return cur.fetchall()
            return None


def execute_many(query: str, param_seq) -> int:
    """Insert/update many rows in ONE connection and ONE transaction — atomic
    (all rows or none) and far cheaper than per-row execute() calls."""
    param_seq = list(param_seq)
    if not param_seq:
        return 0
    with _get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(query, param_seq)
    return len(param_seq)
