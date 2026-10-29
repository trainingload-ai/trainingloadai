ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

FROM ${NODE_IMAGE} AS build-base

# DuckDB and other native dependencies may compile during dependency install.
# These build tools stay out of the final runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.0.0 && npm cache clean --force

WORKDIR /app

# Keep dependency resolution cacheable independently from application source.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY scripts/selfhost/copy-optional-workspace-metadata.mjs ./scripts/selfhost/copy-optional-workspace-metadata.mjs
RUN --mount=type=bind,source=.,target=/context,readonly \
    node scripts/selfhost/copy-optional-workspace-metadata.mjs /context /app
COPY apps/server/package.json ./apps/server/package.json
COPY packages/prisma/package.json ./packages/prisma/package.json

FROM build-base AS builder

ARG SOURCE_DATE_EPOCH=0
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}

RUN --mount=type=cache,id=trainingload-selfhost-server-pnpm,target=/root/.local/share/pnpm/store/v3,sharing=locked \
    pnpm install --filter=@trainingloadai/server... --filter=@trainingloadai/database... --frozen-lockfile

COPY apps/server/ ./apps/server/
COPY packages/prisma/ ./packages/prisma/
COPY packages/shared/ ./packages/shared/
COPY packages/messages/server/ ./packages/messages/server/
COPY scripts/prisma/ ./scripts/prisma/
COPY scripts/selfhost/verify-server-build-boundary.mjs ./scripts/selfhost/verify-server-build-boundary.mjs

RUN node scripts/prisma/build-core-schema.mjs --check && \
    pnpm --dir packages/prisma exec prisma generate --schema core/schema.prisma

RUN pnpm --dir apps/server build:selfhost

COPY scripts/selfhost/collect-linux-runtime-rootfs.mjs ./scripts/selfhost/collect-linux-runtime-rootfs.mjs
COPY scripts/selfhost/prune-server-runtime-deploy.mjs ./scripts/selfhost/prune-server-runtime-deploy.mjs
COPY scripts/selfhost/verify-server-runtime-deploy.mjs ./scripts/selfhost/verify-server-runtime-deploy.mjs

# Materialize a package-local production tree. Disabling automatic peer
# installation prevents Better Auth optional peers (Next, React, test runners)
# from leaking into the API image. Prisma CLI remains in the builder only.
RUN --mount=type=cache,id=trainingload-selfhost-server-pnpm,target=/root/.local/share/pnpm/store/v3,sharing=locked \
    pnpm --config.auto-install-peers=false \
      --filter=@trainingloadai/server deploy --prod /app/deploy/server && \
    node scripts/prisma/copy-generated-client.mjs \
      /app/packages/prisma /app/deploy/server && \
    node scripts/selfhost/prune-server-runtime-deploy.mjs \
      /app/deploy/server && \
    node scripts/selfhost/verify-server-runtime-deploy.mjs \
      /app/deploy/server /app/apps/server/package.json && \
    RUNTIME_DATA_DIRS=/data/uploads:/data/cache/storage:/data/elevation:/data/operations \
      node scripts/selfhost/collect-linux-runtime-rootfs.mjs \
        /app/runtime-rootfs /app/deploy/server/node_modules

FROM scratch AS runner

ARG NODE_IMAGE
ARG DEBIAN_IMAGE
ARG RELEASE_VERSION=0.0.0-dev
ARG SOURCE_REVISION=unknown
ARG SOURCE_URL=local://trainingloadai
ARG BUILD_DATE=1970-01-01T00:00:00Z
ARG SELF_HOST_SCHEMA_VERSION=1

LABEL org.opencontainers.image.title="Trainingload Self-host Server" \
      org.opencontainers.image.description="Trainingload self-host API and workers" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.base.name="${DEBIAN_IMAGE}" \
      io.trainingload.selfhost.node.source="${NODE_IMAGE}" \
      io.trainingload.selfhost.config-schema="${SELF_HOST_SCHEMA_VERSION}" \
      io.trainingload.selfhost.image-role="server"

WORKDIR /app/apps/server

ENV NODE_ENV=production
ENV APP_VERSION=${RELEASE_VERSION}
ENV PRISMA_CLIENT_ENGINE_TYPE=library
ENV PATH=/usr/local/bin

COPY --from=builder /app/runtime-rootfs/ /

COPY --from=builder --chown=10001:10001 /app/deploy/server/node_modules ./node_modules
COPY --from=builder --chown=10001:10001 /app/apps/server/dist-selfhost ./dist
COPY --from=builder --chown=10001:10001 /app/deploy/server/package.json ./package.json
COPY --from=builder --chown=10001:10001 /app/packages/messages/server /app/packages/messages/server

EXPOSE 3001

USER 10001:10001
STOPSIGNAL SIGTERM

CMD ["node", "dist/apps/server/src/main.self-host"]
