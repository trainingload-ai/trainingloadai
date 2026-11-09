ALTER TYPE "enum_third_party_provider" ADD VALUE IF NOT EXISTS 'garmin';
ALTER TYPE "enum_third_party_provider" ADD VALUE IF NOT EXISTS 'coros';
ALTER TYPE "enum_import_source_kind" ADD VALUE IF NOT EXISTS 'GARMIN_PERSONAL_API';
ALTER TYPE "enum_import_source_kind" ADD VALUE IF NOT EXISTS 'COROS_MCP';
ALTER TYPE "enum_health_data_provider" ADD VALUE IF NOT EXISTS 'GARMIN';
ALTER TYPE "enum_health_data_provider" ADD VALUE IF NOT EXISTS 'COROS';

CREATE TABLE "t_personal_provider_job" (
  "id" TEXT PRIMARY KEY,
  "connection_id" TEXT NOT NULL REFERENCES "t_external_provider_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "request_id" TEXT NOT NULL,
  "dedup_key" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error_code" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "lease_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "personal_job_kind_check" CHECK ("kind" IN ('SYNC','ACTIVITY','HEALTH','WRITE')),
  CONSTRAINT "personal_job_status_check" CHECK ("status" IN ('PREVIEW','QUEUED','RUNNING','WAITING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'))
);
CREATE UNIQUE INDEX "t_personal_provider_job_connection_id_request_id_key" ON "t_personal_provider_job"("connection_id", "request_id");
CREATE UNIQUE INDEX "t_personal_provider_job_connection_id_dedup_key_key" ON "t_personal_provider_job"("connection_id", "dedup_key");
CREATE UNIQUE INDEX "personal_job_one_running_per_connection" ON "t_personal_provider_job"("connection_id") WHERE "status" = 'RUNNING';
CREATE INDEX "t_personal_provider_job_status_next_attempt_at_idx" ON "t_personal_provider_job"("status", "next_attempt_at");
CREATE INDEX "t_personal_provider_job_connection_id_created_at_idx" ON "t_personal_provider_job"("connection_id", "created_at");
