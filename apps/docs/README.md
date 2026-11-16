# Trainingload.ai Docs

独立的 Next.js/Fumadocs 站点，包含公开产品文档、定价、法律内容和工具页面。不参与 Self-host Compose 或应用镜像。

在公共仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
```

使用 Node.js 22、pnpm 9。生产站点按需配置 `NEXT_PUBLIC_BASE_URL`（站点 canonical URL）、`NEXT_PUBLIC_API_URL` 或 `DOCS_INTERNAL_API_URL`（工具 API）。
遥测默认不配置；启用时必须自行提供项目 ID。内部设计、Provider 配置和运营文档由私有仓库维护。

## Independent Docs image

The **Publish Docs image** workflow (`.github/workflows/docs-image.yml`) is a
manual publisher for this public site. It does not deploy a server and does not
participate in the three-role Self-host bundle.

After the workflow has been merged, open **Actions → Publish Docs image → Run
workflow**, select `main`, and run it. Publishing is restricted to the canonical
`trainingload-ai/trainingloadai` repository's `main` branch. Pull requests keep
the required `core` and `docs` checks; PR checks cannot push an image or sign a
release.

The publisher calls the same read-only Docs job used by PR checks. It runs the
existing lint, tests, browser checks and type checks, compiles Next once, then
packages that standalone output. The image smoke covers English/Chinese pages,
static JS/CSS, image optimization, Markdown responses and the runtime public API
proxy. The publishing job downloads the **same run's tested image**, checks its
archive checksum, source/configuration labels and image ID, then pushes it
without rebuilding.

The initial platform is **linux/amd64**, built on Linux x64 with Node.js
22.23.3 and pnpm 9.0.0. The pinned Debian Node runtime runs as UID/GID
`10001:10001`, listens on port `3000`, and retains the monorepo standalone
layout. Do not relabel a macOS or Linux-arm64 build as this platform; native
runtime dependencies such as sharp must match the build target.

### Public configuration

The `cloud` profile takes only an explicit allowlist of public repository
Variables. Defaults are defined in `scripts/docs/image-artifact.mjs`:

- `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_ASSET_BASE_URL`, `NEXT_PUBLIC_DEMO_HOST`;
- optional `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`,
  `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN` (tracking IDs are empty by
  default);
- existing advertised offer-copy inputs `NEW_USER_GIFT_ACCESS_DAYS`,
  `NEW_USER_GIFT_BONUS_CREDITS`, `AI_PLAN_PLUS_MONTHLY_CREDITS` and
  `AI_PLAN_PRO_MONTHLY_CREDITS`. These affect display text, not entitlements.

Public origins must use HTTPS without credentials, paths, queries or fragments.
The build configuration has a SHA-256 fingerprint, is embedded in the image and
is applied before starting the standalone server. These values are immutable
for the image, including browser bundles and prerendered HTML; runtime variables
cannot change this public configuration. Rebuild for a different configuration.

`DOCS_INTERNAL_API_URL` remains a separate runtime-only upstream override for
server-to-server tool requests. It accepts an origin such as
`http://backend:3001`; it is not exposed as a browser URL and is not a build
input. No private source, backend credentials or Sentry upload token is used by
the publisher.

### Release coordinates and verification

Images are published to
`ghcr.io/trainingload-ai/trainingloadai/trainingload-docs`. A discoverable tag
includes the full source SHA and a configuration fingerprint prefix. Consumers
must pin the full `repository@sha256:...` reference from the release record.

The workflow signs and verifies the exact image digest using Cosign 3.0.6 and
GitHub OIDC. It also attaches the signed Docs release predicate to that image in
GHCR, independently of the Actions artifact retention period. The run summary
contains the digest and a downloadable `docs-release-<Public SHA>` artifact:

- `docs-release.json`: source SHA, version, Linux platform, pinned Node base,
  public configuration and fingerprint, complete image reference and digest;
- `docs-release.bundle.json`: signature bundle for that exact JSON file;
- verified image-signature and release-attestation results.

Verify against the fixed issuer `https://token.actions.githubusercontent.com`
and identity
`https://github.com/trainingload-ai/trainingloadai/.github/workflows/docs-image.yml@refs/heads/main`.
Consumers must also compare the source commit, profile, configuration fingerprint
and platform with their approved lock. Do not treat a signature from a different
workflow/ref or an arbitrary "latest successful run" as a compatible release.

GHCR creates new packages as private by default, even for a public repository.
After the first manual publish, the package owner must make this package public
for anonymous pulls, or explicitly grant the consuming repository read access.
See [GitHub's registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

This change provides the upstream artifact only. Managed must separately adopt
its full reference and signed record, including compatible rollback handling;
publishing a new Docs image does not update an existing deployment.
