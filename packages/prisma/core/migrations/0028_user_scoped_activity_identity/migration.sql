-- Expand before deploying user-scoped readers and writers. Existing global indexes
-- intentionally remain until every old service and worker has exited.
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

-- Run only after all services and workers use user-scoped identities.
-- Once different users own the same external identity, pre-cutover binaries
-- cannot be used for rollback. No historical data is transferred or deleted.
DROP INDEX "t_third_party_activity_provider_external_id_key";
DROP INDEX "t_activity_third_party_provider_third_party_activity_id_key";
