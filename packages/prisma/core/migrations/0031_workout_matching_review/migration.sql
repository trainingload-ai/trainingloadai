-- Preserve legacy AUTO bindings; new inferred links are independently reversible.
ALTER TYPE "enum_plan_workout_activity_link_source" ADD VALUE IF NOT EXISTS 'AUTO_MATCH';
CREATE TABLE "t_plan_activity_match_state" (
  "activity_id" INTEGER PRIMARY KEY REFERENCES "t_activity"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "t_user"("id") ON DELETE CASCADE,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('NO_MATCH','NEEDS_REVIEW','AUTO_LINKED','SUPPRESSED','MANUAL')),
  "reason" TEXT NOT NULL,
  "candidate_workout_ids" TEXT[] NOT NULL DEFAULT '{}',
  "suppressed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "t_plan_activity_match_state_user_id_outcome_updated_at_idx"
  ON "t_plan_activity_match_state"("user_id", "outcome", "updated_at");
