-- CreateEnum
CREATE TYPE "enum_plan_planning_mode" AS ENUM ('FIXED', 'ROLLING');

-- AlterTable
ALTER TABLE "t_plan" ADD COLUMN     "generated_through" DATE,
ADD COLUMN     "planning_mode" "enum_plan_planning_mode" NOT NULL DEFAULT 'FIXED',
ALTER COLUMN "period_weeks" DROP NOT NULL;

-- AlterTable
ALTER TABLE "t_plan_workout" ADD COLUMN     "automation_protected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "generation_id" TEXT;

-- CreateTable
CREATE TABLE "t_plan_automation_policy" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "confirmed_decision_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_plan_automation_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_rolling_month_strategy" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "month_start" DATE NOT NULL,
    "month_end" DATE NOT NULL,
    "effective_from" DATE NOT NULL,
    "revision" INTEGER NOT NULL,
    "strategy" JSONB NOT NULL,
    "evidence_revision" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_rolling_month_strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_rolling_week_generation" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "generated_from" DATE NOT NULL,
    "generated_through" DATE NOT NULL,
    "revision" INTEGER NOT NULL,
    "evidence_revision" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    "applied_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_rolling_week_generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_rolling_week_month_strategy" (
    "generation_id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,

    CONSTRAINT "t_rolling_week_month_strategy_pkey" PRIMARY KEY ("generation_id","strategy_id")
);

-- CreateTable
CREATE TABLE "t_rolling_plan_job" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "window_start" DATE NOT NULL,
    "input_revision" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "preview_id" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claim_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "last_error" TEXT,
    "receipt" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_rolling_plan_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "t_plan_automation_policy_user_id_revoked_at_idx" ON "t_plan_automation_policy"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_plan_automation_policy_plan_id_revision_key" ON "t_plan_automation_policy"("plan_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "t_rolling_month_strategy_plan_id_month_start_revision_key" ON "t_rolling_month_strategy"("plan_id", "month_start", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "t_rolling_week_generation_plan_id_week_start_revision_key" ON "t_rolling_week_generation"("plan_id", "week_start", "revision");

-- CreateIndex
CREATE INDEX "t_rolling_plan_job_state_available_at_lease_until_idx" ON "t_rolling_plan_job"("state", "available_at", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "t_rolling_plan_job_plan_id_kind_window_start_policy_id_inpu_key" ON "t_rolling_plan_job"("plan_id", "kind", "window_start", "policy_id", "input_revision");

-- AddForeignKey
ALTER TABLE "t_plan_workout" ADD CONSTRAINT "t_plan_workout_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "t_rolling_week_generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_plan_automation_policy" ADD CONSTRAINT "t_plan_automation_policy_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_month_strategy" ADD CONSTRAINT "t_rolling_month_strategy_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_month_strategy" ADD CONSTRAINT "t_rolling_month_strategy_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "t_plan_automation_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_week_generation" ADD CONSTRAINT "t_rolling_week_generation_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_week_generation" ADD CONSTRAINT "t_rolling_week_generation_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "t_plan_automation_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_week_month_strategy" ADD CONSTRAINT "t_rolling_week_month_strategy_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "t_rolling_week_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_week_month_strategy" ADD CONSTRAINT "t_rolling_week_month_strategy_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "t_rolling_month_strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_plan_job" ADD CONSTRAINT "t_rolling_plan_job_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "t_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_rolling_plan_job" ADD CONSTRAINT "t_rolling_plan_job_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "t_plan_automation_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Active versions are unique independently of revision history.
CREATE UNIQUE INDEX t_plan_automation_policy_effective ON t_plan_automation_policy(plan_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX t_rolling_month_strategy_effective ON t_rolling_month_strategy(plan_id,month_start) WHERE applied_at IS NOT NULL AND superseded_at IS NULL;
CREATE UNIQUE INDEX t_rolling_week_generation_effective ON t_rolling_week_generation(plan_id,week_start) WHERE applied_at IS NOT NULL AND superseded_at IS NULL;
ALTER TABLE t_plan ADD CONSTRAINT t_plan_mode_period CHECK ((planning_mode='FIXED' AND period_weeks IS NOT NULL AND period_weeks BETWEEN 1 AND 520) OR (planning_mode='ROLLING' AND period_weeks IS NULL AND end_date IS NULL));
ALTER TABLE t_rolling_week_generation ADD CONSTRAINT t_rolling_week_window CHECK (extract(isodow FROM week_start)=1 AND week_end=week_start+6 AND generated_from>=week_start AND generated_through<=week_end AND generated_from<=generated_through);
ALTER TABLE t_rolling_month_strategy ADD CONSTRAINT t_rolling_month_window CHECK (extract(day FROM month_start)=1 AND month_end=(month_start+interval '1 month -1 day')::date AND effective_from BETWEEN month_start AND month_end);
