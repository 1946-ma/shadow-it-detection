-- Migration: token_denylist table (JWT revocation) — 2026-07-24
-- ---------------------------------------------------------------------------
-- This table is part of db/schema.sql, but databases created before it was
-- added never got it: the app connects as the restricted role, which cannot
-- CREATE in schema public (hence the "permission denied for schema public"
-- warning at startup, and logout-revocation silently no-opping).
--
-- token_denylist is required for JWT revocation on logout AND for
-- concurrent-session enforcement (revoking older sessions). Create it here.
--
-- Run once as the table OWNER (postgres) on the HOST database:
--   psql -U postgres -d shadow_it_db -f db/migrate_token_denylist.sql
--
-- Idempotent and safe to re-run.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS token_denylist (
    jti         TEXT PRIMARY KEY,
    expires_at  TIMESTAMPTZ NOT NULL
);

GRANT SELECT, INSERT, DELETE ON token_denylist TO shadow_it_app;
