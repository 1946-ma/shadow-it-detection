-- Migration: behavioural-classifier alert columns (2026-07-29)
-- ---------------------------------------------------------------------------
-- Adds classifier_confidence + classifier_alert to the detections table.
-- classifier_confidence records the traffic classifier's predicted-category
-- confidence (ml/traffic_classifier.py:classify()) for anomaly-flagged flows
-- it could name behaviourally; classifier_alert is TRUE only when that
-- category is in the "watched" set (ai/social) AND confidence clears the
-- stricter ALERT_MIN_CONFIDENCE bar — the signal /api/stats/alerts and the
-- Topbar bell use to notify the admin of a likely AI/social look-alike.
--
-- Run as the table OWNER (postgres) on the HOST database:
--   psql -U postgres -d shadow_it_db -f db/migrate_classifier_alert.sql
--
-- Idempotent (IF NOT EXISTS) and safe to re-run. Fresh Docker volumes get
-- these columns from db/schema.sql instead, so this file is only for
-- databases created before the columns existed. The restricted role's
-- grants are table-level, so no new GRANTs are needed.
-- ---------------------------------------------------------------------------

ALTER TABLE detections ADD COLUMN IF NOT EXISTS classifier_confidence FLOAT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS classifier_alert BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows predate this signal, so NULL/FALSE (the column defaults,
-- already applied above) is the correct backfill.
