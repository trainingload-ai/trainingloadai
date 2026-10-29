#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { arch as hostArch, platform as hostPlatform, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAcceptanceResourceBaseline,
  assertPassingAcceptanceReport,
  createAcceptanceReport,
  isExpectedDockerOperatingSystem,
  latencySummary,
  parseAcceptanceArguments,
  parseDockerByteSize,
  replaceEnvironmentSettings,
  SELF_HOST_ACCEPTANCE_CONTRACT,
} from "./acceptance-core.mjs";
import {
  copyRegularTreeBounded,
  publishRegularFileExclusive,
  readRegularFileBounded,
  replaceRegularFileAtomically,
} from "./backup-artifact.mjs";
import { isolateComposeEnvironment } from "./compose-environment.mjs";
import {
  scanDiagnosticsText,
  validateDiagnosticsBundle,
} from "./diagnostics-artifact.mjs";
import { isCatalogedSelfHostError } from "./error-catalog.mjs";
import {
  isSupportedComposeVersion,
  validRuntimeVersion,
} from "./management-core.mjs";
import { SELF_HOST_RELEASE_BUNDLE_LIMITS } from "./release-bundle.mjs";

const MAX_COMMAND_BUFFER = 32 * 1024 * 1024;
const MAX_ACCEPTANCE_METADATA_BYTES = 1024 * 1024;
const MAX_ACCEPTANCE_DIAGNOSTICS_BYTES = 32 * 1024 * 1024;
const MAX_ACCEPTANCE_RELEASE_FILES = 10_128;
const MAX_ACCEPTANCE_RELEASE_DIRECTORIES = 100_000;
const MAX_ACCEPTANCE_RELEASE_DEPTH = 64;
const READY_TIMEOUT_MS = 10 * 60 * 1000;
const FAILURE_TIMEOUT_MS = 60 * 1000;
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let commandEnvironment = process.env;
let composeEnvironmentSources = [];
const evidenceSecretValues = new Set();

async function readBoundedAcceptanceText(
  path,
  label,
  { maximumBytes = MAX_ACCEPTANCE_METADATA_BYTES, expectedBytes = null } = {},
) {
  try {
    const { contents } = await readRegularFileBounded(path, {
      maximumBytes,
      minimumBytes: 1,
      expectedSizeBytes: expectedBytes,
      label,
    });
    return contents.toString("utf8");
  } catch (error) {
    if (error?.message?.includes("not a bounded regular file")) {
      throw new Error(`${label} is not one bounded regular file`, {
        cause: error,
      });
    }
    if (error?.message?.includes("changed")) {
      throw new Error(`${label} changed while it was being read`, {
        cause: error,
      });
    }
    throw error;
  }
}

export async function readAcceptanceJson(path, label, options = {}) {
  const text = await readBoundedAcceptanceText(path, label, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function resetComposeEnvironment(sources) {
  composeEnvironmentSources = [...sources];
  commandEnvironment = isolateComposeEnvironment(
    process.env,
    composeEnvironmentSources,
  );
}

async function registerComposeEnvironmentFile(path) {
  composeEnvironmentSources.push(
    await readBoundedAcceptanceText(path, "self-host environment"),
  );
  commandEnvironment = isolateComposeEnvironment(
    process.env,
    composeEnvironmentSources,
  );
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...commandEnvironment, ...(options.env ?? {}) },
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs ?? 30 * 60 * 1000,
    maxBuffer: MAX_COMMAND_BUFFER,
    windowsHide: true,
  });
  const value = {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
  if ((value.error || value.status !== 0) && !options.allowFailure) {
    throw new Error(
      `${basename(command)} failed with exit ${String(value.status)}`,
      { cause: value.error },
    );
  }
  return value;
}

function parseJsonProcessResult(result, label) {
  const output = (result.status === 0 ? result.stdout : result.stderr).trim();
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} returned non-JSON output`, { cause: error });
  }
}

function runReleaseWrapper(root, wrapper, args, options = {}) {
  const windows = hostPlatform() === "win32";
  const command = windows
    ? "powershell.exe"
    : resolve(root, wrapper === "install" ? "install.sh" : "self-host");
  const commandArgs = windows
    ? [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve(root, wrapper === "install" ? "install.ps1" : "self-host.ps1"),
        ...args,
      ]
    : args;
  const result = runCommand(command, commandArgs, {
    cwd: root,
    timeoutMs: options.timeoutMs,
    allowFailure: options.allowFailure,
    input: options.input,
  });
  return { result, payload: parseJsonProcessResult(result, wrapper) };
}

function runInstaller(root, args, options = {}) {
  return runReleaseWrapper(root, "install", [...args, "--json"], options);
}

function runManagement(root, args, options = {}) {
  return runReleaseWrapper(root, "self-host", [...args, "--json"], options);
}

function runManagementFrom(controllerRoot, instanceRoot, args, options = {}) {
  return runReleaseWrapper(
    controllerRoot,
    "self-host",
    [...args, "--directory", instanceRoot, "--json"],
    options,
  );
}

function requireOk({ result, payload }, label) {
  if (result.status !== 0 || payload?.ok !== true || payload?.exitCode !== 0) {
    throw new Error(
      `${label} failed with ${payload?.error?.code ?? "unknown error"}`,
    );
  }
  return payload;
}

function runInstallerAfterDryRun(root, args, label) {
  const planned = requireOk(
    runInstaller(root, [...args, "--dry-run"]),
    `${label} dry-run`,
  );
  if (planned.status !== "planned" || planned.dryRun !== true) {
    throw new Error(`${label} dry-run did not return a planned result`);
  }
  return requireOk(runInstaller(root, args), label);
}

function docker(args, options = {}) {
  return runCommand("docker", args, options);
}

function composeArguments(instance) {
  return [
    "compose",
    "--project-name",
    instance.projectName,
    "--project-directory",
    instance.root,
    "--env-file",
    resolve(instance.root, ".env.selfhost"),
    "-f",
    resolve(instance.root, "compose.yml"),
  ];
}

async function reservePorts(count, createServer = createNetServer) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 16) {
    throw new Error("reserved port count is invalid");
  }
  const servers = [];
  return withRequiredAcceptanceRecovery(
    async () => {
      for (let index = 0; index < count; index += 1) {
        const server = createServer();
        await new Promise((resolvePromise, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolvePromise);
        });
        servers.push(server);
      }
      return servers.map((server) => server.address().port);
    },
    async () => {
      const results = await Promise.allSettled(
        servers.map(
          (server) =>
            new Promise((resolvePromise, reject) =>
              server.close((error) =>
                error ? reject(error) : resolvePromise(),
              ),
            ),
        ),
      );
      const errors = results
        .filter(({ status }) => status === "rejected")
        .map(({ reason }) => reason);
      if (errors.length) {
        throw new AggregateError(errors, "reserved port cleanup failed");
      }
    },
    "reserved port cleanup",
  );
}

async function startTileFixture(dependencies = {}) {
  let hanging = false;
  const sockets = new Set();
  const server = (dependencies.createServer ?? createHttpServer)(
    (request, response) => {
      if (hanging) return;
      if (!/^\/\d+\/\d+\/\d+\.png$/.test(request.url ?? "")) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": TILE_PNG.length,
        "cache-control": "no-store",
      });
      response.end(TILE_PNG);
    },
  );
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const port = server.address().port;
  let stopped = false;
  return {
    tileUrl: `http://127.0.0.1:${port}/{z}/{x}/{y}.png`,
    hang() {
      hanging = true;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      );
    },
  };
}

