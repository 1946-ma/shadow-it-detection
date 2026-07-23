-- Migration: Shadow IT categorisation columns (Phase 2, 2026-07-22)
-- ---------------------------------------------------------------------------
-- Adds app_category + detection_source to the detections table so the
-- dashboard can group Shadow IT by category and distinguish catalog-based
-- SaaS detections from ML anomalies and active-scan findings.
--
-- Run as the table OWNER (postgres) on the HOST database:
--   psql -U postgres -d shadow_it_db -f db/migrate_shadowit_categories.sql
--
-- Idempotent (IF NOT EXISTS) and safe to re-run. Fresh Docker volumes get
-- these columns from db/schema.sql instead, so this file is only for
-- databases created before the columns existed.
-- The restricted role's grants are table-level, so no new GRANTs are needed —
-- new columns are covered automatically.
-- ---------------------------------------------------------------------------

ALTER TABLE detections ADD COLUMN IF NOT EXISTS app_category VARCHAR(30);
ALTER TABLE detections ADD COLUMN IF NOT EXISTS detection_source VARCHAR(20) NOT NULL DEFAULT 'anomaly';

-- Existing rows predate the catalog/active-scan paths, so 'anomaly' (the
-- column default, already applied above) is the correct backfill.
