-- A planned workout can be completed without belonging to a training plan.
-- Existing plan-owned links and their foreign keys remain unchanged.
ALTER TABLE "t_plan_workout_activity_link" ALTER COLUMN "plan_id" DROP NOT NULL;
