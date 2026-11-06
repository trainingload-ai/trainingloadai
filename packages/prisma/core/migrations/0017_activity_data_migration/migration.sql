CREATE TABLE "t_activity_data_migration" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "t_user"("id") ON DELETE CASCADE,
  "run_key" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "phase" TEXT NOT NULL DEFAULT 'RAW_SCAN',
  "backup_evidence" JSONB NOT NULL,
  "before_manifest" JSONB,
  "verification" JSONB,
  "raw_cursor" TEXT,
  "import_batch_ids" JSONB NOT NULL DEFAULT '[]',
  "recompute_job_id" TEXT,
  "replay_from" TIMESTAMP(3),
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "verified_at" TIMESTAMP(3),
  CONSTRAINT "activity_data_migration_status_check"
    CHECK ("status" IN ('PENDING','MIGRATING','VERIFYING','VERIFIED','FAILED'))
);
CREATE UNIQUE INDEX "t_activity_data_migration_run_key_user_id_key"
  ON "t_activity_data_migration"("run_key", "user_id");
CREATE UNIQUE INDEX "t_activity_data_migration_run_key_sequence_key"
  ON "t_activity_data_migration"("run_key", "sequence");
CREATE INDEX "t_activity_data_migration_status_run_key_sequence_idx"
  ON "t_activity_data_migration"("status", "run_key", "sequence");
-- FAILED remains a barrier: retry that user explicitly before another can start.
CREATE UNIQUE INDEX "activity_data_migration_one_active"
  ON "t_activity_data_migration" ((1))
  WHERE "status" IN ('MIGRATING','VERIFYING','FAILED');

CREATE TABLE "t_storage_object_retention" (
  "id" TEXT PRIMARY KEY,
  "migration_id" TEXT NOT NULL REFERENCES "t_activity_data_migration"("id") ON DELETE CASCADE,
  "bucket" TEXT NOT NULL DEFAULT 'default',
  "object_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "t_storage_object_retention_migration_id_bucket_object_key_key"
  ON "t_storage_object_retention"("migration_id", "bucket", "object_key");
CREATE INDEX "t_storage_object_retention_bucket_object_key_released_at_idx"
  ON "t_storage_object_retention"("bucket", "object_key", "released_at");
