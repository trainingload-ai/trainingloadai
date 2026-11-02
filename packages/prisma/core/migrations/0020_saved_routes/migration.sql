-- CreateEnum
CREATE TYPE "enum_route_delivery_state" AS ENUM ('PENDING', 'ACCEPTED', 'VERIFIED', 'UNKNOWN', 'REJECTED', 'REMOTE_DELETED');

-- CreateTable
CREATE TABLE "t_saved_route" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_id" VARCHAR(36) NOT NULL,
    "creation_checksum" VARCHAR(64) NOT NULL,
    "head_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "t_saved_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_saved_route_version" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "sport_code" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "distance_meters" DOUBLE PRECISION NOT NULL,
    "elevation_gain_meters" DOUBLE PRECISION,
    "elevation_loss_meters" DOUBLE PRECISION,
    "point_count" INTEGER NOT NULL,
    "segment_count" INTEGER NOT NULL,
    "has_complete_elevation" BOOLEAN NOT NULL,
    "raw_storage_key" TEXT NOT NULL,
    "raw_size" INTEGER NOT NULL,
    "raw_checksum" VARCHAR(64) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_saved_route_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_route_external_mapping" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "version_id" TEXT,
    "provider" "enum_third_party_provider" NOT NULL,
    "connection_id" TEXT,
    "account_ref" TEXT NOT NULL,
    "external_id" TEXT,
    "created_by_application" BOOLEAN NOT NULL DEFAULT true,
    "adapter_version" INTEGER NOT NULL DEFAULT 1,
    "state" "enum_route_delivery_state" NOT NULL DEFAULT 'PENDING',
    "last_local_checksum" VARCHAR(64),
    "last_remote_checksum" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_route_external_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "t_saved_route_user_id_deleted_at_updated_at_idx" ON "t_saved_route"("user_id", "deleted_at", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "route_owner_unique" ON "t_saved_route"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_request_unique" ON "t_saved_route"("user_id", "request_id");

-- CreateIndex
CREATE INDEX "t_saved_route_version_user_id_created_at_idx" ON "t_saved_route_version"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "t_saved_route_version_raw_storage_key_idx" ON "t_saved_route_version"("raw_storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "route_revision_unique" ON "t_saved_route_version"("route_id", "user_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "route_version_owner_unique" ON "t_saved_route_version"("id", "route_id", "user_id");

-- CreateIndex
CREATE INDEX "t_route_external_mapping_route_id_user_id_idx" ON "t_route_external_mapping"("route_id", "user_id");

-- CreateIndex
CREATE INDEX "t_route_external_mapping_connection_id_state_idx" ON "t_route_external_mapping"("connection_id", "state");

-- CreateIndex
CREATE INDEX "t_route_external_mapping_version_id_idx" ON "t_route_external_mapping"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_delivery_identity_unique" ON "t_route_external_mapping"("user_id", "provider", "account_ref", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_remote_identity_unique" ON "t_route_external_mapping"("provider", "account_ref", "external_id");

-- AddForeignKey
ALTER TABLE "t_saved_route" ADD CONSTRAINT "t_saved_route_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_saved_route_version" ADD CONSTRAINT "t_saved_route_version_route_id_user_id_fkey" FOREIGN KEY ("route_id", "user_id") REFERENCES "t_saved_route"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_saved_route_version" ADD CONSTRAINT "t_saved_route_version_sport_code_fkey" FOREIGN KEY ("sport_code") REFERENCES "t_sport_definition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_route_external_mapping" ADD CONSTRAINT "t_route_external_mapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_route_external_mapping" ADD CONSTRAINT "t_route_external_mapping_route_id_user_id_fkey" FOREIGN KEY ("route_id", "user_id") REFERENCES "t_saved_route"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_route_external_mapping" ADD CONSTRAINT "t_route_external_mapping_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "t_saved_route_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_route_external_mapping" ADD CONSTRAINT "t_route_external_mapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "t_external_provider_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Current revision must exist when the atomic route/version transaction commits.
ALTER TABLE t_saved_route ADD CONSTRAINT route_head_version_fkey
 FOREIGN KEY (id,user_id,head_revision) REFERENCES t_saved_route_version(route_id,user_id,revision)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE t_route_external_mapping ADD CONSTRAINT route_mapping_version_scope_fkey
 FOREIGN KEY (version_id,route_id,user_id) REFERENCES t_saved_route_version(id,route_id,user_id)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE t_saved_route ADD CONSTRAINT route_revision_positive CHECK(head_revision>0),
 ADD CONSTRAINT route_creation_checksum_valid CHECK(creation_checksum ~ '^[0-9a-f]{64}$');
ALTER TABLE t_saved_route_version ADD CONSTRAINT route_version_valid CHECK (
 revision>0 AND length(name)>0 AND raw_size BETWEEN 1 AND 20971520
 AND point_count BETWEEN 2 AND 100000 AND segment_count BETWEEN 1 AND 32 AND point_count>=segment_count*2
 AND distance_meters>0 AND distance_meters<'Infinity'::float8
 AND has_complete_elevation = (elevation_gain_meters IS NOT NULL AND elevation_loss_meters IS NOT NULL)
 AND ((elevation_gain_meters IS NULL AND elevation_loss_meters IS NULL AND NOT has_complete_elevation)
   OR (has_complete_elevation AND elevation_gain_meters>=0 AND elevation_gain_meters<'Infinity'::float8 AND elevation_loss_meters>=0 AND elevation_loss_meters<'Infinity'::float8))
 AND checksum ~ '^[0-9a-f]{64}$' AND raw_checksum ~ '^[0-9a-f]{64}$'
 AND octet_length(geometry::text)<=12582912
 AND ((geometry->>'type'='MultiLineString' AND jsonb_typeof(geometry->'coordinates')='array'
   AND jsonb_array_length(geometry->'coordinates')=segment_count) IS TRUE));
CREATE FUNCTION reject_saved_route_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'ROUTE_VERSION_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER saved_route_version_immutable BEFORE UPDATE ON t_saved_route_version
 FOR EACH ROW EXECUTE FUNCTION reject_saved_route_version_update();
