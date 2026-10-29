import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import { verifyBackupBundle } from "./backup-artifact.mjs";
import {
  defaultStreamRunner,
  executeManagementCommand,
  isSupportedHostPlatform,
  parseEnvironmentFile,
  parseManagementArguments,
  SELF_HOST_CLI_EXIT,
  SELF_HOST_HISTORY_LIMITS,
} from "./management-core.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const workspaces = [];

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

function healthyGatewayResponse() {
  return new Response(
    JSON.stringify({
      status: "ready",
      timestamp: "2026-10-17T00:00:00.000Z",
      checks: { configuration: "ready", database: "ready" },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

async function createBundle() {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-cli-test-"));
  workspaces.push(directory);
  for (const file of [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ]) {
    await fs.copyFile(resolve(repositoryRoot, file), resolve(directory, file));
  }
  await fs.mkdir(resolve(directory, "docker/selfhost"), { recursive: true });
  return directory;
}

function dependencies(overrides = {}) {
  let sequence = 0;
  return {
    cwd: repositoryRoot,
    now: () => new Date(`2026-10-17T00:00:0${sequence++}.000Z`),
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    randomBytes: (size) => Buffer.alloc(size, 0xab),
    fetcher: async () => healthyGatewayResponse(),
    ...overrides,
  };
}

function options(command, directory, overrides = {}) {
  return {
    command,
    directory,
    dryRun: false,
    json: true,
    source: false,
    tail: 200,
    services: [],
    output: null,
    backupPath: null,
    releasePath: null,
    rollbackVersion: null,
    ownerEmail: null,
    ownerName: null,
    acceptNoApplicationRollback: false,
    deleteData: false,
    confirmDataRoot: null,
    ...overrides,
  };
}

async function writeOperationLockFixture(directory, overrides = {}) {
  const stateDirectory = resolve(directory, ".selfhost");
  const path = resolve(stateDirectory, "operation.lock.json");
  await fs.mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "trainingload-selfhost-operation-lock",
        operationId: "75000000-0000-4000-8000-000000000014",
        command: "backup",
        processId: process.pid,
        startedAt: "2026-10-17T00:00:00.000Z",
        ...overrides,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return path;
}

async function writeOperationReclaimFixture(
  directory,
  lockPath,
  overrides = {},
) {
  const lockContents = await fs.readFile(lockPath);
  const lock = JSON.parse(lockContents.toString("utf8"));
  const path = resolve(directory, ".selfhost/operation.lock.reclaim");
  await fs.writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "trainingload-selfhost-operation-reclaim",
        operationId: "75050000-0000-4000-8000-000000000014",
        command: "start",
        processId: process.pid,
        startedAt: "2026-10-17T11:59:59.000Z",
        observedOperationId: lock.operationId,
        observedSha256: createHash("sha256").update(lockContents).digest("hex"),
        ...overrides,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return path;
}

function readyRows() {
  return [
    { Service: "permissions", State: "exited", ExitCode: 0 },
    { Service: "postgres", State: "running", Health: "healthy" },
    { Service: "migrate", State: "exited", ExitCode: 0 },
    { Service: "server", State: "running", Health: "healthy" },
    { Service: "client", State: "running", Health: "healthy" },
    { Service: "gateway", State: "running", Health: "healthy" },
  ];
}

function dockerRunner({
  rows = readyRows(),
  logs = "",
  unavailable = false,
  handle = null,
} = {}) {
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (unavailable) {
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: new Error("Docker daemon is unavailable"),
      };
    }
    const handled = handle?.(args, calls);
    if (handled) return handled;
    if (args[0] === "version") {
      return { status: 0, stdout: "27.5.1\n", stderr: "", error: null };
    }
    if (args[0] === "info" && args.at(-1) === "{{json .}}") {
      return {
        status: 0,
        stdout: `${JSON.stringify({
          Architecture: process.arch === "x64" ? "amd64" : process.arch,
          OSType: "linux",
        })}\n`,
        stderr: "",
        error: null,
      };
    }
    if (args[0] === "info" && args.at(-1) === "{{json .SecurityOptions}}") {
      return { status: 0, stdout: "[]\n", stderr: "", error: null };
    }
    if (args[0] === "compose" && args[1] === "version") {
      return { status: 0, stdout: "2.32.4\n", stderr: "", error: null };
    }
    if (args.includes("ps")) {
      const value = typeof rows === "function" ? rows(calls) : rows;
      return {
        status: 0,
        stdout: `${JSON.stringify(value)}\n`,
        stderr: "",
        error: null,
      };
    }
    if (args.includes("logs")) {
      return { status: 0, stdout: logs, stderr: "", error: null };
    }
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { calls, runner };
}

function copyDirectoryContentsSync(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    cpSync(resolve(source, name), resolve(destination, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
}

const migrationInventory = [
  {
    id: "20261017090000_self_host_owner_bootstrap",
    checksum: "a".repeat(64),
  },
];
const coreRecordCounts = {
  selfHostInstance: 1,
  ownerReady: true,
  user: 2,
  activity: 3,
};
const sourceImageReferences = {
  migrate: `example/source-migrate@sha256:${"7".repeat(64)}`,
  server: `example/source-server@sha256:${"4".repeat(64)}`,
  client: `example/source-client@sha256:${"5".repeat(64)}`,
  docs: `example/source-docs@sha256:${"6".repeat(64)}`,
};

test("environment parser matches the supported Compose value subset", () => {
  const values = parseEnvironmentFile(String.raw`
MAIL_PASSWORD='Let\'s-$afe#literal'
MAP_ATTRIBUTION="Operator\tMaps # literal"
AI_BASE_URL=https://ai.example.test/v1 # operator comment
MAP_TILE_URL=https://tiles.example.test/{z}/{x}/{y}.png#fragment
`);

  assert.equal(values.get("MAIL_PASSWORD"), "Let's-$afe#literal");
  assert.equal(values.get("MAP_ATTRIBUTION"), "Operator\tMaps # literal");
  assert.equal(values.get("AI_BASE_URL"), "https://ai.example.test/v1");
  assert.equal(
    values.get("MAP_TILE_URL"),
    "https://tiles.example.test/{z}/{x}/{y}.png#fragment",
  );

  for (const source of [
    "AI_API_KEY=$HOST_SECRET\n",
    'AI_API_KEY="${HOST_SECRET}"\n',
    'MAP_ATTRIBUTION="unterminated\n',
    String.raw`MAP_ATTRIBUTION="bad\q"` + "\n",
    'MAP_ATTRIBUTION="valid" trailing\n',
    'MAP_ATTRIBUTION="valid"#not-a-comment\n',
    "export AI_PROVIDER=none\n",
  ]) {
    assert.throws(
      () => parseEnvironmentFile(source),
      (error) => error?.code === "SELF_HOST_CONFIG_SYNTAX_INVALID",
    );
  }
});

test("host platform policy matches the four release matrix targets", () => {
  for (const [platform, architecture] of [
    ["linux", "x64"],
    ["linux", "arm64"],
    ["darwin", "arm64"],
    ["win32", "x64"],
  ]) {
    assert.equal(isSupportedHostPlatform(platform, architecture), true);
  }
  for (const [platform, architecture] of [
    ["darwin", "x64"],
    ["win32", "arm64"],
    ["freebsd", "x64"],
    ["linux", "riscv64"],
  ]) {
    assert.equal(isSupportedHostPlatform(platform, architecture), false);
  }
});

async function useDigestBoundSourceImages(directory) {
  const path = resolve(directory, ".env.selfhost");
  let text = await fs.readFile(path, "utf8");
  for (const [name, reference] of Object.entries(sourceImageReferences)) {
    text = text.replace(
      new RegExp(`^SELF_HOST_${name.toUpperCase()}_IMAGE=.*$`, "m"),
      `SELF_HOST_${name.toUpperCase()}_IMAGE=${reference}`,
    );
  }
  await fs.writeFile(path, text);
}

function upgradeReleaseManifest({ rollback = true } = {}) {
  const digest = (digit) => `sha256:${digit.repeat(64)}`;
  return {
    releaseVersion: "1.1.14",
    configSchemaVersion: 1,
    composeSchemaVersion: 1,
    source: { revision: "a".repeat(40) },
    images: {
      migrate: { reference: `example/migrate@${digest("4")}` },
      server: { reference: `example/server@${digest("1")}` },
      client: { reference: `example/client@${digest("2")}` },
      docs: { reference: `example/docs@${digest("3")}` },
    },
    upgrade: {
      supportedSourceVersions: ["1.1.13"],
      applicationRollbackTo: rollback ? ["1.1.13"] : [],
      backupRequired: true,
    },
    database: {
      schemaEpoch: 1,
      migrations: migrationInventory.map((migration) => ({
        ...migration,
        phase: "baseline",
        releaseVersion: "1.1.13",
      })),
    },
  };
}

function lifecycleDocker({
  dataRoot,
  bundleRoot = null,
  runtimeMap = { provider: "none", styleUrl: null, tileUrl: null },
  restore = false,
  logs = "",
  beforePgRestore = null,
  pgRestoreFails = false,
  quiesceFails = false,
  uploadInspectionFails = false,
  upgradeFails = false,
  rollbackFails = false,
  ownerReady = true,
} = {}) {
  let psCalls = 0;
  let upCalls = 0;
  const docker = dockerRunner({
    rows: () => (restore && psCalls++ === 0 ? [] : readyRows()),
    logs,
    handle: (args) => {
      if (args[0] === "pull") {
        return { status: 0, stdout: "pulled\n", stderr: "", error: null };
      }
      if (args[0] === "image" && args[1] === "inspect") {
        return {
          status: 0,
          stdout: args.includes("--format")
            ? `${JSON.stringify([args.at(-1)])}\n`
            : "[]\n",
          stderr: "",
          error: null,
        };
      }
      if (args.includes("up")) {
        upCalls += 1;
        if (
          (upgradeFails && upCalls === 2) ||
          (rollbackFails && upCalls === 1)
        ) {
          return {
            status: 1,
            stdout: "",
            stderr: "injected upgrade start failure",
            error: null,
          };
        }
      }
      if (quiesceFails && args.includes("stop") && args.includes("client")) {
        return {
          status: 1,
          stdout: "",
          stderr: "injected stop failure",
          error: null,
        };
      }
      const commandIndex = args.indexOf("--command");
      if (commandIndex >= 0) {
        const sql = args[commandIndex + 1];
        if (sql.includes("current_setting('server_version')")) {
          return {
            status: 0,
            stdout: `${JSON.stringify({
              version: "17.10",
              postgisInstalled: false,
            })}\n`,
            stderr: "",
            error: null,
          };
        }
        if (sql.includes("pg_database_size")) {
          return { status: 0, stdout: "1048576\n", stderr: "", error: null };
        }
        if (
          sql.includes("to_regclass") &&
          sql.includes("_trainingload_core_migrations")
        ) {
          return { status: 0, stdout: "true\n", stderr: "", error: null };
        }
        if (sql.includes('FROM "_trainingload_core_migrations"')) {
          return {
            status: 0,
            stdout: `${JSON.stringify(migrationInventory)}\n`,
            stderr: "",
            error: null,
          };
        }
        if (sql.includes("_prisma_migrations")) {
          return {
            status: 0,
            stdout: `${JSON.stringify(migrationInventory)}\n`,
            stderr: "",
            error: null,
          };
        }
        if (sql.includes("selfHostInstance")) {
          return {
            status: 0,
            stdout: `${JSON.stringify({ ...coreRecordCounts, ownerReady })}\n`,
            stderr: "",
            error: null,
          };
        }
      }
      if (
        args.includes("server") &&
        args.at(-1).includes("/api/runtime/capabilities")
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 1,
            deployment: "self-host",
            mode: "core-local",
            ready: true,
            map: runtimeMap,
            capabilities: {
              database: {
                name: "database",
                required: true,
                state: "enabled",
                provider: "postgresql",
              },
              storage: {
                name: "storage",
                required: true,
                state: "enabled",
                provider: "local",
              },
              authentication: {
                name: "authentication",
                required: true,
                state: "enabled",
                provider: "local",
              },
              maps: {
                name: "maps",
                required: false,
                state: runtimeMap.provider === "none" ? "disabled" : "enabled",
                provider: runtimeMap.provider,
              },
            },
          }),
          stderr: "",
          error: null,
        };
      }
      if (
        args.includes("server") &&
        args.at(-1).includes("SELF_HOST_UPLOAD_BYTES")
      ) {
        if (uploadInspectionFails) {
          return {
            status: 1,
            stdout: "",
            stderr: "uploads exceed the file limit",
            error: null,
          };
        }
        return {
          status: 0,
          stdout: "SELF_HOST_UPLOAD_BYTES=4096",
          stderr: "",
          error: null,
        };
      }
      if (args.includes("permissions") && args.includes("node")) {
        const script = args.at(-1);
        const task = JSON.parse(script.match(/^const task = (.+);\n/)[1]);
        if (task.operation === "backup-uploads") {
          const stagingName = task.target.split("/")[3];
          copyDirectoryContentsSync(
            resolve(dataRoot, "uploads"),
            resolve(dataRoot, "backups", stagingName, "uploads"),
          );
          return { status: 0, stdout: "", stderr: "", error: null };
        }
        if (task.operation === "restore-uploads") {
          const suffix = ":/restore:ro";
          const restoreVolume = args.find(
            (argument) =>
              typeof argument === "string" && argument.endsWith(suffix),
          );
          assert.ok(restoreVolume, args.join(" "));
          const mountedBundleRoot = restoreVolume.slice(0, -suffix.length);
          if (bundleRoot) {
            assert.notEqual(resolve(mountedBundleRoot), resolve(bundleRoot));
          }
          copyDirectoryContentsSync(
            resolve(mountedBundleRoot, "uploads"),
            resolve(dataRoot, "uploads"),
          );
          return { status: 0, stdout: "", stderr: "", error: null };
        }
        return { status: 0, stdout: "", stderr: "", error: null };
      }
      return null;
    },
  });
  const streamCalls = [];
  const streamRunner = async (_command, args, streamOptions) => {
    streamCalls.push({ args, streamOptions });
    if (args.includes("pg_dump")) {
      await fs.writeFile(streamOptions.outputPath, "custom-postgres-dump\n", {
        mode: 0o600,
      });
      return { status: 0, stdout: "", stderr: "", error: null };
    }
    if (args.includes("pg_restore")) {
      if (beforePgRestore) await beforePgRestore(streamOptions);
      assert.equal(
        readFileSync(streamOptions.inputPath, "utf8"),
        "custom-postgres-dump\n",
      );
      return pgRestoreFails
        ? { status: 1, stdout: "", stderr: "restore failed", error: null }
        : { status: 0, stdout: "", stderr: "", error: null };
    }
    throw new Error(`unexpected stream command: ${args.join(" ")}`);
  };
  return { ...docker, streamCalls, streamRunner };
}

const abundantDisk = async () => ({
  bavail: 10_000_000_000n,
  blocks: 20_000_000_000n,
  bsize: 1n,
  files: 2_000_000n,
  ffree: 1_500_000n,
});

async function createManagedBackup(
  directory,
  backupId,
  output = "test-backup",
) {
  await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => `01000000-0000-4000-8000-${backupId.slice(-12)}`,
    }),
  );
  await fs.writeFile(
    resolve(directory, "data/uploads/activity.fit"),
    "fit-data\n",
  );
  await fs.mkdir(resolve(directory, "data/uploads/private"));
  await fs.writeFile(
    resolve(directory, "data/uploads/private/attachment.bin"),
    "attachment\n",
  );
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("backup", directory, { output }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => backupId,
    }),
  );
  return {
    docker,
    result,
    bundleRoot: resolve(directory, "data/backups", output),
  };
}

async function readOnlyOperationRecord(directory, result) {
  const path = resolve(directory, result.operationRecord);
  const record = JSON.parse(await fs.readFile(path, "utf8"));
  const stat = await fs.stat(path);
  return { path, record, stat };
}

async function schemaValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  const resultSchema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-cli-result.schema.json"),
      "utf8",
    ),
  );
  const recordSchema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-operation-record.schema.json"),
      "utf8",
    ),
  );
  const doctorSchema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-doctor-report.schema.json"),
      "utf8",
    ),
  );
  const doctorValidator = ajv.compile(doctorSchema);
  const diagnosticsSchema = JSON.parse(
    await fs.readFile(
      resolve(
        repositoryRoot,
        "schemas/self-host-diagnostics-bundle.schema.json",
      ),
      "utf8",
    ),
  );
  return {
    result: ajv.compile(resultSchema),
    record: ajv.compile(recordSchema),
    doctor: doctorValidator,
    diagnostics: ajv.compile(diagnosticsSchema),
  };
}

