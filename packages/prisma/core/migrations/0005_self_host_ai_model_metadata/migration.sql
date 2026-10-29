-- Persist the context window selected for each owner-managed model instead of
-- guessing it from a vendor-specific model name at runtime. Web search remains
-- opt-in and is enabled only for an explicitly supported provider adapter.
ALTER TABLE "t_self_host_instance"
  ADD COLUMN IF NOT EXISTS "ai_default_model_context_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "ai_reasoning_model_context_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "ai_web_search_enabled" BOOLEAN NOT NULL DEFAULT false;
