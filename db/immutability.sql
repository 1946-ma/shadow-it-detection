-- ══════════════════════════════════════════════════════════════════════════
--  Audit Log Immutability & Hash Chain
--  Run from shadow-it-detection/ :
--    psql -U postgres -d shadow_it_db -f db/immutability.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. pgcrypto (needed for SHA-256 inside the DB) ────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. Hash column on audit_logs ──────────────────────────────────────────
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entry_hash CHAR(64);

-- ── 3. BEFORE INSERT trigger — auto-computes SHA-256 hash chain ───────────
CREATE OR REPLACE FUNCTION fn_audit_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
  content   TEXT;
BEGIN
  -- get the most recent hash (or all-zeros genesis for first entry)
  SELECT COALESCE(entry_hash, repeat('0', 64))
  INTO   prev_hash
  FROM   audit_logs
  ORDER  BY id DESC
  LIMIT  1;

  content :=
      NEW.user_id::TEXT                        || '|' ||
      NEW.action                               || '|' ||
      COALESCE(NEW.target,     '')             || '|' ||
      COALESCE(NEW.ip_address, '')             || '|' ||
      NEW.timestamp::TEXT                      || '|' ||
      COALESCE(prev_hash, repeat('0', 64));

  NEW.entry_hash := encode(digest(content, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_hash ON audit_logs;
CREATE TRIGGER trg_audit_hash
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_hash();

-- ── 4. BEFORE UPDATE / DELETE triggers — hard block ───────────────────────
CREATE OR REPLACE FUNCTION fn_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Audit log entries are immutable — modifications are not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_logs;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_immutable();

DROP TRIGGER IF EXISTS trg_audit_no_delete ON audit_logs;
CREATE TRIGGER trg_audit_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_immutable();

-- ── 5. Restricted application role (INSERT + SELECT only on audit_logs) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shadow_it_app') THEN
    CREATE ROLE shadow_it_app WITH LOGIN PASSWORD 'sh4d0w_app_2026';
  END IF;
END $$;

GRANT CONNECT  ON DATABASE shadow_it_db TO shadow_it_app;
GRANT USAGE    ON SCHEMA  public        TO shadow_it_app;

-- Full access to detections and users
GRANT SELECT, INSERT, UPDATE, DELETE ON detections TO shadow_it_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users      TO shadow_it_app;

-- Audit logs: append + read only — NO UPDATE, NO DELETE
GRANT SELECT, INSERT ON audit_logs TO shadow_it_app;

-- Token denylist: read/insert (logout revocation) + delete (expiry cleanup)
GRANT SELECT, INSERT, DELETE ON token_denylist TO shadow_it_app;

-- Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shadow_it_app;
