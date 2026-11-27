ALTER TABLE "t_coach_action"
  ADD COLUMN "invocation_key" TEXT,
  ADD COLUMN "invocation_attempt_id" TEXT,
  ADD COLUMN "invocation_input_hash" TEXT,
  ADD COLUMN "invocation_payload" JSONB;

ALTER TABLE "t_coach_action"
  ADD CONSTRAINT "t_coach_action_invocation_complete" CHECK (
    ("invocation_key" IS NULL AND "invocation_attempt_id" IS NULL AND "invocation_input_hash" IS NULL AND "invocation_payload" IS NULL)
    OR
    ("invocation_key" IS NOT NULL AND "invocation_attempt_id" IS NOT NULL AND "invocation_input_hash" IS NOT NULL AND "invocation_payload" IS NOT NULL)
  );

CREATE UNIQUE INDEX "t_coach_action_invocation_key_key" ON "t_coach_action" ("invocation_key");
CREATE INDEX "t_coach_action_invocation_attempt_id_idx" ON "t_coach_action" ("invocation_attempt_id");
