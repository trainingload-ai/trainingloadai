-- Allow multiple ExternalProviderConnection rows per provider when they differ
-- by region (e.g. official Garmin international vs China). Other providers keep
-- a single row per user via region = ''.

ALTER TABLE "t_external_provider_connection"
ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "t_external_provider_connection_user_id_provider_key";
ALTER TABLE "t_external_provider_connection"
  DROP CONSTRAINT IF EXISTS "t_external_provider_connection_user_id_provider_key";

CREATE UNIQUE INDEX IF NOT EXISTS "t_external_provider_connection_user_id_provider_region_key"
  ON "t_external_provider_connection"("user_id", "provider", "region");
