ALTER TABLE "t_plan_proposal_preview"
  ADD COLUMN "calendar_adjustment_id" TEXT,
  ADD COLUMN "calendar_version" INTEGER,
  ADD COLUMN "discarded_at" TIMESTAMP(3),
  ADD COLUMN "calendar_receipt" JSONB,
  ADD COLUMN "calendar_sync_claimed_at" TIMESTAMP(3),
  ADD COLUMN "calendar_sync_sent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "plan_calendar_adjustment_version_key"
  ON "t_plan_proposal_preview" ("calendar_adjustment_id", "calendar_version");
CREATE INDEX "plan_calendar_adjustment_owner_idx"
  ON "t_plan_proposal_preview" ("user_id", "source_plan_id", "calendar_adjustment_id", "calendar_version");
CREATE INDEX "plan_calendar_adjustment_pending_sync_idx"
  ON "t_plan_proposal_preview" ("applied_at")
  WHERE "calendar_receipt" IS NOT NULL AND "calendar_sync_sent_at" IS NULL;
