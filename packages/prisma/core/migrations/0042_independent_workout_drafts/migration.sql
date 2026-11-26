CREATE TABLE "t_independent_workout_draft" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "sid" TEXT NOT NULL,
  "origin_message_id" TEXT NOT NULL,
  "workout" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "workout_id" TEXT,
  "discarded_at" TIMESTAMP(3),
  CONSTRAINT "t_independent_workout_draft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "t_independent_workout_draft_origin_key" UNIQUE ("user_id", "sid", "origin_message_id"),
  CONSTRAINT "t_independent_workout_draft_session_fkey" FOREIGN KEY ("user_id", "sid")
    REFERENCES "t_ai_coach_session" ("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