async function fetchReady(origin) {
  try {
    const response = await fetch(`${origin}/api/health/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    const value = payload?.data ?? payload;
    return value?.status === "ready";
  } catch {
    return false;
  }
}

async function waitForReadiness(origin, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await fetchReady(origin)) === expected) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`readiness did not become ${String(expected)}`);
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (!(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers,
  });
  const payload = await response.json().catch(() => null);
  return { response, value: payload?.data ?? payload };
}

function wait(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

export function extractSessionCookie(headers) {
  const values =
    typeof headers?.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers?.get?.("set-cookie")].filter(Boolean);
  const cookies = values
    .map((value) => String(value).split(";", 1)[0].trim())
    .filter((value) =>
      /^(?:(?:__Secure|__Host)-)?better-auth\.session[_-]token(?:\.[A-Za-z0-9_-]+)?=[^\s;,]+$/.test(
        value,
      ),
    );
  if (cookies.length === 0) {
    throw new Error("owner sign-in did not return a session cookie");
  }
  return [...new Set(cookies)].join("; ");
}

export function createAcceptanceGpx(suffix) {
  if (!/^[a-z0-9-]{1,80}$/.test(suffix)) {
    throw new Error("acceptance GPX suffix is invalid");
  }
  const points = Array.from({ length: 30 }, (_, index) => {
    const latitude = (39.9 + index * 0.0001).toFixed(6);
    const longitude = (116.1 + index * 0.0001).toFixed(6);
    const elevation = 80 + index;
    const timestamp = new Date(
      Date.UTC(2026, 0, 1, 0, 0, index * 5),
    ).toISOString();
    return `<trkpt lat="${latitude}" lon="${longitude}"><ele>${elevation}</ele><time>${timestamp}</time></trkpt>`;
  }).join("");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><gpx creator="Trainingload self-host acceptance" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><time>2026-01-01T00:00:00.000Z</time></metadata><trk><name>Acceptance ${suffix}</name><type>running</type><trkseg>${points}</trkseg></trk></gpx>`,
  );
}

export function validateRuntimeCapabilitySnapshot(
  snapshot,
  mode,
  tileUrl = "",
) {
  const expectedMap = mode === "connected" ? "custom-raster" : "none";
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot.deployment !== "self-host" ||
    snapshot.mode !== mode ||
    snapshot.ready !== true ||
    !Array.isArray(snapshot.startupErrors) ||
    snapshot.startupErrors.length !== 0 ||
    snapshot.capabilities?.database?.state !== "enabled" ||
    snapshot.capabilities?.storage?.state !== "enabled" ||
    snapshot.capabilities?.storage?.provider !== "LOCAL" ||
    snapshot.capabilities?.authentication?.state !== "enabled" ||
    snapshot.map?.provider !== expectedMap ||
    snapshot.capabilities?.maps?.provider !== expectedMap ||
    snapshot.capabilities?.elevation?.provider !== "none" ||
    snapshot.capabilities?.elevation?.state !== "disabled"
  ) {
    throw new Error(
      "runtime capability snapshot does not match the acceptance mode",
    );
  }
  for (const name of [
    "ai",
    "mail",
    "billing",
    "telemetry",
    "weather",
    "third-party-sync",
    "agent-api",
    "public-demo",
  ]) {
    if (snapshot.capabilities?.[name]?.state !== "disabled") {
      throw new Error(`optional capability is not disabled: ${name}`);
    }
  }
  if (mode === "connected") {
    if (
      snapshot.capabilities.maps.state !== "enabled" ||
      snapshot.map.tileUrl !== tileUrl ||
      snapshot.map.attribution !== "Acceptance fixture tiles" ||
      snapshot.map.publicToken !== null ||
      snapshot.map.tilePolicy?.browserOnly !== false ||
      snapshot.map.tilePolicy?.bulkDownloadAllowed !== false
    ) {
      throw new Error("connected map provider contract differs");
    }
  } else if (
    snapshot.capabilities.maps.state !== "disabled" ||
    snapshot.map.styleUrl !== null ||
    snapshot.map.tileUrl !== null ||
    snapshot.map.attribution !== null ||
    snapshot.map.publicToken !== null ||
    snapshot.map.tilePolicy?.browserOnly !== false ||
    snapshot.map.tilePolicy?.bulkDownloadAllowed !== false
  ) {
    throw new Error("Core Local route-only map contract differs");
  }
  return snapshot;
}

function bootstrapTokenMetadata(instance) {
  const result = docker([
    ...composeArguments(instance),
    "exec",
    "-T",
    "server",
    "node",
    "-e",
    "const fs=require('node:fs');const path='/data/operations/bootstrap-token';const stat=fs.statSync(path);process.stdout.write(JSON.stringify({token:fs.readFileSync(path,'utf8').trim(),mode:stat.mode&0o777}));",
  ]);
  return JSON.parse(result.stdout.trim());
}

function bootstrapTokenExists(instance) {
  const result = docker([
    ...composeArguments(instance),
    "exec",
    "-T",
    "server",
    "node",
    "-e",
    "process.stdout.write(String(require('node:fs').existsSync('/data/operations/bootstrap-token')));",
  ]);
  return result.stdout.trim() === "true";
}

async function bootstrapOwner(instance) {
  const metadata = bootstrapTokenMetadata(instance);
  evidenceSecretValues.add(metadata.token);
  if (!/^[A-Za-z0-9_-]{43}$/.test(metadata.token) || metadata.mode !== 0o600) {
    throw new Error("bootstrap token contract is invalid");
  }
  const pending = await fetchJson(
    `${instance.origin}/api/self-host/bootstrap/status`,
  );
  if (
    !pending.response.ok ||
    pending.value?.state !== "PENDING" ||
    pending.value?.bootstrapRequired !== true ||
    JSON.stringify(pending.value).includes(metadata.token)
  ) {
    throw new Error("bootstrap status is not a redacted pending state");
  }
  const credentials = {
    email: `owner-${randomBytes(6).toString("hex")}@example.test`,
    password: `Acceptance-${randomBytes(12).toString("base64url")}9`,
  };
  evidenceSecretValues.add(credentials.email);
  evidenceSecretValues.add(credentials.password);
  const ownerName = "Acceptance Owner";
  const ownerBootstrapArguments = [
    "owner-bootstrap",
    "--email",
    credentials.email,
    "--name",
    ownerName,
  ];
  const planned = requireOk(
    runManagement(instance.root, [...ownerBootstrapArguments, "--dry-run"]),
    "owner bootstrap dry-run",
  );
  const plannedSerialized = JSON.stringify(planned);
  const metadataAfterDryRun = bootstrapTokenMetadata(instance);
  if (
    planned.status !== "planned" ||
    planned.details?.passwordInput !== "stdin" ||
    plannedSerialized.includes(credentials.email) ||
    plannedSerialized.includes(credentials.password) ||
    plannedSerialized.includes(ownerName) ||
    plannedSerialized.includes(metadata.token) ||
    metadataAfterDryRun.token !== metadata.token ||
    metadataAfterDryRun.mode !== metadata.mode
  ) {
    throw new Error(
      "owner bootstrap dry-run mutated state or exposed identity",
    );
  }
  const initialized = requireOk(
    runManagement(instance.root, ownerBootstrapArguments, {
      input: `${credentials.password}\n`,
    }),
    "owner bootstrap",
  );
  const serialized = JSON.stringify(initialized);
  if (
    initialized.details?.ownerInitialized !== true ||
    serialized.includes(credentials.email) ||
    serialized.includes(credentials.password) ||
    serialized.includes(ownerName) ||
    serialized.includes(metadata.token)
  ) {
    throw new Error(
      "owner bootstrap management result is invalid or sensitive",
    );
  }
  if (bootstrapTokenExists(instance)) {
    throw new Error("bootstrap token survived owner initialization");
  }
  const replay = await fetchJson(
    `${instance.origin}/api/self-host/bootstrap/owner`,
    {
      method: "POST",
      body: JSON.stringify({
        token: metadata.token,
        email: "replay@example.test",
        password: "Replay-acceptance-password-9",
        name: "Replay",
      }),
    },
  );
  if (replay.response.status !== 409) {
    throw new Error("bootstrap replay was not rejected");
  }
  return credentials;
}

async function assertSignIn(instance, credentials, expected) {
  const response = await fetch(`${instance.origin}/auth/sign-in/email`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      origin: instance.origin,
    },
    body: JSON.stringify(credentials),
  });
  if (response.ok !== expected) {
    throw new Error(
      `owner sign-in expectation was ${expected} but HTTP was ${response.status}`,
    );
  }
  return expected ? extractSessionCookie(response.headers) : null;
}

