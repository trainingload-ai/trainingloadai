ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

FROM ${NODE_IMAGE} AS base

# Install the pnpm version that matches packageManager in package.json
RUN apt-get update && apt-get install -y --no-install-recommends binutils \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@9.0.0 \
    && npm cache clean --force

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy workspace configuration files. Private monorepo install metadata is
# available to internal builds, while an extracted public candidate has none.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY scripts/selfhost/copy-optional-workspace-metadata.mjs ./scripts/selfhost/copy-optional-workspace-metadata.mjs
RUN --mount=type=bind,source=.,target=/context,readonly \
    node scripts/selfhost/copy-optional-workspace-metadata.mjs /context /app

COPY apps/client/package.json ./apps/client/package.json
COPY packages/design-tokens/package.json ./packages/design-tokens/package.json
RUN --mount=type=cache,id=trainingload-selfhost-client-pnpm,target=/root/.local/share/pnpm/store/v3,sharing=locked \
    pnpm install --frozen-lockfile --filter ./apps/client

# Rebuild the source code only when needed
FROM base AS builder
ARG SOURCE_DATE_EPOCH=0
ARG TARGETARCH
WORKDIR /app
COPY --from=deps /app /app
COPY apps/client/ ./apps/client/
COPY packages/shared/ ./packages/shared/
COPY packages/design-tokens/ ./packages/design-tokens/
COPY packages/messages/package.json ./packages/messages/package.json
COPY packages/messages/catalog.mjs packages/messages/catalog.d.mts ./packages/messages/
COPY packages/messages/client-core/ ./packages/messages/client-core/

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
ENV SELF_HOST_RUNTIME_PLATFORM=linux
ENV SELF_HOST_RUNTIME_ARCH=${TARGETARCH}
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_MARKETING_BASE_URL
ARG NEXT_PUBLIC_AUTH_UI_ENABLED
ARG AI_TODAY_WEATHER_ENABLED
ARG SELF_HOST_MODE_MARKER
ARG SELF_HOST_TELEMETRY_ENABLED
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_DOCS_URL}
ENV NEXT_PUBLIC_MARKETING_BASE_URL=${NEXT_PUBLIC_MARKETING_BASE_URL}
ENV NEXT_PUBLIC_AUTH_UI_ENABLED=${NEXT_PUBLIC_AUTH_UI_ENABLED}
ENV AI_TODAY_WEATHER_ENABLED=${AI_TODAY_WEATHER_ENABLED}
ENV NEXT_PUBLIC_SELF_HOST_MODE=${SELF_HOST_MODE_MARKER}
ENV NEXT_PUBLIC_TELEMETRY_ENABLED=${SELF_HOST_TELEMETRY_ENABLED}


ENV NODE_ENV=production
# Bound both worker fan-out and the V8 heap. Use Next directly here because the
# local client build script intentionally clears NODE_OPTIONS.
ARG NEXT_BUILD_CPUS=1
ARG NEXT_BUILD_MAX_OLD_SPACE_MB=2048
ENV NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS}
ENV NODE_OPTIONS="--max-old-space-size=${NEXT_BUILD_MAX_OLD_SPACE_MB}"
RUN pnpm --dir ./packages/design-tokens generate
RUN pnpm --dir ./apps/client build:selfhost

COPY scripts/selfhost/collect-linux-runtime-rootfs.mjs ./scripts/selfhost/collect-linux-runtime-rootfs.mjs
RUN node scripts/selfhost/collect-linux-runtime-rootfs.mjs \
      /app/runtime-rootfs /app/apps/client/.next/standalone

# Production image, copy all the files and run next
FROM scratch AS runner

ARG NODE_IMAGE
ARG DEBIAN_IMAGE
ARG RELEASE_VERSION=0.0.0-dev
ARG SOURCE_REVISION=unknown
ARG SOURCE_URL=local://trainingloadai
ARG BUILD_DATE=1970-01-01T00:00:00Z
ARG SELF_HOST_SCHEMA_VERSION=1

LABEL org.opencontainers.image.title="Trainingload Client" \
      org.opencontainers.image.description="Trainingload self-host web application" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.base.name="${DEBIAN_IMAGE}" \
      io.trainingload.selfhost.node.source="${NODE_IMAGE}" \
      io.trainingload.selfhost.config-schema="${SELF_HOST_SCHEMA_VERSION}" \
      io.trainingload.selfhost.image-role="client"

WORKDIR /app

COPY --from=builder /app/runtime-rootfs/ /

# Next.js standalone 已按运行时文件追踪裁剪生产依赖。public 与 static
# 不会自动进入 standalone，需要显式复制到 monorepo 应用目录。
COPY --from=builder --chown=10001:10001 /app/apps/client/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=builder --chown=10001:10001 /app/apps/client/.next/selfhost-public ./apps/client/public

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

ENV PATH=/usr/local/bin

USER 10001:10001
WORKDIR /app/apps/client
EXPOSE 3002
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
