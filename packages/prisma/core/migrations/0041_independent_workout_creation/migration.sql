CREATE TABLE "t_independent_workout_creation" (
  "user_id" TEXT NOT NULL,
  "key" UUID NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "workout_id" TEXT NOT NULL,
  CONSTRAINT "t_independent_workout_creation_pkey" PRIMARY KEY ("user_id", "key"),
  CONSTRAINT "t_independent_workout_creation_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "t_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