function authenticatedHeaders(instance, sessionCookie, extra = {}) {
  return {
    cookie: sessionCookie,
    origin: instance.origin,
    ...extra,
  };
}

async function fetchAuthenticatedJson(
  instance,
  sessionCookie,
  path,
  options = {},
) {
  return fetchJson(`${instance.origin}${path}`, {
    ...options,
    headers: authenticatedHeaders(
      instance,
      sessionCookie,
      options.headers ?? {},
    ),
  });
}

async function assertRuntimeCapabilities(instance, mode, tileUrl) {
  const result = await fetchJson(
    `${instance.origin}/api/proxy/api/runtime/capabilities`,
  );
  if (!result.response.ok) {
    throw new Error("runtime capability endpoint is unavailable");
  }
  validateRuntimeCapabilitySnapshot(result.value, mode, tileUrl);
  if (mode === "connected") {
    const probeUrl = tileUrl
      .replaceAll("{z}", "0")
      .replaceAll("{x}", "0")
      .replaceAll("{y}", "0");
    const response = await fetch(probeUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      !response.ok ||
      response.headers.get("content-type") !== "image/png" ||
      bytes.length !== TILE_PNG.length
    ) {
      throw new Error(
        "configured map provider did not return the fixture tile",
      );
    }
  }
  return result.value;
}

async function waitForImportedActivity(
  instance,
  sessionCookie,
  batchId,
  timeoutMs = 5 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [batchResult, itemsResult] = await Promise.all([
      fetchAuthenticatedJson(
        instance,
        sessionCookie,
        `/api/proxy/activities/import/batches/${batchId}`,
      ),
      fetchAuthenticatedJson(
        instance,
        sessionCookie,
        `/api/proxy/activities/import/batches/${batchId}/items`,
      ),
    ]);
    if (!batchResult.response.ok || !itemsResult.response.ok) {
      throw new Error("activity import status endpoint failed");
    }
    const batch = batchResult.value;
    const items = itemsResult.value?.items;
    if (["FAILED", "PARTIAL_FAILED", "CANCELLED"].includes(batch?.status)) {
      throw new Error(`activity import reached ${batch.status}`);
    }
    if (
      batch?.status === "COMPLETED" &&
      batch.successCount === 1 &&
      batch.failedCount === 0 &&
      batch.skippedCount === 0 &&
      Array.isArray(items) &&
      items.length === 1 &&
      items[0]?.status === "DONE" &&
      items[0]?.activity?.hashId &&
      (items[0].activity.processingStatus === "READY" ||
        items[0].activity.readyAt)
    ) {
      const sourceFileKey = items[0].sourceObject?.fileKey;
      if (
        typeof sourceFileKey !== "string" ||
        !sourceFileKey ||
        sourceFileKey.includes("\\") ||
        sourceFileKey.startsWith("/") ||
        sourceFileKey.split("/").some((segment) => segment === "..")
      ) {
        throw new Error(
          "activity import did not retain a safe local source file key",
        );
      }
      return {
        hashId: items[0].activity.hashId,
        batchId,
        sourceFileKey,
      };
    }
    await wait(2_000);
  }
  throw new Error(
    "activity import did not complete before the acceptance timeout",
  );
}

async function waitForActivityThumbnails(
  instance,
  sessionCookie,
  hashId,
  timeoutMs = 2 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const detailResult = await fetchAuthenticatedJson(
      instance,
      sessionCookie,
      `/api/proxy/activities/${hashId}`,
    );
    if (!detailResult.response.ok) {
      throw new Error(
        "activity detail endpoint failed while waiting for thumbnails",
      );
    }
    const light = detailResult.value?.mapThumbnailUrl;
    const dark = detailResult.value?.mapThumbnailDarkUrl;
    if (
      typeof light === "string" &&
      light &&
      typeof dark === "string" &&
      dark
    ) {
      return { light, dark };
    }
    await wait(1_000);
  }
  throw new Error("local route thumbnails were not generated");
}