test("parses the bounded command surface and rejects ambiguous options", () => {
  assert.deepEqual(parseManagementArguments(["status", "--json"]), {
    command: "status",
    directory: ".",
    dryRun: false,
    json: true,
    source: false,
    tail: 200,
    services: [],
    output: null,
    backupPath: null,
    releasePath: null,
    rollbackVersion: null,
    ownerEmail: null,
    ownerName: null,
    acceptNoApplicationRollback: false,
    deleteData: false,
    confirmDataRoot: null,
  });
  assert.throws(
    () => parseManagementArguments(["start", "--tail", "500"]),
    /supported only by logs/,
  );
  assert.throws(
    () => parseManagementArguments(["logs", "--service", "unknown"]),
    /unsupported service/,
  );
  assert.equal(
    parseManagementArguments(["restore", "backup-v1", "--dry-run"]).backupPath,
    "backup-v1",
  );
  assert.equal(
    parseManagementArguments(["backup", "--output", "nightly"]).output,
    "nightly",
  );
  assert.deepEqual(
    parseManagementArguments([
      "diagnostics",
      "--output",
      "support",
      "--tail",
      "50",
      "--service",
      "server",
    ]),
    {
      command: "diagnostics",
      directory: ".",
      dryRun: false,
      json: false,
      source: false,
      tail: 50,
      services: ["server"],
      output: "support",
      backupPath: null,
      releasePath: null,
      rollbackVersion: null,
      ownerEmail: null,
      ownerName: null,
      acceptNoApplicationRollback: false,
      deleteData: false,
      confirmDataRoot: null,
    },
  );
  assert.equal(
    parseManagementArguments(["upgrade", "/tmp/release"]).releasePath,
    "/tmp/release",
  );
  assert.equal(
    parseManagementArguments(["rollback", "1.1.13"]).rollbackVersion,
    "1.1.13",
  );
  assert.equal(
    parseManagementArguments(["owner-recovery", "--email", "owner@example.com"])
      .ownerEmail,
    "owner@example.com",
  );
  assert.equal(
    parseManagementArguments([
      "owner-bootstrap",
      "--email",
      "owner@example.com",
      "--name",
      "  Local Owner  ",
    ]).ownerName,
    "Local Owner",
  );
  assert.deepEqual(
    parseManagementArguments([
      "uninstall",
      "--delete-data",
      "--confirm-data-root",
      "/srv/trainingload/data",
      "--dry-run",
    ]),
    {
      command: "uninstall",
      directory: ".",
      dryRun: true,
      json: false,
      source: false,
      tail: 200,
      services: [],
      output: null,
      backupPath: null,
      releasePath: null,
      rollbackVersion: null,
      ownerEmail: null,
      ownerName: null,
      acceptNoApplicationRollback: false,
      deleteData: true,
      confirmDataRoot: "/srv/trainingload/data",
    },
  );
  assert.throws(
    () => parseManagementArguments(["restore", "--dry-run"]),
    /requires a backup directory/,
  );
  assert.throws(
    () => parseManagementArguments(["upgrade", "--dry-run"]),
    /requires a release evidence directory/,
  );
  assert.throws(
    () => parseManagementArguments(["rollback", "--dry-run"]),
    /requires the exact previous release version/,
  );
  assert.throws(
    () => parseManagementArguments(["rollback", "previous"]),
    /semantic previous release version/,
  );
  assert.throws(
    () => parseManagementArguments(["uninstall", "--delete-data"]),
    /requires --confirm-data-root/,
  );
  assert.throws(
    () =>
      parseManagementArguments([
        "uninstall",
        "--confirm-data-root",
        "/srv/trainingload/data",
      ]),
    /requires --delete-data/,
  );
  assert.throws(
    () =>
      parseManagementArguments([
        "uninstall",
        "--delete-data",
        "--confirm-data-root",
        "data",
      ]),
    /must be an absolute path/,
  );
  assert.throws(
    () => parseManagementArguments(["owner-recovery", "--dry-run"]),
    /requires a valid --email/,
  );
  assert.throws(
    () =>
      parseManagementArguments(["owner-recovery", "--email", "not-an-email"]),
    /requires a valid --email/,
  );
  assert.throws(
    () => parseManagementArguments(["status", "--email", "a@example.com"]),
    /supported only by owner-bootstrap and owner-recovery/,
  );
  assert.throws(
    () =>
      parseManagementArguments([
        "owner-bootstrap",
        "--email",
        "owner@example.com",
      ]),
    /requires --name/,
  );
  assert.throws(
    () => parseManagementArguments(["status", "--name", "Owner"]),
    /supported only by owner-bootstrap/,
  );
});

test("stream runner preserves binary stdin and stdout without buffering the payload", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-stream-test-"));
  workspaces.push(directory);
  const input = resolve(directory, "input.bin");
  const output = resolve(directory, "output.bin");
  const payload = Buffer.from([0, 1, 2, 3, 255, 10, 0, 128]);
  await fs.writeFile(input, payload);
  const result = await defaultStreamRunner(
    process.execPath,
    ["-e", "process.stdin.pipe(process.stdout)"],
    { inputPath: input, outputPath: output, timeoutMs: 10_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await fs.readFile(output), payload);
});

test("stream runner exposes close failures without hiding a failed command", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-stream-close-"));
  workspaces.push(directory);
  const input = resolve(directory, "input.bin");
  await fs.writeFile(input, Buffer.from("input"));
  const closeFailure = Object.assign(new Error("stream close failed"), {
    code: "EACCES",
  });

  const result = await defaultStreamRunner(
    process.execPath,
    [
      "-e",
      "process.stdin.resume(); process.stdin.on('end', () => process.exit(9))",
    ],
    { inputPath: input, timeoutMs: 10_000 },
    {
      closeHandle: async (handle) => {
        await handle.close();
        throw closeFailure;
      },
    },
  );

  assert.equal(result.status, 9);
  assert.equal(result.error instanceof AggregateError, true);
  assert.equal(result.error.code, "EACCES");
  assert.equal(result.error.errors[0].code, "ECHILD");
  assert.equal(result.error.errors[0].status, 9);
  assert.equal(result.error.errors[1], closeFailure);
});

test("stream runner fails when a successful output cannot be closed cleanly", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-stream-output-"));
  workspaces.push(directory);
  const output = resolve(directory, "output.bin");
  const closeFailure = Object.assign(new Error("output close failed"), {
    code: "EIO",
  });

  const result = await defaultStreamRunner(
    process.execPath,
    ["-e", "process.stdout.write(Buffer.from([0, 255, 1]))"],
    { outputPath: output, timeoutMs: 10_000 },
    {
      closeHandle: async (handle) => {
        await handle.close();
        throw closeFailure;
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.error instanceof AggregateError, true);
  assert.equal(result.error.code, "EIO");
  assert.deepEqual(result.error.errors, [closeFailure]);
  assert.deepEqual(await fs.readFile(output), Buffer.from([0, 255, 1]));
});

test("init dry-run records a plan without creating config or data", async () => {
  const directory = await createBundle();
  const result = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies(),
  );

  assert.equal(result.status, "planned");
  assert.equal(result.ok, true);
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.stat(resolve(directory, "data")), { code: "ENOENT" });
  const { record } = await readOnlyOperationRecord(directory, result);
  assert.equal(record.dryRun, true);
  assert.deepEqual(record.actionCodes, [
    "CREATE_CONFIG",
    "DECLARE_DATA_ROOT",
    "CREATE_DATA_DIRECTORIES",
  ]);
});

test("init creates protected config and is idempotent without exposing secrets", async () => {
  const directory = await createBundle();
  const first = await executeManagementCommand(
    options("init", directory),
    dependencies(),
  );
  const configPath = resolve(directory, ".env.selfhost");
  const firstConfig = await fs.readFile(configPath, "utf8");
  const authSecret = firstConfig.match(/^SELF_HOST_AUTH_SECRET=(.+)$/m)?.[1];

  assert.equal(first.status, "completed");
  assert.match(authSecret, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes(authSecret), false);
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
  await fs.stat(resolve(directory, "data/backups"));
  await fs.stat(resolve(directory, "data/diagnostics"));
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(
        resolve(directory, "data/.trainingload-selfhost-data-root.json"),
        "utf8",
      ),
    ),
    { schemaVersion: 1, purpose: "trainingload-selfhost-data-root" },
  );

  const second = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "10000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(second.status, "unchanged");
  assert.equal(await fs.readFile(configPath, "utf8"), firstConfig);
  const { record } = await readOnlyOperationRecord(directory, first);
  assert.equal(JSON.stringify(record).includes(authSecret), false);
});

test("init safely generates a missing integration secret for an existing instance", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const legacyConfig = (await fs.readFile(configPath, "utf8")).replace(
    /^SELF_HOST_INTEGRATION_SECRET=.*\n/m,
    "",
  );
  await fs.writeFile(configPath, legacyConfig, { mode: 0o600 });

  const dryRun = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "12000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(dryRun.status, "planned");
  assert.equal(
    dryRun.actions.some(
      ({ code, status }) =>
        code === "GENERATE_INTEGRATION_SECRET" && status === "planned",
    ),
    true,
  );
  assert.equal(await fs.readFile(configPath, "utf8"), legacyConfig);

  const migrated = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "12000000-0000-4000-8000-000000000003",
    }),
  );
  const migratedConfig = await fs.readFile(configPath, "utf8");
  const integrationSecret = migratedConfig.match(
    /^SELF_HOST_INTEGRATION_SECRET=(.+)$/m,
  )?.[1];
  assert.equal(migrated.status, "completed");
  assert.match(integrationSecret, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(migrated).includes(integrationSecret), false);
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
});

test("init safely adds the release migrate image to legacy configuration", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const legacyConfig = (await fs.readFile(configPath, "utf8")).replace(
    /^SELF_HOST_MIGRATE_IMAGE=.*\n/m,
    "",
  );
  await fs.writeFile(configPath, legacyConfig, { mode: 0o600 });

  const dryRun = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "12010000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(dryRun.status, "planned");
  assert.equal(
    dryRun.actions.some(
      ({ code, status }) =>
        code === "ADD_MIGRATE_IMAGE" && status === "planned",
    ),
    true,
  );
  assert.equal(await fs.readFile(configPath, "utf8"), legacyConfig);

  const migrated = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "12010000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(migrated.status, "completed");
  assert.equal(
    parseEnvironmentFile(await fs.readFile(configPath, "utf8")).get(
      "SELF_HOST_MIGRATE_IMAGE",
    ),
    "trainingload-selfhost-migrate:1.1.13",
  );
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
});

test("init refuses to adopt an unrelated data directory before writing config", async () => {
  const directory = await createBundle();
  await fs.mkdir(resolve(directory, "data"));
  await fs.writeFile(resolve(directory, "data/family-photo.jpg"), "not ours");

  const result = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "11000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_DATA_ROOT_NOT_DEDICATED");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), {
    code: "ENOENT",
  });
});

test("init rejects a data root that contains the release directory", async () => {
  const dataRoot = await fs.mkdtemp(join(tmpdir(), "selfhost-data-parent-"));
  workspaces.push(dataRoot);
  const directory = resolve(dataRoot, "cache");
  await fs.mkdir(directory);
  for (const file of [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ]) {
    await fs.copyFile(resolve(repositoryRoot, file), resolve(directory, file));
  }
  const examplePath = resolve(directory, ".env.example");
  const example = await fs.readFile(examplePath, "utf8");
  await fs.writeFile(
    examplePath,
    example.replace(
      /^# SELF_HOST_DATA_ROOT=.*$/m,
      `SELF_HOST_DATA_ROOT=${dataRoot}`,
    ),
  );

  const result = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "04010000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_DATA_ROOT_UNSAFE");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), /ENOENT/);
  await assert.rejects(
    fs.stat(resolve(dataRoot, ".trainingload-selfhost-data-root.json")),
    /ENOENT/,
  );
});

test("init rejects a symlinked path that resolves to a release ancestor", async () => {
  const outer = await fs.mkdtemp(join(tmpdir(), "selfhost-data-realpath-"));
  workspaces.push(outer);
  const dataRoot = resolve(outer, "backups");
  const directory = resolve(dataRoot, "cache");
  const aliases = resolve(outer, "aliases");
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir(aliases);
  await fs.symlink(outer, resolve(aliases, "root"));
  for (const file of [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ]) {
    await fs.copyFile(resolve(repositoryRoot, file), resolve(directory, file));
  }
  const examplePath = resolve(directory, ".env.example");
  const example = await fs.readFile(examplePath, "utf8");
  await fs.writeFile(
    examplePath,
    example.replace(
      /^# SELF_HOST_DATA_ROOT=.*$/m,
      `SELF_HOST_DATA_ROOT=${resolve(aliases, "root/backups")}`,
    ),
  );

  const result = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "04020000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_DATA_ROOT_UNSAFE");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), /ENOENT/);
});

test("init rejects a data root inside a signed release subtree", async () => {
  const directory = await createBundle();
  const examplePath = resolve(directory, ".env.example");
  const example = await fs.readFile(examplePath, "utf8");
  await fs.writeFile(
    examplePath,
    example.replace(
      "# SELF_HOST_DATA_ROOT=./data",
      "SELF_HOST_DATA_ROOT=./scripts/runtime-data",
    ),
  );
  const result = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "11500000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(result.error.code, "SELF_HOST_DATA_ROOT_UNSAFE");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), /ENOENT/);
});

test("init rejects a parent symlink that resolves a data root into a signed release subtree", async () => {
  const directory = await createBundle();
  const aliases = await fs.mkdtemp(join(tmpdir(), "selfhost-data-alias-"));
  workspaces.push(aliases);
  await fs.mkdir(resolve(directory, "scripts"));
  await fs.symlink(resolve(directory, "scripts"), resolve(aliases, "runtime"));
  const examplePath = resolve(directory, ".env.example");
  const example = await fs.readFile(examplePath, "utf8");
  await fs.writeFile(
    examplePath,
    example.replace(
      "# SELF_HOST_DATA_ROOT=./data",
      `SELF_HOST_DATA_ROOT=${resolve(aliases, "runtime/runtime-data")}`,
    ),
  );

  const result = await executeManagementCommand(
    options("init", directory, { dryRun: true }),
    dependencies({
      randomUUID: () => "11510000-0000-4000-8000-000000000002",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_DATA_ROOT_UNSAFE");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), /ENOENT/);
  await assert.rejects(
    fs.stat(
      resolve(
        directory,
        "scripts/runtime-data/.trainingload-selfhost-data-root.json",
      ),
    ),
    /ENOENT/,
  );
});

test("init refuses symlinked intermediate persistent paths", async () => {
  const directory = await createBundle();
  const external = await fs.mkdtemp(join(tmpdir(), "selfhost-external-data-"));
  workspaces.push(external);
  await fs.mkdir(resolve(directory, "data"));
  await fs.symlink(external, resolve(directory, "data/cache"));

  const result = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "12000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_DATA_PATH_UNSAFE");
  await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), {
    code: "ENOENT",
  });
});

test("init maps an exclusive config race to the stable conflict exit", async () => {
  const directory = await createBundle();
  const conflict = new Error("already exists");
  conflict.code = "EEXIST";
  const result = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "13000000-0000-4000-8000-000000000002",
      atomicWrite: async () => {
        throw conflict;
      },
    }),
  );

  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
  assert.equal(result.error.code, "SELF_HOST_INIT_CONFLICT");
  assert.equal(result.error.retryable, true);
});

test("init bounds release inputs and requires exact version identity", async () => {
  for (const [name, mutate, errorCode] of [
    [
      "template-version-mismatch",
      async (directory) => {
        const path = resolve(directory, ".env.example");
        const text = await fs.readFile(path, "utf8");
        await fs.writeFile(
          path,
          text.replace("SELF_HOST_VERSION=1.1.13", "SELF_HOST_VERSION=1.1.14"),
        );
      },
      "SELF_HOST_RELEASE_STATE_INVALID",
    ],
    [
      "oversized-template",
      async (directory) => {
        await fs.writeFile(
          resolve(directory, ".env.example"),
          "x".repeat(1024 * 1024 + 1),
        );
      },
      "SELF_HOST_BUNDLE_INCOMPLETE",
    ],
    [
      "oversized-release-metadata",
      async (directory) => {
        await fs.writeFile(
          resolve(directory, "package.json"),
          `${JSON.stringify({ version: "1.1.13", padding: "x".repeat(1024 * 1024) })}\n`,
        );
      },
      "SELF_HOST_RELEASE_STATE_INVALID",
    ],
    [
      "oversized-authoritative-release-manifest",
      async (directory) => {
        await fs.writeFile(
          resolve(directory, "release-manifest.json"),
          `${JSON.stringify({ releaseVersion: "1.1.13", padding: "x".repeat(1024 * 1024) })}\n`,
        );
      },
      "SELF_HOST_RELEASE_STATE_INVALID",
    ],
  ]) {
    const directory = await createBundle();
    await mutate(directory);
    const result = await executeManagementCommand(
      options("init", directory),
      dependencies({
        randomUUID: () => "09000000-0000-4000-8000-000000000009",
      }),
    );

    assert.equal(result.ok, false, name);
    assert.equal(result.error.code, errorCode, name);
    await assert.rejects(fs.stat(resolve(directory, ".env.selfhost")), {
      code: "ENOENT",
    });
  }
});

test("status uses one schema-backed result and a minimal operation record", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "20000000-0000-4000-8000-000000000003",
    }),
  );
  const { record } = await readOnlyOperationRecord(directory, result);
  const validators = await schemaValidators();

  assert.equal(result.details.state, "ready");
  assert.equal(result.details.ready, true);
  assert.equal(
    validators.result(result),
    true,
    JSON.stringify(validators.result.errors),
  );
  assert.equal(
    validators.record(record),
    true,
    JSON.stringify(validators.record.errors),
  );
  assert.equal("details" in record, false);
  assert.equal("summary" in record, false);
});

test("doctor aggregates trusted checks into a schema-backed redacted report", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const config = await fs.readFile(resolve(directory, ".env.selfhost"), "utf8");
  const authSecret = config.match(/^SELF_HOST_AUTH_SECRET=(.+)$/m)?.[1];
  const databaseSecret = config.match(
    /^SELF_HOST_DATABASE_PASSWORD=(.+)$/m,
  )?.[1];
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "21000000-0000-4000-8000-000000000003",
    }),
  );
  const validators = await schemaValidators();
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.details.doctor.overall, "warning");
  assert.equal(
    validators.doctor(result.details.doctor),
    true,
    JSON.stringify(validators.doctor.errors),
  );
  assert.equal(
    result.details.doctor.checks.some((check) => check.status === "fail"),
    false,
  );
  assert.equal(serialized.includes(authSecret), false);
  assert.equal(serialized.includes(databaseSecret), false);
  assert.equal(
    docker.calls.some((args) =>
      args.at(-1).includes?.("/api/runtime/capabilities"),
    ),
    true,
  );
  assert.equal(
    docker.calls.some((args) =>
      args[args.indexOf("--command") + 1]?.includes(
        'FROM "_trainingload_core_migrations"',
      ),
    ),
    true,
  );
  const dockerEngine = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DOCKER_ENGINE",
  );
  assert.equal(dockerEngine.status, "pass");
  assert.equal(dockerEngine.details.osType, "linux");
  assert.equal(dockerEngine.details.architectureSupported, true);
  assert.equal(dockerEngine.details.matchesHost, true);
  assert.equal(
    result.details.doctor.checks.find(
      (check) => check.code === "SELF_HOST_DOCTOR_OWNER",
    ).status,
    "pass",
  );
  assert.deepEqual(
    result.details.doctor.checks.find(
      (check) => check.code === "SELF_HOST_DOCTOR_GATEWAY",
    ),
    {
      code: "SELF_HOST_DOCTOR_GATEWAY",
      category: "security",
      status: "pass",
      summary:
        "The Client endpoint, reverse proxy, and readiness endpoint are valid",
      errorCode: null,
      remediation: {
        id: "repair-security-boundary",
        documentation: "ai_docs/self-hosting/doctor-and-diagnostics.zh.md",
      },
      details: {
        protocol: "http",
        port: 43210,
        httpStatus: 200,
        tlsVerified: null,
        reverseProxyVerified: true,
        readiness: {
          status: "ready",
          configuration: "ready",
          database: "ready",
        },
      },
    },
  );
});

