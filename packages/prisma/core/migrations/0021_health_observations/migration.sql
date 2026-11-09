-- CreateEnum
CREATE TYPE "enum_health_observation_kind" AS ENUM ('BLOOD_PRESSURE', 'BREATHING_VARIATION');

-- CreateEnum
CREATE TYPE "enum_health_observation_scope" AS ENUM ('MEASUREMENT', 'DAILY', 'INTERVAL');

-- CreateEnum
CREATE TYPE "enum_health_measurement_origin" AS ENUM ('DEVICE', 'MANUAL', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "enum_health_metric_type" ADD VALUE 'DIETARY_ENERGY_KCAL';
ALTER TYPE "enum_health_metric_type" ADD VALUE 'DIETARY_CARBOHYDRATE_G';
ALTER TYPE "enum_health_metric_type" ADD VALUE 'DIETARY_FAT_G';
ALTER TYPE "enum_health_metric_type" ADD VALUE 'DIETARY_PROTEIN_G';
ALTER TYPE "enum_health_metric_type" ADD VALUE 'HYDRATION_ML';
ALTER TYPE "enum_health_metric_type" ADD VALUE 'SKIN_TEMPERATURE_DELTA_C';

-- CreateTable
CREATE TABLE "t_external_health_observation" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "enum_health_data_provider" NOT NULL,
    "source_namespace" VARCHAR(192) NOT NULL,
    "source_group_key" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(512) NOT NULL,
    "connection_id" TEXT,
    "source_object_id" TEXT,
    "snapshot_id" TEXT,
    "kind" "enum_health_observation_kind" NOT NULL,
    "scope" "enum_health_observation_scope" NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" TEXT,
    "offset_seconds" INTEGER,
    "measured_at" TIMESTAMP(3),
    "interval_start" TIMESTAMP(3),
    "interval_end" TIMESTAMP(3),
    "systolic_mmhg" DOUBLE PRECISION,
    "diastolic_mmhg" DOUBLE PRECISION,
    "pulse_bpm" DOUBLE PRECISION,
    "measurement_origin" "enum_health_measurement_origin",
    "category_system" VARCHAR(192),
    "category_code" VARCHAR(64),
    "source_name" VARCHAR(200),
    "source_priority" INTEGER,
    "source_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "t_external_health_observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "t_external_health_observation_user_id_source_group_key_idx" ON "t_external_health_observation"("user_id", "source_group_key");

-- CreateIndex
CREATE INDEX "t_external_health_observation_user_id_kind_local_date_idx" ON "t_external_health_observation"("user_id", "kind", "local_date");

-- CreateIndex
CREATE INDEX "t_external_health_observation_user_id_source_namespace_loca_idx" ON "t_external_health_observation"("user_id", "source_namespace", "local_date");

-- CreateIndex
CREATE INDEX "t_external_health_observation_provider_connection_id_idx" ON "t_external_health_observation"("provider", "connection_id");

-- CreateIndex
CREATE INDEX "t_external_health_observation_source_object_id_idx" ON "t_external_health_observation"("source_object_id");

-- CreateIndex
CREATE INDEX "t_external_health_observation_snapshot_id_idx" ON "t_external_health_observation"("snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_observation_identity_unique" ON "t_external_health_observation"("user_id", "provider", "source_namespace", "kind", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_owner_identity_unique" ON "t_import_source_object"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_snapshot_owner_identity_unique" ON "t_canonical_health_snapshot"("id", "user_id");

-- AddForeignKey
ALTER TABLE "t_external_health_observation" ADD CONSTRAINT "t_external_health_observation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_observation" ADD CONSTRAINT "t_external_health_observation_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "t_import_source_object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_external_health_observation" ADD CONSTRAINT "t_external_health_observation_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "t_canonical_health_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve nullable source references while fencing their user scope at commit.
ALTER TABLE t_external_health_observation ADD CONSTRAINT health_observation_source_owner_fkey
 FOREIGN KEY (source_object_id,user_id) REFERENCES t_import_source_object(id,user_id)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE t_external_health_observation ADD CONSTRAINT health_observation_snapshot_owner_fkey
 FOREIGN KEY (snapshot_id,user_id) REFERENCES t_canonical_health_snapshot(id,user_id)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE t_external_health_observation ADD CONSTRAINT health_observation_common_valid CHECK (
 source_group_key ~ '^[a-f0-9]{64}$' AND length(source_namespace)>0 AND length(external_id)>0 AND isfinite(local_date) AND isfinite(source_updated_at)
 AND (offset_seconds IS NULL OR offset_seconds BETWEEN -86400 AND 86400));
ALTER TABLE t_external_health_observation ADD CONSTRAINT health_observation_shape_valid CHECK ((
 (kind='BLOOD_PRESSURE' AND scope='MEASUREMENT'
  AND measured_at IS NOT NULL AND isfinite(measured_at)
  AND interval_start IS NULL AND interval_end IS NULL
  AND systolic_mmhg IS NOT NULL AND systolic_mmhg>0 AND systolic_mmhg<1000
  AND diastolic_mmhg IS NOT NULL AND diastolic_mmhg>0 AND diastolic_mmhg<1000
  AND (pulse_bpm IS NULL OR (pulse_bpm>=0 AND pulse_bpm<=300))
  AND measurement_origin IS NOT NULL AND category_system IS NULL AND category_code IS NULL)
 OR
 (kind='BREATHING_VARIATION' AND measured_at IS NULL
  AND systolic_mmhg IS NULL AND diastolic_mmhg IS NULL AND pulse_bpm IS NULL AND measurement_origin IS NULL
  AND category_system IS NOT NULL AND length(category_system)>0
  AND category_code IS NOT NULL AND category_code ~ '^[A-Z0-9_:-]{1,64}$'
  AND ((scope='DAILY' AND interval_start IS NULL AND interval_end IS NULL)
   OR (scope='INTERVAL' AND interval_start IS NOT NULL AND interval_end IS NOT NULL
    AND isfinite(interval_start) AND isfinite(interval_end) AND interval_end>interval_start)))
) IS TRUE);
