import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  executeManagementCommand,
  isSupportedComposeVersion,
  isSupportedDockerPlatform,
  isSupportedHostPlatform,
  parseDockerPlatform,
  SELF_HOST_CLI_EXIT,
  validRuntimeVersion,
} from "./management-core.mjs";
import { verifySelfHostReleaseBundle } from "./release-bundle.mjs";

const MINIMUM_NODE_MAJOR = 22;

class InstallError extends Error {
  constructor(code, message, exitCode, retryable = false) {
    super(message);
    this.name = "InstallError";
    this.code = code;
    this.exitCode = exitCode;
    this.retryable = retryable;
  }
}

export function parseInstallArguments(argv) {
  if (argv.includes("--help")) return { help: true };
  const options = { dryRun: false, json: false, noStart: false };
  for (const argument of argv) {
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--no-start") options.noStart = true;
    else {
      throw new InstallError(
        "SELF_HOST_USAGE_INVALID",
        `unknown installer option: ${argument}`,
        SELF_HOST_CLI_EXIT.USAGE,
      );
    }
  }
  return options;
}

export function createInstallUsageFailure(
  error,
  argv,
  operationId = randomUUID(),
) {
  const code =
    typeof error?.code === "string" ? error.code : "SELF_HOST_USAGE_INVALID";
  const message =
    typeof error?.message === "string" && error.message
      ? error.message
      : "invalid installer arguments";
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-install-result",
    operationId,
    status: "failed",
    ok: false,
    exitCode: SELF_HOST_CLI_EXIT.USAGE,
    dryRun: argv.includes("--dry-run"),
    releaseVersion: "unknown",
    bundleVerified: false,
    steps: [step("runtime", "failed", code)],
    nextActions: [
      "Run install.sh --help (or install.ps1 --help) and retry with supported options.",
    ],
    error: {
      code,
      message,
      retryable: false,
    },
  };
}

export function defaultInstallRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 5 * 60_000,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    stdio: "pipe",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

function requireCommand(
  runner,
  command,
  args,
  code,
  cwd,
  exitCode = SELF_HOST_CLI_EXIT.PREREQUISITE,
  retryable = true,
  options = {},
) {
  const result = runner(command, args, { cwd, ...options });
  if (result.error || result.status !== 0) {
    throw new InstallError(
      code,
      `${command} prerequisite is unavailable`,
      exitCode,
      retryable,
    );
  }
  return result;
}

