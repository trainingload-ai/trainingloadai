CREATE TABLE "t_vdot_forecast_snapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fingerprint" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE UNIQUE INDEX "t_vdot_forecast_snapshot_user_id_fingerprint_key"
  ON "t_vdot_forecast_snapshot"("user_id", "fingerprint");
CREATE INDEX "t_vdot_forecast_snapshot_user_id_created_at_idx"
  ON "t_vdot_forecast_snapshot"("user_id", "created_at");