async function assertStoredImage(instance, sessionCookie, path) {
  const url = new URL(path, `${instance.origin}/`);
  if (url.origin !== instance.origin) {
    throw new Error("local thumbnail escaped the self-host origin");
  }
  const response = await fetch(url, {
    headers: authenticatedHeaders(instance, sessionCookie),
    signal: AbortSignal.timeout(10_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/") ||
    bytes.length < 100
  ) {
    throw new Error("local route thumbnail is unavailable or invalid");
  }
  return bytes.length;
}

async function assertCoreUserJourney(instance, credentials, fixture) {
  await assertRuntimeCapabilities(instance, fixture.mode, fixture.tileUrl);
  const sessionCookie = await assertSignIn(instance, credentials, true);
  const detailResult = await fetchAuthenticatedJson(
    instance,
    sessionCookie,
    `/api/proxy/activities/${fixture.hashId}`,
  );
  const detail = detailResult.value;
  if (
    !detailResult.response.ok ||
    detail?.hashId !== fixture.hashId ||
    (detail?.processingStatus !== "READY" && !detail?.readyAt) ||
    !Number.isFinite(detail?.distance) ||
    detail.distance <= 0
  ) {
    throw new Error(
      "imported activity is not available through the detail API",
    );
  }

  const listResult = await fetchAuthenticatedJson(
    instance,
    sessionCookie,
    "/api/proxy/activities?page=1&perPage=20",
  );
  if (
    !listResult.response.ok ||
    !Array.isArray(listResult.value?.activities) ||
    !listResult.value.activities.some(
      (activity) => activity.hashId === fixture.hashId,
    )
  ) {
    throw new Error("imported activity is absent from the activity list");
  }

  const layerResult = await fetchAuthenticatedJson(
    instance,
    sessionCookie,
    `/api/proxy/activities/${fixture.hashId}/layer`,
  );
  if (
    !layerResult.response.ok ||
    !Array.isArray(layerResult.value?.maps) ||
    layerResult.value.maps.length === 0 ||
    !Array.isArray(layerResult.value?.bounds) ||
    !Array.isArray(layerResult.value?.center)
  ) {
    throw new Error(
      "imported route is not available through the map layer API",
    );
  }

  const exportResponse = await fetch(
    `${instance.origin}/api/proxy/activities/convert/byId`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: authenticatedHeaders(instance, sessionCookie, {
        "content-type": "application/json",
      }),
      body: JSON.stringify({ fileHashId: fixture.hashId, type: "gpx" }),
    },
  );
  const exported = Buffer.from(await exportResponse.arrayBuffer());
  const exportText = exported.toString("utf8");
  if (
    !exportResponse.ok ||
    exported.length < 100 ||
    !exportText.includes("<gpx") ||
    !exportText.includes("<ele")
  ) {
    throw new Error("imported activity could not be exported with elevation");
  }

  const thumbnails = await waitForActivityThumbnails(
    instance,
    sessionCookie,
    fixture.hashId,
  );
  const [lightBytes, darkBytes] = await Promise.all([
    assertStoredImage(instance, sessionCookie, thumbnails.light),
    assertStoredImage(instance, sessionCookie, thumbnails.dark),
  ]);
  return {
    hashId: fixture.hashId,
    routeSegments: layerResult.value.maps.length,
    exportBytes: exported.length,
    thumbnailBytes: { light: lightBytes, dark: darkBytes },
    sourceFileStored: Boolean(fixture.sourceFileKey),
  };
}

async function createCoreUserJourneyFixture(
  instance,
  credentials,
  suffix,
  mode,
  tileUrl,
) {
  await assertRuntimeCapabilities(instance, mode, tileUrl);
  const sessionCookie = await assertSignIn(instance, credentials, true);
  const fileName = `acceptance-${suffix}.gpx`;
  const form = new FormData();
  form.append(
    "files",
    new Blob([createAcceptanceGpx(suffix)], {
      type: "application/gpx+xml",
    }),
    fileName,
  );
  const upload = await fetchAuthenticatedJson(
    instance,
    sessionCookie,
    "/api/proxy/activities/upload",
    { method: "POST", body: form },
  );
  if (upload.response.status !== 202 || typeof upload.value?.id !== "string") {
    throw new Error("activity upload did not create an import batch");
  }
  const fixture = await waitForImportedActivity(
    instance,
    sessionCookie,
    upload.value.id,
  );
  const fixtureWithRuntime = { ...fixture, mode, tileUrl };
  const journey = await assertCoreUserJourney(
    instance,
    credentials,
    fixtureWithRuntime,
  );
  return { ...fixtureWithRuntime, ...journey };
}

function psqlScalar(instance, sql) {
  return docker([
    ...composeArguments(instance),
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "trainingload",
    "-d",
    "trainingload",
    "-Atc",
    sql,
  ]).stdout.trim();
}

function projectName(prefix) {
  return `tl-${prefix}-${randomBytes(4).toString("hex")}`.slice(0, 62);
}

async function configureInstance(instance, mode, tileUrl) {
  const path = resolve(instance.root, ".env.selfhost");
  const source = await readBoundedAcceptanceText(path, "self-host environment");
  const connected = mode === "connected";
  const configured = replaceEnvironmentSettings(
    source,
    {
      SELF_HOST_PROJECT_NAME: instance.projectName,
      SELF_HOST_SITE_ADDRESS: instance.origin,
      SELF_HOST_HTTP_BIND: "127.0.0.1",
      SELF_HOST_HTTP_PORT: String(instance.httpPort),
      SELF_HOST_MODE: mode,
      STORAGE_STRATEGY: "LOCAL",
      MAP_PROVIDER: connected ? "custom-raster" : "none",
      MAP_TILE_URL: connected ? tileUrl : "",
      MAP_ATTRIBUTION: connected ? "Acceptance fixture tiles" : "",
      MAP_STYLE_URL: "",
      ACTIVITY_MAP_THUMB_PROVIDER: "local",
      ELEVATION_PROVIDER: "none",
      AI_PROVIDER: "none",
      AI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      OPENROUTER_DEFAULT_MODEL: "",
      OPENROUTER_REASONING_MODEL: "",
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_DEFAULT_MODEL: "",
      DASHSCOPE_REASONING_MODEL: "",
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_DEFAULT_MODEL: "",
      DEEPSEEK_REASONING_MODEL: "",
      MAIL_PROVIDER: "none",
      MAIL_HOST: "",
      MAIL_USER: "",
      MAIL_PASSWORD: "",
      BILLING_PROVIDER: "none",
      TELEMETRY_ENABLED: "false",
      WEATHER_PROVIDER: "none",
      ACTIVITY_WEATHER_ENABLED: "false",
      AI_TODAY_WEATHER_ENABLED: "false",
      THIRD_PARTY_SYNC_ENABLED: "false",
      AGENT_CAPABILITIES_ENABLED: "false",
      SOCIAL_AUTH_ENABLED: "false",
      PUBLIC_DEMO_ENABLED: "false",
    },
    { appendMissing: true },
  );
  await fs.writeFile(path, configured, { mode: 0o600 });
  if (hostPlatform() !== "win32") await fs.chmod(path, 0o600);
  await registerComposeEnvironmentFile(path);
}

async function copyRelease(source, destination) {
  await copyRegularTreeBounded(source, destination, {
    maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes,
    maximumFileBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
    maximumFiles: MAX_ACCEPTANCE_RELEASE_FILES,
    maximumDirectories: MAX_ACCEPTANCE_RELEASE_DIRECTORIES,
    maximumDepth: MAX_ACCEPTANCE_RELEASE_DEPTH,
    fileMode:
      process.platform === "win32"
        ? 0o600
        : (file) => {
            if (![0o644, 0o755].includes(file.mode)) {
              throw new Error(
                `release source has an invalid file mode: ${file.relativePath}`,
              );
            }
            return file.mode;
          },
    label: "acceptance release copy",
  });
}

async function createInstance({ source, parent, prefix, mode, tileUrl }) {
  const root = resolve(parent, projectName(prefix));
  await copyRelease(source, root);
  const [httpPort, httpsPort] = await reservePorts(2);
  const instance = {
    root,
    projectName: projectName(prefix),
    httpPort,
    httpsPort,
    origin: `http://127.0.0.1:${httpPort}`,
  };
  return instance;
}

async function initializeAndStart(instance, mode, tileUrl) {
  runInstallerAfterDryRun(instance.root, ["--no-start"], "installer");
  await configureInstance(instance, mode, tileUrl);
  requireOk(
    runManagement(instance.root, ["start", "--dry-run"]),
    "start dry-run",
  );
  const started = performance.now();
  requireOk(runManagement(instance.root, ["start"]), "start");
  await waitForReadiness(instance.origin, true, READY_TIMEOUT_MS);
  return Math.round(performance.now() - started);
}

function extractDoctorReport(execution, { expectFailure = false } = {}) {
  if (!expectFailure) return requireOk(execution, "doctor").details.doctor;
  if (
    execution.result.status === 0 ||
    execution.payload?.ok !== false ||
    execution.payload?.error?.code !== "SELF_HOST_DOCTOR_FAILED" ||
    execution.payload?.details?.doctor?.overall !== "fail"
  ) {
    throw new Error("doctor did not return the expected blocking failure");
  }
  return execution.payload.details.doctor;
}

function doctor(instance, options = {}) {
  const execution = runManagement(instance.root, ["doctor"], {
    allowFailure: options.expectFailure === true,
  });
  return extractDoctorReport(execution, options);
}

function doctorCheck(report, code) {
  const check = report.checks.find((item) => item.code === code);
  if (!check) throw new Error(`doctor omitted ${code}`);
  return check;
}

function composeContainerId(instance, service) {
  const result = docker([
    ...composeArguments(instance),
    "ps",
    "--all",
    "--quiet",
    service,
  ]);
  const id = result.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    throw new Error(`Compose did not return one ${service} container`);
  }
  return id;
}

function inspectContainer(id) {
  const result = docker(["inspect", id]);
  const values = JSON.parse(result.stdout);
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error("Docker inspect returned an invalid container result");
  }
  return values[0];
}

function auditRuntimeSecurity(instance) {
  const inspected = Object.fromEntries(
    ["permissions", "postgres", "migrate", "server", "client"].map(
      (service) => [
        service,
        inspectContainer(composeContainerId(instance, service)),
      ],
    ),
  );
  const assertions = [];
  const record = (id, pass, details) => {
    assertions.push({ id, status: pass ? "pass" : "fail", details });
  };
  const nonRoot = ["migrate", "server", "client"].every(
    (service) => {
      const user = String(inspected[service].Config?.User ?? "");
      return user && !/^(?:0|root)(?::|$)/.test(user);
    },
  );
  record("runtime-non-root", nonRoot, {
    services: ["migrate", "server", "client"],
  });
  const readOnly = ["migrate", "server", "client"].every(
    (service) => inspected[service].HostConfig?.ReadonlyRootfs === true,
  );
  record("runtime-read-only-root", readOnly, {
    services: ["migrate", "server", "client"],
  });
  const dropped = [
    "permissions",
    "migrate",
    "server",
    "client",
  ].every((service) =>
    (inspected[service].HostConfig?.CapDrop ?? []).map(String).includes("ALL"),
  );
  record("runtime-cap-drop-all", dropped, {
    services: ["permissions", "migrate", "server", "client"],
  });
  const noNewPrivileges = Object.values(inspected).every((value) =>
    (value.HostConfig?.SecurityOpt ?? []).some((item) =>
      String(item).startsWith("no-new-privileges"),
    ),
  );
  record("runtime-no-new-privileges", noNewPrivileges, {
    services: Object.keys(inspected),
  });
  const databaseBindings = inspected.postgres.HostConfig?.PortBindings ?? {};
  record("database-not-published", Object.keys(databaseBindings).length === 0, {
    publishedPorts: Object.keys(databaseBindings),
  });
  const expectedPermissionsCaps = ["CHOWN", "DAC_OVERRIDE", "FOWNER"];
  const permissionsCaps = (inspected.permissions.HostConfig?.CapAdd ?? [])
    .map(String)
    .sort();
  record(
    "permissions-cap-allowlist",
    JSON.stringify(permissionsCaps) === JSON.stringify(expectedPermissionsCaps),
    { capabilities: permissionsCaps },
  );
  if (assertions.some(({ status }) => status === "fail")) {
    throw new Error("runtime container security differs from the contract");
  }
  return assertions;
}

