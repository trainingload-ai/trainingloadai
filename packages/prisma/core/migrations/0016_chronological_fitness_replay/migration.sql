ALTER TABLE "t_user_fitness_metric"
  ADD COLUMN "projection_version" INTEGER,
  ADD COLUMN "projection_run_id" TEXT,
  ADD COLUMN "projection_fingerprint" TEXT;

ALTER TABLE "t_activity_fitness_metrics_snapshot"
  ADD COLUMN "calculation_fingerprint" TEXT,
  ADD COLUMN "provenance_fingerprint" TEXT,
  ADD COLUMN "input_fingerprint" TEXT,
  ADD COLUMN "input_dimension_fingerprints" JSONB,
  ADD COLUMN "context_fingerprint" TEXT,
  ADD COLUMN "analysis_config_fingerprint" TEXT,
  ADD COLUMN "resolved_load_sources" JSONB,
  ADD COLUMN "actual_load" DOUBLE PRECISION,
  ADD COLUMN "resolved_vo2max_value" DOUBLE PRECISION,
  ADD COLUMN "resolved_vo2max_source" TEXT,
  ADD COLUMN "analysis_timezone" TEXT,
  ADD COLUMN "pmc_local_date" VARCHAR(10);

CREATE TYPE "enum_activity_actual_load_source" AS ENUM (
  'POWER',
  'HEART_RATE',
  'PACE',
  'SESSION_RPE'
);

ALTER TABLE "t_activity_fitness_metrics_snapshot"
  ADD COLUMN "actual_load_source" "enum_activity_actual_load_source";

ALTER TABLE "t_activity_fitness_metrics_snapshot"
  ALTER COLUMN "resolution_version" SET DEFAULT 4;

ALTER TABLE "t_user_post_process_job"
  ADD COLUMN "replay_checkpoint" JSONB;

ALTER TABLE "t_activity_recompute_job"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "replay_checkpoint" JSONB,
  ADD COLUMN "lock_token" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "last_error_code" VARCHAR(64),
  ADD COLUMN "failure_stats" JSONB;

CREATE TABLE "t_user_fitness_metric_projection_audit" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "original_metric_id" TEXT NOT NULL,
  "sport" "enum_sport_type" NOT NULL DEFAULT 'UNKNOWN',
  "type" "enum_user_fitness_metric_type" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "value2" DOUBLE PRECISION,
  "source" "enum_metric_source" NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL,
  "projection_version" INTEGER,
  "projection_run_id" TEXT,
  "projection_fingerprint" TEXT,
  "origin_payload" JSONB,
  "change_source" "enum_change_source",
  "origin_provider" "enum_third_party_provider",
  "origin_external_id" TEXT,
  "origin_checksum" TEXT,
  "origin_synced_at" TIMESTAMP(3),
  "original_created_at" TIMESTAMP(3) NOT NULL,
  "replacement_run_id" TEXT NOT NULL,
  "replacement_reason" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "t_user_fitness_metric_projection_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "t_user_fitness_metric_projection_audit_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "t_user_fitness_metric_projection_audit_original_metric_id_replacement_run_id_key"
  ON "t_user_fitness_metric_projection_audit"("original_metric_id", "replacement_run_id");
CREATE INDEX "t_user_fitness_metric_projection_audit_user_id_type_sport_recorded_at_idx"
  ON "t_user_fitness_metric_projection_audit"("user_id", "type", "sport", "recorded_at");
CREATE INDEX "t_user_fitness_metric_projection_audit_replacement_run_id_idx"
  ON "t_user_fitness_metric_projection_audit"("replacement_run_id");

