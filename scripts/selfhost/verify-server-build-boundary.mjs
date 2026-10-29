import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputRoot = resolve(repositoryRoot, "apps/server/dist-selfhost");
const entrypoint = resolve(outputRoot, "apps/server/src/main.self-host.js");
const forbiddenSourceRoot = resolve(outputRoot, "apps/server/src/managed");
const forbiddenModuleMarkers = [
  "@better-auth/expo",
  "@better-auth/oauth-provider",
  "@langfuse/otel",
  "@modelcontextprotocol/node",
  "@modelcontextprotocol/server",
  "@creem_io/better-auth",
  "@waffo/pancake-ts",
  "CloudBillingModule",
  "ManagedAppModule",
  "ai.trainingload.mobile.plus.monthly",
  "APPLE_IAP_ENABLED",
  "REVENUECAT_SECRET_API_KEY",
  "WAFFO_PRODUCT_PLUS_MONTHLY",
  "CREDITS_5000",
  "MembershipGiftService",
  "NewUserGiftService",
  "exports.OperationsController",
  "WatchDashboardController",
  "AiCreditsService",
  "BillingEntitlementResolver",
  "MembershipAccessService",
  "CREDIT_PACK",
  "MEMBERSHIP_GIFT",
  "NEW_USER_GIFT",
  "@aws-sdk/",
];

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (path.endsWith(".js")) files.push(path);
  }
  return files;
}

const problems = [];
if (!existsSync(entrypoint)) {
  problems.push(
    "missing Self-host entrypoint: apps/server/src/main.self-host.js",
  );
}
if (existsSync(forbiddenSourceRoot)) {
  problems.push("Self-host output contains the Managed source tree");
}

if (existsSync(outputRoot)) {
  for (const file of walk(outputRoot)) {
    const source = readFileSync(file, "utf8");
    if (/(?:require\(|from\s+)[^\n]*["'][^"']+\.ts["']/.test(source)) {
      problems.push(
        `${relative(outputRoot, file)} contains a runtime import of a TypeScript source file`,
      );
    }
    if (
      source.includes("require('@duckdb/node-api')") &&
      relative(outputRoot, file) !==
        "apps/server/src/runtime/duckdb-runtime.js"
    ) {
      problems.push(
        `${relative(outputRoot, file)} eagerly loads the native DuckDB runtime`,
      );
    }
    if (
      source.includes("require('sharp')") &&
      relative(outputRoot, file) !== "apps/server/src/runtime/sharp-runtime.js"
    ) {
      problems.push(
        `${relative(outputRoot, file)} eagerly loads the native Sharp runtime`,
      );
    }
    for (const marker of forbiddenModuleMarkers) {
      if (source.includes(marker)) {
        problems.push(
          `${relative(outputRoot, file)} contains Managed marker ${marker}`,
        );
      }
    }
  }
}

const selfHostDockerfile = readFileSync(
  resolve(repositoryRoot, "apps/server/Dockerfile"),
  "utf8",
);
const serverPackage = readFileSync(
  resolve(repositoryRoot, "apps/server/package.json"),
  "utf8",
);
const managedDependencyPackagePath = resolve(
  repositoryRoot,
  "packages/managed-server/package.json",
);
const managedDependencyPackage = existsSync(managedDependencyPackagePath)
  ? readFileSync(managedDependencyPackagePath, "utf8")
  : null;
const managedDockerfilePath = resolve(
  repositoryRoot,
  "apps/server/Dockerfile.managed",
);
const managedDockerfile = existsSync(managedDockerfilePath)
  ? readFileSync(managedDockerfilePath, "utf8")
  : null;
const migrateDockerfile = readFileSync(
  resolve(repositoryRoot, "packages/prisma/Dockerfile"),
  "utf8",
);
if (!selfHostDockerfile.includes("pnpm --dir apps/server build:selfhost")) {
  problems.push("apps/server/Dockerfile must use the Self-host build target");
}
if (!selfHostDockerfile.includes("--filter=@trainingloadai/server deploy --prod")) {
  problems.push("apps/server/Dockerfile must materialize a production deploy");
}
if (
  !selfHostDockerfile.includes("verify-server-runtime-deploy.mjs") ||
  !selfHostDockerfile.includes("prune-server-runtime-deploy.mjs") ||
  !selfHostDockerfile.includes("collect-linux-runtime-rootfs.mjs") ||
  !selfHostDockerfile.includes("copy-generated-client.mjs")
) {
  problems.push(
    "apps/server/Dockerfile must prune, verify and collect its minimal runtime and copy only the generated Prisma Client",
  );
}
const selfHostRunner = selfHostDockerfile.slice(
  selfHostDockerfile.indexOf("FROM scratch AS runner"),
);
if (!selfHostDockerfile.includes("FROM scratch AS runner")) {
  problems.push(
    "apps/server/Dockerfile must assemble the pinned minimal Debian runtime in a scratch final stage",
  );
}
for (const forbidden of [
  "/app/packages/prisma/migrations",
  "/app/packages/prisma/node_modules",
]) {
  if (selfHostRunner.includes(forbidden)) {
    problems.push(`apps/server/Dockerfile runtime must not contain ${forbidden}`);
  }
}
if (!selfHostDockerfile.includes("dist/apps/server/src/main.self-host")) {
  problems.push("apps/server/Dockerfile must start the Self-host entrypoint");
}
for (const dependency of [
  "@better-auth/expo",
  "@better-auth/oauth-provider",
  "@creem_io",
  "@langfuse/otel",
  "@modelcontextprotocol/node",
  "@modelcontextprotocol/server",
  "@opentelemetry/sdk-node",
  "@waffo",
  "strava_api_v3_pig",
]) {
  if (serverPackage.includes(dependency)) {
    problems.push(`apps/server/package.json must not own ${dependency}`);
  }
  // The Self-host Docker context deliberately excludes the Managed package.
  // Validate ownership in a full checkout, and validate only absence inside
  // the Self-host image build.
  if (
    managedDependencyPackage &&
    !managedDependencyPackage.includes(dependency)
  ) {
    problems.push(`packages/managed-server must own ${dependency}`);
  }
  if (selfHostDockerfile.includes(dependency)) {
    problems.push(
      `apps/server/Dockerfile must not install or delete ${dependency}`,
    );
  }
}
if (
  managedDockerfile &&
  !managedDockerfile.includes("pnpm --dir apps/server build")
) {
  problems.push("apps/server/Dockerfile.managed must use the Managed build");
}
if (managedDockerfile?.includes("--schema core/schema.prisma")) {
  problems.push(
    "apps/server/Dockerfile.managed must use the Managed Prisma schema",
  );
}
if (
  managedDockerfile &&
  !managedDockerfile.includes("dist/apps/server/src/main")
) {
  problems.push(
    "apps/server/Dockerfile.managed must start the Managed entrypoint",
  );
}
if (
  !migrateDockerfile.includes('io.trainingload.selfhost.image-role="migrate"') ||
  !migrateDockerfile.includes("core/runner/core-migration-runner.mjs") ||
  !migrateDockerfile.includes("packages/prisma/core/migrations") ||
  migrateDockerfile.includes("node_modules/prisma/build/index.js") ||
  migrateDockerfile.includes("packages/prisma/migrations")
) {
  problems.push(
    "packages/prisma/Dockerfile must contain only the run-once Core SQL runner and Core lineage",
  );
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Self-host server boundary: PASS (${walk(outputRoot).length} JavaScript files)\n`,
  );
}
