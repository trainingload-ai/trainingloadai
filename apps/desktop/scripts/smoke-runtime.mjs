import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  constants,
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? join(desktop, "build/app"));
const temporary = mkdtempSync(join(tmpdir(), "Trainingload packaged 验证-"));
const app = join(temporary, "app");
// Relocation outside the repository prevents missing dependencies from being
// silently resolved from the developer's parent node_modules.
cpSync(source, app, {
  recursive: true,
  verbatimSymlinks: true,
  mode: constants.COPYFILE_FICLONE,
});
function resourceFingerprint(root) {
  const hash = createHash("sha256");
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      hash.update(path.slice(root.length)).update("\0");
      if (entry.isSymbolicLink()) hash.update(readlinkSync(path));
      else if (entry.isDirectory()) walk(path);
      else hash.update(readFileSync(path));
      hash.update("\0");
    }
  };
  walk(root);
  return hash.digest("hex");
}
const originalResources = resourceFingerprint(app);
const load = (file) => import(pathToFileURL(join(app, file)).href);
const children = [];
const startup = new AbortController();
let rejectStartup;
const startupFailure = new Promise((_resolve, reject) => {
  rejectStartup = reject;
});
let database;
async function wait(url, headers = {}) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    startup.signal.throwIfAborted();
    try {
      const response = await fetch(url, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok || [301, 302, 303, 307, 308].includes(response.status))
        return response;
    } catch {
      /* Wait for local services. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Packaged runtime did not become ready: ${url}`);
}
try {
  const { DesktopPgliteService } = await load("dist/runtime/pglite-service.js");
  const { ChildSupervisor } = await load("dist/runtime/child-supervisor.js");
  const { getAvailableLoopbackPort } = await load("dist/runtime/port.js");
  const { resolveDesktopRuntimeEntries } = await load(
    "dist/runtime/runtime-entry.js",
  );
  const entries = await resolveDesktopRuntimeEntries(
    "/no-source-workspace",
    app,
  );
  database = new DesktopPgliteService();
  const databaseUrl = await database.start(
    join(temporary, "database"),
    entries.databaseRunner,
  );
  const serverPort = await getAvailableLoopbackPort();
  let clientPort = await getAvailableLoopbackPort();
  while (clientPort === serverPort)
    clientPort = await getAvailableLoopbackPort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const clientUrl = `http://localhost:${clientPort}`;
  const credential = randomBytes(32).toString("base64url");
  const common = {
    NODE_ENV: "production",
    DEPLOYMENT_MODE: "self-host",
    SELF_HOST_MODE: "core-local",
    NEXT_PUBLIC_SELF_HOST_MODE: "core-local",
    DESKTOP_INTERNAL_CREDENTIAL: credential,
    NEXT_PUBLIC_APP_URL: clientUrl,
    NEXT_PUBLIC_API_URL: clientUrl,
    NEXT_PUBLIC_BASE_URL: clientUrl,
    BETTER_AUTH_URL: clientUrl,
  };
  for (const [name, entry, env] of [
    [
      "server",
      entries.server,
      {
        ...common,
        HOST: "127.0.0.1",
        PORT: String(serverPort),
        DATABASE_URL: databaseUrl,
        CORE_MIGRATION_DIALECT: "pglite",
        BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
        EXTERNAL_PROVIDER_CREDENTIAL_SECRET:
          randomBytes(32).toString("base64url"),
        SERVER_MESSAGE_CATALOG_PATH: join(app, "runtime/server/messages"),
        LOCAL_STORAGE_PATH: join(temporary, "uploads"),
        LOCAL_STORAGE_CACHE_PATH: join(temporary, "cache"),
        ELEVATION_DATA_PATH: join(temporary, "elevation"),
        SELF_HOST_OPERATIONS_PATH: join(temporary, "operations"),
        STORAGE_STRATEGY: "LOCAL",
        AI_PROVIDER: "none",
        MAP_PROVIDER: "none",
        ACTIVITY_MAP_THUMB_PROVIDER: "local",
        SOCIAL_AUTH_ENABLED: "false",
        THIRD_PARTY_SYNC_ENABLED: "false",
        TELEMETRY_ENABLED: "false",
        TRUSTED_ORIGINS: clientUrl,
      },
    ],
    [
      "client",
      entries.client,
      {
        ...common,
        HOSTNAME: "localhost",
        PORT: String(clientPort),
        CLIENT_INTERNAL_API_URL: `${serverUrl}/api`,
      },
    ],
  ]) {
    const child = new ChildSupervisor({
      name,
      entry,
      bootstrap: join(app, "dist/runtime/child-bootstrap.js"),
      env,
      maximumRestarts: 0,
    });
    children.push(child);
    child.on("child-error", (details) =>
      rejectStartup(
        Object.assign(new Error(details.message), { code: details.code }),
      ),
    );
    child.once("failed", (details) =>
      rejectStartup(new Error(`Packaged ${details.name} exited`)),
    );
    child.start();
  }
  await Promise.race([
    startupFailure,
    Promise.all([
      wait(`${serverUrl}/api/health/ready`, {
        "x-trainingload-desktop-credential": credential,
      }),
      wait(clientUrl),
    ]),
  ]);
  assert.equal((await fetch(`${serverUrl}/api/health/ready`)).status, 403);
  assert.ok(
    (await wait(`${clientUrl}/api/health/ready`)).ok,
    "BFF forwards its private credential",
  );
  const response = await fetch(clientUrl);
  assert.ok(response.ok, `page status ${response.status}`);
  const html = await response.text();
  const asset = html.match(
    /(?:src|href)="([^\"]*\/_next\/static\/[^\"]+)"/,
  )?.[1];
  assert.ok(asset, "rendered page references bundled static assets");
  assert.ok(
    (await fetch(new URL(asset.replaceAll("&amp;", "&"), clientUrl))).ok,
  );
  assert.equal(
    (await fetch(`${clientUrl}/en/desktop-smoke-missing-route`)).status,
    404,
  );
  const image = await fetch(
    `${clientUrl}/_next/image?url=%2FLOGO.png&w=64&q=75`,
  );
  assert.ok(image.ok, `Next image optimizer status ${image.status}`);
  assert.ok(image.headers.get("content-type")?.startsWith("image/"));
  const require = createRequire(join(app, "runtime/server/package.json"));
  assert.ok(
    require("geo-tz").find(31.2304, 121.4737).includes("Asia/Shanghai"),
  );
  await require("sharp")({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const duckdb =
    await require("@duckdb/node-api").DuckDBInstance.create(":memory:");
  const connection = await duckdb.connect();
  try {
    await connection.run("SELECT 42");
  } finally {
    connection.closeSync();
    duckdb.closeSync();
  }
  await Promise.all(children.map((child) => child.stop()));
  assert.equal(
    resourceFingerprint(app),
    originalResources,
    "runtime must not modify signed application resources",
  );
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "relocated runtime",
        "Core migrations",
        "Prisma startup",
        "Next page and static asset",
        "Next 404 and image optimizer",
        "BFF internal credential",
        "geo-tz",
        "sharp",
        "DuckDB",
        "immutable application resources",
      ],
    }),
  );
} catch (error) {
  console.error("DESKTOP_RUNTIME_SMOKE_FAILED", error);
  throw error;
} finally {
  startup.abort();
  await Promise.allSettled(children.map((child) => child.stop()));
  await database?.stop();
  rmSync(temporary, { recursive: true, force: true });
}
