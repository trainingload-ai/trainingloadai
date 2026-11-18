ALTER TABLE "t_coach_run" ADD COLUMN "fact_scope" JSONB;
CREATE INDEX "t_coach_run_user_id_status_idx" ON "t_coach_run"("user_id", "status");
