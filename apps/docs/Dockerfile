ARG NODE_IMAGE=node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM ${NODE_IMAGE}

ARG NODE_IMAGE
ARG SOURCE_REVISION
ARG RELEASE_VERSION
ARG CONFIG_FINGERPRINT
LABEL org.opencontainers.image.title="Trainingload Docs" \
      org.opencontainers.image.description="Public Trainingload documentation and marketing site" \
      org.opencontainers.image.source="https://github.com/trainingload-ai/trainingloadai" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.base.name="${NODE_IMAGE}" \
      io.trainingload.docs.profile="cloud" \
      io.trainingload.docs.config-fingerprint="${CONFIG_FINGERPRINT}"

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && groupadd --system --gid 10001 trainingload \
    && useradd --system --uid 10001 --gid trainingload --no-create-home \
      --home-dir /nonexistent --shell /usr/sbin/nologin trainingload

# The context contains only the checked, Linux-amd64 Next standalone output.
# Compilation and type checking happen once in the reusable Public docs job.
COPY --chown=10001:10001 app/ /app/
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
USER 10001:10001
WORKDIR /app/apps/docs
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/start-docs.mjs"]