test("doctor reports a pending owner bootstrap as a failure", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    ownerReady: false,
  });
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "21100000-0000-4000-8000-000000000003",
    }),
  );
  const owner = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_OWNER",
  );

  assert.equal(result.ok, false);
  assert.equal(owner.status, "fail");
  assert.equal(owner.errorCode, "SELF_HOST_DOCTOR_OWNER_MISSING");
  assert.deepEqual(owner.details, { initialized: false });
});

test("doctor returns a complete report when Docker is unavailable", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: dockerRunner({ unavailable: true }).runner,
      statfs: abundantDisk,
      randomUUID: () => "22000000-0000-4000-8000-000000000003",
    }),
  );
  const validators = await schemaValidators();

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.UNHEALTHY);
  assert.equal(result.error.code, "SELF_HOST_DOCTOR_FAILED");
  assert.equal(result.details.doctor.overall, "fail");
  assert.ok(result.details.doctor.checks.length >= 20);
  assert.equal(
    validators.doctor(result.details.doctor),
    true,
    JSON.stringify(validators.doctor.errors),
  );
  assert.equal(
    result.details.doctor.checks.find(
      (check) => check.code === "SELF_HOST_DOCTOR_DOCKER_ENGINE",
    ).status,
    "fail",
  );
});

test("doctor fails closed on unsupported or malformed Docker runtime metadata", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());

  const unsupportedDocker = dockerRunner({
    handle: (args) =>
      args[0] === "info" && args.at(-1) === "{{json .}}"
        ? {
            status: 0,
            stdout: `${JSON.stringify({ Architecture: "riscv64", OSType: "linux" })}\n`,
            stderr: "",
            error: null,
          }
        : null,
  });
  const unsupported = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: unsupportedDocker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22100000-0000-4000-8000-000000000003",
    }),
  );
  const unsupportedCheck = unsupported.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DOCKER_ENGINE",
  );
  assert.equal(unsupportedCheck.status, "fail");
  assert.equal(
    unsupportedCheck.errorCode,
    "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
  );
  assert.deepEqual(unsupportedCheck.details, {
    version: "27.5.1",
    osType: "linux",
    architecture: "riscv64",
    architectureSupported: false,
    matchesHost: false,
  });

  const malformedDocker = dockerRunner({
    handle: (args) =>
      args[0] === "info" && args.at(-1) === "{{json .}}"
        ? { status: 0, stdout: "not-json\n", stderr: "", error: null }
        : null,
  });
  const malformed = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: malformedDocker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22200000-0000-4000-8000-000000000003",
    }),
  );
  const malformedCheck = malformed.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DOCKER_ENGINE",
  );
  assert.equal(malformedCheck.status, "fail");
  assert.equal(malformedCheck.errorCode, "SELF_HOST_DOCKER_INFO_FAILED");
  assert.deepEqual(malformedCheck.details, {
    version: "27.5.1",
    osType: null,
    architecture: null,
    architectureSupported: false,
    matchesHost: null,
  });

  const invalidVersionDocker = dockerRunner({
    handle: (args) =>
      args[0] === "version"
        ? {
            status: 0,
            stdout: "27.5.1 injected-output\n",
            stderr: "",
            error: null,
          }
        : null,
  });
  const invalidVersion = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: invalidVersionDocker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22210000-0000-4000-8000-000000000003",
    }),
  );
  const invalidVersionCheck = invalidVersion.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DOCKER_ENGINE",
  );
  assert.equal(invalidVersionCheck.status, "fail");
  assert.equal(invalidVersionCheck.errorCode, "SELF_HOST_DOCKER_INFO_FAILED");
  assert.equal(invalidVersionCheck.details.version, null);
  assert.equal(JSON.stringify(invalidVersionCheck).includes("injected"), false);

  const legacyComposeDocker = dockerRunner({
    handle: (args) =>
      args[0] === "compose" && args[1] === "version"
        ? { status: 0, stdout: "1.29.2\n", stderr: "", error: null }
        : null,
  });
  const legacyCompose = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: legacyComposeDocker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22220000-0000-4000-8000-000000000003",
    }),
  );
  const legacyComposeCheck = legacyCompose.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_COMPOSE",
  );
  assert.equal(legacyComposeCheck.status, "fail");
  assert.equal(legacyComposeCheck.errorCode, "SELF_HOST_COMPOSE_UNAVAILABLE");
  assert.deepEqual(legacyComposeCheck.details, {});
});

test("doctor fails closed when the host tuple is outside the release matrix", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: dockerRunner().runner,
      statfs: abundantDisk,
      hostPlatform: () => "darwin",
      hostArchitecture: () => "x64",
      randomUUID: () => "22230000-0000-4000-8000-000000000003",
    }),
  );
  const hostCheck = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_HOST_RESOURCES",
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_DOCTOR_FAILED");
  assert.equal(hostCheck.status, "fail");
  assert.equal(hostCheck.errorCode, "SELF_HOST_HOST_PLATFORM_UNSUPPORTED");
  assert.equal(hostCheck.details.platform, "darwin");
  assert.equal(hostCheck.details.architecture, "x64");
  assert.equal(hostCheck.details.platformSupported, true);
  assert.equal(hostCheck.details.architectureSupported, true);
  assert.equal(hostCheck.details.hostSupported, false);
});

test("doctor treats critically low inode capacity as blocking", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: async () => ({
        bavail: 10_000_000_000n,
        blocks: 20_000_000_000n,
        bsize: 1n,
        files: 1_000_000n,
        ffree: 100n,
      }),
      randomUUID: () => "22250000-0000-4000-8000-000000000003",
    }),
  );
  const disk = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DISK",
  );
  const inodes = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_INODES",
  );

  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.UNHEALTHY);
  assert.equal(disk.status, "pass");
  assert.equal(inodes.status, "fail");
  assert.equal(inodes.errorCode, "SELF_HOST_DOCTOR_INODES_INSUFFICIENT");
  assert.deepEqual(inodes.details, {
    supported: true,
    freeInodes: "100",
    totalInodes: "1000000",
  });

  const unsupported = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: async () => ({
        bavail: 10_000_000_000n,
        blocks: 20_000_000_000n,
        bsize: 1n,
        files: 0n,
        ffree: 0n,
      }),
      randomUUID: () => "22260000-0000-4000-8000-000000000003",
    }),
  );
  const unsupportedInodes = unsupported.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_INODES",
  );
  assert.equal(unsupportedInodes.status, "skipped");
  assert.deepEqual(unsupportedInodes.details, { supported: false });
});

test("doctor verifies the public HTTPS gateway and fails closed on TLS or payload faults", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const config = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    config
      .replace(
        "SELF_HOST_SITE_ADDRESS=http://localhost:43210",
        "SELF_HOST_SITE_ADDRESS=https://training.example.com:43211",
      )
      .replace(
        "SELF_HOST_GATEWAY_ADDRESS=http://:80",
        "SELF_HOST_GATEWAY_ADDRESS=https://training.example.com:43211",
      ),
    { mode: 0o600 },
  );
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const requests = [];
  const passed = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetcher: async (url, requestOptions) => {
        requests.push({ url, requestOptions });
        return healthyGatewayResponse();
      },
      randomUUID: () => "22300000-0000-4000-8000-000000000003",
    }),
  );
  const gateway = passed.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_GATEWAY",
  );

  assert.equal(gateway.status, "pass");
  assert.equal(gateway.details.tlsVerified, true);
  assert.equal(gateway.details.reverseProxyVerified, true);
  assert.equal(
    requests[0].url,
    "https://training.example.com:43211/api/health/ready",
  );
  assert.equal(requests[0].requestOptions.redirect, "manual");
  assert.deepEqual(requests[0].requestOptions.headers, {
    accept: "application/json",
  });

  const certificateCause = Object.assign(new Error("certificate expired"), {
    code: "CERT_HAS_EXPIRED",
  });
  const fetchError = new TypeError("fetch failed", {
    cause: certificateCause,
  });
  const tlsFailed = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetcher: async () => {
        throw fetchError;
      },
      randomUUID: () => "22400000-0000-4000-8000-000000000003",
    }),
  );
  const tlsCheck = tlsFailed.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_GATEWAY",
  );
  assert.equal(tlsCheck.status, "fail");
  assert.equal(tlsCheck.errorCode, "SELF_HOST_DOCTOR_TLS_FAILED");
  assert.equal(tlsCheck.details.tlsVerified, false);
  assert.equal(
    JSON.stringify(tlsFailed).includes("certificate expired"),
    false,
  );

  const redirected = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetcher: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://other.example.com/ready" },
        }),
      randomUUID: () => "22425000-0000-4000-8000-000000000003",
    }),
  );
  const redirectCheck = redirected.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_GATEWAY",
  );
  assert.equal(
    redirectCheck.errorCode,
    "SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID",
  );
  assert.equal(redirectCheck.details.httpStatus, 302);

  const oversized = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetcher: async () =>
        new Response("x".repeat(64 * 1024 + 1), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      randomUUID: () => "22450000-0000-4000-8000-000000000003",
    }),
  );
  const oversizedCheck = oversized.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_GATEWAY",
  );
  assert.equal(oversizedCheck.status, "fail");
  assert.equal(
    oversizedCheck.errorCode,
    "SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID",
  );
  assert.equal(oversizedCheck.details.reverseProxyVerified, false);
});

test("doctor reports an observed stopped database as a cataloged failure", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const rows = readyRows().map((row) =>
    row.Service === "postgres"
      ? { Service: "postgres", State: "exited", ExitCode: 0 }
      : row,
  );
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: dockerRunner({ rows }).runner,
      statfs: abundantDisk,
      randomUUID: () => "22500000-0000-4000-8000-000000000003",
    }),
  );
  const database = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_DATABASE",
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_DOCTOR_FAILED");
  assert.equal(database.status, "fail");
  assert.equal(database.errorCode, "SELF_HOST_DOCTOR_DATABASE_FAILED");
  assert.deepEqual(database.details, { state: "exited", health: null });
});

test("doctor resolves and probes a same-origin local map URL", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const config = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    config
      .replace("MAP_PROVIDER=none", "MAP_PROVIDER=local")
      .replace("MAP_ATTRIBUTION=", "MAP_ATTRIBUTION=Operator maps")
      .replace("MAP_STYLE_URL=", "MAP_STYLE_URL=/maps/style.json"),
    { mode: 0o600 },
  );
  const requested = [];
  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    runtimeMap: {
      provider: "local",
      styleUrl: "/maps/style.json",
      tileUrl: null,
    },
  });

  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      fetcher: async (url) => {
        if (url === "http://localhost:43210/api/health/ready") {
          return healthyGatewayResponse();
        }
        requested.push(url);
        return { ok: true, body: { cancel: async () => {} } };
      },
      randomUUID: () => "22550000-0000-4000-8000-000000000003",
    }),
  );
  const provider = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
  );

  assert.deepEqual(requested, ["http://localhost:43210/maps/style.json"]);
  assert.equal(provider.status, "pass");
  assert.deepEqual(provider.details, { provider: "local" });
});

