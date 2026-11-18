-- Saved-draft start previews use the existing immutable proposal ledger.
ALTER TYPE "enum_plan_proposal_mode" ADD VALUE 'START';
ALTER TABLE "t_ai_coach_session"
  ADD COLUMN "plan_start_plan_id" TEXT,
  ADD COLUMN "plan_start_date" TEXT,
  ADD COLUMN "plan_start_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plan_start_branch_id" TEXT;
CREATE UNIQUE INDEX "t_ai_coach_session_user_id_plan_start_plan_id_key"
  ON "t_ai_coach_session"("user_id", "plan_start_plan_id");
