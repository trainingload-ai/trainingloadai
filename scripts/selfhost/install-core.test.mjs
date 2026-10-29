import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import packageManifest from "../../package.json" with { type: "json" };
import {
  createInstallUsageFailure,
  executeInstall,
  parseInstallArguments,
  renderInstallResult,
} from "./install-core.mjs";
import { SELF_HOST_CLI_EXIT } from "./management-core.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const verifiedBundle = {
  manifest: { releaseVersion: packageManifest.version },
  checksums: new Map(),
  signatureVerified: true,
};

async function checksumInventory(root, paths) {
  return new Map(
    await Promise.all(
      paths.map(async (path) => [
        path,
        createHash("sha256")
          .update(await fs.readFile(resolve(root, path)))
          .digest("hex"),
      ]),
    ),
  );
}

function runner({
  docker = true,
  cosign = true,
  dockerVersion = "27.5.1",
  composeVersion = "2.32.4",
  dockerInfo = { Architecture: "amd64", OSType: "linux" },
} = {}) {
  const calls = [];
  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args });
      const available = command === "cosign" ? cosign : docker;
      if (!available) {
        return {
          status: null,
          stdout: "",
          stderr: "",
          error: new Error(`${command} unavailable`),
        };
      }
      if (command === "cosign") {
        return { status: 0, stdout: "2.6.0\n", stderr: "", error: null };
      }
      if (args[0] === "version") {
        return {
          status: 0,
          stdout: `${dockerVersion}\n`,
          stderr: "",
          error: null,
        };
      }
      if (args[0] === "info") {
        return {
          status: 0,
          stdout: `${typeof dockerInfo === "string" ? dockerInfo : JSON.stringify(dockerInfo)}\n`,
          stderr: "",
          error: null,
        };
      }
      if (args[0] === "compose") {
        return {
          status: 0,
          stdout: `${composeVersion}\n`,
          stderr: "",
          error: null,
        };
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function managementResult(command, ok = true) {
  return {
    command,
    ok,
    status: ok ? "completed" : "failed",
    exitCode: ok ? 0 : SELF_HOST_CLI_EXIT.UNHEALTHY,
    error: ok
      ? null
      : {
          code: "SELF_HOST_NOT_READY",
          message: "services are not ready",
          retryable: true,
        },
  };
}

async function validateResult(result) {
  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-install-result.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
}

test("parses the bounded installer surface", () => {
  assert.deepEqual(parseInstallArguments([]), {
    dryRun: false,
    json: false,
    noStart: false,
  });
  assert.deepEqual(
    parseInstallArguments(["--dry-run", "--no-start", "--json"]),
    {
      dryRun: true,
      json: true,
      noStart: true,
    },
  );
  assert.throws(
    () => parseInstallArguments(["--directory", "/tmp"]),
    /unknown/,
  );
});

test("returns a schema-valid JSON usage failure without touching the host", async () => {
  let error;
  try {
    parseInstallArguments(["--dry-run", "--json", "--directory"]);
  } catch (caught) {
    error = caught;
  }
  const result = createInstallUsageFailure(
    error,
    ["--dry-run", "--json", "--directory"],
    "10000000-0000-4000-8000-000000000000",
  );
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.USAGE);
  assert.equal(result.dryRun, true);
  assert.equal(result.bundleVerified, false);
  assert.equal(result.error.code, "SELF_HOST_USAGE_INVALID");
  await validateResult(result);
});

