ALTER TYPE "enum_setting_category" ADD VALUE IF NOT EXISTS 'ATHLETE_STATE_AUTO_ENABLED';
CREATE TABLE "t_athlete_state_update" (
  "user_id" TEXT PRIMARY KEY REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RUNNING','RETRY_WAIT','DONE','SKIPPED','DEAD')),
  "requested_version" INTEGER NOT NULL DEFAULT 0,
  "running_version" INTEGER NOT NULL DEFAULT 0,
  "completed_version" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3),
  "next_available_at" TIMESTAMPTZ(3),
  "pending_triggers" JSONB NOT NULL DEFAULT '[]',
  "running_triggers" JSONB NOT NULL DEFAULT '[]',
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMPTZ(3),
  "heartbeat_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("completed_version" <= "running_version" AND "running_version" <= "requested_version"),
  CHECK (("status" = 'RUNNING') = ("lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL))
);
CREATE INDEX "t_athlete_state_update_due_idx" ON "t_athlete_state_update" ("status", "available_at");
CREATE INDEX "t_athlete_state_update_lease_idx" ON "t_athlete_state_update" ("status", "lease_expires_at");
