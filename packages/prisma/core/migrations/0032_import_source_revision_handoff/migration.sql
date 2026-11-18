ALTER TABLE "t_import_source_object" ADD COLUMN "import_revision" TEXT, ADD COLUMN "completed_import_revision" TEXT, ADD COLUMN "import_revoked_at" TIMESTAMP(3), ADD COLUMN "import_request" JSONB;
ALTER TABLE "t_import_item_job" ADD COLUMN "source_revision" TEXT;
