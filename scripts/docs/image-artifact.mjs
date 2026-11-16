import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  appendFile,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findCredentialMarkers,
  findForbiddenPaths,
} from "../selfhost/scan-image-layers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "dist/docs-image");
export const SOURCE = "https://github.com/trainingload-ai/trainingloadai";
export const REPOSITORY =
  "ghcr.io/trainingload-ai/trainingloadai/trainingload-docs";
export const SIGNATURE_IDENTITY = `${SOURCE}/.github/workflows/docs-image.yml@refs/heads/main`;
export const DEFAULT_ENVIRONMENT = Object.freeze({
  NEXT_PUBLIC_BASE_URL: "https://www.trainingload.ai",
  NEXT_PUBLIC_API_URL: "https://api.trainingload.ai",
  NEXT_PUBLIC_APP_URL: "https://app.trainingload.ai",
  NEXT_PUBLIC_ASSET_BASE_URL: "https://assets.trainingload.ai",
  NEXT_PUBLIC_DEMO_HOST: "demo.trainingload.ai",
  NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_PUBLIC_SELF_HOST_MODE: "",
  NEXT_PUBLIC_TELEMETRY_ENABLED: "",
  NEW_USER_GIFT_ACCESS_DAYS: "30",
  NEW_USER_GIFT_BONUS_CREDITS: "1000",
  AI_PLAN_PLUS_MONTHLY_CREDITS: "4000",
  AI_PLAN_PRO_MONTHLY_CREDITS: "10000",
});

const fail = (code) => {
  throw new Error(code);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const isDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const fingerprint = (environment) =>
  hash(
    JSON.stringify(
      Object.fromEntries(
        Object.keys(DEFAULT_ENVIRONMENT)
          .sort()
          .map((key) => [key, environment[key]]),
      ),
    ),
  );
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

export function buildConfiguration({
  revision,
  version,
  environment = {},
  nodeImage,
}) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) fail("DOCS_REVISION_INVALID");
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version ?? ""))
    fail("DOCS_VERSION_INVALID");
  if (!/^node:22\.[\w.-]+@sha256:[a-f0-9]{64}$/.test(nodeImage ?? ""))
    fail("DOCS_NODE_IMAGE_INVALID");
  const values = {};
  for (const [key, fallback] of Object.entries(DEFAULT_ENVIRONMENT)) {
    if (environment[key] !== undefined && typeof environment[key] !== "string")
      fail("DOCS_ENVIRONMENT_INVALID");
    const value = environment[key]?.trim() || fallback;
    if (
      typeof value !== "string" ||
      /[\r\n\0]/.test(value) ||
      value.length > 2048
    )
      fail("DOCS_ENVIRONMENT_INVALID");
    values[key] = value;
  }
  // This artifact is the Cloud site, not a Self-host Client or a secret-backed build.
  values.NEXT_PUBLIC_SELF_HOST_MODE = "";
  values.NEXT_PUBLIC_TELEMETRY_ENABLED = "";
  for (const key of [
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_ASSET_BASE_URL",
    "NEXT_PUBLIC_POSTHOG_HOST",
  ]) {
    let url;
    try {
      url = new URL(values[key]);
    } catch {
      fail("DOCS_ORIGIN_INVALID");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      fail("DOCS_ORIGIN_INVALID");
    values[key] = url.origin;
  }
  if (!/^[a-z0-9.-]+$/i.test(values.NEXT_PUBLIC_DEMO_HOST))
    fail("DOCS_DEMO_HOST_INVALID");
  for (const key of Object.keys(values).filter(
    (key) => !key.startsWith("NEXT_PUBLIC_"),
  )) {
    if (!/^[1-9]\d{0,8}$/.test(values[key])) fail("DOCS_OFFER_COPY_INVALID");
  }
  return {
    schemaVersion: 1,
    profile: "cloud",
    platform: "linux/amd64",
    publicCommit: revision,
    version,
    nodeImage,
    environment: values,
    configFingerprint: fingerprint(values),
  };
}

