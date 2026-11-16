import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import {
  buildConfiguration,
  DEFAULT_ENVIRONMENT,
  fileDigest,
  releaseManifest,
  REPOSITORY,
  scanContext,
  SOURCE,
  stageContext,
  validateConfiguration,
  validateImage,
} from "./image-artifact.mjs";

const revision = "a".repeat(40);
const nodeImage = `node:22.23.3-bookworm-slim@sha256:${"b".repeat(64)}`;
const options = { revision, version: "1.1.25", nodeImage };
const configuration = buildConfiguration(options);
const digest = `sha256:${"c".repeat(64)}`;
const inspect = {
  Id: digest,
  Os: "linux",
  Architecture: "amd64",
  Config: {
    User: "10001:10001",
    WorkingDir: "/app/apps/docs",
    Cmd: ["node", "/app/start-docs.mjs"],
    ExposedPorts: { "3000/tcp": {} },
    Labels: {
      "org.opencontainers.image.source": SOURCE,
      "org.opencontainers.image.revision": revision,
      "org.opencontainers.image.version": "1.1.25",
      "org.opencontainers.image.licenses": "AGPL-3.0-only",
      "org.opencontainers.image.base.name": nodeImage,
      "io.trainingload.docs.profile": "cloud",
      "io.trainingload.docs.config-fingerprint":
        configuration.configFingerprint,
    },
  },
  RepoDigests: [`${REPOSITORY}@${digest}`],
};

