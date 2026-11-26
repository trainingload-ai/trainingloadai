CREATE TABLE "t_coach_plan_validation_rejection" (
    "attempt_id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "t_coach_plan_validation_rejection_pkey" PRIMARY KEY ("attempt_id", "tool_call_id"),
    CONSTRAINT "t_coach_plan_validation_rejection_attempt_id_fkey"
        FOREIGN KEY ("attempt_id") REFERENCES "t_coach_run_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
