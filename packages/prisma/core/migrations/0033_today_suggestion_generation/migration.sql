CREATE TABLE "t_today_suggestion_generation" (
  "user_id" TEXT PRIMARY KEY REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "context_token" TEXT NOT NULL,
  "token" TEXT,
  "fence" INTEGER NOT NULL DEFAULT 0,
  "locale" TEXT,
  "date" TEXT,
  "input_hash" TEXT,
  "lease_expires_at" TIMESTAMPTZ(3),
  "retry_after" TIMESTAMPTZ(3),
  "failures" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "t_today_suggestion_generation_context_token_key" ON "t_today_suggestion_generation"("context_token");