function dataUsageBytes(instance) {
  const result = docker([
    ...composeArguments(instance),
    "run",
    "--rm",
    "--no-deps",
    "--user",
    "0:0",
    "permissions",
    "/bin/sh",
    "-eu",
    "-c",
    "du -sk /state | awk '{print $1}'",
  ]);
  const kibibytes = Number(result.stdout.trim());
  if (!Number.isSafeInteger(kibibytes) || kibibytes < 0) {
    throw new Error("data usage measurement is invalid");
  }
  return kibibytes * 1024;
}

function memoryUsage(instance) {
  const usage = {};
  for (const service of ["postgres", "server", "client"]) {
    const id = composeContainerId(instance, service);
    const value = docker([
      "stats",
      "--no-stream",
      "--format",
      "{{.MemUsage}}",
      id,
    ]).stdout.trim();
    usage[service] = parseDockerByteSize(value.split("/")[0].trim());
  }
  return usage;
}

async function healthLatencies(origin, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    if (!(await fetchReady(origin)))
      throw new Error("health latency probe was not ready");
    samples.push(Math.round((performance.now() - started) * 100) / 100);
  }
  return latencySummary(samples);
}

function migrationCount(instance) {
  const count = psqlScalar(
    instance,
    'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
  );
  if (!/^\d+$/.test(count) || Number(count) < 1) {
    throw new Error("migration inventory is empty");
  }
  return Number(count);
}

async function injectDiskFailure(instance) {
  const moduleUrl = `${pathToFileURL(resolve(instance.root, "scripts/selfhost/management-core.mjs")).href}?acceptance=${Date.now()}`;
  const { executeManagementCommand, SELF_HOST_CLI_EXIT } = await import(
    moduleUrl
  );
  const result = await executeManagementCommand(
    {
      command: "backup",
      directory: instance.root,
      dryRun: false,
      json: true,
      source: false,
      tail: 200,
      services: [],
      output: `disk-fault-${randomBytes(4).toString("hex")}`,
      backupPath: null,
      releasePath: null,
      rollbackVersion: null,
      acceptNoApplicationRollback: false,
      deleteData: false,
      confirmDataRoot: null,
    },
    {
      cwd: instance.root,
      statfs: async () => ({ bavail: 0n, bsize: 4096n }),
    },
  );
  if (
    result.exitCode !== SELF_HOST_CLI_EXIT.FILESYSTEM ||
    result.error?.code !== "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT"
  ) {
    throw new Error("disk exhaustion did not fail with the stable error code");
  }
}

async function injectPermissionFailure(instance) {
  const permissionArgs = [
    ...composeArguments(instance),
    "run",
    "--rm",
    "--no-deps",
    "--user",
    "0:0",
    "permissions",
    "/bin/sh",
    "-eu",
    "-c",
  ];
  await withRequiredAcceptanceRecovery(
    async () => {
      docker([...permissionArgs, "chmod 0500 /state/uploads"]);
      const result = docker(
        [
          ...composeArguments(instance),
          "exec",
          "-T",
          "server",
          "node",
          "-e",
          "require('node:fs').writeFileSync('/data/uploads/acceptance-permission-probe','must-not-write')",
        ],
        { allowFailure: true },
      );
      if (result.status === 0) {
        throw new Error("a read-only upload directory accepted a write");
      }
    },
    async () => {
      const result = docker([...permissionArgs, "chmod 0700 /state/uploads"], {
        allowFailure: true,
      });
      const failure = acceptanceCleanupFailure(
        result,
        "upload permission recovery",
      );
      if (failure) throw failure;
    },
    "upload permission recovery",
  );
}

function networkReconnectArguments(network, containerId, networkState) {
  const aliases = [...new Set(networkState?.Aliases ?? [])].filter(
    (alias) =>
      typeof alias === "string" &&
      alias.length > 0 &&
      alias.length <= 253 &&
      !/[\r\n]/.test(alias),
  );
  return [
    "network",
    "connect",
    ...aliases.flatMap((alias) => ["--alias", alias]),
    network,
    containerId,
  ];
}

async function disconnectNetwork(instance) {
  const serverId = composeContainerId(instance, "server");
  const inspected = inspectContainer(serverId);
  const networks = Object.keys(inspected.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1)
    throw new Error("server network inventory is ambiguous");
  const network = networks[0];
  const reconnectArguments = networkReconnectArguments(
    network,
    serverId,
    inspected.NetworkSettings.Networks[network],
  );
  await withRequiredAcceptanceRecovery(
    async () => {
      docker(["network", "disconnect", network, serverId]);
      await waitForReadiness(instance.origin, false, FAILURE_TIMEOUT_MS);
    },
    async () => {
      const result = docker(reconnectArguments, { allowFailure: true });
      const failure = acceptanceCleanupFailure(result, "network reconnect");
      if (failure) throw failure;
    },
    "network reconnect",
  );
  await waitForReadiness(instance.origin, true, READY_TIMEOUT_MS);
}

async function stopDatabaseAndRecover(instance) {
  return withRequiredAcceptanceRecovery(
    async () => {
      docker([
        ...composeArguments(instance),
        "stop",
        "--timeout",
        "30",
        "postgres",
      ]);
      await waitForReadiness(instance.origin, false, FAILURE_TIMEOUT_MS);
      const doctorExecution = runManagement(instance.root, ["doctor"], {
        allowFailure: true,
      });
      const report = extractDoctorReport(doctorExecution, {
        expectFailure: true,
      });
      const database = doctorCheck(report, "SELF_HOST_DOCTOR_DATABASE");
      if (
        database.status !== "fail" ||
        database.errorCode !== "SELF_HOST_DOCTOR_DATABASE_FAILED"
      ) {
        throw new Error("doctor did not report the unavailable database");
      }
      for (const code of [
        doctorExecution.payload.error.code,
        database.errorCode,
      ]) {
        if (!isCatalogedSelfHostError(code)) {
          throw new Error(`doctor returned an uncataloged error code: ${code}`);
        }
      }

      const output = `acceptance-database-fault-${randomBytes(5).toString("hex")}`;
      const diagnosticsArguments = [
        "diagnostics",
        "--output",
        output,
        "--tail",
        "200",
        "--service",
        "postgres",
        "--service",
        "server",
      ];
      requireOk(
        runManagement(instance.root, [...diagnosticsArguments, "--dry-run"]),
        "fault diagnostics dry-run",
      );
      const diagnosticsResult = requireOk(
        runManagement(instance.root, diagnosticsArguments),
        "fault diagnostics",
      );
      const relativePath = diagnosticsResult.details.diagnosticsPath;
      if (
        typeof relativePath !== "string" ||
        !relativePath ||
        isAbsolute(relativePath)
      ) {
        throw new Error("diagnostics returned an unsafe artifact path");
      }
      const artifactPath = resolve(instance.root, relativePath);
      const contained = relative(instance.root, artifactPath);
      if (!contained || contained.startsWith("..") || isAbsolute(contained)) {
        throw new Error("diagnostics returned an unsafe artifact path");
      }
      const reportedArtifactBytes = diagnosticsResult.details.sizeBytes;
      if (
        !Number.isSafeInteger(reportedArtifactBytes) ||
        reportedArtifactBytes <= 0
      ) {
        throw new Error("diagnostics returned an invalid artifact size");
      }
      const artifact = await readAcceptanceJson(
        artifactPath,
        "diagnostics artifact",
        {
          maximumBytes: MAX_ACCEPTANCE_DIAGNOSTICS_BYTES,
          expectedBytes: reportedArtifactBytes,
        },
      );
      validateDiagnosticsBundle(artifact);
      const artifactDatabase = doctorCheck(
        artifact.contents.doctor,
        "SELF_HOST_DOCTOR_DATABASE",
      );
      if (
        diagnosticsResult.details.secretScan !== "pass" ||
        diagnosticsResult.details.operatorReviewRequired !== true ||
        diagnosticsResult.details.doctorOverall !== "fail" ||
        !/^[a-f0-9]{64}$/.test(diagnosticsResult.details.sha256 ?? "") ||
        artifactDatabase.status !== "fail" ||
        artifactDatabase.errorCode !== "SELF_HOST_DOCTOR_DATABASE_FAILED" ||
        artifact.contents.logs?.status !== "collected" ||
        JSON.stringify(artifact.contents.logs?.selectedServices) !==
          JSON.stringify(["postgres", "server"])
      ) {
        throw new Error(
          "diagnostics did not preserve the database fault evidence",
        );
      }
      return {
        doctorOverall: report.overall,
        doctorErrorCode: doctorExecution.payload.error.code,
        databaseErrorCode: database.errorCode,
        diagnosticsSecretScan: diagnosticsResult.details.secretScan,
        diagnosticsOperatorReviewRequired:
          diagnosticsResult.details.operatorReviewRequired,
        diagnosticsSha256: diagnosticsResult.details.sha256,
      };
    },
    async () => {
      requireOk(
        runManagement(instance.root, ["start", "--dry-run"]),
        "database recovery start dry-run",
      );
      requireOk(
        runManagement(instance.root, ["start"]),
        "database recovery start",
      );
      await waitForReadiness(instance.origin, true, READY_TIMEOUT_MS);
    },
    "database recovery",
  );
}