test("the installer process emits only schema-valid JSON for usage failures", async () => {
  const child = spawnSync(
    process.execPath,
    [
      resolve(repositoryRoot, "scripts/selfhost/install.mjs"),
      "--json",
      "--unsupported",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(child.status, SELF_HOST_CLI_EXIT.USAGE, child.stderr);
  assert.equal(child.stdout, "");
  const result = JSON.parse(child.stderr);
  assert.equal(result.error.code, "SELF_HOST_USAGE_INVALID");
  await validateResult(result);
});

test("dry-run verifies the signed bundle, prerequisites, and shared init plan", async () => {
  const commands = runner();
  const managementCalls = [];
  let signatureCallbackCalled = false;
  const result = await executeInstall(
    { dryRun: true, json: true, noStart: false },
    {
      root: "/verified/release",
      runner: commands.run,
      nodeVersion: "22.15.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000001",
      verifyBundle: async (_root, { verifySignature }) => {
        await verifySignature({
          checksumsPath: "/verified/release/checksums.txt",
          bundlePath: "/verified/release/checksums.bundle.json",
          identity: `https://example.invalid/workflow@refs/tags/v${packageManifest.version}`,
          oidcIssuer: "https://token.actions.githubusercontent.com",
        });
        signatureCallbackCalled = true;
        return verifiedBundle;
      },
      executeManagement: async (options, managementDependencies) => {
        managementCalls.push({ options, managementDependencies });
        return {
          ...managementResult(options.command),
          status: "planned",
          details: { initialized: false },
        };
      },
    },
  );

  assert.equal(result.status, "planned", JSON.stringify(result.error));
  assert.equal(result.bundleVerified, true);
  assert.equal(signatureCallbackCalled, true);
  assert.equal(managementCalls.length, 1);
  assert.equal(managementCalls[0].options.command, "init");
  assert.equal(managementCalls[0].options.dryRun, true);
  assert.equal(
    managementCalls[0].managementDependencies.suppressOperationRecord,
    true,
  );
  assert.equal(
    commands.calls.filter((call) => call.command === "docker").length,
    3,
  );
  assert.match(renderInstallResult(result), /bundle verified: true/);
  await validateResult(result);
});

test("dry-run uses the real init planner without changing the release tree", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "selfhost-install-plan-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ];
  for (const file of files) {
    await fs.copyFile(resolve(repositoryRoot, file), resolve(root, file));
  }
  await fs.mkdir(resolve(root, "docker/selfhost"), { recursive: true });
  const before = (await fs.readdir(root)).sort();
  const commands = runner({ docker: false });
  const checksums = await checksumInventory(root, [
    ".env.example",
    "compose.yml",
  ]);

  const result = await executeInstall(
    { dryRun: true, json: true, noStart: true },
    {
      root,
      runner: commands.run,
      nodeVersion: "22.15.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000011",
      verifyBundle: async () => ({ ...verifiedBundle, checksums }),
      managementDependencies: {
        randomUUID: () => "10000000-0000-4000-8000-000000000012",
      },
    },
  );

  assert.equal(result.status, "planned", JSON.stringify(result.error));
  assert.deepEqual((await fs.readdir(root)).sort(), before);
  await assert.rejects(fs.stat(resolve(root, ".env.selfhost")), /ENOENT/);
  await assert.rejects(fs.stat(resolve(root, ".selfhost")), /ENOENT/);
  await validateResult(result);
});

test("dry-run rejects a template changed after bundle authentication", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "selfhost-install-drift-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of [
    ".env.example",
    "compose.yml",
    "compose.build.yml",
    "package.json",
  ]) {
    await fs.copyFile(resolve(repositoryRoot, file), resolve(root, file));
  }
  await fs.mkdir(resolve(root, "docker/selfhost"), { recursive: true });
  const checksums = await checksumInventory(root, [
    ".env.example",
    "compose.yml",
  ]);
  const commands = runner({ docker: false });

  const result = await executeInstall(
    { dryRun: true, json: true, noStart: true },
    {
      root,
      runner: commands.run,
      nodeVersion: "22.15.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000015",
      verifyBundle: async () => {
        await fs.appendFile(
          resolve(root, ".env.example"),
          "# changed after authentication\n",
        );
        return { ...verifiedBundle, checksums };
      },
      managementDependencies: {
        randomUUID: () => "10000000-0000-4000-8000-000000000016",
      },
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "SELF_HOST_RELEASE_STATE_INVALID");
  assert.equal(result.steps.at(-1).name, "init");
  await assert.rejects(fs.stat(resolve(root, ".env.selfhost")), /ENOENT/);
  await assert.rejects(fs.stat(resolve(root, ".selfhost")), /ENOENT/);
  await validateResult(result);
});

