CREATE TYPE "enum_health_daily_fact_status" AS ENUM ('AVAILABLE', 'WITHDRAWN');

ALTER TABLE "t_user_daily_health_metric"
  ADD COLUMN "semantic_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "semantic_hash" VARCHAR(64),
  ADD CONSTRAINT "t_user_daily_health_metric_semantic_revision_check" CHECK (
    ("semantic_version" = 0 AND "semantic_hash" IS NULL) OR
    ("semantic_version" > 0 AND "semantic_hash" IS NOT NULL)
  );

CREATE TABLE "t_health_daily_fact_revision" (
  "daily_metric_id" TEXT NOT NULL REFERENCES "t_user_daily_health_metric"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" "enum_health_daily_fact_status" NOT NULL,
  "semantic_hash" VARCHAR(64) NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "value" DOUBLE PRECISION,
  "unit" TEXT,
  "timezone" TEXT,
  "selected_provider" "enum_health_data_provider",
  "evidence" JSONB,
  CONSTRAINT "t_health_daily_fact_revision_pkey" PRIMARY KEY ("daily_metric_id", "version"),
  CONSTRAINT "t_health_daily_fact_revision_status_check" CHECK (
    ("status" = 'AVAILABLE' AND "value" IS NOT NULL AND "selected_provider" IS NOT NULL AND "evidence" IS NOT NULL) OR
    ("status" = 'WITHDRAWN' AND "value" IS NULL AND "selected_provider" IS NULL AND "evidence" IS NULL)
  )
);
