-- Persist server-owned Coach tasks in the same run/attempt timeline as chat,
-- while keeping them out of user-visible conversation lists.
ALTER TYPE "enum_ai_coach_session_type" ADD VALUE IF NOT EXISTS 'BACKGROUND';

ALTER TABLE "t_coach_run"
  RENAME COLUMN "origin_user_message_id" TO "origin_message_id";

ALTER TABLE "t_coach_run"
  ADD COLUMN "task_kind" TEXT NOT NULL DEFAULT 'CONVERSATION',
  ADD COLUMN "trigger_type" TEXT,
  ADD COLUMN "trigger_ref" TEXT,
  ADD COLUMN "dedupe_key" TEXT,
  ADD COLUMN "input_hash" TEXT,
  ADD COLUMN "result_type" TEXT,
  ADD COLUMN "result_ref" JSONB;

CREATE INDEX "t_ai_coach_session_user_id_type_updated_at_idx"
  ON "t_ai_coach_session"("user_id", "type", "updated_at" DESC);

CREATE UNIQUE INDEX "t_coach_run_user_id_task_kind_dedupe_key_key"
  ON "t_coach_run"("user_id", "task_kind", "dedupe_key");

CREATE INDEX "t_coach_run_user_id_task_kind_started_at_idx"
  ON "t_coach_run"("user_id", "task_kind", "started_at" DESC);