export function validateConfiguration(configuration) {
  const expected = buildConfiguration({
    revision: configuration.publicCommit,
    version: configuration.version,
    nodeImage: configuration.nodeImage,
    environment: configuration.environment,
  });
  if (!isDeepStrictEqual(expected, configuration))
    fail("DOCS_CONFIGURATION_MISMATCH");
  return configuration;
}

export function validateImage(inspect, configuration) {
  validateConfiguration(configuration);
  const labels = inspect.Config?.Labels || {};
  const expected = {
    "org.opencontainers.image.source": SOURCE,
    "org.opencontainers.image.revision": configuration.publicCommit,
    "org.opencontainers.image.version": configuration.version,
    "org.opencontainers.image.licenses": "AGPL-3.0-only",
    "org.opencontainers.image.base.name": configuration.nodeImage,
    "io.trainingload.docs.profile": "cloud",
    "io.trainingload.docs.config-fingerprint": configuration.configFingerprint,
  };
  if (
    !isDigest(inspect.Id) ||
    inspect.Os !== "linux" ||
    inspect.Architecture !== "amd64" ||
    inspect.Config?.User !== "10001:10001" ||
    inspect.Config?.WorkingDir !== "/app/apps/docs" ||
    JSON.stringify(inspect.Config?.Cmd) !==
      JSON.stringify(["node", "/app/start-docs.mjs"]) ||
    !inspect.Config?.ExposedPorts?.["3000/tcp"] ||
    Object.entries(expected).some(([key, value]) => labels[key] !== value)
  )
    fail("DOCS_IMAGE_MISMATCH");
  return inspect;
}

export async function scanContext(app, forbiddenValues = []) {
  const canonicalApp = await realpath(app);
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const name = relative(app, path).split(sep).join("/");
      if (findForbiddenPaths([name]).length) fail("DOCS_IMAGE_FORBIDDEN_PATH");
      if (entry.isSymbolicLink()) {
        const target = relative(canonicalApp, await realpath(path));
        if (target === ".." || target.startsWith(`..${sep}`))
          fail("DOCS_IMAGE_SYMLINK_ESCAPE");
      } else if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        let overlap = "";
        for await (const chunk of createReadStream(path)) {
          const text = overlap + chunk.toString("latin1");
          if (findCredentialMarkers(text, forbiddenValues).length)
            fail("DOCS_IMAGE_FORBIDDEN_CONTENT");
          overlap = text.slice(-512);
        }
      } else fail("DOCS_IMAGE_FILE_TYPE_INVALID");
    }
  }
  await walk(app);
}

