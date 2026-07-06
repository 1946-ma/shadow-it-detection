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

CREATE INDEX IF NOT EXISTS idx_detections_detected_at    ON detections(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_detections_risk_level     ON detections(risk_level);
CREATE INDEX IF NOT EXISTS idx_detections_shadow_it_type ON detections(shadow_it_type);
CREATE INDEX IF NOT EXISTS idx_detections_is_resolved    ON detections(is_resolved);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id        ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp      ON audit_logs(timestamp DESC);
