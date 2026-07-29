-- Shadow IT Detection Framework - Database Schema
-- Assumes you are already connected to shadow_it_db.
-- Easiest setup: python db/setup.py  (handles everything automatically)

CREATE TYPE user_role AS ENUM ('admin', 'viewer');

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'viewer',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
    id              SERIAL PRIMARY KEY,
    src_ip          VARCHAR(45) NOT NULL,
    src_mac         VARCHAR(17),
    dst_domain      VARCHAR(255),
    protocol        VARCHAR(10),
    bytes_sent      BIGINT,
    bytes_received  BIGINT,
    duration        FLOAT,
    device_type     VARCHAR(50),
    shadow_it_type  VARCHAR(20),
    risk_level      VARCHAR(10),
    anomaly_score   FLOAT,
    app_category     VARCHAR(30),                -- SaaS category (catalog hits): ai, cloud-storage, vpn, …
    detection_source VARCHAR(20) NOT NULL DEFAULT 'anomaly',  -- catalog | anomaly | active-scan
    classifier_confidence FLOAT,                 -- behavioural traffic classifier's predicted-category confidence
    classifier_alert BOOLEAN NOT NULL DEFAULT FALSE,  -- high-confidence ai/social look-alike (ml/traffic_classifier.py)
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    target      TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address  VARCHAR(45)
);

-- Revoked JWTs (populated on logout). token_required() rejects any token
-- whose jti is present here until it naturally expires.
CREATE TABLE IF NOT EXISTS token_denylist (
    jti         TEXT PRIMARY KEY,
    expires_at  TIMESTAMPTZ NOT NULL
);

-- Live login sessions (one row per issued JWT). Drives concurrent-session
-- (identity Shadow IT) detection: a single account active from more than N
-- distinct IPs at once indicates credential sharing.
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

-- Auto-suggested firewall rules: a draft enforcement action generated from a
-- detection (block-egress or quarantine), reviewed by an admin. Approval
-- actually executes the command against the real target (ml/enforcement.py);
-- rejection just dismisses it. Never auto-applied without a human approving.
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

CREATE INDEX IF NOT EXISTS idx_detections_detected_at    ON detections(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_detections_risk_level     ON detections(risk_level);
CREATE INDEX IF NOT EXISTS idx_detections_shadow_it_type ON detections(shadow_it_type);
CREATE INDEX IF NOT EXISTS idx_detections_is_resolved    ON detections(is_resolved);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id        ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp      ON audit_logs(timestamp DESC);