test("dry-run reports a shared init planning failure", async () => {
  const commands = runner({ docker: false });
  const result = await executeInstall(
    { dryRun: true, json: true, noStart: true },
    {
      root: "/verified/release",
      runner: commands.run,
      nodeVersion: "22.15.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000013",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async () => managementResult("init", false),
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "SELF_HOST_NOT_READY");
  assert.equal(result.steps.at(-1).name, "init");
  await validateResult(result);
});

test("dry-run validates the shared start plan for an initialized instance", async () => {
  const commands = runner();
  const managementCalls = [];
  const result = await executeInstall(
    { dryRun: true, json: true, noStart: false },
    {
      root: "/verified/release",
      runner: commands.run,
      nodeVersion: "22.15.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000014",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async (options, managementDependencies) => {
        managementCalls.push({ options, managementDependencies });
        return options.command === "init"
          ? {
              ...managementResult("init"),
              status: "unchanged",
              details: { initialized: true },
            }
          : {
              ...managementResult("start"),
              status: "planned",
              details: {},
            };
      },
    },
  );

  assert.equal(result.status, "planned", JSON.stringify(result.error));
  assert.deepEqual(
    managementCalls.map(({ options }) => [options.command, options.dryRun]),
    [
      ["init", true],
      ["start", true],
    ],
  );
  assert.equal(
    managementCalls.every(
      ({ managementDependencies }) =>
        managementDependencies.suppressOperationRecord === true,
    ),
    true,
  );
  await validateResult(result);
});

test("installer delegates init and start to the shared management core", async () => {
  const commands = runner();
  const managementCalls = [];
  const result = await executeInstall(
    { dryRun: false, json: true, noStart: false },
    {
      root: "/verified/release",
      runner: commands.run,
      nodeVersion: "25.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000002",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async (options) => {
        managementCalls.push(options);
        return managementResult(options.command);
      },
    },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(
    managementCalls.map((call) => call.command),
    ["init", "start"],
  );
  assert.equal(
    managementCalls.every((call) => call.directory === "/verified/release"),
    true,
  );
  assert.match(result.nextActions[0], /owner bootstrap/);
  await validateResult(result);
});

test("no-start initializes config without requiring Docker", async () => {
  const commands = runner({ docker: false });
  const result = await executeInstall(
    { dryRun: false, json: true, noStart: true },
    {
      root: "/verified/release",
      runner: commands.run,
      nodeVersion: "22.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000003",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async (options) => managementResult(options.command),
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(
    commands.calls.some((call) => call.command === "docker"),
    false,
  );
  assert.equal(
    result.steps.find((item) => item.name === "start").status,
    "skipped",
  );
  await validateResult(result);
});

test("installer rejects unsupported host tuples before external prerequisites", async () => {
  for (const [name, hostPlatform, hostArchitecture] of [
    ["macos-intel", "darwin", "x64"],
    ["windows-arm", "win32", "arm64"],
    ["unsupported-os", "freebsd", "x64"],
  ]) {
    const commands = runner();
    let bundleChecks = 0;
    let managementCalls = 0;
    const result = await executeInstall(
      { dryRun: false, json: true, noStart: name === "macos-intel" },
      {
        root: "/verified/release",
        runner: commands.run,
        nodeVersion: "22.0.0",
        hostPlatform,
        hostArchitecture,
        randomUUID: () => "10000000-0000-4000-8000-000000000009",
        verifyBundle: async () => {
          bundleChecks += 1;
          return verifiedBundle;
        },
        executeManagement: async () => {
          managementCalls += 1;
          throw new Error("unsupported hosts must fail before initialization");
        },
      },
    );

    assert.equal(result.status, "failed", name);
    assert.equal(
      result.error.code,
      "SELF_HOST_HOST_PLATFORM_UNSUPPORTED",
      name,
    );
    assert.equal(result.error.retryable, false, name);
    assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE, name);
    assert.equal(result.bundleVerified, false, name);
    assert.equal(result.steps.at(-1).name, "runtime", name);
    assert.equal(commands.calls.length, 0, name);
    assert.equal(bundleChecks, 0, name);
    assert.equal(managementCalls, 0, name);
    assert.match(result.nextActions[0], /Linux amd64\/arm64/, name);
    await validateResult(result);
  }
});

test("installer distinguishes unverified bundles from unavailable Docker", async () => {
  const invalid = await executeInstall(
    { dryRun: true, json: true, noStart: false },
    {
      root: "/invalid/release",
      runner: runner().run,
      nodeVersion: "22.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000004",
      verifyBundle: async () => {
        throw new Error("tampered");
      },
    },
  );
  assert.equal(invalid.error.code, "SELF_HOST_INSTALL_BUNDLE_INVALID");
  assert.equal(invalid.bundleVerified, false);

  const unavailable = await executeInstall(
    { dryRun: true, json: true, noStart: false },
    {
      root: "/verified/release",
      runner: runner({ docker: false }).run,
      nodeVersion: "22.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000005",
      verifyBundle: async () => verifiedBundle,
    },
  );
  assert.equal(unavailable.error.code, "SELF_HOST_DOCKER_UNAVAILABLE");
  assert.equal(unavailable.bundleVerified, true);
  assert.equal(unavailable.exitCode, SELF_HOST_CLI_EXIT.PREREQUISITE);
  assert.equal(unavailable.steps.at(-1).name, "docker");
  await validateResult(unavailable);
});

test("installer rejects unsupported or malformed Docker platforms before initialization", async () => {
  for (const [name, commandRunner, errorCode, exitCode] of [
    [
      "windows-containers",
      runner({ dockerInfo: { Architecture: "amd64", OSType: "windows" } }),
      "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    ],
    [
      "unsupported-architecture",
      runner({ dockerInfo: { Architecture: "riscv64", OSType: "linux" } }),
      "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    ],
    [
      "malformed-info",
      runner({ dockerInfo: "not-json" }),
      "SELF_HOST_DOCKER_INFO_FAILED",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    ],
    [
      "malformed-version",
      runner({ dockerVersion: "27.5.1 injected-output" }),
      "SELF_HOST_DOCKER_INFO_FAILED",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    ],
    [
      "malformed-compose-version",
      runner({ composeVersion: "2.32.4 injected-output" }),
      "SELF_HOST_COMPOSE_UNAVAILABLE",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    ],
    [
      "legacy-compose-version",
      runner({ composeVersion: "1.29.2" }),
      "SELF_HOST_COMPOSE_UNAVAILABLE",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    ],
  ]) {
    let managementCalls = 0;
    const result = await executeInstall(
      { dryRun: false, json: true, noStart: false },
      {
        root: "/verified/release",
        runner: commandRunner.run,
        nodeVersion: "22.0.0",
        randomUUID: () => "10000000-0000-4000-8000-000000000008",
        verifyBundle: async () => verifiedBundle,
        executeManagement: async () => {
          managementCalls += 1;
          throw new Error("unsupported Docker must fail before init");
        },
      },
    );

    assert.equal(result.status, "failed", name);
    assert.equal(result.error.code, errorCode, name);
    assert.equal(result.exitCode, exitCode, name);
    assert.equal(result.bundleVerified, true, name);
    assert.equal(result.steps.at(-1).name, "docker", name);
    assert.equal(managementCalls, 0, name);
    assert.equal(JSON.stringify(result).includes("injected-output"), false);
    await validateResult(result);
  }
});

test("installer returns management readiness failures without rewriting them", async () => {
  const result = await executeInstall(
    { dryRun: false, json: true, noStart: false },
    {
      root: "/verified/release",
      runner: runner().run,
      nodeVersion: "22.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000006",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async (options) =>
        managementResult(options.command, options.command !== "start"),
    },
  );

  assert.equal(result.error.code, "SELF_HOST_NOT_READY");
  assert.equal(result.error.retryable, true);
  assert.equal(result.steps.at(-1).name, "start");
  await validateResult(result);
});

test("unexpected post-verification failures remain internal and identify the active step", async () => {
  const result = await executeInstall(
    { dryRun: false, json: true, noStart: true },
    {
      root: "/verified/release",
      runner: runner().run,
      nodeVersion: "22.0.0",
      randomUUID: () => "10000000-0000-4000-8000-000000000007",
      verifyBundle: async () => verifiedBundle,
      executeManagement: async () => {
        throw new Error("unexpected init defect");
      },
    },
  );

  assert.equal(result.error.code, "SELF_HOST_INTERNAL_ERROR");
  assert.equal(result.exitCode, SELF_HOST_CLI_EXIT.INTERNAL);
  assert.equal(result.bundleVerified, true);
  assert.equal(result.steps.at(-1).name, "init");
  assert.doesNotMatch(result.nextActions.join(" "), /unverified bundle/);
  await validateResult(result);
});