CREATE TABLE "t_activity_analysis_lease" (
  "user_id" TEXT NOT NULL,
  "owner_token" TEXT NOT NULL,
  "source_job_type" TEXT NOT NULL,
  "source_job_id" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "t_activity_analysis_lease_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "t_activity_analysis_lease_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "t_activity_analysis_lease_owner_token_key"
  ON "t_activity_analysis_lease"("owner_token");
CREATE INDEX "t_activity_analysis_lease_lease_expires_at_idx"
  ON "t_activity_analysis_lease"("lease_expires_at");
CREATE INDEX "t_activity_analysis_lease_source_job_type_priority_lease_expires_at_idx"
  ON "t_activity_analysis_lease"("source_job_type", "priority", "lease_expires_at");

CREATE INDEX "t_activity_recompute_job_priority_status_available_at_idx"
  ON "t_activity_recompute_job"("priority" DESC, "status", "available_at");
CREATE INDEX "t_activity_recompute_job_status_available_at_lease_expires_at_idx"
  ON "t_activity_recompute_job"("status", "available_at", "lease_expires_at");

CREATE TABLE "t_user_analysis_config_version" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER_PROFILE',
  "fingerprint" TEXT NOT NULL,
  "load_sources" TEXT,
  "altitude_optimization_model" "AltitudeOptimizationModel" NOT NULL,
  "altitude_threshold" DOUBLE PRECISION,
  "default_vdot_source" "enum_default_vdot_source" NOT NULL,
  "vo2max_correction_factor" DOUBLE PRECISION,
  "heart_rate_zone_model" "enum_heart_rate_zone_model" NOT NULL,
  "pace_zone_model" "enum_pace_zone_model" NOT NULL,
  "power_zone_model" "PowerZoneModel" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "t_user_analysis_config_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "t_user_analysis_config_version_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "t_user_analysis_config_version_user_id_version_key"
  ON "t_user_analysis_config_version"("user_id", "version");
CREATE INDEX "t_user_analysis_config_version_user_id_effective_at_version_idx"
  ON "t_user_analysis_config_version"("user_id", "effective_at" DESC, "version" DESC);

CREATE TABLE "t_user_auto_update_config_version" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "metric" "enum_user_fitness_metric_type" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER_SETTING',
  "fingerprint" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "t_user_auto_update_config_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "t_user_auto_update_config_version_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "t_user_auto_update_config_version_user_id_metric_version_key"
  ON "t_user_auto_update_config_version"("user_id", "metric", "version");
CREATE INDEX "t_user_auto_update_config_version_user_id_metric_effective_at_version_idx"
  ON "t_user_auto_update_config_version"("user_id", "metric", "effective_at" DESC, "version" DESC);

-- Existing configuration history cannot be reconstructed. Seed one baseline
-- version at the Unix epoch so the migration preserves the pre-upgrade result;
-- every subsequent change is recorded at its exact effective instant.
INSERT INTO "t_user_analysis_config_version" (
  "id",
  "user_id",
  "version",
  "effective_at",
  "source",
  "fingerprint",
  "load_sources",
  "altitude_optimization_model",
  "altitude_threshold",
  "default_vdot_source",
  "vo2max_correction_factor",
  "heart_rate_zone_model",
  "pace_zone_model",
  "power_zone_model"
)
SELECT
  'analysis-config-baseline-' || u."id",
  u."id",
  1,
  TIMESTAMP '1970-01-01 00:00:00',
  'MIGRATION_BASELINE',
  md5(concat_ws('|',
    COALESCE(p."load_sources", ''),
    COALESCE(p."altitude_optimization_model"::text, 'THRESHOLDMETHOD'),
    COALESCE(p."altitude_threshold"::text, ''),
    COALESCE(p."default_vdot_source"::text, 'FACTOR'),
    COALESCE(p."vo2max_correction_factor"::text, '1'),
    COALESCE(p."heart_rate_zone_model"::text, 'MHR'),
    COALESCE(p."pace_zone_model"::text, 'DANIELS'),
    COALESCE(p."power_zone_model"::text, 'FRIEL')
  )),
  p."load_sources",
  COALESCE(p."altitude_optimization_model", 'THRESHOLDMETHOD'::"AltitudeOptimizationModel"),
  p."altitude_threshold",
  COALESCE(p."default_vdot_source", 'FACTOR'::"enum_default_vdot_source"),
  COALESCE(p."vo2max_correction_factor", 1.0),
  COALESCE(p."heart_rate_zone_model", 'MHR'::"enum_heart_rate_zone_model"),
  COALESCE(p."pace_zone_model", 'DANIELS'::"enum_pace_zone_model"),
  COALESCE(p."power_zone_model", 'FRIEL'::"PowerZoneModel")
FROM "t_user" u
LEFT JOIN "t_user_profile" p ON p."user_id" = u."id";

INSERT INTO "t_user_auto_update_config_version" (
  "id",
  "user_id",
  "metric",
  "enabled",
  "version",
  "effective_at",
  "source",
  "fingerprint"
)
SELECT
  'auto-update-baseline-' || c."id",
  c."user_id",
  c."metric",
  c."enabled",
  1,
  TIMESTAMP '1970-01-01 00:00:00',
  'MIGRATION_BASELINE',
  md5(c."metric"::text || '|' || c."enabled"::text)
FROM "t_user_auto_update_config" c;

-- Migration 0008 already fences Activity, FitnessMetric, BodyMetric, Profile
-- and current Zone writes through fitness_publication_changed(). Auto-update
-- permission is also a replay input, so add only the missing trigger here.
CREATE TRIGGER fitness_revision
BEFORE INSERT OR UPDATE OR DELETE ON "t_user_auto_update_config"
FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision
BEFORE INSERT OR UPDATE OR DELETE ON "t_user_analysis_config_version"
FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();

CREATE TRIGGER fitness_revision
BEFORE INSERT OR UPDATE OR DELETE ON "t_user_auto_update_config_version"
FOR EACH ROW EXECUTE FUNCTION fitness_publication_changed();
