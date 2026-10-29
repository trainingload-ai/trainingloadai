ALTER TYPE "enum_coach_action_type" ADD VALUE IF NOT EXISTS 'INDEPENDENT_WORKOUT_CREATE';
ALTER TYPE "enum_notification_kind" ADD VALUE IF NOT EXISTS 'TRAINING_REMINDER';

ALTER TABLE "t_ai_today_suggestion"
  ADD COLUMN "constraint_hash" TEXT,
  ADD COLUMN "continuity_hash" TEXT,
  ADD COLUMN "result_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "structured_result" JSONB,
  ADD COLUMN "generation_token" TEXT,
  ADD COLUMN "valid_until" TIMESTAMPTZ(3),
  ADD COLUMN "run_id" TEXT;

UPDATE "t_ai_today_suggestion"
SET "generation_token" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "generation_token" IS NULL;

ALTER TABLE "t_ai_today_suggestion"
  ALTER COLUMN "generation_token" SET NOT NULL;

CREATE UNIQUE INDEX "t_ai_today_suggestion_generation_token_key"
  ON "t_ai_today_suggestion"("generation_token");
CREATE INDEX "t_ai_today_suggestion_run_id_idx"
  ON "t_ai_today_suggestion"("run_id");

CREATE TABLE "t_today_suggestion_engagement_state" (
  "user_id" TEXT NOT NULL,
  "generation_token" TEXT,
  "continuity_hash" TEXT,
  "suggestion_date" TEXT,
  "first_presented_at" TIMESTAMPTZ(3),
  "last_presented_at" TIMESTAMPTZ(3),
  "resolved_at" TIMESTAMPTZ(3),
  "resolution" TEXT,
  "selected_intent" TEXT,
  "unresolved_streak" INTEGER NOT NULL DEFAULT 0,
  "quiet_until" TIMESTAMPTZ(3),
  "workout_id" TEXT,
  "workout_action_id" TEXT,
  "reminder_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "t_today_suggestion_engagement_state_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "t_today_suggestion_engagement_state_generation_token_idx"
  ON "t_today_suggestion_engagement_state"("generation_token");
CREATE INDEX "t_today_suggestion_engagement_state_quiet_until_idx"
  ON "t_today_suggestion_engagement_state"("quiet_until");
CREATE INDEX "t_today_suggestion_engagement_state_workout_id_idx"
  ON "t_today_suggestion_engagement_state"("workout_id");
CREATE INDEX "t_today_suggestion_engagement_state_workout_action_id_idx"
  ON "t_today_suggestion_engagement_state"("workout_action_id");
CREATE INDEX "t_today_suggestion_engagement_state_reminder_id_idx"
  ON "t_today_suggestion_engagement_state"("reminder_id");
ALTER TABLE "t_today_suggestion_engagement_state"
  ADD CONSTRAINT "t_today_suggestion_engagement_state_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "t_notification"
  ADD COLUMN "visible_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);

UPDATE "t_notification"
SET "visible_at" = "created_at" AT TIME ZONE 'UTC'
WHERE "visible_at" IS NULL;

ALTER TABLE "t_notification"
  ALTER COLUMN "visible_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "visible_at" SET NOT NULL;

CREATE INDEX "t_notification_user_id_visible_at_created_at_idx"
  ON "t_notification"("user_id", "visible_at", "created_at" DESC);
CREATE INDEX "t_notification_kind_visible_at_cancelled_at_idx"
  ON "t_notification"("kind", "visible_at", "cancelled_at");