test("doctor validates local DEM provenance and a bounded tile sample", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  await fs.appendFile(
    configPath,
    "ELEVATION_PROVIDER=local-dem\nELEVATION_TILE_ZOOM=13\n",
  );
  const tileDirectory = resolve(directory, "data/elevation/13/4321");
  const tilePath = resolve(tileDirectory, "2345.png");
  await fs.mkdir(tileDirectory, { recursive: true });
  await fs.writeFile(
    resolve(directory, "data/elevation/source.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      format: "mapbox-terrain-rgb",
      source: "acceptance-dem-v1",
      attribution: "Test DEM",
      license: "TEST-ONLY",
    })}\n`,
  );
  await fs.writeFile(tilePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });

  const valid = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22600000-0000-4000-8000-000000000003",
    }),
  );
  const validCheck = valid.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_LOCAL_DEM",
  );
  assert.equal(validCheck.status, "pass");
  assert.deepEqual(validCheck.details, {
    provider: "local-dem",
    tileZoom: 13,
    ready: true,
    reason: null,
  });

  await fs.unlink(tilePath);
  const invalid = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22700000-0000-4000-8000-000000000003",
    }),
  );
  const invalidCheck = invalid.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_LOCAL_DEM",
  );
  assert.equal(invalid.ok, true);
  assert.equal(invalidCheck.status, "warning");
  assert.equal(invalidCheck.errorCode, "SELF_HOST_DOCTOR_LOCAL_DEM_INVALID");
  assert.equal(invalidCheck.details.reason, "missing-valid-tile-sample");
});

test("doctor reports bounded recovery history overflow without scanning it", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const backupDirectory = resolve(directory, "data/backups");
  await Promise.all(
    Array.from(
      { length: SELF_HOST_HISTORY_LIMITS.maximumBackupEntries + 1 },
      (_, index) => fs.mkdir(resolve(backupDirectory, `flood-${index}`)),
    ),
  );
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22900000-0000-4000-8000-000000000003",
    }),
  );
  const backup = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_BACKUP",
  );

  assert.equal(backup.status, "warning");
  assert.equal(backup.errorCode, "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED");
  assert.deepEqual(backup.details, {
    latest: null,
    history: {
      scannedEntries: SELF_HOST_HISTORY_LIMITS.maximumBackupEntries,
      maximumEntries: SELF_HOST_HISTORY_LIMITS.maximumBackupEntries,
      scannedBytes: 0,
      maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumBackupBytes,
      entryLimitExceeded: true,
      byteLimitExceeded: false,
      limitExceeded: true,
    },
  });
});

test("doctor fails closed when operation history exceeds its byte budget", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const operationsDirectory = resolve(directory, ".selfhost/operations");
  const recordBytes = 64 * 1024;
  const overflowCount =
    SELF_HOST_HISTORY_LIMITS.maximumOperationBytes / recordBytes + 1;
  await Promise.all(
    Array.from({ length: overflowCount }, (_, index) =>
      fs.writeFile(
        resolve(
          operationsDirectory,
          `zz-overflow-${String(index).padStart(2, "0")}.json`,
        ),
        " ".repeat(recordBytes),
      ),
    ),
  );
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "22910000-0000-4000-8000-000000000003",
    }),
  );
  const recentFailure = result.details.doctor.checks.find(
    (check) => check.code === "SELF_HOST_DOCTOR_RECENT_FAILURE",
  );
  assert.equal(recentFailure.status, "warning");
  assert.equal(
    recentFailure.errorCode,
    "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED",
  );
  assert.deepEqual(recentFailure.details, {
    latest: null,
    history: {
      scannedEntries: overflowCount + 1,
      maximumEntries: SELF_HOST_HISTORY_LIMITS.maximumOperationEntries,
      scannedBytes: SELF_HOST_HISTORY_LIMITS.maximumOperationBytes,
      maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumOperationBytes,
      entryLimitExceeded: false,
      byteLimitExceeded: true,
      limitExceeded: true,
    },
  });
});

test("diagnostics publishes a private schema-valid bundle with mandatory redaction", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const config = await fs.readFile(resolve(directory, ".env.selfhost"), "utf8");
  const secret = config.match(/^SELF_HOST_AUTH_SECRET=(.+)$/m)?.[1];
  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    logs: `server | authorization=generic-sensitive-value\nserver | exact=${secret}\nserver | ready\n`,
  });
  const planned = await executeManagementCommand(
    options("diagnostics", directory, {
      output: "support",
      tail: 50,
      services: ["server"],
      dryRun: true,
    }),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "23000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.deepEqual(planned.details.includedFields, [
    "doctor",
    "configuration",
    "logs",
    "operations",
  ]);
  assert.equal(planned.details.operatorReviewRequired, true);
  await assert.rejects(
    fs.access(resolve(directory, "data/diagnostics/support.json")),
  );

  const result = await executeManagementCommand(
    options("diagnostics", directory, {
      output: "support",
      tail: 50,
      services: ["server"],
    }),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "23000000-0000-4000-8000-000000000003",
    }),
  );
  const artifactPath = resolve(directory, result.details.diagnosticsPath);
  const [artifactText, artifactStat] = await Promise.all([
    fs.readFile(artifactPath, "utf8"),
    fs.stat(artifactPath),
  ]);
  const artifact = JSON.parse(artifactText);
  const validators = await schemaValidators();

  assert.equal(result.ok, true);
  assert.equal(result.details.secretScan, "pass");
  assert.equal(result.details.operatorReviewRequired, true);
  assert.deepEqual(
    result.details.includedFields,
    planned.details.includedFields,
  );
  assert.equal(artifactText.includes(secret), false);
  assert.equal(artifactText.includes("generic-sensitive-value"), false);
  assert.equal(artifactStat.mode & 0o777, 0o600);
  assert.equal(result.details.sizeBytes, Buffer.byteLength(artifactText));
  assert.equal(
    result.details.sha256,
    createHash("sha256").update(artifactText).digest("hex"),
  );
  assert.equal(
    validators.diagnostics(artifact),
    true,
    JSON.stringify(validators.diagnostics.errors),
  );
  assert.equal(
    validators.result(result),
    true,
    JSON.stringify(validators.result.errors),
  );
  assert.deepEqual(artifact.contents.logs.selectedServices, ["server"]);
  assert.equal(artifact.contents.logs.tail, 50);

  const duplicate = await executeManagementCommand(
    options("diagnostics", directory, { output: "support" }),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "23000000-0000-4000-8000-000000000004",
    }),
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, "SELF_HOST_DIAGNOSTICS_EXISTS");
  assert.equal(await fs.readFile(artifactPath, "utf8"), artifactText);
});

test("diagnostics fails closed when the artifact secret scanner finds a private key", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    logs: "server | -----BEGIN PRIVATE KEY-----\n",
  });
  const result = await executeManagementCommand(
    options("diagnostics", directory, { output: "unsafe-support" }),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "24000000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED");
  await assert.rejects(
    fs.access(resolve(directory, "data/diagnostics/unsafe-support.json")),
  );
});

test("diagnostics removes a published artifact that fails byte-for-byte verification", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const destination = resolve(
    directory,
    "data/diagnostics/drifted-support.json",
  );
  const result = await executeManagementCommand(
    options("diagnostics", directory, { output: "drifted-support" }),
    dependencies({
      runner: lifecycleDocker({ dataRoot: resolve(directory, "data") }).runner,
      statfs: abundantDisk,
      atomicWrite: async (path, content, mode = 0o600) => {
        await fs.writeFile(
          path,
          resolve(path) === destination ? `${content} ` : content,
          { encoding: "utf8", flag: "wx", mode },
        );
      },
      randomUUID: () => "24500000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_DIAGNOSTICS_VERIFY_FAILED");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  await assert.rejects(fs.stat(destination), { code: "ENOENT" });
});

test("diagnostics fails closed when an untrusted published artifact cannot be removed", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const destination = resolve(
    directory,
    "data/diagnostics/cleanup-failure.json",
  );
  const result = await executeManagementCommand(
    options("diagnostics", directory, { output: "cleanup-failure" }),
    dependencies({
      runner: lifecycleDocker({ dataRoot: resolve(directory, "data") }).runner,
      statfs: abundantDisk,
      atomicWrite: async (path, content, mode = 0o600) => {
        await fs.writeFile(
          path,
          resolve(path) === destination ? `${content} ` : content,
          { encoding: "utf8", flag: "wx", mode },
        );
      },
      removeDiagnosticsArtifact: async (path) => {
        if (resolve(path) === destination) {
          const error = new Error("injected diagnostics cleanup failure");
          error.code = "EACCES";
          throw error;
        }
        await fs.unlink(path);
      },
      randomUUID: () => "24600000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  await fs.stat(destination);
});

test("diagnostics remains collectable when Docker is unavailable", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const result = await executeManagementCommand(
    options("diagnostics", directory, { output: "offline-support" }),
    dependencies({
      runner: dockerRunner({ unavailable: true }).runner,
      statfs: abundantDisk,
      randomUUID: () => "25000000-0000-4000-8000-000000000003",
    }),
  );
  const artifact = JSON.parse(
    await fs.readFile(
      resolve(directory, result.details.diagnosticsPath),
      "utf8",
    ),
  );

  assert.equal(result.ok, true);
  assert.equal(result.details.doctorOverall, "fail");
  assert.equal(artifact.contents.logs.status, "unavailable");
  assert.equal(
    artifact.contents.logs.errorCode,
    "SELF_HOST_DOCKER_UNAVAILABLE",
  );
});

test("start dry-run is non-mutating and actual start verifies readiness", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const readyDocker = dockerRunner();
  const unchanged = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: readyDocker.runner,
      randomUUID: () => "29000000-0000-4000-8000-000000000004",
    }),
  );
  assert.equal(unchanged.status, "unchanged");
  assert.equal(
    readyDocker.calls.some((args) => args.includes("up")),
    false,
  );

  const degraded = readyRows().filter((row) => row.Service !== "server");
  const dryDocker = dockerRunner({ rows: degraded });
  const planned = await executeManagementCommand(
    options("start", directory, { dryRun: true }),
    dependencies({
      runner: dryDocker.runner,
      randomUUID: () => "30000000-0000-4000-8000-000000000004",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.equal(
    dryDocker.calls.some((args) => args.includes("up")),
    false,
  );

  let psCalls = 0;
  const actualDocker = dockerRunner({
    rows: () => (psCalls++ === 0 ? degraded : readyRows()),
  });
  const started = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: actualDocker.runner,
      randomUUID: () => "40000000-0000-4000-8000-000000000005",
    }),
  );
  assert.equal(started.status, "completed");
  assert.equal(started.details.ready, true);
  assert.equal(
    actualDocker.calls.filter((args) => args.includes("up")).length,
    1,
  );
});

test("source start pins project-scoped images only after readiness", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  await fs.writeFile(
    configPath,
    (await fs.readFile(configPath, "utf8"))
      .replace(
        "SELF_HOST_PROJECT_NAME=trainingload-selfhost",
        "SELF_HOST_PROJECT_NAME=trainingload-test-source",
      )
      .replace(/^SELF_HOST_MIGRATE_IMAGE=.*\n/m, ""),
    { mode: 0o600 },
  );
  const originalConfig = await fs.readFile(configPath, "utf8");
  const degraded = readyRows().filter((row) => row.Service !== "server");

  const dryRunDocker = dockerRunner({ rows: degraded });
  const planned = await executeManagementCommand(
    options("start", directory, { dryRun: true, source: true }),
    dependencies({
      runner: dryRunDocker.runner,
      randomUUID: () => "40010000-0000-4000-8000-000000000005",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.equal(
    planned.actions.some(
      ({ code, status }) =>
        code === "PIN_SOURCE_IMAGES" && status === "planned",
    ),
    true,
  );
  assert.equal(await fs.readFile(configPath, "utf8"), originalConfig);

  let psCalls = 0;
  const sourceDocker = dockerRunner({
    rows: () => (psCalls++ === 0 ? degraded : readyRows()),
  });
  const started = await executeManagementCommand(
    options("start", directory, { source: true }),
    dependencies({
      runner: sourceDocker.runner,
      randomUUID: () => "40020000-0000-4000-8000-000000000005",
    }),
  );
  assert.equal(started.status, "completed");
  assert.equal(
    started.actions.some(
      ({ code, status }) =>
        code === "PIN_SOURCE_IMAGES" && status === "completed",
    ),
    true,
  );
  assert.equal(
    sourceDocker.calls.some(
      (args) =>
        args.includes("up") &&
        args.includes("--build") &&
        args.includes("--force-recreate"),
    ),
    true,
  );

  const pinnedConfig = parseEnvironmentFile(
    await fs.readFile(configPath, "utf8"),
  );
  for (const role of ["migrate", "server", "client"]) {
    assert.equal(
      pinnedConfig.get(`SELF_HOST_${role.toUpperCase()}_IMAGE`),
      `trainingload-test-source-${role}:1.1.13`,
    );
  }

  const statusDocker = dockerRunner();
  const observedImages = [];
  const statusResult = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: (command, args, runnerOptions) => {
        const environmentIndex = args.indexOf("--env-file");
        if (environmentIndex >= 0 && args.includes("ps")) {
          const values = parseEnvironmentFile(
            readFileSync(args[environmentIndex + 1], "utf8"),
          );
          observedImages.push(values.get("SELF_HOST_SERVER_IMAGE"));
        }
        return statusDocker.runner(command, args, runnerOptions);
      },
      randomUUID: () => "40030000-0000-4000-8000-000000000005",
    }),
  );
  assert.equal(statusResult.status, "completed");
  assert.deepEqual(observedImages, ["trainingload-test-source-server:1.1.13"]);

  const readySourceDocker = dockerRunner({ rows: readyRows() });
  const readySourcePlan = await executeManagementCommand(
    options("start", directory, { dryRun: true, source: true }),
    dependencies({
      runner: readySourceDocker.runner,
      randomUUID: () => "40040000-0000-4000-8000-000000000005",
    }),
  );
  assert.equal(readySourcePlan.status, "planned");
  assert.equal(
    readySourcePlan.actions.some(
      ({ code, status }) => code === "START_SERVICES" && status === "planned",
    ),
    true,
  );
});

test("owner bootstrap dry-run is non-mutating and actual bootstrap inherits stdin", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  let streamCalls = 0;
  const planned = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      dryRun: true,
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: true,
      streamRunner: async () => {
        streamCalls += 1;
        throw new Error("dry-run must not invoke owner bootstrap");
      },
      randomUUID: () => "23300000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.equal(planned.details.passwordInput, "stdin");
  assert.equal(streamCalls, 0);

  let invocation = null;
  const completed = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async (command, args, streamOptions) => {
        streamCalls += 1;
        invocation = { command, args, streamOptions };
        return {
          status: 0,
          stdout: `${JSON.stringify({
            schemaVersion: 1,
            state: "READY",
            owner: { email: "owner@example.com", name: "Local Owner" },
            initializedAt: "2026-10-17T00:00:00.000Z",
            operation: "self-host-owner-bootstrap",
            status: "completed",
          })}\n`,
          stderr: "",
          error: null,
        };
      },
      randomUUID: () => "23400000-0000-4000-8000-000000000003",
    }),
  );
  const validators = await schemaValidators();
  const { record } = await readOnlyOperationRecord(directory, completed);
  const serialized = JSON.stringify({ completed, record });
  assert.equal(completed.status, "completed");
  assert.equal(completed.details.ownerInitialized, true);
  assert.equal(serialized.includes("owner@example.com"), false);
  assert.equal(serialized.includes("Local Owner"), false);
  assert.equal(streamCalls, 1);
  assert.equal(invocation.command, "docker");
  assert.deepEqual(invocation.args.slice(-4), [
    "--email",
    "owner@example.com",
    "--name",
    "Local Owner",
  ]);
  assert.equal(invocation.streamOptions.inheritStdin, true);
  assert.equal("inputPath" in invocation.streamOptions, false);
  assert.equal(validators.result(completed), true);
  assert.equal(validators.record(record), true);
});

test("owner bootstrap rejects terminal input and maps bounded server failures", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  let streamCalls = 0;
  const terminal = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: true,
      streamRunner: async () => {
        streamCalls += 1;
        throw new Error("terminal input must be rejected before execution");
      },
      randomUUID: () => "23410000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(terminal.error.code, "SELF_HOST_OWNER_BOOTSTRAP_STDIN_REQUIRED");
  assert.equal(streamCalls, 0);

  const invalid = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async () => ({
        status: 1,
        stdout: "",
        stderr: `${JSON.stringify({
          schemaVersion: 1,
          operation: "self-host-owner-bootstrap",
          status: "failed",
          code: "SELF_HOST_BOOTSTRAP_INPUT_INVALID",
          passwordPolicy: "redacted policy",
        })}\n`,
        error: null,
      }),
      randomUUID: () => "23420000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(invalid.error.code, "SELF_HOST_BOOTSTRAP_INPUT_INVALID");

  const malformed = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async () => ({
        status: 1,
        stdout: "",
        stderr: `${JSON.stringify({ code: "SELF_HOST_ALREADY_INITIALIZED" })}\n`,
        error: null,
      }),
      randomUUID: () => "23430000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(malformed.error.code, "SELF_HOST_OWNER_BOOTSTRAP_FAILED");

  const inconsistent = await executeManagementCommand(
    options("owner-bootstrap", directory, {
      ownerEmail: "owner@example.com",
      ownerName: "Local Owner",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async () => ({
        status: 0,
        stdout: `${JSON.stringify({
          schemaVersion: 1,
          state: "READY",
          owner: { email: "owner@example.com", name: "Different Owner" },
          initializedAt: "2026-10-17T00:00:00.000Z",
          operation: "self-host-owner-bootstrap",
          status: "completed",
        })}\n`,
        stderr: "",
        error: null,
      }),
      randomUUID: () => "23440000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(
    inconsistent.error.code,
    "SELF_HOST_OWNER_BOOTSTRAP_RESPONSE_INVALID",
  );
  assert.equal(
    JSON.stringify(inconsistent).includes("owner@example.com"),
    false,
  );
});

test("owner recovery dry-run is non-mutating and actual recovery inherits stdin", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  let streamCalls = 0;
  const planned = await executeManagementCommand(
    options("owner-recovery", directory, {
      dryRun: true,
      ownerEmail: "owner@example.com",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: true,
      streamRunner: async () => {
        streamCalls += 1;
        throw new Error("dry-run must not invoke owner recovery");
      },
      randomUUID: () => "23500000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(planned.status, "planned");
  assert.equal(planned.details.passwordInput, "stdin");
  assert.equal(streamCalls, 0);

  let invocation = null;
  const completed = await executeManagementCommand(
    options("owner-recovery", directory, {
      ownerEmail: "owner@example.com",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async (command, args, streamOptions) => {
        streamCalls += 1;
        invocation = { command, args, streamOptions };
        return {
          status: 0,
          stdout: `${JSON.stringify({
            schemaVersion: 1,
            operation: "self-host-owner-password-recovery",
            status: "completed",
            ownerEmail: "owner@example.com",
            revokedSessions: 3,
          })}\n`,
          stderr: "",
          error: null,
        };
      },
      randomUUID: () => "23600000-0000-4000-8000-000000000003",
    }),
  );
  const validators = await schemaValidators();
  const { record } = await readOnlyOperationRecord(directory, completed);

  assert.equal(completed.status, "completed");
  assert.equal(completed.details.sessionsRevoked, 3);
  assert.equal(JSON.stringify(completed).includes("owner@example.com"), false);
  assert.equal(JSON.stringify(record).includes("owner@example.com"), false);
  assert.equal(streamCalls, 1);
  assert.equal(invocation.command, "docker");
  assert.equal(invocation.args.at(-1), "owner@example.com");
  assert.equal(invocation.streamOptions.inheritStdin, true);
  assert.equal("inputPath" in invocation.streamOptions, false);
  assert.equal(validators.result(completed), true);
  assert.equal(validators.record(record), true);
});

test("owner recovery rejects terminal input and maps bounded server failures", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  let streamCalls = 0;
  const terminal = await executeManagementCommand(
    options("owner-recovery", directory, {
      ownerEmail: "owner@example.com",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: true,
      streamRunner: async () => {
        streamCalls += 1;
        throw new Error("terminal input must be rejected before execution");
      },
      randomUUID: () => "23700000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(terminal.error.code, "SELF_HOST_OWNER_RECOVERY_STDIN_REQUIRED");
  assert.equal(streamCalls, 0);

  const mismatch = await executeManagementCommand(
    options("owner-recovery", directory, {
      ownerEmail: "other@example.com",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async () => {
        streamCalls += 1;
        return {
          status: 1,
          stdout: "",
          stderr: `${JSON.stringify({
            schemaVersion: 1,
            operation: "self-host-owner-password-recovery",
            status: "failed",
            code: "SELF_HOST_OWNER_MISMATCH",
          })}\n`,
          error: null,
        };
      },
      randomUUID: () => "23800000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(mismatch.error.code, "SELF_HOST_OWNER_MISMATCH");
  assert.equal(JSON.stringify(mismatch).includes("other@example.com"), false);
  assert.equal(streamCalls, 1);

  const malformed = await executeManagementCommand(
    options("owner-recovery", directory, {
      ownerEmail: "other@example.com",
    }),
    dependencies({
      runner: docker.runner,
      stdinIsTTY: false,
      streamRunner: async () => ({
        status: 1,
        stdout: "",
        stderr: `${JSON.stringify({
          code: "SELF_HOST_OWNER_MISMATCH",
        })}\n`,
        error: null,
      }),
      randomUUID: () => "23900000-0000-4000-8000-000000000003",
    }),
  );
  assert.equal(malformed.error.code, "SELF_HOST_OWNER_RECOVERY_FAILED");
});

test("logs redact configured and labeled secrets from human and JSON data", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const config = await fs.readFile(resolve(directory, ".env.selfhost"), "utf8");
  const secret = config.match(/^SELF_HOST_AUTH_SECRET=(.+)$/m)?.[1];
  const docker = dockerRunner({
    logs: `server | secret=${secret}\nserver | password=hunter42\nserver | ready\n`,
  });
  const result = await executeManagementCommand(
    options("logs", directory, { services: ["server"], tail: 20 }),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "50000000-0000-4000-8000-000000000006",
    }),
  );
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("hunter42"), false);
  assert.match(result.details.lines.join("\n"), /\[REDACTED\]/);
});

test("Docker absence has a stable exit code and still writes a record", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner({ unavailable: true });
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "60000000-0000-4000-8000-000000000007",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE);
  assert.equal(result.error.code, "SELF_HOST_DOCKER_UNAVAILABLE");
  const { record, stat } = await readOnlyOperationRecord(directory, result);
  const validators = await schemaValidators();
  assert.equal(record.errorCode, "SELF_HOST_DOCKER_UNAVAILABLE");
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(
    validators.record(record),
    true,
    JSON.stringify(validators.record.errors),
  );
});

test("compose lifecycle rejects unsupported or malformed Docker runtime before resolving Compose", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const cases = [
    {
      name: "windows-containers",
      errorCode: "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      exitCode: SELF_HOST_CLI_EXIT.PREREQUISITE,
      retryable: true,
      handle: (args) =>
        args[0] === "info" && args.at(-1) === "{{json .}}"
          ? {
              status: 0,
              stdout: `${JSON.stringify({ Architecture: "amd64", OSType: "windows" })}\n`,
              stderr: "",
              error: null,
            }
          : null,
    },
    {
      name: "malformed-info",
      errorCode: "SELF_HOST_DOCKER_INFO_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: false,
      handle: (args) =>
        args[0] === "info" && args.at(-1) === "{{json .}}"
          ? { status: 0, stdout: "injected-output\n", stderr: "", error: null }
          : null,
    },
    {
      name: "malformed-version",
      errorCode: "SELF_HOST_DOCKER_INFO_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: false,
      handle: (args) =>
        args[0] === "version"
          ? {
              status: 0,
              stdout: "27.5.1 injected-output\n",
              stderr: "",
              error: null,
            }
          : null,
    },
    {
      name: "malformed-compose-version",
      errorCode: "SELF_HOST_COMPOSE_UNAVAILABLE",
      exitCode: SELF_HOST_CLI_EXIT.PREREQUISITE,
      retryable: true,
      handle: (args) =>
        args[0] === "compose" && args[1] === "version"
          ? {
              status: 0,
              stdout: "2.32.4 injected-output\n",
              stderr: "",
              error: null,
            }
          : null,
    },
    {
      name: "legacy-compose-version",
      errorCode: "SELF_HOST_COMPOSE_UNAVAILABLE",
      exitCode: SELF_HOST_CLI_EXIT.PREREQUISITE,
      retryable: true,
      handle: (args) =>
        args[0] === "compose" && args[1] === "version"
          ? {
              status: 0,
              stdout: "1.29.2\n",
              stderr: "",
              error: null,
            }
          : null,
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const docker = dockerRunner({ handle: testCase.handle });
    const result = await executeManagementCommand(
      options("status", directory),
      dependencies({
        runner: docker.runner,
        randomUUID: () =>
          `60100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      }),
    );

    assert.equal(result.ok, false, testCase.name);
    assert.equal(result.error.code, testCase.errorCode, testCase.name);
    assert.equal(result.exitCode, testCase.exitCode, testCase.name);
    assert.equal(result.error.retryable, testCase.retryable, testCase.name);
    assert.equal(
      docker.calls.some((args) => args.includes("config")),
      false,
      testCase.name,
    );
    assert.equal(JSON.stringify(result).includes("injected-output"), false);
    const { record } = await readOnlyOperationRecord(directory, result);
    assert.equal(record.errorCode, testCase.errorCode, testCase.name);
  }
});

