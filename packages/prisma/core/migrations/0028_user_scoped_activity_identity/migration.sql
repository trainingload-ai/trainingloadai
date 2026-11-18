-- Add owner-scoped identities without removing the legacy unique indexes.
-- Single-owner Self-host retains both key shapes for supported application rollback.
-- Multi-user Managed deployments perform their contract in a separate release step.
CREATE UNIQUE INDEX "t_third_party_activity_user_id_provider_external_id_key"
  ON "t_third_party_activity" ("user_id", "provider", "external_id");
CREATE UNIQUE INDEX "t_activity_user_provider_activity_key"
  ON "t_activity" ("user_id", "third_party_provider", "third_party_activity_id");

-- Unknown athlete ids never establish exclusive account ownership.
CREATE UNIQUE INDEX "intervals_icu_active_athlete_unique"
  ON "t_external_provider_connection" ("external_athlete_id")
  WHERE "provider" = 'intervals_icu' AND "status" = 'ACTIVE'
    AND "external_athlete_id" IS NOT NULL
    AND btrim("external_athlete_id") NOT IN ('', '0');