async function writeReport(evidenceDirectory, report) {
  report.generatedAt = new Date().toISOString();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const findings = scanDiagnosticsText(serialized, [...evidenceSecretValues]);
  if (findings.length) {
    throw new Error(
      `acceptance report secret scan failed: ${findings.join(", ")}`,
    );
  }
  await fs.mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  await replaceRegularFileAtomically(
    resolve(evidenceDirectory, "acceptance-report.json"),
    serialized,
    { mode: 0o600 },
  );
}

function sanitizedFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 4096) || "unknown failure";
}

export function acceptanceCleanupFailure(result, label) {
  if (!result?.error && result?.status === 0) return null;
  return new Error(`${label} failed with exit ${String(result?.status)}`, {
    cause: result?.error ?? undefined,
  });
}

export async function withRequiredAcceptanceRecovery(
  operation,
  recovery,
  label,
) {
  let result;
  let operationError = null;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  let recoveryError = null;
  try {
    await recovery();
  } catch (error) {
    recoveryError = error;
  }
  if (recoveryError) {
    if (operationError) {
      throw new AggregateError(
        [operationError, recoveryError],
        `${label} failed after the acceptance operation failed`,
      );
    }
    throw recoveryError;
  }
  if (operationError) throw operationError;
  return result;
}

function readPreparation(path) {
  return readAcceptanceJson(path, "release preparation record");
}

function validatePreparation(record, releaseDirectory) {
  if (
    record?.schemaVersion !== 1 ||
    record.kind !== "trainingload-selfhost-acceptance-release" ||
    record.outerSignatureVerified !== true ||
    record.innerSignatureVerified !== true ||
    resolve(record.releaseRoot) !== resolve(releaseDirectory) ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(record.releaseVersion ?? "") ||
    !/^[a-f0-9]{40}$/.test(record.sourceRevision ?? "") ||
    !/^[a-f0-9]{64}$/.test(record.archiveSha256 ?? "")
  ) {
    throw new Error("release preparation record is invalid or mismatched");
  }
  return record;
}

