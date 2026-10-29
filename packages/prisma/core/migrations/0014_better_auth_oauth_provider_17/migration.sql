-- DropForeignKey
ALTER TABLE "t_oauth_access_token" DROP CONSTRAINT "t_oauth_access_token_refresh_id_fkey";

-- Better Auth 1.7 references refresh-token row ids rather than token values.
-- The previous foreign key guarantees that every non-null value can be
-- translated before the replacement constraint is installed.
UPDATE "t_oauth_access_token" AS "access"
SET "refresh_id" = "refresh"."id"
FROM "t_oauth_refresh_token" AS "refresh"
WHERE "access"."refresh_id" = "refresh"."token";

-- AlterTable
ALTER TABLE "t_oauth_client" ADD COLUMN     "application_type" TEXT,
ADD COLUMN     "backchannel_logout_session_required" BOOLEAN,
ADD COLUMN     "backchannel_logout_uri" TEXT,
ADD COLUMN     "client_credentials_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "client_discovery_id" TEXT,
ADD COLUMN     "dpop_bound_access_tokens" BOOLEAN DEFAULT false,
ADD COLUMN     "jwks" TEXT,
ADD COLUMN     "jwks_uri" TEXT;

-- AlterTable
ALTER TABLE "t_oauth_refresh_token" ADD COLUMN     "authorization_code_id" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requested_user_info_claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rotated_at" TIMESTAMP(3),
ADD COLUMN     "rotation_replay_expires_at" TIMESTAMP(3),
ADD COLUMN     "rotation_replay_response" TEXT;

-- AlterTable
ALTER TABLE "t_oauth_access_token" ADD COLUMN     "authorization_code_id" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requested_user_info_claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "revoked" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "t_oauth_consent" ADD COLUMN     "requested_user_info_claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "resources" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "t_oauth_resource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_token_ttl" INTEGER,
    "refresh_token_ttl" INTEGER,
    "signing_algorithm" TEXT,
    "signing_key_id" TEXT,
    "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom_claims" JSONB,
    "dpop_bound_access_tokens_required" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "policy_version" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "t_oauth_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_client_resource" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_oauth_client_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_oauth_client_assertion" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_oauth_client_assertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "t_oauth_resource_identifier_key" ON "t_oauth_resource"("identifier");

-- CreateIndex
CREATE INDEX "t_oauth_client_resource_client_id_idx" ON "t_oauth_client_resource"("client_id");

-- CreateIndex
CREATE INDEX "t_oauth_client_resource_resource_id_idx" ON "t_oauth_client_resource"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_oauth_client_resource_client_id_resource_id_key" ON "t_oauth_client_resource"("client_id", "resource_id");

-- CreateIndex
CREATE INDEX "t_oauth_refresh_token_authorization_code_id_idx" ON "t_oauth_refresh_token"("authorization_code_id");

-- CreateIndex
CREATE INDEX "t_oauth_access_token_authorization_code_id_idx" ON "t_oauth_access_token"("authorization_code_id");

-- AddForeignKey
ALTER TABLE "t_oauth_access_token" ADD CONSTRAINT "t_oauth_access_token_refresh_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "t_oauth_refresh_token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_client_resource" ADD CONSTRAINT "t_oauth_client_resource_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "t_oauth_client"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_oauth_client_resource" ADD CONSTRAINT "t_oauth_client_resource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "t_oauth_resource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;
