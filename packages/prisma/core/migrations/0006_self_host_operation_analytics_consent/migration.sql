ALTER TABLE "t_self_host_instance"
ADD COLUMN IF NOT EXISTS "telemetry_consent_granted" BOOLEAN,
ADD COLUMN IF NOT EXISTS "telemetry_consent_version" TEXT,
ADD COLUMN IF NOT EXISTS "telemetry_consent_source" TEXT,
ADD COLUMN IF NOT EXISTS "telemetry_consent_updated_at" TIMESTAMP(3);
