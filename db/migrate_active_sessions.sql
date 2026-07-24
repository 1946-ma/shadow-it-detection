-- Migration: active_sessions table for concurrent-session detection (Feature 1, 2026-07-24)
-- ---------------------------------------------------------------------------
-- Tracks live login sessions (one row per issued JWT, keyed by jti) so the
-- backend can detect one credential used from more than N distinct IPs at
-- once (identity Shadow IT / credential sharing) and enforce the limit by
-- revoking older sessions via token_denylist.
--
-- Run once as the table OWNER (postgres) on the HOST database:
--   psql -U postgres -d shadow_it_db -f db/migrate_active_sessions.sql
--
-- Idempotent and safe to re-run. Fresh Docker volumes get this from
-- db/schema.sql + db/immutability.sql instead — this file is only for
-- databases created before the table existed. The restricted app role can't
-- CREATE, so the migration must run as postgres.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS active_sessions (
    jti         TEXT PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username    VARCHAR(100),
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);

-- The restricted app role reads/inserts (login) and deletes (logout /
-- enforcement / expiry cleanup). Table-level grant covers future columns.
GRANT SELECT, INSERT, DELETE ON active_sessions TO shadow_it_app;
