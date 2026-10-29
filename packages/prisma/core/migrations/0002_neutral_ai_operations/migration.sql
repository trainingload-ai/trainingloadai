-- Expand phase: add provider-neutral AI operations and usage purpose.
DO $$ BEGIN
  CREATE TYPE "enum_ai_model_purpose" AS ENUM ('DEFAULT', 'REASONING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_ai_operation_status" AS ENUM ('STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "t_ai_operation" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "user_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "kind" "enum_ai_usage_kind" NOT NULL,
  "purpose" "enum_ai_model_purpose" NOT NULL DEFAULT 'DEFAULT',
  "actual_purposes" "enum_ai_model_purpose"[] NOT NULL DEFAULT ARRAY[]::"enum_ai_model_purpose"[],
  "status" "enum_ai_operation_status" NOT NULL DEFAULT 'STARTED',
  "result_ref" JSONB,
  "error_code" TEXT,
  "metadata" JSONB,
  CONSTRAINT "t_ai_operation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "t_ai_usage_event"
  ADD COLUMN IF NOT EXISTS "operation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" "enum_ai_model_purpose" NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 't_ai_usage_event'
      AND column_name = 'model_tier'
  ) THEN
    EXECUTE $backfill$
      UPDATE "t_ai_usage_event"
      SET "purpose" = CASE
        WHEN "model_tier"::text = 'PRO' THEN 'REASONING'::"enum_ai_model_purpose"
        ELSE 'DEFAULT'::"enum_ai_model_purpose"
      END
    $backfill$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 't_ai_usage_event'
      AND column_name = 'action_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 't_ai_usage_event'
        AND column_name = 'model_tier'
    ) THEN
      EXECUTE $backfill$
        INSERT INTO "t_ai_operation" (
          "id", "created_at", "updated_at", "completed_at", "heartbeat_at", "expires_at",
          "user_id", "idempotency_key", "kind", "purpose", "actual_purposes", "status"
        )
        SELECT
          "action_id", MIN("created_at"), MAX("created_at"), MAX("created_at"),
          MAX("created_at"), MAX("created_at") + INTERVAL '15 minutes',
          "user_id", "action_id", MIN("kind"::text)::"enum_ai_usage_kind",
          CASE WHEN BOOL_OR("model_tier"::text = 'PRO')
            THEN 'REASONING'::"enum_ai_model_purpose"
            ELSE 'DEFAULT'::"enum_ai_model_purpose" END,
          ARRAY[CASE WHEN BOOL_OR("model_tier"::text = 'PRO')
            THEN 'REASONING'::"enum_ai_model_purpose"
            ELSE 'DEFAULT'::"enum_ai_model_purpose" END]::"enum_ai_model_purpose"[],
          'COMPLETED'::"enum_ai_operation_status"
        FROM "t_ai_usage_event"
        WHERE "action_id" IS NOT NULL AND "user_id" IS NOT NULL
        GROUP BY "action_id", "user_id"
        ON CONFLICT ("id") DO NOTHING
      $backfill$;
    ELSE
      EXECUTE $backfill$
        INSERT INTO "t_ai_operation" (
          "id", "created_at", "updated_at", "completed_at", "heartbeat_at", "expires_at",
          "user_id", "idempotency_key", "kind", "purpose", "actual_purposes", "status"
        )
        SELECT
          "action_id", MIN("created_at"), MAX("created_at"), MAX("created_at"),
          MAX("created_at"), MAX("created_at") + INTERVAL '15 minutes',
          "user_id", "action_id", MIN("kind"::text)::"enum_ai_usage_kind",
          'DEFAULT'::"enum_ai_model_purpose",
          ARRAY['DEFAULT']::"enum_ai_model_purpose"[],
          'COMPLETED'::"enum_ai_operation_status"
        FROM "t_ai_usage_event"
        WHERE "action_id" IS NOT NULL AND "user_id" IS NOT NULL
        GROUP BY "action_id", "user_id"
        ON CONFLICT ("id") DO NOTHING
      $backfill$;
    END IF;

    EXECUTE $backfill$
      UPDATE "t_ai_usage_event" AS usage
      SET "operation_id" = usage."action_id"
      WHERE usage."operation_id" IS NULL
        AND usage."action_id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "t_ai_operation" AS operation
          WHERE operation."id" = usage."action_id"
        )
    $backfill$;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "t_ai_operation_user_id_idempotency_key_key"
  ON "t_ai_operation"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "t_ai_operation_user_id_status_created_at_idx"
  ON "t_ai_operation"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "t_ai_operation_expires_at_status_idx"
  ON "t_ai_operation"("expires_at", "status");
CREATE INDEX IF NOT EXISTS "t_ai_usage_event_operation_id_created_at_idx"
  ON "t_ai_usage_event"("operation_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "t_ai_operation"
    ADD CONSTRAINT "t_ai_operation_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "t_ai_usage_event"
    ADD CONSTRAINT "t_ai_usage_event_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "t_ai_operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