test("the fingerprint binds public build inputs and excludes secrets and runtime upstreams", () => {
  const a = buildConfiguration({
    ...options,
    environment: {
      NEXT_PUBLIC_BASE_URL: "https://www.trainingload.ai/",
      DOCS_INTERNAL_API_URL: "http://private",
      SENTRY_AUTH_TOKEN: "not-public",
    },
  });
  assert.deepEqual(a, configuration);
  assert.ok(!JSON.stringify(a).includes("not-public"));
  for (const environment of [
    { NEXT_PUBLIC_API_URL: "https://example.org" },
    { NEW_USER_GIFT_ACCESS_DAYS: "31" },
    { NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-FIXTURE" },
  ]) {
    assert.notEqual(
      buildConfiguration({ ...options, environment }).configFingerprint,
      a.configFingerprint,
    );
  }
  const reordered = Object.fromEntries(Object.entries(configuration).reverse());
  assert.doesNotThrow(() => validateConfiguration(reordered));
  assert.throws(
    () =>
      validateConfiguration({
        ...configuration,
        configFingerprint: "0".repeat(64),
      }),
    /CONFIGURATION_MISMATCH/,
  );
});

test("invalid origins and multiline values cannot enter the public environment", () => {
  for (const value of [
    "http://example.org",
    "https://user:password@example.org",
    "https://example.org/private",
    "https://example.org?query=1",
  ]) {
    assert.throws(() =>
      buildConfiguration({
        ...options,
        environment: { NEXT_PUBLIC_API_URL: value },
      }),
    );
  }
  assert.throws(
    () =>
      buildConfiguration({
        ...options,
        environment: { NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-X\nPRIVATE=1" },
      }),
    /ENVIRONMENT_INVALID/,
  );
  assert.throws(
    () =>
      buildConfiguration({
        ...options,
        environment: { NEW_USER_GIFT_ACCESS_DAYS: "-1" },
      }),
    /OFFER_COPY_INVALID/,
  );
  assert.deepEqual(
    Object.keys(configuration.environment),
    Object.keys(DEFAULT_ENVIRONMENT),
  );
});

test("release records require the tested architecture, source, configuration and exact image", () => {
  const artifact = { configuration, imageId: digest, archiveDigest: digest };
  assert.equal(
    releaseManifest(artifact, inspect).reference,
    `${REPOSITORY}@${digest}`,
  );
  assert.throws(
    () => validateImage({ ...inspect, Architecture: "arm64" }, configuration),
    /IMAGE_MISMATCH/,
  );
  assert.throws(
    () =>
      validateImage(
        { ...inspect, Config: { ...inspect.Config, User: "root" } },
        configuration,
      ),
    /IMAGE_MISMATCH/,
  );
  assert.throws(
    () =>
      releaseManifest(
        { ...artifact, imageId: `sha256:${"d".repeat(64)}` },
        inspect,
      ),
    /ARTIFACT_MISMATCH/,
  );
  assert.throws(
    () =>
      releaseManifest(artifact, {
        ...inspect,
        RepoDigests: [`ghcr.io/other/docs@${digest}`],
      }),
    /PUBLISHED_DIGEST_MISSING/,
  );
});

test("staging preserves standalone links and adds static/public files without copying the checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-context-test-"));
  try {
    const source = join(root, "repo");
    const target = join(root, "context");
    for (const directory of [
      "apps/docs/.next/standalone/apps/docs",
      "apps/docs/.next/standalone/node_modules/pkg-real",
      "apps/docs/.next/static",
      "apps/docs/public",
      "scripts/docs",
      "uploads",
    ])
      await mkdir(join(source, directory), { recursive: true });
    await writeFile(
      join(source, "apps/docs/.next/standalone/apps/docs/server.js"),
      "console.log('fixture')",
    );
    await writeFile(join(source, "apps/docs/.next/static/asset.js"), "abc");
    await writeFile(join(source, "apps/docs/public/LOGO.png"), "public");
    await writeFile(
      join(source, "scripts/docs/start-image.mjs"),
      "// fixture bootstrap",
    );
    await writeFile(join(source, ".env"), "fixture-excluded-environment");
    await symlink(
      "pkg-real",
      join(source, "apps/docs/.next/standalone/node_modules/pkg"),
    );
    await mkdir(target);
    await stageContext(source, target, configuration);
    assert.equal(
      await readFile(
        join(target, "app/apps/docs/.next/static/asset.js"),
        "utf8",
      ),
      "abc",
    );
    assert.equal(
      await readFile(join(target, "app/apps/docs/public/LOGO.png"), "utf8"),
      "public",
    );
    assert.equal(
      await readlink(join(target, "app/node_modules/pkg")),
      "pkg-real",
    );
    await assert.rejects(readFile(join(target, "app/.env")), {
      code: "ENOENT",
    });
    assert.equal(
      JSON.parse(
        await readFile(join(target, "app/DOCS_ARTIFACT_MANIFEST.json")),
      ).publicCommit,
      revision,
    );
    assert.equal(
      await fileDigest(join(target, "app/apps/docs/.next/static/asset.js")),
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the runtime context rejects environment files, escaping links and split canary markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-context-scan-"));
  try {
    const app = join(root, "app");
    await mkdir(app);
    await writeFile(join(app, ".env"), "fixture");
    await assert.rejects(scanContext(app), /FORBIDDEN_PATH/);
    await rm(join(app, ".env"));
    await writeFile(join(root, "outside"), "fixture");
    await symlink(join(root, "outside"), join(app, "escape"));
    await assert.rejects(scanContext(app), /SYMLINK_ESCAPE/);
    await rm(join(app, "escape"));
    const marker = "docs-context-exclusion-fixture";
    await writeFile(join(app, "asset.js"), "a".repeat(65530) + marker);
    await assert.rejects(scanContext(app, [marker]), /FORBIDDEN_CONTENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Docs publishing is manual, canonical-main-only and reuses the read-only required Docs job", async () => {
  const publish = parse(
    await readFile(
      new URL("../../.github/workflows/docs-image.yml", import.meta.url),
      "utf8",
    ),
  );
  const docs = parse(
    await readFile(
      new URL("../../.github/workflows/docs.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(publish.on), ["workflow_dispatch"]);
  assert.deepEqual(publish.permissions, { contents: "read" });
  assert.equal(publish.jobs.build.uses, "./.github/workflows/docs.yml");
  assert.equal(publish.jobs.build.needs, "source");
  assert.match(
    publish.jobs.source.steps[0].run,
    /GITHUB_REF.*refs\/heads\/main/,
  );
  assert.match(
    publish.jobs.publish.if,
    /github\.repository == 'trainingload-ai\/trainingloadai'/,
  );
  assert.match(publish.jobs.publish.if, /github\.ref == 'refs\/heads\/main'/);
  assert.deepEqual(publish.jobs.publish.permissions, {
    contents: "read",
    packages: "write",
    "id-token": "write",
  });
  assert.equal(docs.jobs.docs.if, undefined);
  assert.equal(docs.on.pull_request.paths, undefined);
  assert.equal(
    docs.jobs.docs.steps.filter((step) => step.run === "pnpm docs:build")
      .length,
    1,
  );
  assert.ok(
    publish.jobs.publish.steps.some((step) =>
      step.run?.includes("check-image"),
    ),
  );
  assert.ok(
    !publish.jobs.publish.steps.some((step) => step.run?.includes("pnpm")),
  );
});
