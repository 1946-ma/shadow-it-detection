-- Migration: firewall_rules table for auto-suggested firewall rules (2026-07-27)
-- ---------------------------------------------------------------------------
-- A draft enforcement action generated from a detection (block-egress or
-- quarantine), reviewed by an admin via GET/PATCH /api/firewall/rules.
-- Approval actually executes the command against the real target
-- (ml/enforcement.py — SSH to docker-host, vmrun guest-ops to the two
-- Windows VMs); rejection just dismisses it. Never auto-applied without a
-- human clicking Approve.
--
-- Run once as the table OWNER (postgres) on the HOST database:
--   psql -U postgres -d shadow_it_db -f db/migrate_firewall_rules.sql
--
-- Idempotent and safe to re-run. Fresh Docker volumes get this from
-- db/schema.sql instead — this file is only for databases created before the
-- table existed. The restricted app role can't CREATE, so the migration must
-- run as postgres.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firewall_rules (
    id               SERIAL PRIMARY KEY,
    detection_id     INTEGER REFERENCES detections(id) ON DELETE CASCADE,
    target_ip        VARCHAR(45) NOT NULL,
    target_label     VARCHAR(100),
    enforcement_kind VARCHAR(20) NOT NULL,               -- linux-ufw-host | windows-vm | macvlan-container | unknown
    rule_action      VARCHAR(20) NOT NULL,               -- block-egress | quarantine
    dst_domain       VARCHAR(255),
    rationale        TEXT NOT NULL,
    command_text     TEXT NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | rejected | applied | apply_failed
    execution_output TEXT,
    suggested_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_firewall_rules_status ON firewall_rules(status);

-- The restricted app role reads/inserts (suggest) and updates (approve/reject
-- + record execution outcome). No DELETE — rejected/applied rows stay as a
-- permanent record (traceability comes from audit_logs, not immutability
-- here, since status genuinely needs to mutate).
GRANT SELECT, INSERT, UPDATE ON firewall_rules TO shadow_it_app;

-- The blanket "GRANT ... ON ALL SEQUENCES ..." in immutability.sql only
-- covered sequences that existed when it ran — new SERIAL sequences need
-- their own grant.
GRANT USAGE, SELECT ON SEQUENCE firewall_rules_id_seq TO shadow_it_app;
