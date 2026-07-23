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


# ── Detection inserts (resilient to the Phase-2 categorisation columns) ────────
# app_category/detection_source may not exist yet on databases that predate the
# migration (db/migrate_shadowit_categories.sql). Check once and build the
# INSERT accordingly so the API works before AND after the migration is applied.
_DET_BASE_COLS = [
    "src_ip", "src_mac", "dst_domain", "protocol", "bytes_sent", "bytes_received",
    "duration", "device_type", "shadow_it_type", "risk_level", "anomaly_score",
]
_has_shadowit_cols = None


def detections_has_shadowit_cols() -> bool:
    """True if detections has app_category + detection_source (cached)."""
    global _has_shadowit_cols
    if _has_shadowit_cols is None:
        try:
            row = execute(
                """SELECT COUNT(*) AS c FROM information_schema.columns
                   WHERE table_name = 'detections'
                   AND column_name IN ('app_category', 'detection_source')""",
                fetch="one",
            )
            _has_shadowit_cols = bool(row) and int(row["c"]) == 2
        except Exception:
            _has_shadowit_cols = False
    return _has_shadowit_cols


def insert_detections(records) -> int:
    """Insert detection records atomically. Accepts the dicts produced by
    ml.model.detect() / ml.collector.scan_to_detections(); tolerates missing
    optional keys and the pre-migration schema."""
    records = list(records)
    if not records:
        return 0
    extra = detections_has_shadowit_cols()
    cols  = _DET_BASE_COLS + (["app_category", "detection_source"] if extra else [])
    sql   = (f"INSERT INTO detections ({', '.join(cols)}) "
             f"VALUES ({', '.join(['%s'] * len(cols))})")

    rows = []
    for r in records:
        vals = [
            r.get("src_ip"),
            r.get("src_mac", "Live"),
            r.get("dst_domain", r.get("Destination IP", "Unknown")),
            r.get("protocol", "TCP"),
            r.get("bytes_sent", 0),
            r.get("bytes_received", 0),
            r.get("duration", 0),
            r.get("device_type", "unknown"),
            r["shadow_it_type"],
            r["risk_level"],
            r["anomaly_score"],
        ]
        if extra:
            vals += [r.get("app_category"), r.get("detection_source", "anomaly")]
        rows.append(tuple(vals))
    return execute_many(sql, rows)