test("compose lifecycle rejects unsupported hosts before invoking Docker", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      hostPlatform: () => "win32",
      hostArchitecture: () => "arm64",
      randomUUID: () => "60200000-0000-4000-8000-000000000007",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_HOST_PLATFORM_UNSUPPORTED");
  assert.equal(result.error.retryable, false);
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE);
  assert.equal(docker.calls.length, 0);
  const { record } = await readOnlyOperationRecord(directory, result);
  assert.equal(record.errorCode, "SELF_HOST_HOST_PLATFORM_UNSUPPORTED");
});

test("compose lifecycle rejects release version drift before invoking Docker", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const config = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    config.replace("SELF_HOST_VERSION=1.1.13", "SELF_HOST_VERSION=1.1.14"),
    { mode: 0o600 },
  );
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "60300000-0000-4000-8000-000000000007",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_RELEASE_STATE_INVALID");
  assert.equal(result.error.retryable, false);
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(docker.calls.length, 0);
  const { record } = await readOnlyOperationRecord(directory, result);
  assert.equal(record.errorCode, "SELF_HOST_RELEASE_STATE_INVALID");
});

test("network preflight blocks public HTTP and reports accepted LAN risk", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const local = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    local.replace(
      "SELF_HOST_SITE_ADDRESS=http://localhost:43210",
      "SELF_HOST_SITE_ADDRESS=http://example.com:43210",
    ),
    { mode: 0o600 },
  );

  const blocked = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: dockerRunner().runner,
      randomUUID: () => "70000000-0000-4000-8000-000000000008",
    }),
  );
  assert.equal(blocked.exitCode, SELF_HOST_CLI_EXIT.CONFIG);
  assert.equal(blocked.error.code, "SELF_HOST_PUBLIC_HTTP_BLOCKED");

  await fs.writeFile(
    configPath,
    local
      .replace(
        "SELF_HOST_SITE_ADDRESS=http://localhost:43210",
        "SELF_HOST_SITE_ADDRESS=http://192.168.1.20:43210",
      )
      .replace("SELF_HOST_HTTP_BIND=127.0.0.1", "SELF_HOST_HTTP_BIND=0.0.0.0"),
    { mode: 0o600 },
  );
  const lan = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: dockerRunner().runner,
      randomUUID: () => "71000000-0000-4000-8000-000000000009",
    }),
  );
  assert.equal(lan.ok, true);
  assert.deepEqual(lan.details.configurationWarnings, [
    "SELF_HOST_INSECURE_LAN_HTTP: credentials and session cookies are unencrypted on the local network",
  ]);
});

