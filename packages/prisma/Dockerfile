ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

FROM ${NODE_IMAGE} AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends binutils \
    && rm -rf /var/lib/apt/lists/* \
    && npm cache clean --force
WORKDIR /app

# Only the pure-JavaScript PostgreSQL driver is a production dependency. Prisma
# CLI, TypeScript and the private legacy lineage stay in the build repository.
COPY packages/prisma/runtime/package.json packages/prisma/runtime/package-lock.json ./runtime/
RUN --mount=type=cache,id=trainingload-selfhost-migrate-npm,target=/root/.npm,sharing=locked \
    npm ci --prefix /app/runtime --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund \
    && node -e "const fs=require('node:fs'),path=require('node:path'); const walk=(root)=>{for(const entry of fs.readdirSync(root,{withFileTypes:true})){const value=path.join(root,entry.name); if(entry.isDirectory())walk(value); else if(entry.isFile()&&entry.name.endsWith('.map'))fs.rmSync(value)}}; walk('/app/runtime/node_modules')" \
    && npm cache clean --force

COPY scripts/selfhost/collect-linux-runtime-rootfs.mjs ./scripts/selfhost/collect-linux-runtime-rootfs.mjs
RUN node scripts/selfhost/collect-linux-runtime-rootfs.mjs \
      /app/runtime-rootfs /app/runtime/node_modules

FROM scratch AS runner

ARG NODE_IMAGE
ARG DEBIAN_IMAGE
ARG RELEASE_VERSION=0.0.0-dev
ARG SOURCE_REVISION=unknown
ARG SOURCE_URL=local://trainingloadai
ARG BUILD_DATE=1970-01-01T00:00:00Z
ARG SELF_HOST_SCHEMA_VERSION=1

LABEL org.opencontainers.image.title="Trainingload Self-host Database Migrator" \
      org.opencontainers.image.description="Run-once Trainingload database migration job" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.base.name="${DEBIAN_IMAGE}" \
      io.trainingload.selfhost.node.source="${NODE_IMAGE}" \
      io.trainingload.selfhost.config-schema="${SELF_HOST_SCHEMA_VERSION}" \
      io.trainingload.selfhost.image-role="migrate"

WORKDIR /app/packages/prisma
ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
ENV PATH=/usr/local/bin

COPY --from=dependencies /app/runtime-rootfs/ /
COPY --from=dependencies --chown=10001:10001 /app/runtime/node_modules ./node_modules
COPY --chown=10001:10001 packages/prisma/core/migrations ./core/migrations
COPY --chown=10001:10001 packages/prisma/core/runner ./core/runner
COPY --chown=10001:10001 packages/prisma/package.json ./package.json

USER 10001:10001
STOPSIGNAL SIGTERM

CMD ["node", "core/runner/core-migration-runner.mjs"]
