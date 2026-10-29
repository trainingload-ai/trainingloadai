-- Keep owner-managed AI configuration compatible with legacy self-host
-- databases. The first public Core baseline already contains these columns;
-- this migration repairs databases that entered the Core lineage through a
-- legacy bridge before provider-neutral model purposes were introduced.
ALTER TABLE "t_self_host_instance"
  ADD COLUMN IF NOT EXISTS "ai_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_base_url" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_default_model" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_reasoning_model" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_api_key_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_config_updated_at" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 't_self_host_instance'
      AND column_name = 'ai_flash_model'
  ) THEN
    EXECUTE $backfill$
      UPDATE "t_self_host_instance"
      SET "ai_default_model" = COALESCE("ai_default_model", "ai_flash_model")
    $backfill$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 't_self_host_instance'
      AND column_name = 'ai_pro_model'
  ) THEN
    EXECUTE $backfill$
      UPDATE "t_self_host_instance"
      SET "ai_reasoning_model" = COALESCE("ai_reasoning_model", "ai_pro_model")
    $backfill$;
  END IF;
END $$;