test("configuration preflight rejects invalid ports and bootstrap expiry", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const original = await fs.readFile(configPath, "utf8");
  const cases = [
    { source: original.replace("SELF_HOST_HTTP_PORT=43210", "SELF_HOST_HTTP_PORT=0"), message: "SELF_HOST_HTTP_PORT must be an integer between 1 and 65535" },
    { source: original.replace("SELF_HOST_HTTP_PORT=43210", "SELF_HOST_HTTP_PORT=8080"), message: "SELF_HOST_HTTP_PORT must match SELF_HOST_SITE_ADDRESS" },
    { source: `${original}SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS=599\n`, message: "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS must be an integer between 600 and 604800" },
    { source: `${original}SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS=604801\n`, message: "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS must be an integer between 600 and 604800" },
    { source: `${original}COMPOSE_PROFILES=docs\n`, message: "must not contain Docker Compose control setting COMPOSE_PROFILES" },
    ...["MAIL_PROVIDER", "SELF_HOST_DOCS_ENABLED", "SELF_HOST_HTTPS_PORT", "SELF_HOST_GATEWAY_ADDRESS", "DISABLE_SIGNUP", "BILLING_PROVIDER"].map(key => ({ source: `${original}${key}=true\n`, message: `unsupported setting ${key}` })),
    { source: original.replace("TELEMETRY_ENABLED=false", "TELEMETRY_ENABLED=true"), message: "TELEMETRY_ENABLED must remain false" },
    { source: `${original}ELEVATION_PROVIDER=mapbox\n`, message: "ELEVATION_PROVIDER must be none or local-dem" },
    { source: original.replace("SELF_HOST_DATABASE_NAME=trainingload", "SELF_HOST_DATABASE_NAME=trainingload/other"), message: "SELF_HOST_DATABASE_NAME must be a 1-63 character URL-safe PostgreSQL identifier" },
    { source: original.replace("SELF_HOST_DATABASE_USER=trainingload", "SELF_HOST_DATABASE_USER=owner@remote"), message: "SELF_HOST_DATABASE_USER must be a 1-63 character URL-safe PostgreSQL identifier" },
    { source: `${original}ELEVATION_PROVIDER=local-dem\nELEVATION_TILE_ZOOM=23\n`, message: "ELEVATION_TILE_ZOOM must be an integer between 0 and 22" },
    { source: `${original}SELF_HOST_DATA_ROOT=\n`, message: "SELF_HOST_DATA_ROOT must not be empty" },
    { source: original.replace("MAP_PROVIDER=none", "MAP_PROVIDER="), message: "MAP_PROVIDER must be none, openfreemap, osm-raster, custom-raster, custom-style, or local" },
  ];

  for (const [index, entry] of cases.entries()) {
    await fs.writeFile(configPath, entry.source, { mode: 0o600 });
    const result = await executeManagementCommand(
      options("status", directory),
      dependencies({
        runner: dockerRunner().runner,
        randomUUID: () =>
          `71500000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.CONFIG);
    assert.equal(result.error.code, "SELF_HOST_CONFIG_INVALID");
    assert.match(result.error.message, new RegExp(entry.message));
  }
});

test("compose commands reject broad config permissions until init repairs them", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  await fs.chmod(configPath, 0o644);

  const rejected = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: dockerRunner().runner,
      randomUUID: () => "72000000-0000-4000-8000-000000000010",
    }),
  );
  assert.equal(rejected.error.code, "SELF_HOST_CONFIG_PERMISSIONS_INSECURE");
  assert.equal(rejected.exitCode, SELF_HOST_CLI_EXIT.CONFIG);

  const repaired = await executeManagementCommand(
    options("init", directory),
    dependencies({
      randomUUID: () => "73000000-0000-4000-8000-000000000011",
    }),
  );
  assert.equal(repaired.status, "completed");
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
});

test("compose commands use a validated per-instance project namespace", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const initial = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    initial.replace(
      "SELF_HOST_PROJECT_NAME=trainingload-selfhost",
      "SELF_HOST_PROJECT_NAME=trainingload-restore-01",
    ),
    { mode: 0o600 },
  );
  const docker = dockerRunner();
  const isolated = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "73500000-0000-4000-8000-000000000011",
    }),
  );
  assert.equal(isolated.ok, true);
  for (const args of docker.calls.filter((args) =>
    args.includes("--project-name"),
  )) {
    const projectIndex = args.indexOf("--project-name");
    assert.equal(args[projectIndex + 1], "trainingload-restore-01");
  }

  await fs.writeFile(
    configPath,
    initial.replace(
      "SELF_HOST_PROJECT_NAME=trainingload-selfhost",
      "SELF_HOST_PROJECT_NAME=../unsafe",
    ),
    { mode: 0o600 },
  );
  const rejected = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: dockerRunner().runner,
      randomUUID: () => "73600000-0000-4000-8000-000000000011",
    }),
  );
  assert.equal(rejected.error.code, "SELF_HOST_CONFIG_INVALID");
  assert.equal(rejected.exitCode, SELF_HOST_CLI_EXIT.CONFIG);
});

test("compose commands isolate instance configuration from host environment overrides", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await fs.appendFile(
    resolve(directory, ".env.selfhost"),
    "AI_API_KEY='token-${HOST_API_FRAGMENT}'\n",
  );
  await fs.appendFile(
    resolve(directory, "compose.yml"),
    '\nx-interpolation-test: "${OUTER_OVERRIDE:-${INNER_OVERRIDE:-$UNBRACED_OVERRIDE}}"\n',
  );
  const docker = dockerRunner();
  const calls = [];
  const result = await executeManagementCommand(
    options("start", directory, { dryRun: true }),
    dependencies({
      env: {
        PATH: process.env.PATH,
        DOCKER_HOST: "unix:///safe-docker.sock",
        SELF_HOST_AUTH_SECRET: "host-auth-override",
        SELF_HOST_DATA_ROOT: "/host-data-override",
        AI_PROVIDER: "openai",
        AI_API_KEY: "host-api-key-override",
        COMPOSE_PROFILES: "docs",
        OUTER_OVERRIDE: "outer-host-override",
        INNER_OVERRIDE: "inner-host-override",
        UNBRACED_OVERRIDE: "unbraced-host-override",
        HOST_API_FRAGMENT: "host-api-fragment",
      },
      runner: (command, args, runnerOptions) => {
        calls.push({ args, env: runnerOptions.env });
        return docker.runner(command, args, runnerOptions);
      },
      randomUUID: () => "41010000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.ok, true);
  const assertIsolated = (observedCalls) => {
    const composeCalls = observedCalls.filter(
      ({ args }) => args[0] === "compose",
    );
    assert.ok(composeCalls.length > 1);
    for (const { env } of composeCalls) {
      assert.equal(env.DOCKER_HOST, "unix:///safe-docker.sock");
      assert.equal(env.PATH, process.env.PATH);
      assert.equal("SELF_HOST_AUTH_SECRET" in env, false);
      assert.equal("SELF_HOST_DATA_ROOT" in env, false);
      assert.equal("AI_PROVIDER" in env, false);
      assert.equal("AI_API_KEY" in env, false);
      assert.equal("COMPOSE_PROFILES" in env, false);
      assert.equal("OUTER_OVERRIDE" in env, false);
      assert.equal("INNER_OVERRIDE" in env, false);
      assert.equal("UNBRACED_OVERRIDE" in env, false);
      assert.equal("HOST_API_FRAGMENT" in env, false);
    }
  };
  assertIsolated(calls);

  calls.length = 0;
  const doctorResult = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      env: {
        PATH: process.env.PATH,
        DOCKER_HOST: "unix:///safe-docker.sock",
        SELF_HOST_AUTH_SECRET: "host-auth-override",
        SELF_HOST_DATA_ROOT: "/host-data-override",
        AI_PROVIDER: "openai",
        AI_API_KEY: "host-api-key-override",
        COMPOSE_PROFILES: "docs",
        OUTER_OVERRIDE: "outer-host-override",
        INNER_OVERRIDE: "inner-host-override",
        UNBRACED_OVERRIDE: "unbraced-host-override",
        HOST_API_FRAGMENT: "host-api-fragment",
      },
      runner: (command, args, runnerOptions) => {
        calls.push({ args, env: runnerOptions.env });
        return docker.runner(command, args, runnerOptions);
      },
      statfs: abundantDisk,
      randomUUID: () => "41010000-0000-4000-8000-000000000004",
    }),
  );
  assert.equal(doctorResult.command, "doctor");
  assert.ok(doctorResult.details.doctor);
  assertIsolated(calls);
});

test("compose commands use and remove one private validated input snapshot", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const composePath = resolve(directory, "compose.yml");
  const buildPath = resolve(directory, "compose.build.yml");
  const originalConfig = await fs.readFile(configPath, "utf8");
  const originalCompose = await fs.readFile(composePath, "utf8");
  const originalBuild = await fs.readFile(buildPath, "utf8");
  const docker = dockerRunner();
  const observations = [];
  let replacedInputs = false;
  const result = await executeManagementCommand(
    options("start", directory, { dryRun: true, source: true }),
    dependencies({
      runner: (command, args, runnerOptions) => {
        if (!replacedInputs && args[0] === "version") {
          replacedInputs = true;
          writeFileSync(configPath, `${originalConfig}COMPOSE_PROFILES=docs\n`);
          writeFileSync(composePath, "services: {}\n");
        }
        const environmentIndex = args.indexOf("--env-file");
        const composeIndex = args.indexOf("-f");
        const buildIndex = args.lastIndexOf("-f");
        if (environmentIndex >= 0 && composeIndex >= 0) {
          const compose = readFileSync(args[composeIndex + 1], "utf8");
          observations.push({
            environmentPath: args[environmentIndex + 1],
            composePath: args[composeIndex + 1],
            buildPath:
              buildIndex > composeIndex ? args[buildIndex + 1] : undefined,
            environment: readFileSync(args[environmentIndex + 1], "utf8"),
            compose,
            build:
              buildIndex > composeIndex
                ? readFileSync(args[buildIndex + 1], "utf8")
                : undefined,
          });
        }
        return docker.runner(command, args, runnerOptions);
      },
      randomUUID: () => "41012500-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(replacedInputs, true);
  assert.ok(observations.length >= 2);
  const snapshotDirectories = new Set();
  for (const observation of observations) {
    assert.notEqual(observation.environmentPath, configPath);
    assert.notEqual(observation.composePath, composePath);
    assert.notEqual(observation.buildPath, buildPath);
    assert.equal(observation.environment, originalConfig);
    assert.equal(observation.compose, originalCompose);
    assert.equal(
      observation.compose.includes(
        "./docker/selfhost/Caddyfile:/etc/caddy/Caddyfile:ro",
      ),
      false,
    );
    assert.equal(observation.build, originalBuild);
    assert.equal(
      dirname(observation.environmentPath),
      dirname(observation.composePath),
    );
    assert.equal(
      dirname(observation.environmentPath),
      dirname(observation.buildPath),
    );
    snapshotDirectories.add(dirname(observation.environmentPath));
  }
  assert.equal(snapshotDirectories.size, 1);
  const [snapshotDirectory] = snapshotDirectories;
  assert.equal(dirname(snapshotDirectory), resolve(directory, ".selfhost"));
  await assert.rejects(fs.stat(snapshotDirectory), { code: "ENOENT" });
  assert.match(await fs.readFile(configPath, "utf8"), /COMPOSE_PROFILES=docs/);
  assert.equal(await fs.readFile(composePath, "utf8"), "services: {}\n");
});

test("authenticated management rejects signed runtime input drift before Docker", async () => {
  for (const changedPath of [
    "compose.yml",
  ]) {
    const directory = await createBundle();
    await executeManagementCommand(options("init", directory), dependencies());
    const signedPaths = ["compose.yml"];
    const checksums = new Map(
      await Promise.all(
        signedPaths.map(async (path) => [
          path,
          createHash("sha256")
            .update(await fs.readFile(resolve(directory, ...path.split("/"))))
            .digest("hex"),
        ]),
      ),
    );
    await fs.appendFile(
      resolve(directory, ...changedPath.split("/")),
      "\n# changed after authentication\n",
    );
    const docker = dockerRunner();

    const result = await executeManagementCommand(
      options("status", directory),
      dependencies({
        authenticatedBundle: {
          root: directory,
          manifest: { releaseVersion: "1.1.13" },
          checksums,
          signatureVerified: true,
        },
        runner: docker.runner,
        randomUUID: () => "41012700-0000-4000-8000-000000000003",
      }),
    );

    assert.equal(result.error.code, "SELF_HOST_RELEASE_STATE_INVALID");
    assert.equal(docker.calls.length, 0);
  }
});

test("compose input snapshot cleanup fails closed after content drift", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner();
  let snapshotPath = null;
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: (command, args, runnerOptions) => {
        const environmentIndex = args.indexOf("--env-file");
        if (snapshotPath === null && environmentIndex >= 0) {
          snapshotPath = args[environmentIndex + 1];
          writeFileSync(snapshotPath, "tampered snapshot\n");
        }
        return docker.runner(command, args, runnerOptions);
      },
      randomUUID: () => "41013000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(await fs.readFile(snapshotPath, "utf8"), "tampered snapshot\n");
});

test("snapshot cleanup failure remains visible after a primary command failure", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner({
    handle: (args) => {
      if (!args.includes("ps")) return null;
      const environmentIndex = args.indexOf("--env-file");
      assert.notEqual(environmentIndex, -1);
      writeFileSync(args[environmentIndex + 1], "tampered snapshot\n");
      return {
        status: 1,
        stdout: "",
        stderr: "injected status failure",
        error: null,
      };
    },
  });
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "41013500-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_STATUS_FAILED");
  assert.deepEqual(result.details.secondaryFailures, [
    {
      code: "SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.FILESYSTEM,
      retryable: false,
    },
  ]);
  assert.equal(
    result.actions.at(-1).code,
    "SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED",
  );
  const record = JSON.parse(
    await fs.readFile(resolve(directory, result.operationRecord), "utf8"),
  );
  assert.equal(record.errorCode, "SELF_HOST_STATUS_FAILED");
  assert.equal(
    record.actionCodes.includes("SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED"),
    true,
  );
});

test("compose commands reject env-file interpolation before invoking Docker", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await fs.appendFile(
    resolve(directory, ".env.selfhost"),
    "SELF_HOST_DATA_ROOT=./${HOST_DATA_SEGMENT}\n",
  );
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("status", directory),
    dependencies({
      env: {
        ...process.env,
        HOST_DATA_SEGMENT: "host-data-segment",
      },
      runner: docker.runner,
      randomUUID: () => "41015000-0000-4000-8000-000000000003",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SELF_HOST_CONFIG_SYNTAX_INVALID");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.CONFIG);
  assert.equal(docker.calls.length, 0);
});

test("instance configuration cannot enable the removed docs profile", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const configPath = resolve(directory, ".env.selfhost");
  const docker = dockerRunner();
  const clean = await executeManagementCommand(options("start", directory, { dryRun: true }), dependencies({
    env: { ...process.env, COMPOSE_PROFILES: "docs" }, runner: docker.runner,
    randomUUID: () => "41020000-0000-4000-8000-000000000003",
  }));
  assert.equal(clean.ok, true);
  assert.equal(docker.calls.some(args => args.includes("--profile")), false);
  await fs.appendFile(configPath, "SELF_HOST_DOCS_ENABLED=true\n");
  const rejected = await executeManagementCommand(options("start", directory, { dryRun: true }), dependencies({
    runner: dockerRunner().runner, randomUUID: () => "41020000-0000-4000-8000-000000000004",
  }));
  assert.equal(rejected.error.code, "SELF_HOST_CONFIG_INVALID");
  assert.match(rejected.error.message, /unsupported setting SELF_HOST_DOCS_ENABLED/);
});

test("stop is idempotent and retains containers and persistent data", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  let psCalls = 0;
  const stoppedRows = readyRows().map((row) =>
    row.State === "running" ? { ...row, State: "exited", ExitCode: 0 } : row,
  );
  const docker = dockerRunner({
    rows: () => (psCalls++ === 0 ? readyRows() : stoppedRows),
  });
  const stopped = await executeManagementCommand(
    options("stop", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "74000000-0000-4000-8000-000000000012",
    }),
  );
  assert.equal(stopped.status, "completed");
  assert.equal(docker.calls.filter((args) => args.includes("stop")).length, 1);
  await fs.stat(resolve(directory, "data/postgres"));

  const repeatedDocker = dockerRunner({ rows: stoppedRows });
  const repeated = await executeManagementCommand(
    options("stop", directory),
    dependencies({
      runner: repeatedDocker.runner,
      randomUUID: () => "75000000-0000-4000-8000-000000000013",
    }),
  );
  assert.equal(repeated.status, "unchanged");
  assert.equal(
    repeatedDocker.calls.some((args) => args.includes("stop")),
    false,
  );
});

test("uninstall removes only Compose resources and retains configuration and data by default", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const dataFile = resolve(directory, "data/uploads/retained.fit");
  await fs.writeFile(dataFile, "retained\n");
  const docker = dockerRunner({
    rows: (calls) =>
      calls.some((args) => args.includes("down")) ? [] : readyRows(),
  });

  const result = await executeManagementCommand(
    options("uninstall", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "75100000-0000-4000-8000-000000000013",
    }),
  );

  assert.equal(result.status, "completed");
  assert.equal(result.details.dataRetained, true);
  assert.equal(await fs.readFile(dataFile, "utf8"), "retained\n");
  await fs.stat(resolve(directory, ".env.selfhost"));
  const down = docker.calls.find((args) => args.includes("down"));
  assert.ok(down);
  assert.equal(down.includes("--remove-orphans"), true);
  assert.equal(down.includes("--volumes"), false);
  assert.equal(down.includes("-v"), false);
});

test("uninstall always runs Compose down so orphan networks are removed", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner({ rows: [] });

  const result = await executeManagementCommand(
    options("uninstall", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "75110000-0000-4000-8000-000000000013",
    }),
  );

  assert.equal(result.status, "completed");
  assert.equal(docker.calls.filter((args) => args.includes("down")).length, 1);
  assert.equal(result.details.dataRetained, true);
});

test("uninstall data deletion requires an exact path and is non-mutating during dry-run", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const dataRoot = resolve(directory, "data");
  const dataFile = resolve(dataRoot, "uploads/delete-me.fit");
  await fs.writeFile(dataFile, "delete-me\n");

  const refusedDocker = dockerRunner();
  const refused = await executeManagementCommand(
    options("uninstall", directory, {
      deleteData: true,
      confirmDataRoot: resolve(directory, "other-data"),
    }),
    dependencies({
      runner: refusedDocker.runner,
      randomUUID: () => "75200000-0000-4000-8000-000000000013",
    }),
  );
  assert.equal(refused.error.code, "SELF_HOST_UNINSTALL_CONFIRMATION_INVALID");
  assert.equal(
    refusedDocker.calls.some((args) => args.includes("down")),
    false,
  );
  assert.equal(await fs.readFile(dataFile, "utf8"), "delete-me\n");

  const dryDocker = dockerRunner();
  const dryRun = await executeManagementCommand(
    options("uninstall", directory, {
      dryRun: true,
      deleteData: true,
      confirmDataRoot: dataRoot,
    }),
    dependencies({
      runner: dryDocker.runner,
      randomUUID: () => "75300000-0000-4000-8000-000000000013",
    }),
  );
  assert.equal(dryRun.status, "planned");
  assert.equal(
    dryDocker.calls.some((args) => args.includes("down")),
    false,
  );
  assert.equal(await fs.readFile(dataFile, "utf8"), "delete-me\n");

  const deleteDocker = dockerRunner({
    rows: (calls) =>
      calls.some((args) => args.includes("down")) ? [] : readyRows(),
  });
  const deleted = await executeManagementCommand(
    options("uninstall", directory, {
      deleteData: true,
      confirmDataRoot: dataRoot,
    }),
    dependencies({
      runner: deleteDocker.runner,
      randomUUID: () => "75400000-0000-4000-8000-000000000013",
    }),
  );
  assert.equal(deleted.status, "completed");
  assert.equal(deleted.details.dataRetained, false);
  await assert.rejects(fs.stat(dataRoot), /ENOENT/);
  assert.equal(
    (await fs.readdir(directory)).some((name) =>
      name.startsWith(".data.selfhost-uninstall-"),
    ),
    false,
  );
  await fs.stat(resolve(directory, ".env.selfhost"));
});

test("uninstall refuses recursive deletion when the confirmed data root is replaced", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const dataRoot = resolve(directory, "data");
  const actualDataRoot = await fs.realpath(dataRoot);
  const preservedRoot = resolve(directory, "preserved-original-data");
  await fs.writeFile(resolve(dataRoot, "uploads/original.fit"), "original\n");
  const docker = dockerRunner({
    rows: (calls) =>
      calls.some((args) => args.includes("down")) ? [] : readyRows(),
  });
  let replaced = false;

  const result = await executeManagementCommand(
    options("uninstall", directory, {
      deleteData: true,
      confirmDataRoot: dataRoot,
    }),
    dependencies({
      runner: docker.runner,
      renameDataRoot: async (source, destination) => {
        if (!replaced && resolve(source) === actualDataRoot) {
          replaced = true;
          await fs.rename(dataRoot, preservedRoot);
          await fs.mkdir(dataRoot, { mode: 0o700 });
          await fs.writeFile(
            resolve(dataRoot, "replacement.txt"),
            "replacement\n",
          );
        }
        return fs.rename(source, destination);
      },
      randomUUID: () => "75410000-0000-4000-8000-000000000013",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
  assert.equal(
    await fs.readFile(resolve(preservedRoot, "uploads/original.fit"), "utf8"),
    "original\n",
  );
  assert.equal(
    await fs.readFile(resolve(dataRoot, "replacement.txt"), "utf8"),
    "replacement\n",
  );
  assert.equal(
    (await fs.readdir(directory)).some((name) =>
      name.startsWith(".data.selfhost-uninstall-"),
    ),
    false,
  );
});

test("backup dry-run is non-mutating and actual backup is verified before publish", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await fs.writeFile(
    resolve(directory, "data/uploads/activity.fit"),
    "fit-data\n",
  );
  const reservedName = await executeManagementCommand(
    options("backup", directory, { output: "CON" }),
    dependencies({
      runner: lifecycleDocker({ dataRoot: resolve(directory, "data") }).runner,
      statfs: abundantDisk,
      randomUUID: () => "74500000-0000-4000-8000-000000000012",
    }),
  );
  assert.equal(reservedName.error.code, "SELF_HOST_BACKUP_PATH_INVALID");
  const dryDocker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const planned = await executeManagementCommand(
    options("backup", directory, { dryRun: true, output: "dry-backup" }),
    dependencies({
      runner: dryDocker.runner,
      streamRunner: dryDocker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "78000000-0000-4000-8000-000000000016",
    }),
  );
  assert.equal(planned.status, "planned");
  await assert.rejects(fs.stat(resolve(directory, "data/backups/dry-backup")), {
    code: "ENOENT",
  });
  assert.equal(dryDocker.streamCalls.length, 0);
  assert.equal(
    dryDocker.calls.some((args) => args.includes("stop")),
    false,
  );
  assert.equal(
    dryDocker.calls.some((args) => args.includes("run")),
    false,
  );
  const uploadInspection = dryDocker.calls.find((args) =>
    args.at(-1)?.includes("SELF_HOST_UPLOAD_BYTES"),
  );
  assert.ok(uploadInspection);
  assert.match(uploadInspection.at(-1), /opendirSync/);
  assert.match(uploadInspection.at(-1), /maximumFiles=100000/);
  assert.match(uploadInspection.at(-1), /maximumDirectories=100000/);
  assert.match(uploadInspection.at(-1), /maximumDepth=64/);

  const { docker, result, bundleRoot } = await createManagedBackup(
    await createBundle(),
    "79000000-0000-4000-8000-000000000017",
    "verified-backup",
  );
  assert.equal(result.status, "completed");
  const verified = await verifyBackupBundle(bundleRoot);
  assert.equal(verified.manifest.database.recordCounts.activity, 3);
  assert.equal(verified.manifest.uploads.fileCount, 2);
  assert.equal(
    docker.calls.some(
      (args) => args.includes("stop") && args.includes("client"),
    ),
    true,
  );
  assert.equal(
    docker.calls.some((args) => args.includes("up") && args.includes("--wait")),
    true,
  );
  const sourceConfig = await fs.readFile(
    resolve(dirname(bundleRoot), "../../.env.selfhost"),
    "utf8",
  );
  const authSecret = sourceConfig.match(/^SELF_HOST_AUTH_SECRET=(.+)$/m)?.[1];
  for (const file of verified.checksums.keys()) {
    const content = await fs.readFile(resolve(bundleRoot, ...file.split("/")));
    assert.equal(content.includes(Buffer.from(authSecret)), false, file);
  }
});

test("backup fault injection resumes services and leaves no published partial bundle", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const preflightDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    uploadInspectionFails: true,
  });
  const preflight = await executeManagementCommand(
    options("backup", directory, { output: "preflight-failure" }),
    dependencies({
      runner: preflightDocker.runner,
      streamRunner: preflightDocker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "79400000-0000-4000-8000-000000000017",
    }),
  );
  assert.equal(
    preflight.error.code,
    "SELF_HOST_BACKUP_UPLOAD_INSPECTION_FAILED",
  );
  assert.equal(
    preflightDocker.calls.some((args) => args.includes("stop")),
    false,
  );

  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    quiesceFails: true,
  });
  const result = await executeManagementCommand(
    options("backup", directory, { output: "injected-failure" }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "79500000-0000-4000-8000-000000000017",
    }),
  );
  assert.equal(result.error.code, "SELF_HOST_BACKUP_QUIESCE_FAILED");
  assert.equal(
    docker.calls.some((args) => args.includes("up") && args.includes("--wait")),
    true,
  );
  assert.deepEqual(await fs.readdir(resolve(directory, "data/backups")), []);
});

test("backup removes the final destination when publication durability fails", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const backupsDirectory = resolve(directory, "data/backups");
  const output = resolve(backupsDirectory, "durability-failure");
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const removed = [];

  const result = await executeManagementCommand(
    options("backup", directory, { output: "durability-failure" }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      backupPublishSync: async (path) => {
        assert.equal(resolve(path), backupsDirectory);
        const error = new Error("injected backup publication sync failure");
        error.code = "EIO";
        throw error;
      },
      removeTree: async (path, removeOptions) => {
        removed.push(resolve(path));
        await fs.rm(path, removeOptions);
      },
      randomUUID: () => "79525000-0000-4000-8000-000000000017",
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_FILESYSTEM_ERROR");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.deepEqual(removed, [output]);
  assert.equal(
    docker.calls.some((args) => args.includes("up") && args.includes("--wait")),
    true,
  );
  assert.deepEqual(await fs.readdir(backupsDirectory), []);
});

test("backup preserves staging and lock paths it did not create", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const operationId = "79550000-0000-4000-8000-000000000017";
  const backupsDirectory = resolve(directory, "data/backups");
  const staging = resolve(
    backupsDirectory,
    `.concurrent-owner.partial-${operationId}`,
  );
  const lock = resolve(backupsDirectory, ".concurrent-owner.lock");
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  let claimed = false;
  const result = await executeManagementCommand(
    options("backup", directory, { output: "concurrent-owner" }),
    dependencies({
      runner: (command, args, runnerOptions) => {
        if (
          !claimed &&
          args[0] === "info" &&
          args.at(-1) === "{{json .SecurityOptions}}"
        ) {
          claimed = true;
          mkdirSync(staging);
          writeFileSync(resolve(staging, "foreign.txt"), "foreign staging\n");
          writeFileSync(lock, "foreign lock\n");
        }
        return docker.runner(command, args, runnerOptions);
      },
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => operationId,
    }),
  );

  assert.equal(result.error.code, "SELF_HOST_BACKUP_ALREADY_EXISTS");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
  assert.equal(
    await fs.readFile(resolve(staging, "foreign.txt"), "utf8"),
    "foreign staging\n",
  );
  assert.equal(await fs.readFile(lock, "utf8"), "foreign lock\n");
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    false,
  );
});

test("backup cleanup failures are fail-closed and preserve the primary error", async () => {
  const primaryDirectory = await createBundle();
  await executeManagementCommand(
    options("init", primaryDirectory),
    dependencies(),
  );
  const primaryLock = resolve(
    primaryDirectory,
    "data/backups/.cleanup-after-primary.lock",
  );
  const primaryDocker = lifecycleDocker({
    dataRoot: resolve(primaryDirectory, "data"),
    quiesceFails: true,
  });
  let primaryLockReplaced = false;
  const primaryResult = await executeManagementCommand(
    options("backup", primaryDirectory, {
      output: "cleanup-after-primary",
    }),
    dependencies({
      runner: (command, args, runnerOptions) => {
        if (!primaryLockReplaced && args.includes("up")) {
          primaryLockReplaced = true;
          rmSync(primaryLock);
          mkdirSync(primaryLock);
        }
        return primaryDocker.runner(command, args, runnerOptions);
      },
      streamRunner: primaryDocker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "79600000-0000-4000-8000-000000000017",
    }),
  );
  assert.equal(primaryResult.error.code, "SELF_HOST_BACKUP_QUIESCE_FAILED");
  assert.deepEqual(primaryResult.details.secondaryFailures, [
    {
      code: "SELF_HOST_BACKUP_CLEANUP_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.FILESYSTEM,
      retryable: false,
    },
  ]);
  assert.equal(
    primaryResult.actions.at(-1).code,
    "SELF_HOST_BACKUP_CLEANUP_FAILED",
  );
  assert.equal((await fs.lstat(primaryLock)).isDirectory(), true);

  const successDirectory = await createBundle();
  await executeManagementCommand(
    options("init", successDirectory),
    dependencies(),
  );
  const successLock = resolve(
    successDirectory,
    "data/backups/.cleanup-after-success.lock",
  );
  const successDocker = lifecycleDocker({
    dataRoot: resolve(successDirectory, "data"),
  });
  const successResult = await executeManagementCommand(
    options("backup", successDirectory, {
      output: "cleanup-after-success",
    }),
    dependencies({
      runner: successDocker.runner,
      backupCleanupSync: async () => {
        const error = new Error("injected backup cleanup sync failure");
        error.code = "EIO";
        throw error;
      },
      streamRunner: successDocker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "79700000-0000-4000-8000-000000000017",
    }),
  );
  assert.equal(successResult.error.code, "SELF_HOST_BACKUP_CLEANUP_FAILED");
  assert.equal(successResult.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  await assert.doesNotReject(
    verifyBackupBundle(
      resolve(successDirectory, "data/backups/cleanup-after-success"),
    ),
  );
  await assert.rejects(fs.stat(successLock), { code: "ENOENT" });
});

test("restore rebuilds a clean exact-release target and emits a schema-valid report", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "80000000-0000-4000-8000-000000000018",
    "restore-source",
  );
  assert.equal(backup.result.ok, true);

  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "81000000-0000-4000-8000-000000000019",
    }),
  );
  const dryDocker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
  });
  const planned = await executeManagementCommand(
    options("restore", target, {
      backupPath: backup.bundleRoot,
      dryRun: true,
    }),
    dependencies({
      runner: dryDocker.runner,
      streamRunner: dryDocker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "81500000-0000-4000-8000-000000000019",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.equal(dryDocker.streamCalls.length, 0);
  assert.equal(
    dryDocker.calls.some(
      (args) =>
        args.includes("run") || args.includes("up") || args.includes("stop"),
    ),
    false,
  );
  await assert.rejects(
    fs.stat(resolve(target, ".selfhost/restore-incomplete.json")),
    { code: "ENOENT" },
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
    beforePgRestore: async (streamOptions) => {
      await fs.writeFile(
        resolve(backup.bundleRoot, "database.dump"),
        "source-changed-after-verification\n",
      );
      assert.notEqual(
        resolve(streamOptions.inputPath),
        resolve(backup.bundleRoot, "database.dump"),
      );
    },
  });
  const restored = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "82000000-0000-4000-8000-000000000020",
    }),
  );
  assert.equal(restored.status, "completed");
  assert.equal(restored.details.ready, true);
  const restoreStream = docker.streamCalls.find(({ args }) =>
    args.includes("pg_restore"),
  );
  assert.ok(restoreStream);
  const snapshotRoot = dirname(restoreStream.streamOptions.inputPath);
  assert.equal(
    snapshotRoot,
    resolve(
      target,
      "data/operations/.restore-input-82000000-0000-4000-8000-000000000020",
    ),
  );
  await assert.rejects(fs.stat(snapshotRoot), { code: "ENOENT" });
  assert.equal(
    await fs.readFile(resolve(target, "data/uploads/activity.fit"), "utf8"),
    "fit-data\n",
  );
  await assert.rejects(
    fs.stat(resolve(target, ".selfhost/restore-incomplete.json")),
    { code: "ENOENT" },
  );
  const report = JSON.parse(
    await fs.readFile(restored.details.restoreReport, "utf8"),
  );
  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-restore-report.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.status, "completed");
});

test("failed restore remains blocked, stops services, and records a failed report", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "83000000-0000-4000-8000-000000000021",
    "failure-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "84000000-0000-4000-8000-000000000022",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
    pgRestoreFails: true,
  });
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      randomUUID: () => "85000000-0000-4000-8000-000000000023",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_RESTORE_DATABASE_FAILED");
  const restoreStream = docker.streamCalls.find(({ args }) =>
    args.includes("pg_restore"),
  );
  assert.ok(restoreStream);
  await assert.rejects(
    fs.stat(dirname(restoreStream.streamOptions.inputPath)),
    {
      code: "ENOENT",
    },
  );
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    true,
  );
  const reports = (
    await fs.readdir(resolve(target, "data/diagnostics"))
  ).filter((name) => name.startsWith("restore-"));
  assert.equal(reports.length, 1);
  const report = JSON.parse(
    await fs.readFile(resolve(target, "data/diagnostics", reports[0]), "utf8"),
  );
  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-restore-report.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "SELF_HOST_RESTORE_DATABASE_FAILED");

  const blocked = await executeManagementCommand(
    options("start", target),
    dependencies({
      runner: dockerRunner({ unavailable: true }).runner,
      randomUUID: () => "86000000-0000-4000-8000-000000000024",
    }),
  );
  assert.equal(blocked.error.code, "SELF_HOST_RESTORE_INCOMPLETE");
  assert.equal(blocked.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
});

test("restore rejects backup drift before starting PostgreSQL", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "85100000-0000-4000-8000-000000000023",
    "drift-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "85200000-0000-4000-8000-000000000023",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
  });
  const mutatingDiskCheck = async (...args) => {
    const databasePath = resolve(backup.bundleRoot, "database.dump");
    const original = await fs.readFile(databasePath);
    await fs.writeFile(databasePath, Buffer.alloc(original.length, 0x78));
    return abundantDisk(...args);
  };
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: mutatingDiskCheck,
      randomUUID: () => "85300000-0000-4000-8000-000000000023",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_RESTORE_SNAPSHOT_FAILED");
  assert.equal(
    docker.calls.some((args) => args.includes("up")),
    false,
  );
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  await assert.rejects(
    fs.stat(
      resolve(
        target,
        "data/operations/.restore-input-85300000-0000-4000-8000-000000000023",
      ),
    ),
    { code: "ENOENT" },
  );
});

test("restore snapshot cleanup failure leaves the target blocked", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "85400000-0000-4000-8000-000000000023",
    "cleanup-failure-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "85500000-0000-4000-8000-000000000023",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
    pgRestoreFails: true,
  });
  const snapshotRoot = resolve(
    target,
    "data/operations/.restore-input-85600000-0000-4000-8000-000000000023",
  );
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      removeTree: async (path, options) => {
        if (resolve(path) === snapshotRoot) {
          const error = new Error("injected snapshot cleanup failure");
          error.code = "EIO";
          throw error;
        }
        return fs.rm(path, options);
      },
      randomUUID: () => "85600000-0000-4000-8000-000000000023",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED");
  assert.equal(failed.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.deepEqual(failed.details.secondaryFailures, [
    {
      code: "SELF_HOST_RESTORE_DATABASE_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: false,
    },
  ]);
  assert.equal(failed.actions.at(-1).code, "SELF_HOST_RESTORE_DATABASE_FAILED");
  await fs.stat(snapshotRoot);
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    true,
  );
});

test("restore report failure keeps the target blocked and records the failed attempt", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "86100000-0000-4000-8000-000000000024",
    "report-failure-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "86200000-0000-4000-8000-000000000024",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
  });
  const injectedAtomicWrite = async (path, content, mode = 0o600) => {
    if (/-completed\.json$/.test(path)) {
      const error = new Error("injected completed restore report failure");
      error.code = "ENOSPC";
      throw error;
    }
    await fs.writeFile(path, content, { encoding: "utf8", flag: "wx", mode });
  };
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      atomicWrite: injectedAtomicWrite,
      randomUUID: () => "86300000-0000-4000-8000-000000000024",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_RESTORE_REPORT_FAILED");
  assert.equal(failed.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    true,
  );
  const reports = (
    await fs.readdir(resolve(target, "data/diagnostics"))
  ).filter((name) => name.startsWith("restore-"));
  assert.equal(reports.length, 1);
  assert.match(reports[0], /-failed\.json$/);
  const report = JSON.parse(
    await fs.readFile(resolve(target, "data/diagnostics", reports[0]), "utf8"),
  );
  assert.equal(report.status, "failed");
  assert.equal(report.errorCode, "SELF_HOST_RESTORE_REPORT_FAILED");
});

test("restore preserves its command failure when the required failed report cannot be written", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "86310000-0000-4000-8000-000000000024",
    "failed-report-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "86320000-0000-4000-8000-000000000024",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
    pgRestoreFails: true,
  });
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      atomicWrite: async (path, content, mode = 0o600) => {
        if (/-failed\.json$/.test(path)) {
          const error = new Error("injected failed restore report failure");
          error.code = "ENOSPC";
          throw error;
        }
        await fs.writeFile(path, content, {
          encoding: "utf8",
          flag: "wx",
          mode,
        });
      },
      randomUUID: () => "86330000-0000-4000-8000-000000000024",
    }),
  );

  assert.equal(failed.error.code, "SELF_HOST_RESTORE_REPORT_FAILED");
  assert.equal(failed.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.deepEqual(failed.details.secondaryFailures, [
    {
      code: "SELF_HOST_RESTORE_DATABASE_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: false,
    },
  ]);
  assert.equal(failed.actions.at(-1).code, "SELF_HOST_RESTORE_DATABASE_FAILED");
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    true,
  );
  const reports = (
    await fs.readdir(resolve(target, "data/diagnostics"))
  ).filter((name) => name.startsWith("restore-"));
  assert.deepEqual(reports, []);
});

test("restore re-arms its blocking marker when durable completion fails", async () => {
  const source = await createBundle();
  const backup = await createManagedBackup(
    source,
    "86400000-0000-4000-8000-000000000024",
    "marker-sync-failure-source",
  );
  const target = await createBundle();
  await executeManagementCommand(
    options("init", target),
    dependencies({
      randomUUID: () => "86500000-0000-4000-8000-000000000024",
    }),
  );
  const docker = lifecycleDocker({
    dataRoot: resolve(target, "data"),
    bundleRoot: backup.bundleRoot,
    restore: true,
  });
  const failed = await executeManagementCommand(
    options("restore", target, { backupPath: backup.bundleRoot }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      syncDirectory: async (path) => {
        if (resolve(path) === resolve(target, ".selfhost")) {
          const error = new Error("injected directory sync failure");
          error.code = "EIO";
          throw error;
        }
      },
      randomUUID: () => "86600000-0000-4000-8000-000000000024",
    }),
  );

  assert.equal(failed.error.code, "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED");
  assert.equal(failed.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  await fs.stat(resolve(target, ".selfhost/restore-incomplete.json"));
  assert.equal(
    docker.calls.some((args) => args.includes("stop")),
    true,
  );
  const reports = (
    await fs.readdir(resolve(target, "data/diagnostics"))
  ).filter((name) => name.startsWith("restore-"));
  assert.equal(reports.length, 2);
  assert.equal(
    reports.some((name) => name.endsWith("-completed.json")),
    true,
  );
  const failedReportName = reports.find((name) =>
    name.endsWith("-failed.json"),
  );
  assert.ok(failedReportName);
  const failedReport = JSON.parse(
    await fs.readFile(
      resolve(target, "data/diagnostics", failedReportName),
      "utf8",
    ),
  );
  assert.equal(
    failedReport.errorCode,
    "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
  );
});

test("upgrade dry-run, verified upgrade, and application-only rollback share one lifecycle", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  await fs.writeFile(
    resolve(directory, "data/uploads/upgrade-fixture.fit"),
    "upgrade fixture\n",
  );
  const releaseManifest = upgradeReleaseManifest();
  const dryDocker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const planned = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/release-evidence",
      dryRun: true,
    }),
    dependencies({
      runner: dryDocker.runner,
      streamRunner: dryDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async (path) => {
        assert.equal(path, "/verified/release-evidence");
        return {
          root: path,
          manifest: releaseManifest,
          signatureVerified: true,
        };
      },
      randomUUID: () => "87000000-0000-4000-8000-000000000025",
    }),
  );
  assert.equal(planned.status, "planned");
  assert.equal(planned.details.applicationRollbackAllowed, true);
  assert.equal(
    dryDocker.calls.some((args) => args[0] === "pull" || args.includes("stop")),
    false,
  );

  const upgradeDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const upgradeEnvironmentVersions = [];
  const upgraded = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/release-evidence",
    }),
    dependencies({
      runner: (command, args, runnerOptions) => {
        if (args[0] === "compose" && args.includes("up")) {
          const environmentIndex = args.indexOf("--env-file");
          upgradeEnvironmentVersions.push(
            parseEnvironmentFile(
              readFileSync(args[environmentIndex + 1], "utf8"),
            ).get("SELF_HOST_VERSION"),
          );
        }
        return upgradeDocker.runner(command, args, runnerOptions);
      },
      streamRunner: upgradeDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/release-evidence",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      randomUUID: () => "88000000-0000-4000-8000-000000000026",
    }),
  );
  assert.equal(upgraded.status, "completed");
  assert.equal(upgraded.releaseVersion, "1.1.14");
  assert.equal(upgraded.details.applicationRollbackAllowed, true);
  assert.equal(
    upgradeDocker.calls.filter((args) => args[0] === "pull").length,
    3,
  );
  assert.equal(upgradeEnvironmentVersions.at(-1), "1.1.14");
  const upgradedConfig = parseEnvironmentFile(
    await fs.readFile(resolve(directory, ".env.selfhost"), "utf8"),
  );
  assert.equal(upgradedConfig.get("SELF_HOST_VERSION"), "1.1.14");
  assert.equal(
    upgradedConfig.get("SELF_HOST_MIGRATE_IMAGE"),
    releaseManifest.images.migrate.reference,
  );
  assert.equal(
    upgradedConfig.get("SELF_HOST_SERVER_IMAGE"),
    releaseManifest.images.server.reference,
  );
  await assert.rejects(
    fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json")),
    { code: "ENOENT" },
  );
  const upgradeReport = JSON.parse(
    await fs.readFile(upgraded.details.upgradeReport, "utf8"),
  );
  const upgradeReportSchema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-upgrade-report.schema.json"),
      "utf8",
    ),
  );
  const validateUpgradeReport = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(upgradeReportSchema);
  assert.equal(
    validateUpgradeReport(upgradeReport),
    true,
    JSON.stringify(validateUpgradeReport.errors),
  );
  assert.equal(upgradeReport.status, "completed");
  assert.equal(upgradeReport.databaseRollback, "unsupported");

  const configPath = resolve(directory, ".env.selfhost");
  const authenticConfig = await fs.readFile(configPath, "utf8");
  await fs.writeFile(
    configPath,
    authenticConfig.replace(
      releaseManifest.images.server.reference,
      `example/tampered-server@sha256:${"f".repeat(64)}`,
    ),
  );
  const tamperedRollback = await executeManagementCommand(
    options("rollback", directory, {
      rollbackVersion: "1.1.13",
      dryRun: true,
    }),
    dependencies({
      runner: lifecycleDocker({ dataRoot: resolve(directory, "data") }).runner,
      randomUUID: () => "88500000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(tamperedRollback.error.code, "SELF_HOST_ROLLBACK_STATE_INVALID");
  await fs.writeFile(configPath, authenticConfig);

  const rollbackDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const rollbackEnvironmentVersions = [];
  const rolledBack = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: (command, args, runnerOptions) => {
        if (args[0] === "compose" && args.includes("up")) {
          const environmentIndex = args.indexOf("--env-file");
          rollbackEnvironmentVersions.push(
            parseEnvironmentFile(
              readFileSync(args[environmentIndex + 1], "utf8"),
            ).get("SELF_HOST_VERSION"),
          );
        }
        return rollbackDocker.runner(command, args, runnerOptions);
      },
      randomUUID: () => "89000000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(rolledBack.status, "completed");
  assert.equal(rolledBack.releaseVersion, "1.1.13");
  assert.equal(rolledBack.details.databaseRollback, "unsupported");
  assert.equal(rollbackEnvironmentVersions.at(-1), "1.1.13");
  const rollbackReport = JSON.parse(
    await fs.readFile(rolledBack.details.rollbackReport, "utf8"),
  );
  assert.equal(
    validateUpgradeReport(rollbackReport),
    true,
    JSON.stringify(validateUpgradeReport.errors),
  );
  assert.equal(rollbackReport.command, "rollback");
  const rolledBackConfig = parseEnvironmentFile(
    await fs.readFile(resolve(directory, ".env.selfhost"), "utf8"),
  );
  assert.equal(rolledBackConfig.get("SELF_HOST_VERSION"), "1.1.13");
  assert.equal(
    rolledBackConfig.get("SELF_HOST_MIGRATE_IMAGE"),
    sourceImageReferences.migrate,
  );
  assert.equal(
    rolledBackConfig.get("SELF_HOST_SERVER_IMAGE"),
    sourceImageReferences.server,
  );
  await assert.rejects(
    fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json")),
    { code: "ENOENT" },
  );
});

test("upgrade and rollback re-arm lifecycle state when durable completion fails", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  const releaseManifest = upgradeReleaseManifest();
  const upgradeDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const failDirectorySync = async () => {
    const error = new Error("injected directory sync failure");
    error.code = "EIO";
    throw error;
  };
  const failedUpgrade = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/marker-sync-release",
    }),
    dependencies({
      runner: upgradeDocker.runner,
      streamRunner: upgradeDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/marker-sync-release",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      syncDirectory: failDirectorySync,
      randomUUID: () => "89500000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(
    failedUpgrade.error.code,
    "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
  );
  assert.equal(
    upgradeDocker.calls.some(
      (args) => args.includes("stop") && args.includes("server"),
    ),
    true,
  );
  const markerPath = resolve(directory, ".selfhost/upgrade-incomplete.json");
  const upgradeMarker = JSON.parse(await fs.readFile(markerPath, "utf8"));
  assert.equal(upgradeMarker.kind, "trainingload-selfhost-upgrade-incomplete");

  const rollbackDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const failedRollback = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: rollbackDocker.runner,
      syncDirectory: failDirectorySync,
      randomUUID: () => "89600000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(
    failedRollback.error.code,
    "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
  );
  assert.equal(
    rollbackDocker.calls.some(
      (args) => args.includes("stop") && args.includes("server"),
    ),
    true,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(markerPath, "utf8")),
    upgradeMarker,
  );

  const blocked = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: dockerRunner({ unavailable: true }).runner,
      randomUUID: () => "89700000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(blocked.error.code, "SELF_HOST_UPGRADE_INCOMPLETE");

  const retryDocker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const recovered = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: retryDocker.runner,
      randomUUID: () => "89800000-0000-4000-8000-000000000027",
    }),
  );
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.releaseVersion, "1.1.13");
  await assert.rejects(fs.stat(markerPath), { code: "ENOENT" });
});

test("upgrade requires cryptographic release inventory verification", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const runner = (command, args, commandOptions) => {
    if (command === "cosign") {
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: new Error("cosign is unavailable"),
      };
    }
    return docker.runner(command, args, commandOptions);
  };
  const refused = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/signed-release",
      dryRun: true,
    }),
    dependencies({
      runner,
      releaseVerifier: async (_path, { verifySignature }) => {
        await verifySignature({
          checksumsPath: "/verified/signed-release/checksums.txt",
          bundlePath: "/verified/signed-release/checksums.bundle.json",
          identity:
            "https://github.com/Buerber/trainingloadai/.github/workflows/selfhost-images.yml@refs/tags/v1.1.14",
          oidcIssuer: "https://token.actions.githubusercontent.com",
        });
        return {
          manifest: upgradeReleaseManifest(),
          signatureVerified: true,
        };
      },
      randomUUID: () => "88500000-0000-4000-8000-000000000026",
    }),
  );
  assert.equal(refused.error.code, "SELF_HOST_COSIGN_UNAVAILABLE");
  assert.equal(refused.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE);
  assert.equal(
    docker.calls.some((args) => args[0] === "pull" || args.includes("stop")),
    false,
  );
});

test("failed upgrade is stopped, blocks start, and remains explicitly rollbackable", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  const releaseManifest = upgradeReleaseManifest();
  const failingDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    upgradeFails: true,
  });
  let upgradeStartFailed = false;
  const failingContainmentRunner = (command, args, commandOptions) => {
    const result = failingDocker.runner(command, args, commandOptions);
    if (args.includes("up") && result.status !== 0) {
      upgradeStartFailed = true;
    }
    if (
      upgradeStartFailed &&
      args.includes("stop") &&
      args.includes("server")
    ) {
      return {
        status: 1,
        stdout: "",
        stderr: "injected containment stop failure",
        error: null,
      };
    }
    return result;
  };
  const failed = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/failing-release",
    }),
    dependencies({
      runner: failingContainmentRunner,
      streamRunner: failingDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/failing-release",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      randomUUID: () => "90000000-0000-4000-8000-000000000028",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_UPGRADE_START_FAILED");
  assert.deepEqual(failed.details.secondaryFailures, [
    {
      code: "SELF_HOST_STOP_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: true,
    },
  ]);
  assert.equal(failed.actions.at(-1).code, "SELF_HOST_STOP_FAILED");
  await fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json"));
  assert.equal(
    failingDocker.calls.some(
      (args) => args.includes("stop") && args.includes("server"),
    ),
    true,
  );
  const reports = await fs.readdir(resolve(directory, ".selfhost/upgrades"));
  const failedReportName = reports.find((name) =>
    name.endsWith("-failed.json"),
  );
  assert.ok(failedReportName);
  const failedReport = JSON.parse(
    await fs.readFile(
      resolve(directory, ".selfhost/upgrades", failedReportName),
      "utf8",
    ),
  );
  assert.equal(failedReport.errorCode, "SELF_HOST_UPGRADE_START_FAILED");

  const blocked = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: dockerRunner({ unavailable: true }).runner,
      randomUUID: () => "91000000-0000-4000-8000-000000000029",
    }),
  );
  assert.equal(blocked.error.code, "SELF_HOST_UPGRADE_INCOMPLETE");

  const rollbackDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const recovered = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: rollbackDocker.runner,
      randomUUID: () => "92000000-0000-4000-8000-000000000030",
    }),
  );
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.releaseVersion, "1.1.13");
  await assert.rejects(
    fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json")),
    { code: "ENOENT" },
  );
});

test("upgrade preserves its command failure when the required failed report cannot be written", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  const releaseManifest = upgradeReleaseManifest();
  const docker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    upgradeFails: true,
  });
  const failed = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/unreportable-release",
    }),
    dependencies({
      runner: docker.runner,
      streamRunner: docker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/unreportable-release",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      atomicWrite: async (path, content, mode = 0o600) => {
        if (
          path.includes("/.selfhost/upgrades/") &&
          path.endsWith("-failed.json")
        ) {
          const error = new Error("injected failed upgrade report failure");
          error.code = "ENOSPC";
          throw error;
        }
        await fs.writeFile(path, content, {
          encoding: "utf8",
          flag: "wx",
          mode,
        });
      },
      randomUUID: () => "92500000-0000-4000-8000-000000000030",
    }),
  );

  assert.equal(failed.error.code, "SELF_HOST_UPGRADE_REPORT_FAILED");
  assert.equal(failed.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.deepEqual(failed.details.secondaryFailures, [
    {
      code: "SELF_HOST_UPGRADE_START_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: true,
    },
  ]);
  assert.equal(failed.actions.at(-1).code, "SELF_HOST_UPGRADE_START_FAILED");
  await fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json"));
  const reports = await fs.readdir(resolve(directory, ".selfhost/upgrades"));
  assert.equal(
    reports.some((name) => name.endsWith("-failed.json")),
    false,
  );
});

test("rollback retries safely after configuration was already switched", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  const releaseManifest = upgradeReleaseManifest();
  const upgradeDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const upgraded = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/retry-release",
    }),
    dependencies({
      runner: upgradeDocker.runner,
      streamRunner: upgradeDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/retry-release",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      randomUUID: () => "93000000-0000-4000-8000-000000000031",
    }),
  );
  assert.equal(upgraded.status, "completed");

  const failingRollbackDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
    rollbackFails: true,
  });
  let rollbackStartFailed = false;
  const failingRollbackContainmentRunner = (command, args, commandOptions) => {
    const result = failingRollbackDocker.runner(command, args, commandOptions);
    if (args.includes("up") && result.status !== 0) {
      rollbackStartFailed = true;
    }
    if (
      rollbackStartFailed &&
      args.includes("stop") &&
      args.includes("server")
    ) {
      return {
        status: 1,
        stdout: "",
        stderr: "injected rollback containment stop failure",
        error: null,
      };
    }
    return result;
  };
  const failed = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: failingRollbackContainmentRunner,
      randomUUID: () => "94000000-0000-4000-8000-000000000032",
    }),
  );
  assert.equal(failed.error.code, "SELF_HOST_ROLLBACK_START_FAILED");
  assert.deepEqual(failed.details.secondaryFailures, [
    {
      code: "SELF_HOST_STOP_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      retryable: true,
    },
  ]);
  assert.equal(failed.actions.at(-1).code, "SELF_HOST_STOP_FAILED");
  const switchedConfig = parseEnvironmentFile(
    await fs.readFile(resolve(directory, ".env.selfhost"), "utf8"),
  );
  assert.equal(switchedConfig.get("SELF_HOST_VERSION"), "1.1.13");
  await fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json"));

  const retryDocker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const recovered = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: retryDocker.runner,
      randomUUID: () => "95000000-0000-4000-8000-000000000033",
    }),
  );
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.releaseVersion, "1.1.13");
  await assert.rejects(
    fs.stat(resolve(directory, ".selfhost/upgrade-incomplete.json")),
    { code: "ENOENT" },
  );
});

test("rollback refuses a tampered upgrade report", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  await useDigestBoundSourceImages(directory);
  const releaseManifest = upgradeReleaseManifest();
  const upgradeDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const upgraded = await executeManagementCommand(
    options("upgrade", directory, {
      releasePath: "/verified/tamper-release",
    }),
    dependencies({
      runner: upgradeDocker.runner,
      streamRunner: upgradeDocker.streamRunner,
      statfs: abundantDisk,
      releaseVerifier: async () => ({
        root: "/verified/tamper-release",
        manifest: releaseManifest,
        signatureVerified: true,
      }),
      randomUUID: () => "96000000-0000-4000-8000-000000000034",
    }),
  );
  const report = JSON.parse(
    await fs.readFile(upgraded.details.upgradeReport, "utf8"),
  );
  report.untrusted = true;
  await fs.writeFile(
    upgraded.details.upgradeReport,
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const rollbackDocker = lifecycleDocker({
    dataRoot: resolve(directory, "data"),
  });
  const refused = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.13" }),
    dependencies({
      runner: rollbackDocker.runner,
      randomUUID: () => "97000000-0000-4000-8000-000000000035",
    }),
  );
  assert.equal(refused.error.code, "SELF_HOST_UPGRADE_STATE_INVALID");
  assert.equal(
    rollbackDocker.calls.some((args) => args.includes("up")),
    false,
  );
});

test("rollback rejects an upgrade report directory beyond its scan limit", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const reportDirectory = resolve(directory, ".selfhost/upgrades");
  await fs.mkdir(reportDirectory, { recursive: true });
  await Promise.all(
    Array.from(
      {
        length: SELF_HOST_HISTORY_LIMITS.maximumUpgradeReportEntries + 1,
      },
      (_, index) =>
        fs.writeFile(resolve(reportDirectory, `flood-${index}`), ""),
    ),
  );
  const docker = lifecycleDocker({ dataRoot: resolve(directory, "data") });
  const result = await executeManagementCommand(
    options("rollback", directory, { rollbackVersion: "1.1.12" }),
    dependencies({
      runner: docker.runner,
      randomUUID: () => "97100000-0000-4000-8000-000000000035",
    }),
  );

  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_UPGRADE_STATE_INVALID");
  assert.equal(
    docker.calls.some((args) => args.includes("up")),
    false,
  );
});

test("invalid instance directories return stable JSON-shaped failures", async () => {
  const missing = resolve(tmpdir(), `missing-selfhost-${process.pid}`);
  const result = await executeManagementCommand(
    options("init", missing),
    dependencies({
      randomUUID: () => "76000000-0000-4000-8000-000000000014",
    }),
  );
  const validators = await schemaValidators();

  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.CONFIG);
  assert.equal(result.error.code, "SELF_HOST_INSTANCE_DIRECTORY_INVALID");
  assert.equal(result.operationRecord, null);
  assert.equal(
    validators.result(result),
    true,
    JSON.stringify(validators.result.errors),
  );
});

test("instance operation lock serializes mutations without blocking status", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const lockPath = await writeOperationLockFixture(directory);
  const statusDocker = dockerRunner();
  const status = await executeManagementCommand(
    options("status", directory),
    dependencies({
      runner: statusDocker.runner,
      randomUUID: () => "75100000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(status.status, "completed");
  const doctor = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: statusDocker.runner,
      statfs: abundantDisk,
      randomUUID: () => "75150000-0000-4000-8000-000000000014",
    }),
  );
  const lockCheck = doctor.details.doctor.checks.find(
    ({ code }) => code === "SELF_HOST_DOCTOR_OPERATION_LOCK",
  );
  assert.equal(lockCheck.status, "warning");
  assert.equal(lockCheck.details.command, "backup");
  assert.equal(lockCheck.details.ownerAlive, true);

  let mutationRunnerCalled = false;
  const blocked = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: () => {
        mutationRunnerCalled = true;
        throw new Error("a blocked mutation must not invoke Docker");
      },
      randomUUID: () => "75200000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(blocked.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
  assert.equal(blocked.error.code, "SELF_HOST_OPERATION_IN_PROGRESS");
  assert.equal(blocked.error.retryable, true);
  assert.equal(mutationRunnerCalled, false);
  await assert.doesNotReject(fs.stat(lockPath));
});

test("instance operation lock reclaims only an old lock whose process is gone", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const lockPath = await writeOperationLockFixture(directory, {
    processId: 987654,
    startedAt: "2026-10-16T00:00:00.000Z",
  });
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: docker.runner,
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: (processId) => {
        assert.equal(processId, 987654);
        return false;
      },
      randomUUID: () => "75300000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.ok, true);
  assert.notEqual(result.status, "failed");
  await assert.rejects(fs.stat(lockPath), { code: "ENOENT" });
  await assert.rejects(
    fs.stat(resolve(directory, ".selfhost/operation.lock.reclaim")),
    { code: "ENOENT" },
  );
  assert.deepEqual(
    (await fs.readdir(resolve(directory, ".selfhost"))).filter((name) =>
      name.startsWith("operation.lock.json."),
    ),
    [],
  );
});

test("stale-lock reclaim record prevents concurrent takeover", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const lockPath = await writeOperationLockFixture(directory, {
    processId: 987655,
    startedAt: "2026-10-16T00:00:00.000Z",
  });
  const reclaimPath = await writeOperationReclaimFixture(directory, lockPath);
  const docker = dockerRunner();
  const doctor = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: (processId) => processId === process.pid,
      randomUUID: () => "75325000-0000-4000-8000-000000000014",
    }),
  );
  const lockCheck = doctor.details.doctor.checks.find(
    ({ code }) => code === "SELF_HOST_DOCTOR_OPERATION_LOCK",
  );
  assert.equal(lockCheck.status, "warning");
  assert.equal(lockCheck.details.reclaimPresent, true);
  assert.equal(lockCheck.details.reclaimOwnerAlive, true);
  assert.equal(lockCheck.details.reclaimCommand, "start");
  assert.equal(lockCheck.details.reclaimAgeSeconds, 1);

  let runnerCalled = false;
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: () => {
        runnerCalled = true;
        throw new Error(
          "a competing stale-lock claimant must not invoke Docker",
        );
      },
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: (processId) => processId === process.pid,
      randomUUID: () => "75350000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.STATE_CONFLICT);
  assert.equal(result.error.code, "SELF_HOST_OPERATION_IN_PROGRESS");
  assert.equal(result.error.retryable, true);
  assert.equal(runnerCalled, false);

  const expired = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: () => {
        runnerCalled = true;
        throw new Error("an expired reclaim record must fail before Docker");
      },
      now: () => new Date("2026-10-17T12:20:00.000Z"),
      processAlive: (processId) => processId === process.pid,
      randomUUID: () => "75370000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(expired.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(expired.error.code, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(runnerCalled, false);
  const expiredDoctor = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      now: () => new Date("2026-10-17T12:20:00.000Z"),
      processAlive: (processId) => processId === process.pid,
      randomUUID: () => "75372500-0000-4000-8000-000000000014",
    }),
  );
  const expiredCheck = expiredDoctor.details.doctor.checks.find(
    ({ code }) => code === "SELF_HOST_DOCTOR_OPERATION_LOCK",
  );
  assert.equal(expiredCheck.status, "fail");
  assert.equal(expiredCheck.errorCode, "SELF_HOST_OPERATION_LOCK_INVALID");

  const abandoned = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: () => {
        runnerCalled = true;
        throw new Error("an abandoned reclaim record must fail before Docker");
      },
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: () => false,
      randomUUID: () => "75375000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(abandoned.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(abandoned.error.code, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(runnerCalled, false);
  const abandonedDoctor = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: () => false,
      randomUUID: () => "75380000-0000-4000-8000-000000000014",
    }),
  );
  const abandonedCheck = abandonedDoctor.details.doctor.checks.find(
    ({ code }) => code === "SELF_HOST_DOCTOR_OPERATION_LOCK",
  );
  assert.equal(abandonedCheck.status, "fail");
  assert.equal(abandonedCheck.errorCode, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(abandonedCheck.details.reclaimPresent, true);
  await assert.doesNotReject(fs.stat(lockPath));
  await assert.doesNotReject(fs.stat(reclaimPath));
});

test("stale-lock reclaim record is bound to the observed lock", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const lockPath = await writeOperationLockFixture(directory, {
    processId: 987656,
    startedAt: "2026-10-16T00:00:00.000Z",
  });
  await writeOperationReclaimFixture(directory, lockPath, {
    observedSha256: "f".repeat(64),
  });
  let runnerCalled = false;
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: () => {
        runnerCalled = true;
        throw new Error("a mismatched reclaim record must fail before Docker");
      },
      now: () => new Date("2026-10-17T12:00:00.000Z"),
      processAlive: (processId) => processId === process.pid,
      randomUUID: () => "75385000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(runnerCalled, false);
});

test("operation lock release failure is fail-closed and observable", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: docker.runner,
      operationLockSync: async () => {
        throw new Error("injected operation lock directory sync failure");
      },
      randomUUID: () => "75390000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED");
  await assert.doesNotReject(
    fs.stat(resolve(directory, ".selfhost/operation.lock.json")),
  );
  assert.deepEqual(
    (await fs.readdir(resolve(directory, ".selfhost"))).filter((name) =>
      name.startsWith("operation.lock.json.released-"),
    ),
    [],
  );
});

test("operation lock release never overwrites a preexisting snapshot", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const operationId = "75392500-0000-4000-8000-000000000014";
  const releasedPath = resolve(
    directory,
    `.selfhost/operation.lock.json.released-${operationId}`,
  );
  await fs.writeFile(releasedPath, "external snapshot\n", {
    mode: 0o600,
    flag: "wx",
  });
  const docker = dockerRunner();
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: docker.runner,
      randomUUID: () => operationId,
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED");
  assert.equal(await fs.readFile(releasedPath, "utf8"), "external snapshot\n");
  await assert.doesNotReject(
    fs.stat(resolve(directory, ".selfhost/operation.lock.json")),
  );
  const doctor = await executeManagementCommand(
    options("doctor", directory),
    dependencies({
      runner: docker.runner,
      statfs: abundantDisk,
      randomUUID: () => "75393000-0000-4000-8000-000000000014",
    }),
  );
  const lockCheck = doctor.details.doctor.checks.find(
    ({ code }) => code === "SELF_HOST_DOCTOR_OPERATION_LOCK",
  );
  assert.equal(lockCheck.status, "fail");
  assert.equal(lockCheck.errorCode, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(lockCheck.details.releaseSnapshotPresent, true);
});

test("operation lock release failure does not hide the primary command error", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const docker = dockerRunner({ unavailable: true });
  const result = await executeManagementCommand(
    options("start", directory),
    dependencies({
      runner: docker.runner,
      operationLockSync: async () => {
        throw new Error("injected operation lock directory sync failure");
      },
      randomUUID: () => "75395000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE);
  assert.equal(result.error.code, "SELF_HOST_DOCKER_UNAVAILABLE");
  assert.deepEqual(result.details.secondaryFailures, [
    {
      code: "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED",
      exitCode: SELF_HOST_CLI_EXIT.FILESYSTEM,
      retryable: false,
    },
  ]);
  assert.equal(
    result.actions.at(-1).code,
    "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED",
  );
  const record = JSON.parse(
    await fs.readFile(resolve(directory, result.operationRecord), "utf8"),
  );
  assert.equal(record.errorCode, "SELF_HOST_DOCKER_UNAVAILABLE");
  assert.equal(
    record.actionCodes.includes("SELF_HOST_OPERATION_LOCK_RELEASE_FAILED"),
    true,
  );
  await assert.doesNotReject(
    fs.stat(resolve(directory, ".selfhost/operation.lock.json")),
  );
});

test("invalid instance operation lock fails closed before mutation", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const lockPath = resolve(directory, ".selfhost/operation.lock.json");
  await fs.writeFile(lockPath, "{not-json}\n", { mode: 0o600, flag: "wx" });
  let runnerCalled = false;
  const result = await executeManagementCommand(
    options("stop", directory),
    dependencies({
      runner: () => {
        runnerCalled = true;
        throw new Error("an invalid lock must fail before Docker");
      },
      randomUUID: () => "75400000-0000-4000-8000-000000000014",
    }),
  );
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(result.error.code, "SELF_HOST_OPERATION_LOCK_INVALID");
  assert.equal(runnerCalled, false);
  assert.equal(await fs.readFile(lockPath, "utf8"), "{not-json}\n");
});

test("operation records are exclusive and cannot overwrite an earlier record", async () => {
  const directory = await createBundle();
  await executeManagementCommand(options("init", directory), dependencies());
  const fixed = {
    runner: dockerRunner().runner,
    now: () => new Date("2026-10-17T01:00:00.000Z"),
    randomUUID: () => "77000000-0000-4000-8000-000000000015",
  };
  const first = await executeManagementCommand(
    options("status", directory),
    dependencies(fixed),
  );
  const original = await fs.readFile(resolve(directory, first.operationRecord));
  const collision = await executeManagementCommand(
    options("status", directory),
    dependencies(fixed),
  );

  assert.equal(collision.exitCode, SELF_HOST_CLI_EXIT.FILESYSTEM);
  assert.equal(collision.error.code, "SELF_HOST_OPERATION_RECORD_FAILED");
  assert.deepEqual(
    await fs.readFile(resolve(directory, first.operationRecord)),
    original,
  );

  const failedCollision = await executeManagementCommand(
    options("status", directory),
    dependencies({
      ...fixed,
      runner: dockerRunner({ unavailable: true }).runner,
    }),
  );
  assert.equal(failedCollision.error.code, "SELF_HOST_OPERATION_RECORD_FAILED");
  assert.deepEqual(failedCollision.details.commandFailure, {
    code: "SELF_HOST_DOCKER_UNAVAILABLE",
    exitCode: SELF_HOST_CLI_EXIT.PREREQUISITE,
    retryable: true,
  });
  assert.equal(
    failedCollision.actions.at(-1).code,
    "SELF_HOST_DOCKER_UNAVAILABLE",
  );
  const validators = await schemaValidators();
  assert.equal(
    validators.result(failedCollision),
    true,
    JSON.stringify(validators.result.errors),
  );
  assert.deepEqual(
    await fs.readFile(resolve(directory, first.operationRecord)),
    original,
  );
});

test("the process CLI emits schema-valid JSON and both OS wrappers stay thin", async () => {
  const directory = await createBundle();
  const cliPath = resolve(repositoryRoot, "scripts/selfhost/cli.mjs");
  const processResult = spawnSync(
    process.execPath,
    [cliPath, "init", "--json", "--directory", directory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(processResult.status, 0, processResult.stderr);
  const result = JSON.parse(processResult.stdout);
  const validators = await schemaValidators();
  assert.equal(
    validators.result(result),
    true,
    JSON.stringify(validators.result.errors),
  );
  const config = parseEnvironmentFile(
    await fs.readFile(resolve(directory, ".env.selfhost"), "utf8"),
  );
  assert.equal(
    processResult.stdout.includes(config.get("SELF_HOST_AUTH_SECRET")),
    false,
  );

  for (const wrapper of ["self-host.sh", "self-host.ps1"]) {
    const text = await fs.readFile(
      resolve(repositoryRoot, "scripts/selfhost", wrapper),
      "utf8",
    );
    assert.match(text, /cli\.mjs/);
    assert.doesNotMatch(text, /docker\s+compose|\.env\.selfhost|SELF_HOST_/);
  }
  const packageJson = JSON.parse(
    await fs.readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts["self-host"],
    "node scripts/selfhost/cli.mjs",
  );
  const agentInstructions = await fs.readFile(
    resolve(repositoryRoot, "AGENTS.md"),
    "utf8",
  );
  assert.match(agentInstructions, /pnpm self-host -- <command> --json/);
  assert.match(agentInstructions, /不要自行拼接 `docker compose`/);

  const failedProcess = spawnSync(
    process.execPath,
    [cliPath, "status", "--json", "--directory", resolve(directory, "missing")],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(failedProcess.status, SELF_HOST_CLI_EXIT.CONFIG);
  assert.equal(failedProcess.stderr, "");
  const failedResult = JSON.parse(failedProcess.stdout);
  assert.equal(failedResult.error.code, "SELF_HOST_INSTANCE_DIRECTORY_INVALID");
  assert.equal(validators.result(failedResult), true);
});