function requireSupportedDocker(runner, cwd) {
  const dockerVersion = requireCommand(
    runner,
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    "SELF_HOST_DOCKER_UNAVAILABLE",
    cwd,
    SELF_HOST_CLI_EXIT.PREREQUISITE,
    true,
    { maxBuffer: 1024 },
  ).stdout.trim();
  if (!validRuntimeVersion(dockerVersion)) {
    throw new InstallError(
      "SELF_HOST_DOCKER_INFO_FAILED",
      "Docker Engine returned an invalid server version",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }

  const dockerInfo = requireCommand(
    runner,
    "docker",
    ["info", "--format", "{{json .}}"],
    "SELF_HOST_DOCKER_INFO_FAILED",
    cwd,
    SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    false,
    { maxBuffer: 64 * 1024 },
  );
  const platform = parseDockerPlatform(dockerInfo.stdout.trim());
  if (!platform) {
    throw new InstallError(
      "SELF_HOST_DOCKER_INFO_FAILED",
      "Docker daemon returned invalid platform information",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  if (!isSupportedDockerPlatform(platform)) {
    throw new InstallError(
      "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      "Docker daemon must run Linux containers on amd64 or arm64",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
      true,
    );
  }

  const composeVersion = requireCommand(
    runner,
    "docker",
    ["compose", "version", "--short"],
    "SELF_HOST_COMPOSE_UNAVAILABLE",
    cwd,
    SELF_HOST_CLI_EXIT.PREREQUISITE,
    true,
    { maxBuffer: 1024 },
  ).stdout.trim();
  if (!isSupportedComposeVersion(composeVersion)) {
    throw new InstallError(
      "SELF_HOST_COMPOSE_UNAVAILABLE",
      "Docker Compose returned an invalid version",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
      true,
    );
  }
}

function requireSupportedHost(platform, architecture) {
  if (!isSupportedHostPlatform(platform, architecture)) {
    throw new InstallError(
      "SELF_HOST_HOST_PLATFORM_UNSUPPORTED",
      "The host must be Linux amd64/arm64, macOS Apple Silicon, or Windows amd64",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    );
  }
}

function managementOptions(command, root, dryRun = false) {
  return {
    command,
    directory: root,
    dryRun,
    json: true,
    source: false,
    tail: 200,
    services: [],
    output: null,
    backupPath: null,
    releasePath: null,
    rollbackVersion: null,
    acceptNoApplicationRollback: false,
    deleteData: false,
    confirmDataRoot: null,
  };
}

function step(name, status, errorCode = null) {
  return { name, status, errorCode };
}

function managementFailure(result, steps) {
  return {
    status: "failed",
    exitCode: result.exitCode,
    bundleVerified: true,
    steps: [...steps, step(result.command, "failed", result.error.code)],
    nextActions: [
      "Read error.code and the bundled error catalog before retrying.",
      "Run self-host diagnostics only after initialization succeeds.",
    ],
    error: result.error,
  };
}

export async function executeInstall(options, dependencies = {}) {
  const root = resolve(dependencies.root ?? process.cwd());
  const runner = dependencies.runner ?? defaultInstallRunner;
  const verifyBundle = dependencies.verifyBundle ?? verifySelfHostReleaseBundle;
  const executeManagement =
    dependencies.executeManagement ?? executeManagementCommand;
  const operationId = (dependencies.randomUUID ?? randomUUID)();
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  const platform = dependencies.hostPlatform ?? process.platform;
  const architecture = dependencies.hostArchitecture ?? process.arch;
  let releaseVersion = "unknown";
  const steps = [];
  let bundleVerified = false;
  let activeStep = "runtime";
  let outcome;
  try {
    const nodeMajor = Number(nodeVersion.split(".")[0]);
    if (!Number.isSafeInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
      throw new InstallError(
        "SELF_HOST_INSTALL_NODE_UNSUPPORTED",
        `Node.js ${MINIMUM_NODE_MAJOR} or newer is required`,
        SELF_HOST_CLI_EXIT.PREREQUISITE,
      );
    }
    requireSupportedHost(platform, architecture);
    steps.push(step("runtime", "completed"));
    activeStep = "bundle";
    requireCommand(
      runner,
      "cosign",
      ["version"],
      "SELF_HOST_COSIGN_UNAVAILABLE",
      root,
    );
    const verified = await verifyBundle(root, {
      verifySignature: async ({
        checksumsPath,
        bundlePath,
        identity,
        oidcIssuer,
      }) => {
        requireCommand(
          runner,
          "cosign",
          [
            "verify-blob",
            "--bundle",
            bundlePath,
            "--certificate-identity",
            identity,
            "--certificate-oidc-issuer",
            oidcIssuer,
            checksumsPath,
          ],
          "SELF_HOST_INSTALL_BUNDLE_INVALID",
          root,
          SELF_HOST_CLI_EXIT.CONFIG,
          false,
        );
      },
    });
    if (
      verified?.signatureVerified !== true ||
      !(verified.checksums instanceof Map)
    ) {
      throw new InstallError(
        "SELF_HOST_INSTALL_BUNDLE_INVALID",
        "release bundle verification did not return an authenticated checksum inventory",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    releaseVersion = verified.manifest.releaseVersion;
    const authenticatedBundle = {
      root,
      manifest: verified.manifest,
      checksums: new Map(verified.checksums),
      signatureVerified: true,
    };
    const managementDependencies = {
      ...dependencies.managementDependencies,
      authenticatedBundle,
    };
    bundleVerified = true;
    steps.push(step("bundle", "completed"));
    activeStep = "docker";

    if (!options.noStart) {
      requireSupportedDocker(runner, root);
      steps.push(step("docker", "completed"));
    } else {
      steps.push(step("docker", "skipped"));
    }
    activeStep = "init";

    if (options.dryRun) {
      const planningDependencies = {
        ...managementDependencies,
        suppressOperationRecord: true,
      };
      const initPlan = await executeManagement(
        managementOptions("init", root, true),
        planningDependencies,
      );
      if (!initPlan.ok) {
        outcome = managementFailure(initPlan, steps);
      } else {
        let startPlan = null;
        if (!options.noStart && initPlan.details?.initialized === true) {
          activeStep = "start";
          startPlan = await executeManagement(
            managementOptions("start", root, true),
            planningDependencies,
          );
        }
        if (startPlan && !startPlan.ok) {
          outcome = managementFailure(startPlan, [
            ...steps,
            step("init", "completed"),
          ]);
        } else {
          outcome = {
            status: "planned",
            exitCode: SELF_HOST_CLI_EXIT.OK,
            bundleVerified: true,
            steps: [
              ...steps,
              step(
                "init",
                initPlan.status === "unchanged" ? "completed" : "planned",
              ),
              step("start", options.noStart ? "skipped" : "planned"),
            ],
            nextActions: [
              "Run the installer without --dry-run to initialize the instance.",
              "Review SELF_HOSTING.md before exposing a non-local origin.",
            ],
            error: null,
          };
        }
      }
    } else {
      const init = await executeManagement(
        managementOptions("init", root),
        managementDependencies,
      );
      if (!init.ok) {
        outcome = managementFailure(init, steps);
      } else if (options.noStart) {
        outcome = {
          status: "completed",
          exitCode: SELF_HOST_CLI_EXIT.OK,
          bundleVerified: true,
          steps: [
            ...steps,
            step("init", "completed"),
            step("start", "skipped"),
          ],
          nextActions: [
            "Review and edit only non-secret settings in .env.selfhost.",
            "Run self-host start --dry-run --json, then self-host start --json.",
          ],
          error: null,
        };
      } else {
        activeStep = "start";
        const start = await executeManagement(
          managementOptions("start", root),
          managementDependencies,
        );
        outcome = start.ok
          ? {
              status: "completed",
              exitCode: SELF_HOST_CLI_EXIT.OK,
              bundleVerified: true,
              steps: [
                ...steps,
                step("init", "completed"),
                step("start", "completed"),
              ],
              nextActions: [
                "Complete the local owner bootstrap described in SELF_HOSTING.md.",
                "Run self-host doctor --json after the owner is claimed.",
                "Create and test a first backup before external exposure.",
              ],
              error: null,
            }
          : managementFailure(start, [...steps, step("init", "completed")]);
      }
    }
  } catch (error) {
    const known =
      error instanceof InstallError
        ? error
        : bundleVerified
          ? new InstallError(
              "SELF_HOST_INTERNAL_ERROR",
              "installer failed unexpectedly after bundle verification",
              SELF_HOST_CLI_EXIT.INTERNAL,
            )
          : new InstallError(
              "SELF_HOST_INSTALL_BUNDLE_INVALID",
              "release bundle verification failed",
              SELF_HOST_CLI_EXIT.CONFIG,
            );
    const nextActions =
      activeStep === "runtime"
        ? known.code === "SELF_HOST_HOST_PLATFORM_UNSUPPORTED"
          ? [
              "Use Linux amd64/arm64, macOS Apple Silicon, or Windows amd64, then retry the installer dry-run.",
            ]
          : ["Install Node.js 22 or newer, then retry the installer dry-run."]
        : activeStep === "docker"
          ? [
              "Start a supported Docker Engine with Compose v2, then retry the installer dry-run.",
            ]
          : activeStep === "bundle"
            ? [
                "Do not continue with an unverified or incomplete release bundle.",
                "Use the exact signed artifact for this release and retry the dry-run.",
              ]
            : [
                "Preserve the installer result and do not edit lifecycle state manually.",
                "Use the bundled error catalog before retrying or reporting the failure.",
              ];
    outcome = {
      status: "failed",
      exitCode: known.exitCode,
      bundleVerified,
      steps: [...steps, step(activeStep, "failed", known.code)],
      nextActions,
      error: {
        code: known.code,
        message: known.message,
        retryable: known.retryable,
      },
    };
  }
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-install-result",
    operationId,
    status: outcome.status,
    ok: outcome.status !== "failed",
    exitCode: outcome.exitCode,
    dryRun: options.dryRun,
    releaseVersion,
    bundleVerified: outcome.bundleVerified,
    steps: outcome.steps,
    nextActions: outcome.nextActions,
    error: outcome.error,
  };
}

export function renderInstallResult(result) {
  const lines = [
    `[${result.status}] self-host install ${result.releaseVersion}`,
    `bundle verified: ${result.bundleVerified}`,
  ];
  for (const item of result.steps) {
    lines.push(
      `- ${item.name}: ${item.status}${item.errorCode ? ` (${item.errorCode})` : ""}`,
    );
  }
  for (const action of result.nextActions) lines.push(`next: ${action}`);
  if (result.error) {
    lines.push(`error: ${result.error.code}: ${result.error.message}`);
  }
  return `${lines.join("\n")}\n`;
}