export async function stageContext(
  repositoryRoot,
  destination,
  configuration,
  forbiddenValues = [],
) {
  validateConfiguration(configuration);
  const app = resolve(destination, "app");
  await mkdir(app, { recursive: false });
  await cp(resolve(repositoryRoot, "apps/docs/.next/standalone"), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
  await cp(
    resolve(repositoryRoot, "apps/docs/.next/static"),
    resolve(app, "apps/docs/.next/static"),
    { recursive: true },
  );
  await cp(
    resolve(repositoryRoot, "apps/docs/public"),
    resolve(app, "apps/docs/public"),
    { recursive: true },
  );
  await stat(resolve(app, "apps/docs/server.js"));
  await cp(
    resolve(repositoryRoot, "scripts/docs/start-image.mjs"),
    resolve(app, "start-docs.mjs"),
  );
  await save(resolve(app, "DOCS_ARTIFACT_MANIFEST.json"), configuration);
  await scanContext(app, forbiddenValues);
}

export async function fileDigest(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return `sha256:${digest.digest("hex")}`;
}

export function validateArtifactImage(artifact, inspect) {
  const configuration = artifact.configuration;
  validateImage(inspect, configuration);
  if (inspect.Id !== artifact.imageId || !isDigest(artifact.archiveDigest))
    fail("DOCS_ARTIFACT_MISMATCH");
  return configuration;
}

export function releaseManifest(artifact, inspect) {
  const configuration = validateArtifactImage(artifact, inspect);
  const references = (inspect.RepoDigests || []).filter((value) =>
    value.startsWith(`${REPOSITORY}@`),
  );
  if (references.length !== 1 || !isDigest(references[0].split("@")[1]))
    fail("DOCS_PUBLISHED_DIGEST_MISSING");
  return {
    ...configuration,
    repository: REPOSITORY,
    digest: references[0].split("@")[1],
    reference: references[0],
    signatureIdentity: SIGNATURE_IDENTITY,
    signatureIssuer: "https://token.actions.githubusercontent.com",
  };
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "configure") {
    if (process.platform !== "linux" || process.arch !== "x64")
      fail("DOCS_BUILD_PLATFORM_UNSUPPORTED");
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (process.env.GITHUB_SHA !== revision) fail("DOCS_CHECKOUT_MISMATCH");
    const dockerfile = await readFile(
      resolve(root, "apps/docs/Dockerfile"),
      "utf8",
    );
    const nodeImage = dockerfile.match(/^ARG NODE_IMAGE=(.+)$/m)?.[1];
    if (!nodeImage?.startsWith(`node:${process.versions.node}-`))
      fail("DOCS_BUILD_NODE_MISMATCH");
    const configuration = buildConfiguration({
      revision,
      version: (await json(resolve(root, "package.json"))).version,
      environment: process.env,
      nodeImage,
    });
    await mkdir(output, { recursive: true });
    await save(resolve(output, "configuration.json"), configuration);
    if (!process.env.GITHUB_ENV) fail("DOCS_GITHUB_ENV_REQUIRED");
    const environment = {
      ...configuration.environment,
      SENTRY_AUTH_TOKEN: "",
      SENTRY_DSN: "",
      SENTRY_ORG: "",
      SENTRY_PROJECT: "",
      NEXT_DIST_DIR: "",
      DOCS_INTERNAL_API_URL: "",
    };
    await appendFile(
      process.env.GITHUB_ENV,
      Object.entries(environment)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `revision=${revision}\nversion=${configuration.version}\nconfig_fingerprint=${configuration.configFingerprint}\n`,
    );
  } else if (command === "stage") {
    await mkdir(resolve(output, "context"));
    await stageContext(
      root,
      resolve(output, "context"),
      await json(resolve(output, "configuration.json")),
      [process.env.DOCS_IMAGE_LEAK_CANARY || ""],
    );
  } else if (command === "record") {
    const configuration = await json(resolve(output, "configuration.json"));
    const inspect = validateImage(
      (await json(resolve(output, "inspect.json")))[0],
      configuration,
    );
    await save(resolve(output, "artifact.json"), {
      configuration,
      imageId: inspect.Id,
      archiveDigest: await fileDigest(resolve(output, "image.tar")),
    });
  } else if (command === "verify") {
    const artifact = await json(resolve(output, "artifact.json"));
    validateConfiguration(artifact.configuration);
    if (
      artifact.configuration.publicCommit !== process.env.GITHUB_SHA ||
      !isDigest(artifact.imageId) ||
      artifact.archiveDigest !==
        (await fileDigest(resolve(output, "image.tar")))
    )
      fail("DOCS_ARTIFACT_MISMATCH");
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `image_id=${artifact.imageId}\ntag=${REPOSITORY}:sha-${artifact.configuration.publicCommit}-${artifact.configuration.configFingerprint.slice(0, 12)}\n`,
    );
  } else if (command === "check-image") {
    validateArtifactImage(
      await json(resolve(output, "artifact.json")),
      (await json(resolve(output, "inspect.json")))[0],
    );
  } else if (command === "release") {
    const manifest = releaseManifest(
      await json(resolve(output, "artifact.json")),
      (await json(resolve(output, "published-inspect.json")))[0],
    );
    if (manifest.publicCommit !== process.env.GITHUB_SHA)
      fail("DOCS_RELEASE_REVISION_MISMATCH");
    await save(resolve(output, "docs-release.json"), manifest);
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `reference=${manifest.reference}\n`,
    );
  } else fail("DOCS_IMAGE_COMMAND_INVALID");
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
