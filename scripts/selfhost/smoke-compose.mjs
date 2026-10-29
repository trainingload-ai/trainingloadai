import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolateComposeEnvironment } from "./compose-environment.mjs";
import { evaluateComposeState, parseComposePs } from "./compose-state.mjs";

export { evaluateComposeState, parseComposePs } from "./compose-state.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
let commandEnvironment = process.env;

function parseArguments(argv) {
  const options = {
    mode: "source",
    keepOnFailure: false,
    timeoutSeconds: 600,
    httpPort: 18080 + Math.floor(Math.random() * 1000),
    migrateImage: null,
    serverImage: null,
    clientImage: null,
  };
  for (const argument of argv) {
    if (argument === "--") continue;
    if (argument === "--keep-on-failure") options.keepOnFailure = true;
    else if (argument.startsWith("--mode=")) options.mode = argument.slice(7);
    else if (argument.startsWith("--timeout=")) {
      options.timeoutSeconds = Number(argument.slice(10));
    } else if (argument.startsWith("--http-port=")) {
      options.httpPort = Number(argument.slice(12));
    } else if (argument.startsWith("--migrate-image=")) {
      options.migrateImage = argument.slice(16);
    } else if (argument.startsWith("--server-image=")) {
      options.serverImage = argument.slice(15);
    } else if (argument.startsWith("--client-image=")) {
      options.clientImage = argument.slice(15);

    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!["source", "prebuilt"].includes(options.mode)) {
    throw new Error("--mode must be source or prebuilt");
  }
  if (
    !Number.isInteger(options.httpPort) ||
    options.httpPort < 1024 ||
    options.httpPort > 64535
  ) {
    throw new Error("--http-port must be an unprivileged TCP port");
  }
  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds < 30) {
    throw new Error("--timeout must be at least 30 seconds");
  }
  if (options.mode === "prebuilt") {
    for (const key of ["migrateImage", "serverImage", "clientImage"]) {
      if (!options[key])
        throw new Error(
          `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required in prebuilt mode`,
        );
    }
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    input: options.input,
    env: { ...commandEnvironment, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture
      ? `\n${result.stdout ?? ""}${result.stderr ?? ""}`
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}${detail}`,
    );
  }
  return result;
}

function runSelfHost(args) {
  if (["init", "start", "stop", "backup", "restore", "uninstall"].includes(args[0]) && !args.includes("--dry-run")) {
    runSelfHost([...args, "--dry-run"]);
  }
  const result = run(
    process.execPath,
    [resolve(repositoryRoot, "scripts/selfhost/cli.mjs"), ...args, "--json"],
    { capture: true },
  );
  const payload = JSON.parse(result.stdout);
  if (!payload.ok) {
    throw new Error(
      `self-host ${args[0]} failed: ${payload.error?.code ?? payload.summary}`,
    );
  }
  return payload;
}

export function smokeCleanupFailure(result, label) {
  if (!result?.error && result?.status === 0) return null;
  return new Error(`${label} failed with exit ${String(result?.status)}`, {
    cause: result?.error ?? undefined,
  });
}

export function aggregateSmokeCleanupFailure(terminalError, cleanupErrors) {
  return new AggregateError(
    [...(terminalError ? [terminalError] : []), ...cleanupErrors],
    "self-host Compose smoke cleanup failed",
  );
}

export async function cleanupSmokeResources({
  cleanupStacks,
  stackTouched,
  workspace,
  runDocker = (args, options) => run("docker", args, options),
  removeWorkspace = (path, options) => rm(path, options),
  uid = typeof process.getuid === "function" ? process.getuid() : null,
  gid = typeof process.getgid === "function" ? process.getgid() : null,
}) {
  const cleanupErrors = [];
  const runCleanup = async (args, label) => {
    try {
      const result = await runDocker(args, { allowFailure: true });
      const failure = smokeCleanupFailure(result, label);
      if (failure) cleanupErrors.push(failure);
    } catch (error) {
      cleanupErrors.push(
        new Error(`${label} could not execute`, { cause: error }),
      );
    }
  };
  if (stackTouched) {
    for (const [index, stack] of cleanupStacks.toReversed().entries()) {
      const label = `Compose smoke stack ${index + 1}`;
      await runCleanup([...stack.composeArgs, "stop"], `${label} stop cleanup`);
      if (Number.isInteger(uid) && Number.isInteger(gid)) {
        await runCleanup(
          [
            ...stack.composeArgs,
            "run",
            "--rm",
            "--no-deps",
            "--user",
            "0:0",
            "permissions",
            "node",
            "-e",
            `const fs=require('node:fs'),path=require('node:path');function own(file){const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new Error('Unexpected symlink in smoke state');if(stat.isDirectory())for(const name of fs.readdirSync(file))own(path.join(file,name));fs.chownSync(file,${uid},${gid});}own('/state');`,
          ],
          `${label} ownership cleanup`,
        );
      }
      await runCleanup(
        [...stack.composeArgs, "down", "--remove-orphans"],
        `${label} resource cleanup`,
      );
    }
  }
  try {
    await removeWorkspace(workspace, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }
  return cleanupErrors;
}

async function materializeReleaseDirectory(directory) {
  await mkdir(resolve(directory, "docker/selfhost"), { recursive: true });
  for (const file of [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ]) {
    await copyFile(resolve(repositoryRoot, file), resolve(directory, file));
  }
}

async function writeEnvironmentFile(
  path,
  { dataRoot, images, packageVersion, projectName, publicOrigin, httpPort, secrets },
) {
  await writeFile(
    path,
    [
      `SELF_HOST_AUTH_SECRET=${secrets.auth}`,
      `SELF_HOST_DATABASE_PASSWORD=${secrets.database}`,
      `SELF_HOST_INTEGRATION_SECRET=${secrets.integration}`,
      `SELF_HOST_PROJECT_NAME=${projectName}`,
      `SELF_HOST_SITE_ADDRESS=${publicOrigin}`,
      "SELF_HOST_HTTP_BIND=127.0.0.1",
      `SELF_HOST_HTTP_PORT=${httpPort}`,
      `SELF_HOST_DATA_ROOT=${dataRoot}`,
      `SELF_HOST_MIGRATE_IMAGE=${images.migrate}`,
      `SELF_HOST_SERVER_IMAGE=${images.server}`,
      `SELF_HOST_CLIENT_IMAGE=${images.client}`,
      `SELF_HOST_VERSION=${packageVersion}`,
      "SELF_HOST_MODE=core-local",
      "TELEMETRY_ENABLED=false",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}

function composeArguments({ environmentFile, projectDirectory, projectName }) {
  return [
    "compose",
    "--project-name",
    projectName,
    "--project-directory",
    projectDirectory,
    "--env-file",
    environmentFile,
    "-f",
    resolve(projectDirectory, "compose.yml"),
  ];
}

function dockerAvailable() {
  const docker = spawnSync("docker", ["version"], {
    env: commandEnvironment,
    stdio: "ignore",
    timeout: 15_000,
  });
  if (docker.error || docker.status !== 0) return false;
  const compose = spawnSync("docker", ["compose", "version"], {
    env: commandEnvironment,
    stdio: "ignore",
    timeout: 15_000,
  });
  return !compose.error && compose.status === 0;
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function fetchOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return false;
    if (url.endsWith("/api/health/ready")) {
      const payload = await response.json().catch(() => null);
      const value = payload?.data ?? payload;
      return value?.status === "ready";
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForReady(composeArgs, publicOrigin, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastWaiting = ["no status yet"];
  while (Date.now() < deadline) {
    const result = run(
      "docker",
      [...composeArgs, "ps", "--all", "--format", "json"],
      { capture: true, allowFailure: true },
    );
    if (result.status === 0) {
      const state = evaluateComposeState(parseComposePs(result.stdout));
      if (state.failures.length > 0) throw new Error(state.failures.join("; "));
      lastWaiting = state.waiting;
      if (
        state.waiting.length === 0 &&
        (await fetchOk(`${publicOrigin}/api/health/ready`)) &&
        (await fetchOk(`${publicOrigin}/`))
      ) {
        return;
      }
    }
    await sleep(2_000);
  }
  throw new Error(`Compose did not become ready: ${lastWaiting.join(", ")}`);
}

async function requireDirectory(path) {
  const value = await stat(path);
  if (!value.isDirectory()) throw new Error(`Expected directory: ${path}`);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, value: payload?.data ?? payload };
}

async function assertOwnerBootstrap(composeArgs, publicOrigin) {
  const pending = await fetchJson(`${publicOrigin}/api/self-host/bootstrap/status`);
  if (!pending.response.ok || pending.value?.state !== "PENDING" ||
      pending.value?.accessMode !== "local-owner") throw new Error("Expected an uninitialized local-owner instance");
  const initialized = await fetchJson(`${publicOrigin}/api/self-host/bootstrap/local-owner`, {
    method: "POST", body: JSON.stringify({name: "Local Owner"}),
    headers: {origin: publicOrigin, "sec-fetch-site":"same-origin"},
  });
  if (!initialized.response.ok || initialized.value?.state !== "READY") {
    throw new Error(`Username initialization failed with HTTP ${initialized.response.status}`);
  }
  const replay = await fetchJson(`${publicOrigin}/api/self-host/bootstrap/local-owner`, {
    method: "POST", body: JSON.stringify({name: "Second Owner"}),
    headers: {origin: publicOrigin, "sec-fetch-site":"same-origin"},
  });
  if (replay.response.status !== 409) throw new Error("A second Owner was not rejected");
  const email = psqlScalar(composeArgs, 'SELECT email FROM t_user');
  return {email};
}

async function assertOwnerSession(publicOrigin) {
  const response = await fetch(`${publicOrigin}/api/proxy/auth/self-host/local-owner`, {
    method: "POST", headers: {origin: publicOrigin, "sec-fetch-site":"same-origin", "content-type":"application/json"},
    body:"{}", signal:AbortSignal.timeout(10_000),
  });
  const cookies=response.headers.getSetCookie();
  if(!response.ok || !cookies.some(value=>value.includes("Path=/"))) {
    throw new Error(`Local Owner session failed with HTTP ${response.status}`);
  }
  const cookie=cookies.map(value=>value.split(';')[0]).join('; ');
  const session=await fetchJson(`${publicOrigin}/api/proxy/auth/get-session`,{headers:{cookie}});
  if(!session.response.ok || !session.value?.user) throw new Error("Owner session cookie was not forwarded");
  for(const endpoint of ["/api/v2/home?locale=zh", "/api/v2/activities/feed?page=1&perPage=5&orderBy=startTime&orderDirection=desc&timeZone=UTC"]) {
    const result=await fetchJson(`${publicOrigin}${endpoint}`,{headers:{cookie}});
    if(!result.response.ok) throw new Error(`${endpoint} returned HTTP ${result.response.status}`);
  }
  const capabilities=await fetchJson(`${publicOrigin}/api/runtime/capabilities`,{headers:{cookie}});
  if(!capabilities.response.ok || capabilities.value?.edition!=="self-host" || capabilities.value?.singleOwner!==true) {
    throw new Error("Runtime capabilities do not identify single-owner Self-host");
  }
}

function psqlScalar(composeArgs, sql) {
  return run(
    "docker",
    [
      ...composeArgs,
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
    ],
    { capture: true },
  ).stdout.trim();
}

function createRestoreFixtures(composeArgs, ownerEmail, suffix) {
  const activityHash = `selfhost-restore-smoke-${suffix}`;
  const inserted = psqlScalar(
    composeArgs,
    `WITH inserted AS (
       INSERT INTO "t_activity" ("updated_at", "hash_id", "user_id", "activity_name")
       SELECT CURRENT_TIMESTAMP, '${activityHash}', "id", 'Restore smoke fixture'
       FROM "t_user" WHERE "email" = '${ownerEmail}'
       RETURNING "id"
     ) SELECT "id" FROM inserted`,
  );
  if (!/^\d+$/.test(inserted)) {
    throw new Error(`Failed to create restore activity fixture: ${inserted}`);
  }

  const fileContent = `self-host restore fixture ${suffix}\n`;
  const encodedFile = Buffer.from(fileContent).toString("base64");
  run("docker", [
    ...composeArgs,
    "exec",
    "-T",
    "server",
    "node",
    "-e",
    `const fs=require('node:fs');fs.mkdirSync('/data/uploads/selfhost-restore-smoke',{recursive:true});fs.writeFileSync('/data/uploads/selfhost-restore-smoke/fixture.txt',Buffer.from(${JSON.stringify(encodedFile)},'base64'),{mode:0o600});`,
  ]);
  return { activityHash, fileContent };
}

function assertRestoreFixtures(composeArgs, fixture) {
  const activityCount = psqlScalar(
    composeArgs,
    `SELECT COUNT(*) FROM "t_activity" WHERE "hash_id" = '${fixture.activityHash}'`,
  );
  if (activityCount !== "1") {
    throw new Error(
      `Restored activity fixture count is ${activityCount}, expected 1`,
    );
  }
  const restoredFile = run(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "server",
      "node",
      "-e",
      "process.stdout.write(require('node:fs').readFileSync('/data/uploads/selfhost-restore-smoke/fixture.txt','utf8'));",
    ],
    { capture: true },
  ).stdout;
  if (restoredFile !== fixture.fileContent) {
    throw new Error("Restored upload fixture content does not match");
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const composeEnvironmentSources = await Promise.all(
    [
      "compose.yml",
      ...(options.mode === "source" ? ["compose.build.yml"] : []),
    ].map((name) => readFile(resolve(repositoryRoot, name), "utf8")),
  );
  commandEnvironment = isolateComposeEnvironment(
    process.env,
    composeEnvironmentSources,
  );
  if (!dockerAvailable()) {
    console.error(
      "[selfhost-compose-smoke] SKIP B-SH8A-001 (includes unresolved Docker gates from SH5-SH7): Docker Engine with Compose v2 is unavailable",
    );
    process.exitCode = 77;
    return;
  }

  const packageJson = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const workspace = await mkdtemp(
    join(tmpdir(), "trainingload-selfhost-smoke-"),
  );
  let succeeded = false;
  let stackTouched = false;
  let terminalError = null;
  const cleanupStacks = [];
  try {
    const dataRoot = join(workspace, "data");
    const secrets = {auth:randomBytes(32).toString("hex"), database:randomBytes(32).toString("hex"), integration:randomBytes(32).toString("hex")};
    const suffix = randomBytes(4).toString("hex");
    const projectName = `trainingload-smoke-${suffix}`;
    const restoreProjectName = `${projectName}-restore`;
    const publicOrigin = `http://127.0.0.1:${options.httpPort}`;
    const sourceImages = {
      migrate: `${projectName}-migrate:${packageJson.version}`,
      server: `${projectName}-server:${packageJson.version}`,
      client: `${projectName}-client:${packageJson.version}`,
    };
    const images =
      options.mode === "source"
        ? sourceImages
        : {
            migrate: options.migrateImage,
            server: options.serverImage,
            client: options.clientImage,
          };
    const environmentFile = join(workspace, ".env.selfhost");
    await materializeReleaseDirectory(workspace);
    await writeEnvironmentFile(environmentFile, {
      dataRoot,
      images,
      packageVersion: packageJson.version,
      secrets,
      projectName,
      publicOrigin,
      httpPort: options.httpPort,
    });
    composeEnvironmentSources.push(await readFile(environmentFile, "utf8"));
    commandEnvironment = isolateComposeEnvironment(
      process.env,
      composeEnvironmentSources,
    );

    const composeArgs = composeArguments({
      environmentFile,
      projectDirectory: repositoryRoot,
      projectName,
    });
    if (options.mode === "source") {
      composeArgs.push(
        "-f",
        resolve(repositoryRoot, "compose.build.yml"),
      );
    }
    cleanupStacks.push({ composeArgs, dataRoot });

    runSelfHost(["init", "--directory", workspace]);
    run("docker", [...composeArgs, "config", "--quiet"]);
    stackTouched = true;
    run("docker", [
      ...composeArgs,
      "up",
      "-d",
      ...(options.mode === "source" ? ["--build"] : ["--pull", "never"]),
    ]);
    await waitForReady(composeArgs, publicOrigin, options.timeoutSeconds);

    const owner = await assertOwnerBootstrap(composeArgs, publicOrigin);
    await assertOwnerSession(publicOrigin);

    const migrationCount = run(
      "docker",
      [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "trainingload",
        "-d",
        "trainingload",
        "-Atc",
        'SELECT COUNT(*) FROM "_trainingload_core_migrations"',
      ],
      { capture: true },
    ).stdout.trim();
    if (!/^\d+$/.test(migrationCount) || Number(migrationCount) < 1) {
      throw new Error(
        `Unexpected successful migration count: ${migrationCount}`,
      );
    }

    run("docker", [...composeArgs, "restart", "server", "client"]);
    await waitForReady(composeArgs, publicOrigin, options.timeoutSeconds);
    const initializedStatus = await fetchJson(
      `${publicOrigin}/api/self-host/bootstrap/status`,
    );
    if (
      !initializedStatus.response.ok ||
      initializedStatus.value?.state !== "READY" ||
      initializedStatus.value?.bootstrapRequired !== false
    ) {
      throw new Error("Owner state did not survive a service restart");
    }

    await assertOwnerSession(publicOrigin);

    run("docker", [...composeArgs, "up", "-d"]);
    await waitForReady(composeArgs, publicOrigin, options.timeoutSeconds);
    const migrationCountAfterRestart = run(
      "docker",
      [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "trainingload",
        "-d",
        "trainingload",
        "-Atc",
        'SELECT COUNT(*) FROM "_trainingload_core_migrations"',
      ],
      { capture: true },
    ).stdout.trim();
    if (migrationCountAfterRestart !== migrationCount) {
      throw new Error(
        `Migration replay changed completed count: ${migrationCount} -> ${migrationCountAfterRestart}`,
      );
    }

    const fixture = createRestoreFixtures(composeArgs, owner.email, suffix);
    const backup = runSelfHost([
      "backup",
      "--output",
      "clean-restore-smoke",
      "--directory",
      workspace,
    ]);
    runSelfHost(["stop", "--directory", workspace]);

    const restoreDirectory = join(workspace, "clean-restore");
    const restoreDataRoot = join(restoreDirectory, "data");
    const restoreEnvironmentFile = join(restoreDirectory, ".env.selfhost");
    await mkdir(restoreDirectory, { recursive: true });
    await materializeReleaseDirectory(restoreDirectory);
    await writeEnvironmentFile(restoreEnvironmentFile, {
      dataRoot: restoreDataRoot,
      images,
      packageVersion: packageJson.version,
      secrets,
      projectName: restoreProjectName,
      publicOrigin,
      httpPort: options.httpPort,
    });
    composeEnvironmentSources.push(
      await readFile(restoreEnvironmentFile, "utf8"),
    );
    commandEnvironment = isolateComposeEnvironment(
      process.env,
      composeEnvironmentSources,
    );
    runSelfHost(["init", "--directory", restoreDirectory]);
    const restoreComposeArgs = composeArguments({
      environmentFile: restoreEnvironmentFile,
      projectDirectory: restoreDirectory,
      projectName: restoreProjectName,
    });
    cleanupStacks.push({
      composeArgs: restoreComposeArgs,
      dataRoot: restoreDataRoot,
    });
    const restored = runSelfHost([
      "restore",
      backup.details.backupPath,
      "--directory",
      restoreDirectory,
    ]);
    if (!restored.details.ready) {
      throw new Error("Clean restore did not report a ready instance");
    }
    await waitForReady(
      restoreComposeArgs,
      publicOrigin,
      options.timeoutSeconds,
    );
    await assertOwnerSession(publicOrigin);
    assertRestoreFixtures(restoreComposeArgs, fixture);

    for (const directory of [
      join(restoreDataRoot, "postgres"),
      join(restoreDataRoot, "uploads"),
      join(restoreDataRoot, "cache", "client"),
      join(restoreDataRoot, "operations"),
    ]) {
      await requireDirectory(directory);
    }
    runSelfHost(["uninstall", "--dry-run", "--directory", restoreDirectory]);
    const uninstalled = runSelfHost([
      "uninstall",
      "--directory",
      restoreDirectory,
    ]);
    if (
      !uninstalled.details.dataRetained ||
      !uninstalled.details.configurationRetained
    ) {
      throw new Error("Safe uninstall did not retain restored instance data");
    }
    await requireDirectory(join(restoreDataRoot, "postgres"));
    await requireDirectory(join(restoreDataRoot, "uploads"));
    runSelfHost(["start", "--dry-run", "--directory", restoreDirectory]);
    runSelfHost(["start", "--directory", restoreDirectory]);
    await waitForReady(
      restoreComposeArgs,
      publicOrigin,
      options.timeoutSeconds,
    );
    await assertOwnerSession(publicOrigin);
    assertRestoreFixtures(restoreComposeArgs, fixture);
    succeeded = true;
    console.log(
      `[selfhost-compose-smoke] PASS mode=${options.mode} migrations=${migrationCount} restore=${restored.details.backupId} origin=${publicOrigin}`,
    );
  } catch (error) {
    terminalError = error;
    throw error;
  } finally {
    if (!succeeded && options.keepOnFailure) {
      console.error(
        `[selfhost-compose-smoke] preserved failure workspace: ${workspace}`,
      );
    } else {
      const cleanupErrors = await cleanupSmokeResources({
        cleanupStacks,
        stackTouched,
        workspace,
      });
      if (cleanupErrors.length) {
        throw aggregateSmokeCleanupFailure(terminalError, cleanupErrors);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
