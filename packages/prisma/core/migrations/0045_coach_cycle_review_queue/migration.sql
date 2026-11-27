CREATE TABLE "t_coach_cycle_review_job" (
  "context_id" TEXT NOT NULL,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "claim_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  CONSTRAINT "t_coach_cycle_review_job_pkey" PRIMARY KEY ("context_id"),
  CONSTRAINT "t_coach_cycle_review_job_context_id_fkey"
    FOREIGN KEY ("context_id") REFERENCES "t_coach_context" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "t_coach_cycle_review_job_completed_at_available_at_idx"
  ON "t_coach_cycle_review_job" ("completed_at", "available_at");
