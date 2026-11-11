CREATE TABLE "t_activity_analysis_segments" (
    "activity_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "segments" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "t_activity_analysis_segments_pkey" PRIMARY KEY ("activity_id"),
    CONSTRAINT "t_activity_analysis_segments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "t_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