async function acceptanceMain(argv = process.argv.slice(2)) {
  const options = parseAcceptanceArguments(argv);
  const platform = SELF_HOST_ACCEPTANCE_CONTRACT.platforms.find(
    ({ id }) => id === options.platformId,
  );
  const evidenceDirectory = resolve(options.evidenceDirectory);
  const [currentPreparationRaw, previousPreparationRaw] = await Promise.all([
    readPreparation(resolve(options.releasePreparation)),
    readPreparation(resolve(options.previousReleasePreparation)),
  ]);
  const currentPreparation = validatePreparation(
    currentPreparationRaw,
    options.releaseDirectory,
  );
  const previousPreparation = validatePreparation(
    previousPreparationRaw,
    options.previousReleaseDirectory,
  );
  resetComposeEnvironment(
    await Promise.all(
      [options.releaseDirectory, options.previousReleaseDirectory].map(
        (directory) =>
          readBoundedAcceptanceText(
            resolve(directory, "compose.yml"),
            "self-host Compose file",
          ),
      ),
    ),
  );
  const report = createAcceptanceReport({
    runId: options.runId,
    platform,
    mode: options.mode,
    current: currentPreparation,
    previous: previousPreparation,
  });
  const workspace = await fs.mkdtemp(
    join(tmpdir(), `trainingload-acceptance-${options.platformId}-`),
  );
  const instances = [];
  let currentScenario = "preflight";
  let tileFixture = null;
  let terminalError = null;

  const scenario = async (id, operation, threshold = null) => {
    currentScenario = id;
    const definition = SELF_HOST_ACCEPTANCE_CONTRACT.scenarios.find(
      (item) => item.id === id && item.modes.includes(options.mode),
    );
    if (!definition) throw new Error(`undeclared scenario: ${id}`);
    const started = performance.now();
    try {
      const details = (await operation()) ?? {};
      const durationMs = Math.round(performance.now() - started);
      if (threshold !== null && durationMs > threshold) {
        throw new Error(`${id} exceeded ${threshold} ms`);
      }
      report.scenarios.push({
        id,
        priority: definition.priority,
        status: "pass",
        durationMs,
        details,
      });
      await writeReport(evidenceDirectory, report);
      return { details, durationMs };
    } catch (error) {
      report.scenarios.push({
        id,
        priority: definition.priority,
        status: "fail",
        durationMs: Math.round(performance.now() - started),
        details: { error: sanitizedFailure(error) },
      });
      throw error;
    }
  };

  try {
    await writeReport(evidenceDirectory, report);
    const dockerVersion = docker([
      "version",
      "--format",
      "{{.Server.Version}}",
    ]).stdout.trim();
    const composeVersion = docker([
      "compose",
      "version",
      "--short",
    ]).stdout.trim();
    if (
      !validRuntimeVersion(dockerVersion) ||
      !isSupportedComposeVersion(composeVersion)
    ) {
      throw new Error("Docker or Compose returned an invalid version");
    }
    const dockerInfo = JSON.parse(
      docker(["info", "--format", "{{json .}}"]).stdout,
    );
    const normalizedArchitecture = ["x86_64", "amd64"].includes(
      String(dockerInfo.Architecture).toLowerCase(),
    )
      ? "amd64"
      : ["aarch64", "arm64"].includes(
            String(dockerInfo.Architecture).toLowerCase(),
          )
        ? "arm64"
        : String(dockerInfo.Architecture).toLowerCase();
    const normalizedHostArchitecture =
      hostArch() === "x64" ? "amd64" : hostArch();
    if (
      hostPlatform() !== platform.nodePlatform ||
      normalizedHostArchitecture !== platform.architecture ||
      dockerInfo.OSType !== "linux" ||
      !isExpectedDockerOperatingSystem(
        dockerInfo.OperatingSystem,
        platform.nodePlatform,
      ) ||
      normalizedArchitecture !== platform.architecture
    ) {
      throw new Error(
        "Docker daemon platform differs from the contracted matrix cell",
      );
    }
    runCommand("cosign", ["version"]);
    const disk = await fs.statfs(workspace, { bigint: true });
    const availableBytes = BigInt(disk.bavail) * BigInt(disk.bsize);
    if (availableBytes < BigInt(platform.minimumFreeDiskBytes)) {
      throw new Error(
        "acceptance runner does not meet the contracted free disk minimum",
      );
    }
    await publishRegularFileExclusive(
      resolve(evidenceDirectory, "environment.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          platformId: platform.id,
          hostPlatform: hostPlatform(),
          hostArchitecture: hostArch(),
          dockerVersion,
          composeVersion,
          dockerArchitecture: normalizedArchitecture,
          dockerOsType: dockerInfo.OSType,
          dockerOperatingSystem: dockerInfo.OperatingSystem,
          availableBytes: String(availableBytes),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    if (options.mode === "connected") tileFixture = await startTileFixture();
    const tileUrl = tileFixture?.tileUrl ?? "";
    const current = await createInstance({
      source: resolve(options.releaseDirectory),
      parent: workspace,
      prefix: "current",
      mode: options.mode,
      tileUrl,
    });
    instances.push(current);

    await scenario("signed-release-integrity", async () => {
      const dryRun = requireOk(
        runInstaller(current.root, ["--dry-run"]),
        "installer dry-run",
      );
      if (dryRun.bundleVerified !== true || dryRun.status !== "planned") {
        throw new Error("installer did not verify and plan the signed bundle");
      }
      return {
        outerSignatureVerified: true,
        innerSignatureVerified: true,
      };
    });

    const fresh = await scenario(
      "fresh-install",
      async () => {
        const durationMs = await initializeAndStart(
          current,
          options.mode,
          tileUrl,
        );
        report.measurements.freshInstallMs = durationMs;
        return {
          releaseVersion: currentPreparation.releaseVersion,
          ready: true,
          installerSameArgumentDryRun: true,
        };
      },
      SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.freshInstallMs,
    );
    report.measurements.freshInstallMs = fresh.durationMs;
    const migrations = migrationCount(current);
    report.measurements.diskBytes.afterInstall = dataUsageBytes(current);

    let credentials;
    let fixture;
    await scenario("owner-bootstrap-and-sign-in", async () => {
      credentials = await bootstrapOwner(current);
      await assertSignIn(current, credentials, true);
      return {
        ownerState: "READY",
        managementCli: true,
        sameArgumentDryRun: true,
        bootstrapReplayRejected: true,
      };
    });

    await scenario("core-user-journey", async () => {
      fixture = await createCoreUserJourneyFixture(
        current,
        credentials,
        randomBytes(5).toString("hex"),
        options.mode,
        tileUrl,
      );
      report.measurements.diskBytes.afterFixtures = dataUsageBytes(current);
      return {
        activityImported: true,
        routeVisible: fixture.routeSegments > 0,
        localThumbnailAvailable:
          fixture.thumbnailBytes.light > 0 && fixture.thumbnailBytes.dark > 0,
        rawElevationExported: fixture.exportBytes > 0,
        sourceFileStored: fixture.sourceFileStored,
        commercialCredentialsRequired: false,
      };
    });

    await scenario("default-security-audit", async () => {
      report.security = auditRuntimeSecurity(current);
      return { checks: report.security.length };
    });

    await scenario("resource-baseline", async () => {
      report.measurements.memoryBytes = memoryUsage(current);
      report.measurements.healthLatencyMs = await healthLatencies(
        current.origin,
        SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.healthLatencySamples,
      );
      if (
        report.measurements.healthLatencyMs.p95 >
        SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.healthLatencyP95Ms
      ) {
        throw new Error("health latency p95 exceeded the contract");
      }
      assertAcceptanceResourceBaseline(
        report.measurements,
        SELF_HOST_ACCEPTANCE_CONTRACT,
        { requireRestore: false },
      );
      return {
        healthLatencyP95Ms: report.measurements.healthLatencyMs.p95,
        measuredServices: Object.keys(report.measurements.memoryBytes),
      };
    });

    const restart = await scenario(
      "restart-persistence",
      async () => {
        docker([
          ...composeArguments(current),
          "restart",
          "postgres",
          "server",
          "client",
        ]);
        await waitForReadiness(current.origin, true, READY_TIMEOUT_MS);
        await assertCoreUserJourney(current, credentials, fixture);
        if (migrationCount(current) !== migrations) {
          throw new Error("restart changed the applied migration count");
        }
        return { persisted: true, migrationCount: migrations };
      },
      SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.restartMs,
    );
    report.measurements.restartMs = restart.durationMs;

    const recreate = await scenario(
      "recreate-persistence",
      async () => {
        docker([
          ...composeArguments(current),
          "up",
          "-d",
          "--force-recreate",
          "--wait",
          "--wait-timeout",
          "600",
        ]);
        await waitForReadiness(current.origin, true, READY_TIMEOUT_MS);
        await assertCoreUserJourney(current, credentials, fixture);
        if (migrationCount(current) !== migrations) {
          throw new Error("recreate changed the applied migration count");
        }
        return { persisted: true, migrationCount: migrations };
      },
      SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.recreateMs,
    );
    report.measurements.recreateMs = recreate.durationMs;

    await scenario("database-unavailable-recovery", async () => {
      const supportEvidence = await stopDatabaseAndRecover(current);
      await assertCoreUserJourney(current, credentials, fixture);
      return { degraded: true, recovered: true, ...supportEvidence };
    });

    await scenario("network-disconnect-recovery", async () => {
      await disconnectNetwork(current);
      await assertCoreUserJourney(current, credentials, fixture);
      return { degraded: true, recovered: true };
    });

    await scenario("disk-insufficient-fail-closed", async () => {
      await injectDiskFailure(current);
      if (!(await fetchReady(current.origin))) {
        throw new Error("disk preflight failure changed ready service state");
      }
      return { errorCode: "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT" };
    });

    await scenario("permission-error-fail-closed", async () => {
      await injectPermissionFailure(current);
      await assertCoreUserJourney(current, credentials, fixture);
      return { writeRejected: true, permissionsRestored: true };
    });

    let backupPath;
    let restored;
    const restoreResult = await scenario(
      "backup-clean-restore",
      async () => {
        const backupName = `acceptance-${randomBytes(5).toString("hex")}`;
        requireOk(
          runManagement(current.root, [
            "backup",
            "--output",
            backupName,
            "--dry-run",
          ]),
          "backup dry-run",
        );
        const backup = requireOk(
          runManagement(current.root, ["backup", "--output", backupName]),
          "backup",
        );
        backupPath = backup.details.backupPath;
        requireOk(
          runManagement(current.root, ["stop", "--dry-run"]),
          "stop dry-run",
        );
        requireOk(runManagement(current.root, ["stop"]), "stop");

        restored = await createInstance({
          source: resolve(options.releaseDirectory),
          parent: workspace,
          prefix: "restore",
          mode: options.mode,
          tileUrl,
        });
        instances.push(restored);
        runInstallerAfterDryRun(
          restored.root,
          ["--no-start"],
          "restore installer",
        );
        await configureInstance(restored, options.mode, tileUrl);
        requireOk(
          runManagement(restored.root, ["restore", backupPath, "--dry-run"]),
          "restore dry-run",
        );
        const restore = requireOk(
          runManagement(restored.root, ["restore", backupPath]),
          "restore",
        );
        if (restore.details.ready !== true) {
          throw new Error("clean restore did not report readiness");
        }
        await waitForReadiness(restored.origin, true, READY_TIMEOUT_MS);
        await assertCoreUserJourney(restored, credentials, fixture);
        report.measurements.diskBytes.afterRestore = dataUsageBytes(restored);
        assertAcceptanceResourceBaseline(
          report.measurements,
          SELF_HOST_ACCEPTANCE_CONTRACT,
        );
        return {
          verified: true,
          ready: true,
          installerSameArgumentDryRun: true,
        };
      },
      SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.restoreMs,
    );
    report.measurements.restoreMs = restoreResult.durationMs;

    let upgradeInstance;
    let upgradeCredentials;
    let upgradeFixture;
    const upgradeResult = await scenario(
      "signed-upgrade",
      async () => {
        upgradeInstance = await createInstance({
          source: resolve(options.previousReleaseDirectory),
          parent: workspace,
          prefix: "upgrade",
          mode: options.mode,
          tileUrl,
        });
        instances.push(upgradeInstance);
        await initializeAndStart(upgradeInstance, options.mode, tileUrl);
        upgradeCredentials = await bootstrapOwner(upgradeInstance);
        upgradeFixture = await createCoreUserJourneyFixture(
          upgradeInstance,
          upgradeCredentials,
          randomBytes(5).toString("hex"),
          options.mode,
          tileUrl,
        );
        requireOk(
          runManagement(upgradeInstance.root, [
            "upgrade",
            resolve(options.releaseDirectory),
            "--dry-run",
          ]),
          "source-controller upgrade compatibility dry-run",
        );
        requireOk(
          runManagementFrom(
            resolve(options.releaseDirectory),
            upgradeInstance.root,
            ["upgrade", resolve(options.releaseDirectory), "--dry-run"],
          ),
          "target-controller upgrade dry-run",
        );
        const upgraded = requireOk(
          runManagementFrom(
            resolve(options.releaseDirectory),
            upgradeInstance.root,
            ["upgrade", resolve(options.releaseDirectory)],
          ),
          "upgrade",
        );
        if (
          upgraded.details.sourceVersion !==
            previousPreparation.releaseVersion ||
          upgraded.details.targetVersion !== currentPreparation.releaseVersion
        ) {
          throw new Error(
            "upgrade report versions do not match signed releases",
          );
        }
        await waitForReadiness(upgradeInstance.origin, true, READY_TIMEOUT_MS);
        await assertCoreUserJourney(
          upgradeInstance,
          upgradeCredentials,
          upgradeFixture,
        );
        return {
          sourceVersion: previousPreparation.releaseVersion,
          targetVersion: currentPreparation.releaseVersion,
          backupVerified: Boolean(upgraded.details.backupPath),
        };
      },
      SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.upgradeMs,
    );
    report.measurements.upgradeMs = upgradeResult.durationMs;

    await scenario("declared-application-rollback", async () => {
      requireOk(
        runManagementFrom(
          resolve(options.releaseDirectory),
          upgradeInstance.root,
          ["rollback", previousPreparation.releaseVersion, "--dry-run"],
        ),
        "rollback dry-run",
      );
      const rolledBack = requireOk(
        runManagementFrom(
          resolve(options.releaseDirectory),
          upgradeInstance.root,
          ["rollback", previousPreparation.releaseVersion],
        ),
        "rollback",
      );
      if (
        rolledBack.details.targetVersion !==
          previousPreparation.releaseVersion ||
        rolledBack.details.databaseRollback !== "unsupported"
      ) {
        throw new Error("rollback result does not match the declared policy");
      }
      await waitForReadiness(upgradeInstance.origin, true, READY_TIMEOUT_MS);
      await assertCoreUserJourney(
        upgradeInstance,
        upgradeCredentials,
        upgradeFixture,
      );
      return {
        targetVersion: rolledBack.details.targetVersion,
        databaseRollback: rolledBack.details.databaseRollback,
      };
    });

    await scenario("safe-uninstall-reinstall", async () => {
      requireOk(
        runManagement(restored.root, ["uninstall", "--dry-run"]),
        "uninstall dry-run",
      );
      const uninstalled = requireOk(
        runManagement(restored.root, ["uninstall"]),
        "uninstall",
      );
      if (
        uninstalled.details.dataRetained !== true ||
        uninstalled.details.configurationRetained !== true ||
        uninstalled.details.services.length !== 0
      ) {
        throw new Error("safe uninstall did not retain instance state");
      }
      requireOk(
        runManagement(restored.root, ["start", "--dry-run"]),
        "post-uninstall start dry-run",
      );
      requireOk(
        runManagement(restored.root, ["start"]),
        "post-uninstall start",
      );
      await waitForReadiness(restored.origin, true, READY_TIMEOUT_MS);
      await assertCoreUserJourney(restored, credentials, fixture);
      return {
        composeResourcesRemoved: true,
        dataRetained: true,
        reinstallVerified: true,
      };
    });

    if (options.mode === "connected") {
      await scenario("provider-timeout-degrades", async () => {
        tileFixture.hang();
        const probeStarted = performance.now();
        const reportValue = doctor(restored);
        const probeDurationMs = Math.round(performance.now() - probeStarted);
        const provider = doctorCheck(
          reportValue,
          "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
        );
        if (
          provider.status !== "warning" ||
          provider.errorCode !== "SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE"
        ) {
          throw new Error("provider outage was not reported as a warning");
        }
        if (
          probeDurationMs <
          SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.providerTimeoutMinimumMs
        ) {
          throw new Error(
            "provider probe failed before exercising its timeout",
          );
        }
        if (!(await fetchReady(restored.origin))) {
          throw new Error("provider outage changed core readiness");
        }
        return {
          coreReady: true,
          providerStatus: "warning",
          probeDurationMs,
        };
      });
    }

    report.status = "passed";
    report.failure = null;
    assertPassingAcceptanceReport(report);
    await writeReport(evidenceDirectory, report);
    process.stdout.write(
      `[selfhost-acceptance] PASS platform=${platform.id} mode=${options.mode} scenarios=${report.scenarios.length}\n`,
    );
    return report;
  } catch (error) {
    terminalError = error;
    report.status = "failed";
    report.failure = {
      scenario: currentScenario,
      message: sanitizedFailure(error),
    };
    try {
      await writeReport(evidenceDirectory, report);
    } catch (reportError) {
      terminalError = new AggregateError(
        [error, reportError],
        "acceptance failed and its failure report could not be persisted",
      );
    }
    throw terminalError;
  } finally {
    const cleanupErrors = [];
    try {
      await tileFixture?.stop();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (options.keepOnFailure && report.status === "failed") {
      process.stderr.write(
        `[selfhost-acceptance] preserved synthetic workspace: ${workspace}\n`,
      );
    } else {
      for (const instance of instances.toReversed()) {
        docker([...composeArguments(instance), "stop", "--timeout", "30"], {
          allowFailure: true,
          timeoutMs: 10 * 60 * 1000,
        });
        if (
          typeof process.getuid === "function" &&
          typeof process.getgid === "function"
        ) {
          const uid = process.getuid();
          const gid = process.getgid();
          docker(
            [
              ...composeArguments(instance),
              "run",
              "--rm",
              "--no-deps",
              "--user",
              "0:0",
              "permissions",
              "/bin/sh",
              "-eu",
              "-c",
              `chown -R ${uid}:${gid} /state && chmod -R u+rwX /state`,
            ],
            { allowFailure: true, timeoutMs: 10 * 60 * 1000 },
          );
        }
        const down = docker(
          [
            ...composeArguments(instance),
            "down",
            "--remove-orphans",
            "--timeout",
            "30",
          ],
          { allowFailure: true, timeoutMs: 10 * 60 * 1000 },
        );
        const downFailure = acceptanceCleanupFailure(
          down,
          `Compose cleanup for ${instance.projectName}`,
        );
        if (downFailure) cleanupErrors.push(downFailure);
      }
      try {
        await fs.rm(workspace, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length) {
      const cleanupSuffix = "; acceptance cleanup failed";
      report.status = "failed";
      report.failure = {
        scenario: report.failure?.scenario ?? "cleanup",
        message: report.failure
          ? `${report.failure.message.slice(0, 4096 - cleanupSuffix.length)}${cleanupSuffix}`
          : "acceptance cleanup failed",
      };
      try {
        await writeReport(evidenceDirectory, report);
      } catch (reportError) {
        cleanupErrors.push(reportError);
      }
      throw new AggregateError(
        [...(terminalError ? [terminalError] : []), ...cleanupErrors],
        "acceptance cleanup failed",
      );
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await acceptanceMain();
}

export {
  acceptanceMain,
  extractDoctorReport,
  networkReconnectArguments,
  reservePorts,
  startTileFixture,
};
