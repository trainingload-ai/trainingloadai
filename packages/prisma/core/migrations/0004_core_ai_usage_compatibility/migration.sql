-- Repair AI usage tables that entered the Core lineage from the pre-credits
-- self-host schema. The public baseline already contains these columns, so
-- every operation below is idempotent for a fresh Core database.
DO $$ BEGIN
  CREATE TYPE "enum_ai_usage_status" AS ENUM ('SUCCESS', 'FAILED', 'RETRY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "t_ai_usage_event"
  ADD COLUMN IF NOT EXISTS "call_key" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_request_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "enum_ai_usage_status" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS "input_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "output_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "uncached_input_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sid" TEXT,
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

UPDATE "t_ai_usage_event"
SET "call_key" = 'core-legacy:' || "id"
WHERE "call_key" IS NULL OR btrim("call_key") = '';

UPDATE "t_ai_usage_event"
SET "uncached_input_tokens" = GREATEST(
  "input_tokens" - "cached_input_tokens",
  0
);

ALTER TABLE "t_ai_usage_event"
  ALTER COLUMN "call_key" SET NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "t_ai_usage_event_call_key_key"
  ON "t_ai_usage_event"("call_key");
CREATE INDEX IF NOT EXISTS "t_ai_usage_event_user_id_created_at_idx"
  ON "t_ai_usage_event"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "t_ai_usage_event_user_id_kind_created_at_idx"
  ON "t_ai_usage_event"("user_id", "kind", "created_at");
