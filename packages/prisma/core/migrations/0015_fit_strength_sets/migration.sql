ALTER TABLE "t_activity_strength_set"
  ADD COLUMN "source_sequence_index" INTEGER,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "rest_after_seconds" INTEGER;
