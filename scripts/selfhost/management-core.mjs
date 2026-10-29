import { uploadCopyScript } from "./upload-copy-helper.mjs";
import {
  createHash,
  randomBytes as nodeRandomBytes,
  randomUUID,
} from "node:crypto";
import { constants, promises as fs } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer, isIP } from "node:net";
import { lookup as nodeLookup } from "node:dns/promises";
import {
  arch as hostArchitecture,
  cpus as hostCpus,
  freemem as hostFreeMemory,
  platform as hostPlatform,
  totalmem as hostTotalMemory,
} from "node:os";
import {
  BACKUP_ARTIFACT_LIMITS,
  CumulativeByteLimitError,
  DirectoryEntryLimitError,
  consumeByteBudget,
  copyRegularTreeBounded,
  directoryIsEmpty,
  inspectRegularTree,
  normalizePrivateTree,
  readDirectoryEntriesBounded,
  readRegularFileBounded,
  sha256File,
  verifyBackupBundle,
} from "./backup-artifact.mjs";
import {
  composeServiceSnapshots,
  evaluateComposeState,
  parseComposePs,
} from "./compose-state.mjs";
import { isolateComposeEnvironment } from "./compose-environment.mjs";
import { createChecksums } from "./create-checksums.mjs";
import {
  SELF_HOST_RELEASE_TRUST,
  validateReleaseManifest,
} from "./release-artifact.mjs";
import {
  SELF_HOST_RELEASE_BUNDLE_CONTRACT,
  verifySelfHostReleaseBundle,
} from "./release-bundle.mjs";
import { createUpgradePlan } from "./upgrade-plan.mjs";
import { buildMigrationInventory } from "./migration-policy.mjs";
import {
  collectPrivateHandleCloseErrors,
  hardenPrivatePath,
  inspectPrivatePath,
  isFilesystemErrorCode,
  rethrowAfterPrivateHandleCleanup,
  rethrowAfterPrivateTemporaryCleanup,
} from "./private-path.mjs";
import {
  buildDoctorReport,
  createDoctorCheck,
  DOCTOR_REMEDIATIONS,
} from "./doctor-core.mjs";
import {
  buildDiagnosticsBundle,
  validateDiagnosticsBundle,
} from "./diagnostics-artifact.mjs";
import {
  isCatalogedSelfHostError,
  selfHostErrorDefinition,
} from "./error-catalog.mjs";

export const SELF_HOST_CLI_SCHEMA_VERSION = 1;
export const SELF_HOST_CLI_EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  CONFIG: 3,
  PREREQUISITE: 4,
  COMMAND_FAILED: 5,
  STATE_CONFLICT: 6,
  FILESYSTEM: 7,
  UNHEALTHY: 8,
  INTERNAL: 10,
});

const COMMANDS = new Set([
  "init",
  "doctor",
  "diagnostics",
  "start",
  "status",
  "logs",
  "backup",
  "restore",
  "upgrade",
  "rollback",
  "stop",
  "owner-bootstrap",
  "owner-recovery",
  "uninstall",
]);
const SERIALIZED_MUTATION_COMMANDS = new Set([
  "init",
  "start",
  "backup",
  "restore",
  "upgrade",
  "rollback",
  "stop",
  "owner-bootstrap",
  "owner-recovery",
  "uninstall",
]);
const OPERATION_LOCK_KIND = "trainingload-selfhost-operation-lock";
const OPERATION_RECLAIM_KIND = "trainingload-selfhost-operation-reclaim";
const OPERATION_LOCK_MAX_BYTES = 4 * 1024;
const OPERATION_LOCK_STALE_GRACE_MS = 2 * 60 * 60 * 1000;
const OPERATION_RECLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const OPERATION_LOCK_RECLAIM_FILENAME = "operation.lock.reclaim";
const SELF_HOST_MODES = new Set(["core-local", "connected", "extended"]);
export const SELF_HOST_INSTANCE_CONFIG_KEYS = Object.freeze([
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_DEFAULT_MODEL",
  "AI_PROVIDER",
  "AI_REASONING_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_DEFAULT_MODEL",
  "OPENAI_REASONING_MODEL",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_BASE_URL",
  "DASHSCOPE_DEFAULT_MODEL",
  "DASHSCOPE_REASONING_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_DEFAULT_MODEL",
  "DEEPSEEK_REASONING_MODEL",
  "ELEVATION_PROVIDER",
  "ELEVATION_TILE_ZOOM",
  "MAP_ATTRIBUTION",
  "MAP_MAX_ZOOM",
  "MAP_PROVIDER",
  "MAP_STYLE_URL",
  "MAP_TILE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_DEFAULT_MODEL",
  "OPENROUTER_REASONING_MODEL",
  "SELF_HOST_ALLOW_INSECURE_HTTP",
  "SELF_HOST_AUTH_SECRET",
  "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS",
  "SELF_HOST_CLIENT_IMAGE",
  "SELF_HOST_DATABASE_CONNECTION_LIMIT",
  "SELF_HOST_DATABASE_NAME",
  "SELF_HOST_DATABASE_PASSWORD",
  "SELF_HOST_DATABASE_POOL_TIMEOUT_SECONDS",
  "SELF_HOST_DATABASE_USER",
  "SELF_HOST_DATA_ROOT",
  "SELF_HOST_HTTP_BIND",
  "SELF_HOST_HTTP_PORT",
  "SELF_HOST_INTEGRATION_SECRET",
  "SELF_HOST_MODE",
  "SELF_HOST_MIGRATE_IMAGE",
  "SELF_HOST_PROJECT_NAME",
  "SELF_HOST_SERVER_IMAGE",
  "SELF_HOST_SITE_ADDRESS",
  "SELF_HOST_VERSION",
  "TELEMETRY_ENABLED",
]);
const SELF_HOST_INSTANCE_CONFIG_KEY_SET = new Set(
  SELF_HOST_INSTANCE_CONFIG_KEYS,
);
const SERVICE_NAMES = new Set([
  "permissions",
  "postgres",
  "migrate",
  "server",
  "client",
]);
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_LOG_LINE_LENGTH = 4096;
const BACKUP_DISK_RESERVE_BYTES = 256 * 1024 * 1024;
const UPGRADE_IMAGE_RESERVE_BYTES = 2 * 1024 * 1024 * 1024;
const DIAGNOSTICS_INCLUDED_FIELDS = Object.freeze([
  "doctor",
  "configuration",
  "logs",
  "operations",
]);
const DOCTOR_DISK_FAILURE_BYTES = 512 * 1024 * 1024;
const DOCTOR_DISK_WARNING_BYTES = 5 * 1024 * 1024 * 1024;
const DOCTOR_INODE_FAILURE_COUNT = 1024;
const DOCTOR_INODE_WARNING_COUNT = 10_000;
const DOCTOR_BACKUP_WARNING_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_RECORD_BYTES = 64 * 1024;
const LOCAL_DEM_MANIFEST_BYTES = 64 * 1024;
const LOCAL_DEM_TILE_BYTES = 16 * 1024 * 1024;
const LOCAL_DEM_SCAN_ENTRIES = 1024;
const DOCTOR_GATEWAY_RESPONSE_BYTES = 64 * 1024;
export const SELF_HOST_HISTORY_LIMITS = Object.freeze({
  maximumBackupEntries: 1024,
  maximumBackupBytes: 64 * 1024 * 1024,
  maximumRestoreEntries: 4096,
  maximumRestoreBytes: 16 * 1024 * 1024,
  maximumOperationEntries: 10_000,
  maximumOperationBytes: 2 * 1024 * 1024,
  maximumUpgradeReportEntries: 1024,
  maximumUpgradeReportBytes: 64 * 1024 * 1024,
});
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
  "ERR_TLS_DH_PARAM_SIZE",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "ERR_TLS_INVALID_PROTOCOL_METHOD",
  "ERR_TLS_INVALID_PROTOCOL_VERSION",
  "ERR_TLS_PROTOCOL_VERSION_CONFLICT",
  "ERR_TLS_REQUIRED_SERVER_NAME",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const OWNER_RECOVERY_FAILURES = Object.freeze({
  SELF_HOST_NOT_INITIALIZED: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The self-host instance has no initialized owner",
  },
  SELF_HOST_OWNER_MISMATCH: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The supplied email does not match the initialized owner",
  },
  SELF_HOST_RECOVERY_EMAIL_IN_USE: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The supplied owner email is already used by another account",
  },
  SELF_HOST_OWNER_MISSING: {
    exitCode: SELF_HOST_CLI_EXIT.UNHEALTHY,
    message: "The initialized owner record is missing",
  },
  SELF_HOST_RECOVERY_PASSWORD_INVALID: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The new owner password does not satisfy the password policy",
  },
  SELF_HOST_RECOVERY_PASSWORD_TOO_LARGE: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The owner password input exceeds the supported size",
  },
});
const OWNER_BOOTSTRAP_FAILURES = Object.freeze({
  SELF_HOST_ALREADY_INITIALIZED: {
    exitCode: SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    message: "The self-host owner is already initialized",
  },
  SELF_HOST_BOOTSTRAP_EMAIL_IN_USE: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The supplied owner email is already in use",
  },
  SELF_HOST_BOOTSTRAP_INPUT_INVALID: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message:
      "The owner identity or password does not satisfy the bootstrap policy",
  },
  SELF_HOST_BOOTSTRAP_PASSWORD_TOO_LARGE: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The owner password input exceeds the supported size",
  },
  SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message:
      "The local owner bootstrap token has expired; restart the server to rotate it",
  },
  SELF_HOST_BOOTSTRAP_TOKEN_FILE_MISSING: {
    exitCode: SELF_HOST_CLI_EXIT.UNHEALTHY,
    message: "The local owner bootstrap token file is missing",
  },
  SELF_HOST_BOOTSTRAP_TOKEN_INVALID: {
    exitCode: SELF_HOST_CLI_EXIT.CONFIG,
    message: "The local owner bootstrap token is invalid",
  },
});
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIGRATION_ID_PATTERN = /^(?:\d{4}|\d{14})_[a-z0-9_]+$/;
const OCI_IMAGE_REFERENCE =
  /^(?:(?:localhost|[a-z0-9.-]+)(?::\d+)?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;
const BACKUP_SAFE_SETTINGS = new Set([
  "SELF_HOST_SITE_ADDRESS",
  "SELF_HOST_HTTP_BIND",
  "SELF_HOST_HTTP_PORT",
  "SELF_HOST_MIGRATE_IMAGE",
  "SELF_HOST_SERVER_IMAGE",
  "SELF_HOST_CLIENT_IMAGE",
  "SELF_HOST_VERSION",
  "SELF_HOST_MODE",
  "SELF_HOST_PROJECT_NAME",
  "SELF_HOST_DATABASE_CONNECTION_LIMIT",
  "SELF_HOST_DATABASE_NAME",
  "SELF_HOST_DATABASE_POOL_TIMEOUT_SECONDS",
  "SELF_HOST_DATABASE_USER",
  "SELF_HOST_ALLOW_INSECURE_HTTP",
  "TELEMETRY_ENABLED",
]);
const DATA_ROOT_MARKER = ".trainingload-selfhost-data-root.json";
const DATA_ROOT_TOP_LEVEL = new Set([
  "backups",
  "cache",
  "diagnostics",
  "elevation",
  "operations",
  "postgres",
  "uploads",
  DATA_ROOT_MARKER,
]);
const RESERVED_INSTANCE_TOP_LEVEL = new Set([
  ...SELF_HOST_RELEASE_BUNDLE_CONTRACT.files.map(
    ({ path }) => path.split("/")[0],
  ),
  ".env.selfhost",
  ".selfhost",
]);

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

export class SelfHostManagementError extends Error {
  constructor(code, message, exitCode, options = {}) {
    super(message);
    this.name = "SelfHostManagementError";
    this.code = code;
    this.exitCode = exitCode;
    this.cause = options.cause;
  }
}

function usageError(message) {
  return new SelfHostManagementError(
    "SELF_HOST_USAGE_INVALID",
    message,
    SELF_HOST_CLI_EXIT.USAGE,
  );
}

function readOptionValue(argv, index, name) {
  const argument = argv[index];
  const inlinePrefix = `${name}=`;
  if (argument.startsWith(inlinePrefix)) {
    const value = argument.slice(inlinePrefix.length).trim();
    if (!value) throw usageError(`${name} requires a value`);
    return { value, consumed: 0 };
  }
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw usageError(`${name} requires a value`);
  }
  return { value, consumed: 1 };
}

export function parseManagementArguments(argv) {
  const normalized = argv.filter((argument) => argument !== "--");
  if (normalized.length === 0 || normalized.includes("--help")) {
    return { help: true };
  }
  if (normalized.includes("--version")) {
    return { version: true };
  }

  const command = normalized[0];
  if (!COMMANDS.has(command)) {
    throw usageError(`unknown command: ${command}`);
  }
  const options = {
    command,
    directory: ".",
    dryRun: false,
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
    deleteData: false,
    confirmDataRoot: null,
  };

  let optionStart = 1;
  if (
    command === "restore" &&
    normalized[1] &&
    !normalized[1].startsWith("--")
  ) {
    options.backupPath = normalized[1];
    optionStart = 2;
  }
  if (
    command === "upgrade" &&
    normalized[1] &&
    !normalized[1].startsWith("--")
  ) {
    options.releasePath = normalized[1];
    optionStart = 2;
  }
  if (
    command === "rollback" &&
    normalized[1] &&
    !normalized[1].startsWith("--")
  ) {
    options.rollbackVersion = normalized[1];
    optionStart = 2;
  }

  for (let index = optionStart; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--source") options.source = true;
    else if (argument === "--delete-data") options.deleteData = true;
    else if (argument === "--accept-no-application-rollback") {
      options.acceptNoApplicationRollback = true;
    } else if (
      argument === "--directory" ||
      argument.startsWith("--directory=")
    ) {
      const parsed = readOptionValue(normalized, index, "--directory");
      options.directory = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--tail" || argument.startsWith("--tail=")) {
      const parsed = readOptionValue(normalized, index, "--tail");
      options.tail = Number(parsed.value);
      index += parsed.consumed;
    } else if (argument === "--service" || argument.startsWith("--service=")) {
      const parsed = readOptionValue(normalized, index, "--service");
      options.services.push(parsed.value);
      index += parsed.consumed;
    } else if (argument === "--output" || argument.startsWith("--output=")) {
      const parsed = readOptionValue(normalized, index, "--output");
      options.output = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--email" || argument.startsWith("--email=")) {
      const parsed = readOptionValue(normalized, index, "--email");
      options.ownerEmail = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--name" || argument.startsWith("--name=")) {
      const parsed = readOptionValue(normalized, index, "--name");
      options.ownerName = parsed.value;
      index += parsed.consumed;
    } else if (
      argument === "--confirm-data-root" ||
      argument.startsWith("--confirm-data-root=")
    ) {
      const parsed = readOptionValue(normalized, index, "--confirm-data-root");
      options.confirmDataRoot = parsed.value;
      index += parsed.consumed;
    } else {
      throw usageError(`unknown option: ${argument}`);
    }
  }

  if (options.source && command !== "start") {
    throw usageError("--source is supported only by start");
  }
  if (options.output !== null && !["backup", "diagnostics"].includes(command)) {
    throw usageError("--output is supported only by backup and diagnostics");
  }
  if (command === "restore" && !options.backupPath) {
    throw usageError("restore requires a backup directory");
  }
  if (command === "upgrade" && !options.releasePath) {
    throw usageError("upgrade requires a release evidence directory");
  }
  if (command === "rollback" && !options.rollbackVersion) {
    throw usageError("rollback requires the exact previous release version");
  }
  if (
    command === "rollback" &&
    !SEMVER_PATTERN.test(options.rollbackVersion ?? "")
  ) {
    throw usageError("rollback requires a semantic previous release version");
  }
  if (options.acceptNoApplicationRollback && command !== "upgrade") {
    throw usageError(
      "--accept-no-application-rollback is supported only by upgrade",
    );
  }
  if (options.deleteData && command !== "uninstall") {
    throw usageError("--delete-data is supported only by uninstall");
  }
  if (options.confirmDataRoot !== null && command !== "uninstall") {
    throw usageError("--confirm-data-root is supported only by uninstall");
  }
  if (
    options.ownerEmail !== null &&
    !["owner-bootstrap", "owner-recovery"].includes(command)
  ) {
    throw usageError(
      "--email is supported only by owner-bootstrap and owner-recovery",
    );
  }
  if (["owner-bootstrap", "owner-recovery"].includes(command)) {
    if (
      !options.ownerEmail ||
      options.ownerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.ownerEmail)
    ) {
      throw usageError(`${command} requires a valid --email value`);
    }
  }
  if (options.ownerName !== null && command !== "owner-bootstrap") {
    throw usageError("--name is supported only by owner-bootstrap");
  }
  if (command === "owner-bootstrap" && options.ownerName !== null) {
    options.ownerName = options.ownerName.trim();
  }
  if (
    command === "owner-bootstrap" &&
    (!options.ownerName ||
      options.ownerName.length > 20 ||
      !/^[\u4e00-\u9fa5a-zA-Z0-9 _-]+$/.test(options.ownerName))
  ) {
    throw usageError(
      "owner-bootstrap requires --name with 1-20 supported characters",
    );
  }
  if (command === "uninstall" && options.deleteData) {
    if (!options.confirmDataRoot) {
      throw usageError(
        "--delete-data requires --confirm-data-root with the exact absolute data-root path",
      );
    }
    if (!isAbsolute(options.confirmDataRoot)) {
      throw usageError("--confirm-data-root must be an absolute path");
    }
  }
  if (
    command === "uninstall" &&
    !options.deleteData &&
    options.confirmDataRoot !== null
  ) {
    throw usageError("--confirm-data-root requires --delete-data");
  }
  if (
    !["logs", "diagnostics"].includes(command) &&
    (options.tail !== 200 || options.services.length)
  ) {
    throw usageError(
      "--tail and --service are supported only by logs and diagnostics",
    );
  }
  if (
    !Number.isSafeInteger(options.tail) ||
    options.tail < 1 ||
    options.tail > 5000
  ) {
    throw usageError("--tail must be an integer between 1 and 5000");
  }
  for (const service of options.services) {
    if (!SERVICE_NAMES.has(service)) {
      throw usageError(`unsupported service: ${service}`);
    }
  }
  options.services = [...new Set(options.services)];
  return options;
}

export function defaultCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    timeout: options.timeoutMs ?? 10 * 60_000,
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

function streamResultFailure(result) {
  if (result?.error) return result.error;
  if (result?.status === 0) return null;
  const error = new Error(
    `command exited with status ${String(result?.status)}`,
  );
  error.code = "ECHILD";
  error.status = result?.status ?? null;
  return error;
}

function streamCleanupFailure(originalError, cleanupErrors) {
  const failure = new AggregateError(
    [...(originalError ? [originalError] : []), ...cleanupErrors],
    originalError
      ? "stream command failed and file handle cleanup was incomplete"
      : "stream command completed but file handle cleanup was incomplete",
  );
  failure.code =
    cleanupErrors.find((error) => isFilesystemErrorCode(error?.code))?.code ??
    "EIO";
  return failure;
}

export async function defaultStreamRunner(
  command,
  args,
  options = {},
  dependencies = {},
) {
  let inputHandle;
  let outputHandle;
  let result;
  let operationError = null;
  try {
    if (options.inputPath) {
      inputHandle = await fs.open(options.inputPath, constants.O_RDONLY);
    }
    if (options.outputPath) {
      outputHandle = await fs.open(
        options.outputPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [
        inputHandle
          ? inputHandle.fd
          : options.inheritStdin
            ? "inherit"
            : "ignore",
        outputHandle ? outputHandle.fd : "pipe",
        "pipe",
      ],
    });
    const maxBuffer = options.maxBuffer ?? 4 * 1024 * 1024;
    const stdout = [];
    const stderr = [];
    let capturedBytes = 0;
    let bufferError = null;
    const capture = (chunks) => (chunk) => {
      capturedBytes += chunk.length;
      if (capturedBytes > maxBuffer) {
        bufferError = new Error("command diagnostic output exceeded limit");
        bufferError.code = "ENOBUFS";
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", capture(stdout));
    child.stderr?.on("data", capture(stderr));
    const timeoutMs = options.timeoutMs ?? 30 * 60_000;
    let timeoutError = null;
    const timeout = setTimeout(() => {
      timeoutError = new Error(`command timed out after ${timeoutMs}ms`);
      timeoutError.code = "ETIMEDOUT";
      child.kill("SIGKILL");
    }, timeoutMs);
    result = await new Promise((resolvePromise) => {
      let spawnError = null;
      child.once("error", (error) => {
        spawnError = error;
      });
      child.once("close", (status) => {
        resolvePromise({
          status,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          error: timeoutError ?? bufferError ?? spawnError,
        });
      });
    });
    clearTimeout(timeout);
    if (!result.error && result.status === 0 && outputHandle) {
      await outputHandle.sync();
    }
  } catch (error) {
    operationError = error;
  }
  const cleanupErrors = await collectPrivateHandleCloseErrors(
    [inputHandle, outputHandle],
    dependencies,
  );
  if (cleanupErrors.length) {
    const failure = streamCleanupFailure(
      operationError ?? streamResultFailure(result),
      cleanupErrors,
    );
    if (operationError) throw failure;
    result.error = failure;
  }
  if (operationError) throw operationError;
  return result;
}

function action(code, status, message) {
  return { code, status, message };
}

function isSensitiveConfigKey(name) {
  if (name.startsWith("NEXT_PUBLIC_")) return false;
  if (/_TOKEN_(?:TTL|LIFETIME|EXPIRY|TIMEOUT|LENGTH)(?:_|$)/.test(name)) {
    return false;
  }
  return /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|TOKEN|CREDENTIAL|COOKIE)/.test(
    name,
  );
}

function environmentSyntaxError(lineNumber, detail) {
  return new SelfHostManagementError(
    "SELF_HOST_CONFIG_SYNTAX_INVALID",
    `.env.selfhost contains invalid syntax on line ${lineNumber}: ${detail}`,
    SELF_HOST_CLI_EXIT.CONFIG,
  );
}

function parseQuotedEnvironmentValue(value, quote, lineNumber) {
  let parsed = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === quote) {
      const trailing = value.slice(index + 1);
      if (trailing && !/^\s+#.*$/.test(trailing)) {
        throw environmentSyntaxError(
          lineNumber,
          "quoted values may only be followed by whitespace and a comment",
        );
      }
      return parsed;
    }
    if (character === "\\") {
      const escaped = value[index + 1];
      if (quote === "'" && escaped === "'") {
        parsed += "'";
        index += 1;
        continue;
      }
      if (quote === '"') {
        const escapes = {
          '"': '"',
          "\\": "\\",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (!Object.hasOwn(escapes, escaped)) {
          throw environmentSyntaxError(
            lineNumber,
            "double-quoted values contain an unsupported escape",
          );
        }
        parsed += escapes[escaped];
        index += 1;
        continue;
      }
    }
    if (quote === '"' && character === "$") {
      throw environmentSyntaxError(
        lineNumber,
        "variable interpolation is not allowed; single-quote a literal $ value",
      );
    }
    if (character === "\0") {
      throw environmentSyntaxError(lineNumber, "NUL bytes are not allowed");
    }
    parsed += character;
  }
  throw environmentSyntaxError(lineNumber, "quoted value is not terminated");
}

function parseEnvironmentValue(value, lineNumber) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    return parseQuotedEnvironmentValue(trimmed, trimmed[0], lineNumber);
  }
  const comment = trimmed.match(/\s+#/);
  const parsed = (
    comment ? trimmed.slice(0, comment.index) : trimmed
  ).trimEnd();
  if (parsed.includes("$")) {
    throw environmentSyntaxError(
      lineNumber,
      "variable interpolation is not allowed; single-quote a literal $ value",
    );
  }
  if (parsed.includes("\0")) {
    throw environmentSyntaxError(lineNumber, "NUL bytes are not allowed");
  }
  return parsed;
}

export function parseEnvironmentFile(text) {
  const values = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) {
      throw environmentSyntaxError(index + 1, "expected NAME=value");
    }
    if (values.has(match[1])) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_DUPLICATE_KEY",
        `.env.selfhost contains duplicate setting ${match[1]} on line ${index + 1}`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    values.set(match[1], parseEnvironmentValue(match[2], index + 1));
  }
  return values;
}

function validateOrigin(raw, name) {
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Error();
    }
    return url;
  } catch {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      `${name} must be an absolute HTTP(S) origin`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
}

function booleanSetting(values, name) {
  return ["1", "true", "yes", "on"].includes(
    (values.get(name) ?? "").trim().toLowerCase(),
  );
}

function integerSetting(
  values,
  name,
  { defaultValue = null, minimum, maximum },
) {
  const configured = values.get(name);
  const raw =
    configured === undefined || configured === "" ? defaultValue : configured;
  if (
    raw === null ||
    !/^(?:0|[1-9]\d*)$/.test(String(raw)) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < minimum ||
    Number(raw) > maximum
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return Number(raw);
}

function ipv4Parts(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  return numbers.every(
    (part, index) =>
      Number.isInteger(part) &&
      part >= 0 &&
      part <= 255 &&
      String(part) === parts[index],
  )
    ? numbers
    : null;
}

export function isPrivateOrLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".home.arpa")
  ) {
    return true;
  }
  const ip = ipv4Parts(normalized);
  if (ip) {
    return (
      ip[0] === 127 ||
      ip[0] === 10 ||
      (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
      (ip[0] === 192 && ip[1] === 168) ||
      (ip[0] === 169 && ip[1] === 254)
    );
  }
  if (isIP(normalized) !== 6) return false;
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function isLoopback(value) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  return ["127.0.0.1", "::1", "localhost"].includes(normalized);
}

function configuredOriginPort(origin) {
  return Number(origin.port || (origin.protocol === "https:" ? 443 : 80));
}

function normalizeBindAddress(value) {
  return value.replace(/^\[|\]$/g, "");
}

function bindAddressesOverlap(left, right) {
  if (left === right || left === "::" || right === "::") return true;
  if (left === "0.0.0.0") return isIP(right) === 4;
  if (right === "0.0.0.0") return isIP(left) === 4;
  return false;
}

export function validateSelfHostNetworkPolicy(values, site) {
  const warnings = [];
  const bind = values.get("SELF_HOST_HTTP_BIND") || "127.0.0.1";
  if (site.protocol === "http:") {
    const localOrigin = isPrivateOrLocalHostname(site.hostname);
    if (
      !localOrigin &&
      !booleanSetting(values, "SELF_HOST_ALLOW_INSECURE_HTTP")
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_PUBLIC_HTTP_BLOCKED",
        "public self-host origins must use HTTPS; SELF_HOST_ALLOW_INSECURE_HTTP=true is an explicit unsafe exception",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    if (!localOrigin) {
      warnings.push(
        "SELF_HOST_INSECURE_PUBLIC_HTTP: explicit unsafe override is active; configure HTTPS before exposure",
      );
    } else if (!isLoopback(site.hostname)) {
      warnings.push(
        "SELF_HOST_INSECURE_LAN_HTTP: credentials and session cookies are unencrypted on the local network",
      );
    }
    if (!isLoopback(bind) && isLoopback(site.hostname)) {
      throw new SelfHostManagementError(
        "SELF_HOST_BIND_ORIGIN_MISMATCH",
        "a non-loopback SELF_HOST_HTTP_BIND requires SELF_HOST_SITE_ADDRESS to name the LAN or public host",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  return warnings;
}

export function validateSelfHostEnvironment(values) {
  const composeControlSetting = [...values.keys()].find((name) =>
    name.startsWith("COMPOSE_"),
  );
  if (composeControlSetting) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      `.env.selfhost must not contain Docker Compose control setting ${composeControlSetting}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const unsupportedSetting = [...values.keys()].find(
    (name) => !SELF_HOST_INSTANCE_CONFIG_KEY_SET.has(name),
  );
  if (unsupportedSetting) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      `.env.selfhost contains unsupported setting ${unsupportedSetting}; use schemas/self-host-instance-config.schema.json for the signed v1 operator surface`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const required = [
    "SELF_HOST_AUTH_SECRET",
    "SELF_HOST_DATABASE_PASSWORD",
    "SELF_HOST_INTEGRATION_SECRET",
    "SELF_HOST_SITE_ADDRESS",
    "SELF_HOST_HTTP_BIND",
    "SELF_HOST_MIGRATE_IMAGE",
    "SELF_HOST_SERVER_IMAGE",
    "SELF_HOST_CLIENT_IMAGE",
    "SELF_HOST_VERSION",
    "SELF_HOST_MODE",
    "SELF_HOST_PROJECT_NAME",
  ];
  const missing = required.filter((name) => !values.get(name)?.trim());
  if (missing.length) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      `missing required self-host settings: ${missing.join(", ")}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  for (const name of [
    "SELF_HOST_DATABASE_NAME",
    "SELF_HOST_DATABASE_USER",
    "SELF_HOST_DATABASE_CONNECTION_LIMIT",
    "SELF_HOST_DATABASE_POOL_TIMEOUT_SECONDS",
    "SELF_HOST_DATA_ROOT",
    "SELF_HOST_HTTP_PORT",
    "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS",
    "MAP_MAX_ZOOM",
    "ELEVATION_TILE_ZOOM",
  ]) {
    if (values.has(name) && !values.get(name)?.trim()) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `${name} must not be empty when present`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  const authSecret = values.get("SELF_HOST_AUTH_SECRET");
  if (
    authSecret.length < 32 ||
    authSecret.toLowerCase().includes("replace-with")
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_SECRET_INVALID",
      "SELF_HOST_AUTH_SECRET must be a generated value with at least 32 characters",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const databasePassword = values.get("SELF_HOST_DATABASE_PASSWORD");
  if (
    databasePassword.length < 32 ||
    databasePassword.toLowerCase().includes("replace-with") ||
    !/^[A-Za-z0-9._~-]+$/.test(databasePassword)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_SECRET_INVALID",
      "SELF_HOST_DATABASE_PASSWORD must be a generated URL-safe value with at least 32 characters",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const integrationSecret = values.get("SELF_HOST_INTEGRATION_SECRET");
  if (
    integrationSecret.length < 32 ||
    integrationSecret.toLowerCase().includes("replace-with")
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_SECRET_INVALID",
      "SELF_HOST_INTEGRATION_SECRET must be a generated value with at least 32 characters",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const site = validateOrigin(
    values.get("SELF_HOST_SITE_ADDRESS"),
    "SELF_HOST_SITE_ADDRESS",
  );
  validateSelfHostNetworkPolicy(values, site);
  if (!SELF_HOST_MODES.has(values.get("SELF_HOST_MODE"))) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "SELF_HOST_MODE must be core-local, connected, or extended",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  for (const name of [
    "SELF_HOST_ALLOW_INSECURE_HTTP",
  ]) {
    if (values.has(name) && !new Set(["true", "false"]).has(values.get(name))) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `${name} must be true or false`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  if (
    !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(values.get("SELF_HOST_PROJECT_NAME"))
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "SELF_HOST_PROJECT_NAME must be 1-63 lowercase letters, digits, hyphens, or underscores and start with a letter or digit",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  for (const name of ["SELF_HOST_DATABASE_NAME", "SELF_HOST_DATABASE_USER"]) {
    const value = values.get(name) ?? "trainingload";
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.~-]{0,62}$/.test(value)) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `${name} must be a 1-63 character URL-safe PostgreSQL identifier`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  integerSetting(values, "SELF_HOST_DATABASE_CONNECTION_LIMIT", {
    defaultValue: "5",
    minimum: 1,
    maximum: 100,
  });
  integerSetting(values, "SELF_HOST_DATABASE_POOL_TIMEOUT_SECONDS", {
    defaultValue: "20",
    minimum: 1,
    maximum: 300,
  });
  for (const name of ["SELF_HOST_HTTP_BIND"]) {
    const bind = normalizeBindAddress(values.get(name));
    if (isIP(bind) === 0) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `${name} must be an IPv4 or IPv6 address`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  const httpPort = integerSetting(values, "SELF_HOST_HTTP_PORT", {
    defaultValue: "43210",
    minimum: 1,
    maximum: 65_535,
  });
  if (site.protocol === "http:" && configuredOriginPort(site) !== httpPort) {
    throw new SelfHostManagementError("SELF_HOST_CONFIG_INVALID", "SELF_HOST_HTTP_PORT must match SELF_HOST_SITE_ADDRESS", SELF_HOST_CLI_EXIT.CONFIG);
  }
  const listeners = [{ name: "HTTP", bind: normalizeBindAddress(values.get("SELF_HOST_HTTP_BIND")), port: httpPort }];
  for (let left = 0; left < listeners.length; left += 1) {
    for (let right = left + 1; right < listeners.length; right += 1) {
      const first = listeners[left];
      const second = listeners[right];
      if (
        first.port === second.port &&
        bindAddressesOverlap(first.bind, second.bind)
      ) {
        throw new SelfHostManagementError(
          "SELF_HOST_CONFIG_INVALID",
          `${first.name} and ${second.name} listeners conflict on port ${first.port} because their bind addresses overlap`,
          SELF_HOST_CLI_EXIT.CONFIG,
        );
      }
    }
  }
  if (values.has("SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS")) {
    integerSetting(values, "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS", {
      minimum: 600,
      maximum: 604_800,
    });
  }
  const mapProvider = values.get("MAP_PROVIDER") ?? "none";
  if (
    ![
      "none",
      "openfreemap",
      "osm-raster",
      "custom-raster",
      "custom-style",
      "local",
    ].includes(mapProvider)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "MAP_PROVIDER must be none, openfreemap, osm-raster, custom-raster, custom-style, or local",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const requireNonEmptySettings = (names, context) => {
    const missing = names.filter((name) => !values.get(name)?.trim());
    if (missing.length) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `${context} requires non-empty settings: ${missing.join(", ")}`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  };
  if (mapProvider === "custom-raster") {
    requireNonEmptySettings(
      ["MAP_TILE_URL", "MAP_ATTRIBUTION"],
      "MAP_PROVIDER=custom-raster",
    );
  }
  if (mapProvider === "custom-style") {
    requireNonEmptySettings(
      ["MAP_STYLE_URL", "MAP_ATTRIBUTION"],
      "MAP_PROVIDER=custom-style",
    );
  }
  if (mapProvider === "local") {
    requireNonEmptySettings(["MAP_ATTRIBUTION"], "MAP_PROVIDER=local");
    if (
      !values.get("MAP_STYLE_URL")?.trim() &&
      !values.get("MAP_TILE_URL")?.trim()
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        "MAP_PROVIDER=local requires MAP_STYLE_URL or MAP_TILE_URL",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  if (values.has("MAP_MAX_ZOOM")) {
    integerSetting(values, "MAP_MAX_ZOOM", {
      minimum: 0,
      maximum: 24,
    });
  }
  const elevationProvider = values.get("ELEVATION_PROVIDER") ?? "none";
  if (!["none", "local-dem"].includes(elevationProvider)) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "ELEVATION_PROVIDER must be none or local-dem in the signed v1 release",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  if (values.has("ELEVATION_TILE_ZOOM")) {
    integerSetting(values, "ELEVATION_TILE_ZOOM", {
      minimum: 0,
      maximum: 22,
    });
  }

  const aiProvider = values.get("AI_PROVIDER") ?? "none";
  const aiRequirements = {
    none: [],
    openai: [
      "OPENAI_API_KEY",
      "OPENAI_DEFAULT_MODEL",
      "OPENAI_REASONING_MODEL",
    ],
    openrouter: [
      "OPENROUTER_API_KEY",
      "OPENROUTER_DEFAULT_MODEL",
      "OPENROUTER_REASONING_MODEL",
    ],
    aliyun: [
      "DASHSCOPE_API_KEY",
      "DASHSCOPE_DEFAULT_MODEL",
      "DASHSCOPE_REASONING_MODEL",
    ],
    dashscope: [
      "DASHSCOPE_API_KEY",
      "DASHSCOPE_DEFAULT_MODEL",
      "DASHSCOPE_REASONING_MODEL",
    ],
    deepseek: [
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_DEFAULT_MODEL",
      "DEEPSEEK_REASONING_MODEL",
    ],
    "custom-openai-compatible": [
      "AI_API_KEY",
      "AI_BASE_URL",
      "AI_DEFAULT_MODEL",
      "AI_REASONING_MODEL",
    ],
  };
  if (!Object.hasOwn(aiRequirements, aiProvider)) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "AI_PROVIDER must be none, openai, openrouter, aliyun, dashscope, deepseek, or custom-openai-compatible",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  if (aiProvider !== "none") {
    requireNonEmptySettings(
      aiRequirements[aiProvider],
      `AI_PROVIDER=${aiProvider}`,
    );
  }
  if (
    values.has("TELEMETRY_ENABLED") &&
    values.get("TELEMETRY_ENABLED") !== "false"
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "TELEMETRY_ENABLED must remain false in the signed v1 release",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  if (values.get("SELF_HOST_MODE") === "core-local") {
    if (!["none", "local"].includes(mapProvider)) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        "MAP_PROVIDER must be none or local when SELF_HOST_MODE=core-local",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    if (!["none", "local-dem"].includes(elevationProvider)) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        "ELEVATION_PROVIDER must be none or local-dem when SELF_HOST_MODE=core-local",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }

  }
  if (!SEMVER_PATTERN.test(values.get("SELF_HOST_VERSION"))) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      "SELF_HOST_VERSION must be an explicit semantic version",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  for (const name of [
    "SELF_HOST_MIGRATE_IMAGE",
    "SELF_HOST_SERVER_IMAGE",
    "SELF_HOST_CLIENT_IMAGE",
  ]) {
    const image = values.get(name);
    if (!OCI_IMAGE_REFERENCE.test(image)) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_IMAGE_INVALID",
        `${name} must be a valid OCI image reference without embedded credentials`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    if (/(?:^|:)latest(?:@|$)/i.test(image)) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_MUTABLE_IMAGE",
        `${name} must not use latest`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
  }
  return values;
}

async function lstatOrNull(path) {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function requireRegularFile(path, code) {
  const stat = await lstatOrNull(path);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new SelfHostManagementError(
      code,
      `required regular file is missing or unsafe: ${path}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return stat;
}

async function ensurePrivateDirectory(path) {
  await fs.mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`unsafe directory: ${path}`);
  }
  await hardenPrivatePath(path, { kind: "directory" });
}

async function syncDirectory(path) {
  // Node cannot open directory handles for fsync on Windows. The file itself is
  // still flushed before publication and rename/link are atomic on one volume.
  if (process.platform === "win32") return;
  const handle = await fs.open(path, constants.O_RDONLY);
  let operationError = null;
  try {
    await handle.sync();
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
}

async function atomicWrite(path, content, mode = 0o600) {
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      mode,
    );
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await hardenPrivatePath(temporaryPath, { kind: "file", mode });
    // Publishing through an exclusive hard link keeps the destination
    // immutable: concurrent init/operation writers cannot replace a record.
    await fs.link(temporaryPath, path);
    await fs.unlink(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    await rethrowAfterPrivateTemporaryCleanup(error, handle, temporaryPath);
  }
}

async function atomicReplace(path, content, mode = 0o600) {
  const existing = await fs.lstat(path);
  if (!existing.isFile() || existing.isSymbolicLink()) {
    throw new Error(`refusing to replace an unsafe file: ${path}`);
  }
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      mode,
    );
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await hardenPrivatePath(temporaryPath, { kind: "file", mode });
    await fs.rename(temporaryPath, path);
    await hardenPrivatePath(path, { kind: "file", mode });
    await syncDirectory(directory);
  } catch (error) {
    await rethrowAfterPrivateTemporaryCleanup(error, handle, temporaryPath);
  }
}

function operationLockPath(instanceDirectory) {
  return resolve(instanceDirectory, ".selfhost/operation.lock.json");
}

function operationLockReclaimPath(instanceDirectory) {
  return resolve(
    instanceDirectory,
    ".selfhost",
    OPERATION_LOCK_RECLAIM_FILENAME,
  );
}

function defaultProcessAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function operationLockFailure(code, message, cause = undefined) {
  return new SelfHostManagementError(
    code,
    message,
    code === "SELF_HOST_OPERATION_IN_PROGRESS"
      ? SELF_HOST_CLI_EXIT.STATE_CONFLICT
      : SELF_HOST_CLI_EXIT.FILESYSTEM,
    { cause },
  );
}

async function readOperationLock(path) {
  let read;
  try {
    read = await readRegularFileBounded(path, {
      maximumBytes: OPERATION_LOCK_MAX_BYTES,
      minimumBytes: 1,
      label: "self-host operation lock",
    });
  } catch (error) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the instance operation lock is missing, unsafe, oversized, or unstable",
      error,
    );
  }
  let record;
  try {
    record = JSON.parse(read.contents.toString("utf8"));
  } catch (error) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the instance operation lock is not valid JSON",
      error,
    );
  }
  const startedAt = Date.parse(record?.startedAt ?? "");
  if (
    !hasExactKeys(record, [
      "schemaVersion",
      "kind",
      "operationId",
      "command",
      "processId",
      "startedAt",
    ]) ||
    record.schemaVersion !== 1 ||
    record.kind !== OPERATION_LOCK_KIND ||
    !UUID_PATTERN.test(record.operationId ?? "") ||
    !SERIALIZED_MUTATION_COMMANDS.has(record.command) ||
    !Number.isSafeInteger(record.processId) ||
    record.processId < 1 ||
    !Number.isFinite(startedAt)
  ) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the instance operation lock does not match its strict contract",
    );
  }
  return {
    contents: read.contents,
    record,
    startedAt,
  };
}

function operationLockDigest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function readOperationReclaim(path) {
  let read;
  try {
    read = await readRegularFileBounded(path, {
      maximumBytes: OPERATION_LOCK_MAX_BYTES,
      minimumBytes: 1,
      label: "self-host operation reclaim record",
    });
  } catch (error) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale-lock reclaim record is missing, unsafe, oversized, or unstable",
      error,
    );
  }
  let record;
  try {
    record = JSON.parse(read.contents.toString("utf8"));
  } catch (error) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale-lock reclaim record is not valid JSON",
      error,
    );
  }
  const startedAt = Date.parse(record?.startedAt ?? "");
  if (
    !hasExactKeys(record, [
      "schemaVersion",
      "kind",
      "operationId",
      "command",
      "processId",
      "startedAt",
      "observedOperationId",
      "observedSha256",
    ]) ||
    record.schemaVersion !== 1 ||
    record.kind !== OPERATION_RECLAIM_KIND ||
    !UUID_PATTERN.test(record.operationId ?? "") ||
    !SERIALIZED_MUTATION_COMMANDS.has(record.command) ||
    !Number.isSafeInteger(record.processId) ||
    record.processId < 1 ||
    !Number.isFinite(startedAt) ||
    !UUID_PATTERN.test(record.observedOperationId ?? "") ||
    !SHA256_PATTERN.test(record.observedSha256 ?? "")
  ) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale-lock reclaim record does not match its strict contract",
    );
  }
  return {
    contents: read.contents,
    record,
    startedAt,
  };
}

async function inspectOperationReclaim(context, path, reclaimPath) {
  const [reclaim, current] = await Promise.all([
    readOperationReclaim(reclaimPath),
    readOperationLock(path),
  ]);
  const now = context.now().getTime();
  let ownerAlive = true;
  try {
    ownerAlive = Boolean(await context.processAlive(reclaim.record.processId));
  } catch {
    ownerAlive = true;
  }
  return {
    reclaim,
    current,
    ownerAlive,
    ageMs: now - reclaim.startedAt,
    futureTimestamp: reclaim.startedAt - now > 5 * 60_000,
    expired: now - reclaim.startedAt > OPERATION_RECLAIM_TIMEOUT_MS,
    matches:
      reclaim.record.observedOperationId === current.record.operationId &&
      reclaim.record.observedSha256 === operationLockDigest(current.contents),
  };
}

async function rejectExistingOperationReclaim(context, path, reclaimPath) {
  let state;
  try {
    state = await inspectOperationReclaim(context, path, reclaimPath);
  } catch (error) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale-lock reclaim record is orphaned, invalid, or unsafe",
      error,
    );
  }
  if (
    !state.matches ||
    state.futureTimestamp ||
    state.expired ||
    !state.ownerAlive
  ) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      !state.matches
        ? "the stale-lock reclaim record does not match the current lock"
        : state.futureTimestamp
          ? "the stale-lock reclaim record has a future timestamp"
          : state.expired
            ? "the stale-lock reclaimer exceeded its bounded claim window"
            : "the stale-lock reclaimer is no longer running",
    );
  }
  throw operationLockFailure(
    "SELF_HOST_OPERATION_IN_PROGRESS",
    `another ${state.reclaim.record.command} command is reclaiming the stale instance operation lock`,
  );
}

async function replaceStaleOperationLock(context, path, observed, payload) {
  const reclaimPath = operationLockReclaimPath(context.instanceDirectory);
  const reclaimPayload = `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: OPERATION_RECLAIM_KIND,
      operationId: context.operationId,
      command: context.command,
      processId: context.processId,
      startedAt: context.startedAt,
      observedOperationId: observed.record.operationId,
      observedSha256: operationLockDigest(observed.contents),
    },
    null,
    2,
  )}\n`;
  const reclaimContents = Buffer.from(reclaimPayload, "utf8");
  let claimed = false;
  try {
    await atomicWrite(reclaimPath, reclaimPayload, 0o600);
    claimed = true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      await rejectExistingOperationReclaim(context, path, reclaimPath);
    }
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale instance operation lock could not be claimed",
      error,
    );
  }

  try {
    const [claim, confirmed] = await Promise.all([
      readOperationReclaim(reclaimPath),
      readOperationLock(path),
    ]);
    if (
      !claim.contents.equals(reclaimContents) ||
      !confirmed.contents.equals(observed.contents)
    ) {
      throw operationLockFailure(
        "SELF_HOST_OPERATION_IN_PROGRESS",
        "the instance operation lock changed while stale ownership was claimed",
      );
    }

    await atomicReplace(path, payload, 0o600);
    const replacement = await readOperationLock(path);
    const contents = Buffer.from(payload, "utf8");
    if (!replacement.contents.equals(contents)) {
      throw new Error("the replacement operation lock identity changed");
    }
    await fs.unlink(reclaimPath);
    claimed = false;
    await context.operationLockSync(dirname(path));
    return { path, contents };
  } catch (error) {
    if (claimed) {
      try {
        const claim = await readOperationReclaim(reclaimPath);
        if (claim.contents.equals(reclaimContents)) {
          await fs.unlink(reclaimPath);
          await context.operationLockSync(dirname(path));
        }
      } catch {
        // A record that cannot be proven to be ours remains as a fail-closed
        // recovery artifact for doctor/diagnostics instead of being removed.
      }
    }
    if (error instanceof SelfHostManagementError) throw error;
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the stale instance operation lock could not be safely replaced",
      error,
    );
  }
}

async function acquireOperationLock(context) {
  const stateDirectory = resolve(context.instanceDirectory, ".selfhost");
  const path = operationLockPath(context.instanceDirectory);
  const reclaimPath = operationLockReclaimPath(context.instanceDirectory);
  if (
    !UUID_PATTERN.test(context.operationId) ||
    !Number.isSafeInteger(context.processId) ||
    context.processId < 1 ||
    !Number.isFinite(Date.parse(context.startedAt)) ||
    typeof context.processAlive !== "function"
  ) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_INVALID",
      "the current operation cannot create a valid instance lock",
    );
  }
  await ensurePrivateDirectory(stateDirectory);
  if (await lstatOrNull(reclaimPath)) {
    await rejectExistingOperationReclaim(context, path, reclaimPath);
  }
  const payload = `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: OPERATION_LOCK_KIND,
      operationId: context.operationId,
      command: context.command,
      processId: context.processId,
      startedAt: context.startedAt,
    },
    null,
    2,
  )}\n`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await atomicWrite(path, payload, 0o600);
      return { path, contents: Buffer.from(payload, "utf8") };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw operationLockFailure(
          "SELF_HOST_OPERATION_LOCK_INVALID",
          "the instance operation lock could not be created",
          error,
        );
      }
    }

    const observed = await readOperationLock(path);
    const now = context.now().getTime();
    const age = now - observed.startedAt;
    if (age < -5 * 60_000) {
      throw operationLockFailure(
        "SELF_HOST_OPERATION_LOCK_INVALID",
        "the instance operation lock has a future timestamp",
      );
    }
    let ownerAlive = true;
    try {
      ownerAlive = Boolean(
        await context.processAlive(observed.record.processId),
      );
    } catch {
      ownerAlive = true;
    }
    if (ownerAlive || age < OPERATION_LOCK_STALE_GRACE_MS) {
      throw operationLockFailure(
        "SELF_HOST_OPERATION_IN_PROGRESS",
        `another ${observed.record.command} operation still owns this instance`,
      );
    }
    const replacement = await replaceStaleOperationLock(
      context,
      path,
      observed,
      payload,
    );
    if (!replacement) {
      continue;
    }
    return replacement;
  }
  throw operationLockFailure(
    "SELF_HOST_OPERATION_IN_PROGRESS",
    "another mutation acquired the instance operation lock",
  );
}

async function releaseOperationLock(context, lock) {
  const observed = await readOperationLock(lock.path);
  if (!observed.contents.equals(lock.contents)) {
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED",
      "the instance operation lock is no longer owned by this command",
    );
  }
  const released = `${lock.path}.released-${context.operationId}`;
  let snapshotCreated = false;
  let primaryUnlinked = false;
  try {
    await fs.link(lock.path, released);
    snapshotCreated = true;
    await context.operationLockSync(dirname(lock.path));
    const [snapshot, current] = await Promise.all([
      readOperationLock(released),
      readOperationLock(lock.path),
    ]);
    if (
      !snapshot.contents.equals(lock.contents) ||
      !current.contents.equals(lock.contents)
    ) {
      throw new Error("the operation lock release snapshot changed identity");
    }
    await fs.unlink(lock.path);
    primaryUnlinked = true;
    await context.operationLockSync(dirname(lock.path));
    await fs.unlink(released);
    snapshotCreated = false;
    await context.operationLockSync(dirname(lock.path));
  } catch (error) {
    if (snapshotCreated) {
      try {
        const snapshot = await readOperationLock(released);
        if (snapshot.contents.equals(lock.contents)) {
          const current = await lstatOrNull(lock.path);
          if (primaryUnlinked && !current) {
            await fs.link(released, lock.path);
            await context.operationLockSync(dirname(lock.path));
          }
          if (await lstatOrNull(lock.path)) {
            await fs.unlink(released);
            await context.operationLockSync(dirname(lock.path));
          }
        }
      } catch {
        // Preserve any snapshot whose identity or recovery cannot be proven.
      }
    }
    throw operationLockFailure(
      "SELF_HOST_OPERATION_LOCK_RELEASE_FAILED",
      "the instance operation lock could not be durably released",
      error,
    );
  }
}

function replaceEnvironmentSettings(text, updates) {
  const remaining = new Set(Object.keys(updates));
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;
    remaining.delete(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  if (remaining.size) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_CONFIG_INVALID",
      `cannot update missing self-host settings: ${[...remaining].join(", ")}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return lines.join("\n");
}

function sourceBuildImageSettings(values) {
  const projectName = values.get("SELF_HOST_PROJECT_NAME");
  const version = values.get("SELF_HOST_VERSION");
  return {
    SELF_HOST_MIGRATE_IMAGE: `${projectName}-migrate:${version}`,
    SELF_HOST_SERVER_IMAGE: `${projectName}-server:${version}`,
    SELF_HOST_CLIENT_IMAGE: `${projectName}-client:${version}`,
  };
}

function instanceProjectName(instanceDirectory) {
  const suffix = createHash("sha256")
    .update(resolve(instanceDirectory))
    .digest("hex")
    .slice(0, 12);
  return `trainingload-${suffix}`;
}

function sourceBuildImagesNeedPinning(values, settings) {
  return Object.entries(settings).some(
    ([name, reference]) => values.get(name) !== reference,
  );
}

function resolveDataRoot(instanceDirectory, values) {
  const configured = values.get("SELF_HOST_DATA_ROOT")?.trim() || "./data";
  const root = isAbsolute(configured)
    ? resolve(configured)
    : resolve(instanceDirectory, configured);
  const instanceRelativeToDataRoot = relative(root, instanceDirectory);
  const dataRootContainsInstance =
    instanceRelativeToDataRoot !== "" &&
    instanceRelativeToDataRoot !== ".." &&
    !instanceRelativeToDataRoot.startsWith(`..${sep}`) &&
    !isAbsolute(instanceRelativeToDataRoot);
  const dataRootRelativeToInstance = relative(instanceDirectory, root);
  const dataRootInsideInstance =
    dataRootRelativeToInstance !== "" &&
    dataRootRelativeToInstance !== ".." &&
    !dataRootRelativeToInstance.startsWith(`..${sep}`) &&
    !isAbsolute(dataRootRelativeToInstance);
  const overlapsReservedInstancePath =
    dataRootInsideInstance &&
    RESERVED_INSTANCE_TOP_LEVEL.has(dataRootRelativeToInstance.split(sep)[0]);
  if (
    root === parse(root).root ||
    root === instanceDirectory ||
    dataRootContainsInstance ||
    overlapsReservedInstancePath
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DATA_ROOT must be dedicated and cannot be a filesystem root, release root, release ancestor, or signed release subtree",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return root;
}

function pathStrictlyContains(parent, child) {
  const relation = relative(parent, child);
  return (
    relation !== "" &&
    relation !== ".." &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}

async function resolveProspectiveRealPath(path) {
  const missingSegments = [];
  let existing = resolve(path);
  while (!(await lstatOrNull(existing))) {
    const parent = dirname(existing);
    if (parent === existing) {
      throw new Error(`cannot resolve an existing ancestor for ${path}`);
    }
    missingSegments.unshift(basename(existing));
    existing = parent;
  }
  return resolve(await fs.realpath(existing), ...missingSegments);
}

async function validateDataRootBoundary(instanceDirectory, values) {
  const dataRoot = resolveDataRoot(instanceDirectory, values);
  const stat = await lstatOrNull(dataRoot);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DATA_ROOT must be a real dedicated directory",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  let actualRoot;
  let actualInstance;
  try {
    [actualRoot, actualInstance] = await Promise.all([
      resolveProspectiveRealPath(dataRoot),
      fs.realpath(instanceDirectory),
    ]);
  } catch (error) {
    if (error instanceof SelfHostManagementError) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DATA_ROOT physical path cannot be resolved safely",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
  const actualRootRelativeToInstance = relative(actualInstance, actualRoot);
  const actualRootInsideInstance =
    actualRootRelativeToInstance !== "" &&
    actualRootRelativeToInstance !== ".." &&
    !actualRootRelativeToInstance.startsWith(`..${sep}`) &&
    !isAbsolute(actualRootRelativeToInstance);
  const actualRootOverlapsReservedInstancePath =
    actualRootInsideInstance &&
    RESERVED_INSTANCE_TOP_LEVEL.has(actualRootRelativeToInstance.split(sep)[0]);
  if (
    actualRoot === parse(actualRoot).root ||
    actualRoot === actualInstance ||
    pathStrictlyContains(actualRoot, actualInstance) ||
    actualRootOverlapsReservedInstancePath
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DATA_ROOT resolves to a filesystem root, release root, release ancestor, or signed release subtree",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return dataRoot;
}

function dataDirectories(dataRoot) {
  return [
    "postgres",
    "uploads",
    "cache",
    "cache/storage",
    "cache/client",
    "elevation",
    "backups",
    "diagnostics",
    "operations",
  ].map((path) => resolve(dataRoot, path));
}

async function unexpectedDirectoryEntryNames(
  directory,
  allowed,
  maximumResults = 5,
) {
  const unexpected = [];
  const handle = await fs.opendir(directory);
  for await (const entry of handle) {
    if (!allowed.has(entry.name)) unexpected.push(entry.name);
    if (unexpected.length === maximumResults) break;
  }
  return unexpected;
}

async function inspectDataRoot(dataRoot) {
  const rootStat = await lstatOrNull(dataRoot);
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_UNSAFE",
      "SELF_HOST_DATA_ROOT must be a real directory",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  const markerPath = resolve(dataRoot, DATA_ROOT_MARKER);
  const markerStat = await lstatOrNull(markerPath);
  if (markerStat && (!markerStat.isFile() || markerStat.isSymbolicLink())) {
    throw new SelfHostManagementError(
      "SELF_HOST_DATA_ROOT_MARKER_INVALID",
      "the self-host data root marker must be a regular file",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  if (markerStat) {
    if (markerStat.size > 4096) {
      throw new SelfHostManagementError(
        "SELF_HOST_DATA_ROOT_MARKER_INVALID",
        "the self-host data root marker is unexpectedly large",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    try {
      const { contents } = await readRegularFileBounded(markerPath, {
        maximumBytes: 4096,
        expectedSizeBytes: markerStat.size,
        label: "self-host data root marker",
      });
      const marker = JSON.parse(contents.toString("utf8"));
      if (
        marker.schemaVersion !== 1 ||
        marker.purpose !== "trainingload-selfhost-data-root"
      ) {
        throw new Error("unexpected marker content");
      }
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_DATA_ROOT_MARKER_INVALID",
        "the self-host data root marker is unreadable or incompatible",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
  } else if (rootStat) {
    const unexpected = await unexpectedDirectoryEntryNames(
      dataRoot,
      DATA_ROOT_TOP_LEVEL,
    );
    if (unexpected.length) {
      throw new SelfHostManagementError(
        "SELF_HOST_DATA_ROOT_NOT_DEDICATED",
        `refusing to adopt a non-empty data root with unrelated entries: ${unexpected.slice(0, 5).join(", ")}`,
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
  }
  const [rootAccess, markerAccess] = await Promise.all([
    rootStat
      ? inspectPrivatePath(dataRoot, { kind: "directory" })
      : Promise.resolve(null),
    markerStat
      ? inspectPrivatePath(markerPath, { kind: "file" })
      : Promise.resolve(null),
  ]);
  return {
    rootStat,
    markerPath,
    markerStat,
    permissionsNeedHardening: Boolean(rootAccess && !rootAccess.secure),
    markerPermissionsNeedHardening: Boolean(
      markerAccess && !markerAccess.secure,
    ),
  };
}

function currentReleaseStatePath(instanceDirectory) {
  return resolve(instanceDirectory, ".selfhost/current-release.json");
}

async function readReleaseMetadata(instanceDirectory) {
  const statePath = currentReleaseStatePath(instanceDirectory);
  const stateStat = await lstatOrNull(statePath);
  if (stateStat) {
    if (
      !stateStat.isFile() ||
      stateStat.isSymbolicLink() ||
      stateStat.size > MAX_CONFIG_BYTES
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_RELEASE_STATE_INVALID",
        "current release state is not a safe regular file",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    try {
      const { contents } = await readRegularFileBounded(statePath, {
        maximumBytes: MAX_CONFIG_BYTES,
        expectedSizeBytes: stateStat.size,
        label: "current release state",
      });
      const state = JSON.parse(contents.toString("utf8"));
      if (
        !hasExactKeys(state, [
          "schemaVersion",
          "kind",
          "releaseVersion",
          "configSchemaVersion",
          "composeSchemaVersion",
          "schemaEpoch",
          "sourceRevision",
          "images",
          "updatedAt",
        ]) ||
        state?.schemaVersion !== 1 ||
        state.kind !== "trainingload-selfhost-current-release" ||
        !SEMVER_PATTERN.test(state.releaseVersion ?? "") ||
        !Number.isInteger(state.configSchemaVersion) ||
        state.configSchemaVersion < 1 ||
        !Number.isInteger(state.composeSchemaVersion) ||
        state.composeSchemaVersion < 1 ||
        !Number.isInteger(state.schemaEpoch) ||
        state.schemaEpoch < 1 ||
        !(
          state.sourceRevision === null ||
          /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(state.sourceRevision)
        ) ||
        !hasExactKeys(state.images, ["migrate", "server", "client"]) ||
        Object.values(state.images).some(
          (reference) =>
            typeof reference !== "string" ||
            !OCI_IMAGE_REFERENCE.test(reference),
        ) ||
        !Number.isFinite(Date.parse(state.updatedAt ?? ""))
      ) {
        throw new Error("unexpected current release state");
      }
      return {
        version: state.releaseVersion,
        configSchemaVersion: state.configSchemaVersion,
        composeSchemaVersion: state.composeSchemaVersion,
        schemaEpoch: state.schemaEpoch,
        sourceRevision: state.sourceRevision ?? null,
        images: state.images,
      };
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_RELEASE_STATE_INVALID",
        "current release state is unreadable or incompatible",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
  }

  let metadata = null;
  for (const { path, authoritative } of [
    {
      path: resolve(instanceDirectory, "release-manifest.json"),
      authoritative: true,
    },
    { path: resolve(instanceDirectory, "package.json"), authoritative: false },
  ]) {
    const stat = await lstatOrNull(path);
    if (
      !stat?.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_CONFIG_BYTES
    ) {
      if (authoritative && stat) break;
      continue;
    }
    try {
      const { contents } = await readRegularFileBounded(path, {
        maximumBytes: MAX_CONFIG_BYTES,
        expectedSizeBytes: stat.size,
        label: authoritative ? "release manifest" : "package metadata",
      });
      const payload = JSON.parse(contents.toString("utf8"));
      if (authoritative) validateReleaseManifest(payload);
      const version = payload.releaseVersion ?? payload.version;
      if (typeof version === "string" && version.trim()) {
        metadata = {
          version: version.trim(),
          configSchemaVersion: Number.isInteger(payload.configSchemaVersion)
            ? payload.configSchemaVersion
            : 1,
          composeSchemaVersion: Number.isInteger(payload.composeSchemaVersion)
            ? payload.composeSchemaVersion
            : 1,
          schemaEpoch: Number.isInteger(payload.database?.schemaEpoch)
            ? payload.database.schemaEpoch
            : 1,
          sourceRevision:
            typeof payload.source?.revision === "string"
              ? payload.source.revision
              : null,
          images: payload.images
            ? {
                server: payload.images.server?.reference,
                client: payload.images.client?.reference,
              }
            : null,
        };
        break;
      }
    } catch {
      // The command-specific artifact validation will report malformed files.
    }
    if (authoritative) break;
  }
  if (!metadata) {
    metadata = {
      version: "unknown",
      configSchemaVersion: 1,
      composeSchemaVersion: 1,
      schemaEpoch: 1,
      sourceRevision: null,
      images: null,
    };
  }
  for (const [path, assign] of [
    [
      resolve(instanceDirectory, "docker/selfhost/compose-contract.json"),
      (payload) => {
        if (Number.isInteger(payload.composeSchemaVersion)) {
          metadata.composeSchemaVersion = payload.composeSchemaVersion;
        }
      },
    ],
    [
      resolve(instanceDirectory, "docker/selfhost/release-policy.json"),
      (payload) => {
        if (Number.isInteger(payload.database?.schemaEpoch)) {
          metadata.schemaEpoch = payload.database.schemaEpoch;
        }
      },
    ],
  ]) {
    const stat = await lstatOrNull(path);
    if (
      !stat?.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > MAX_CONFIG_BYTES
    ) {
      continue;
    }
    try {
      const { contents } = await readRegularFileBounded(path, {
        maximumBytes: MAX_CONFIG_BYTES,
        expectedSizeBytes: stat.size,
        label: "release contract metadata",
      });
      assign(JSON.parse(contents.toString("utf8")));
    } catch {
      // Command-specific release validation reports malformed bundle metadata.
    }
  }
  return metadata;
}

async function readReleaseVersion(instanceDirectory) {
  return (await readReleaseMetadata(instanceDirectory)).version;
}

async function readConfig(instanceDirectory, options = {}) {
  const configPath = resolve(instanceDirectory, ".env.selfhost");
  const stat = await requireRegularFile(
    configPath,
    "SELF_HOST_NOT_INITIALIZED",
  );
  if (stat.size > MAX_CONFIG_BYTES) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_TOO_LARGE",
      ".env.selfhost exceeds 1 MiB",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  let text;
  let readStat;
  try {
    const read = await readRegularFileBounded(configPath, {
      maximumBytes: MAX_CONFIG_BYTES,
      expectedSizeBytes: stat.size,
      label: "self-host configuration",
    });
    text = read.contents.toString("utf8");
    readStat = read.stat;
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_INVALID",
      ".env.selfhost changed or became unreadable during validation",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  const access = await inspectPrivatePath(configPath, { kind: "file" });
  let parsedValues = parseEnvironmentFile(text);
  let generatedIntegrationSecret = false;
  if (
    options.generateMissingIntegrationSecret &&
    !parsedValues.has("SELF_HOST_INTEGRATION_SECRET")
  ) {
    const integrationSecret = options
      .generateMissingIntegrationSecret()
      .toString("hex");
    text = `${text.trimEnd()}\nSELF_HOST_INTEGRATION_SECRET=${integrationSecret}\n`;
    generatedIntegrationSecret = true;
    parsedValues = parseEnvironmentFile(text);
  }
  const generatedSettings = [];
  const missingSettings =
    options.generateMissingSettings?.(new Map(parsedValues)) ?? {};
  for (const [name, value] of Object.entries(missingSettings)) {
    if (parsedValues.has(name)) continue;
    if (
      !SELF_HOST_INSTANCE_CONFIG_KEY_SET.has(name) ||
      typeof value !== "string" ||
      !value.trim() ||
      /[\r\n\0]/.test(value)
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_INVALID",
        `cannot generate invalid self-host setting ${name}`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    text = `${text.trimEnd()}\n${name}=${value}\n`;
    generatedSettings.push(name);
    parsedValues.set(name, value);
  }
  const values = validateSelfHostEnvironment(parsedValues);
  await validateDataRootBoundary(instanceDirectory, values);
  const site = validateOrigin(
    values.get("SELF_HOST_SITE_ADDRESS"),
    "SELF_HOST_SITE_ADDRESS",
  );
  const secrets = [...values.entries()]
    .filter(([name, value]) => isSensitiveConfigKey(name) && value.length >= 6)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
  return {
    configPath,
    text,
    values,
    secrets,
    mode: readStat.mode & 0o777,
    permissionsSecure: access.secure,
    permissionMechanism: access.mechanism,
    warnings: validateSelfHostNetworkPolicy(values, site),
    generatedIntegrationSecret,
    generatedSettings,
  };
}

function requireMatchingReleaseVersion(context, values) {
  if (
    !SEMVER_PATTERN.test(context.releaseVersion) ||
    values.get("SELF_HOST_VERSION") !== context.releaseVersion
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_RELEASE_STATE_INVALID",
      "Configured release version must match the installed release metadata",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
}

async function requireBundleArtifacts(instanceDirectory, source = false) {
  await requireRegularFile(
    resolve(instanceDirectory, "compose.yml"),
    "SELF_HOST_BUNDLE_INCOMPLETE",
  );
  if (source) {
    await requireRegularFile(
      resolve(instanceDirectory, "compose.build.yml"),
      "SELF_HOST_SOURCE_BUNDLE_INCOMPLETE",
    );
  }
}

function redactWithSecrets(text, secretValues = []) {
  let output = String(text ?? "");
  for (const secret of secretValues) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  output = output
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:password|passcode|secret|token|authorization|cookie|credential|api[-_]?key)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:password|secret|token|signature|key)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[REDACTED]@");
  return output;
}

function commandFailure(code, result, secrets) {
  const detail = redactWithSecrets(
    result.error?.message || result.stderr || result.stdout || "command failed",
    secrets,
  )
    .trim()
    .slice(0, 2000);
  return new SelfHostManagementError(
    code,
    detail || code,
    code.endsWith("_UNAVAILABLE")
      ? SELF_HOST_CLI_EXIT.PREREQUISITE
      : code === "SELF_HOST_RESTORE_TARGET_NOT_EMPTY"
        ? SELF_HOST_CLI_EXIT.STATE_CONFLICT
        : code === "SELF_HOST_COMPOSE_CONFIG_INVALID"
          ? SELF_HOST_CLI_EXIT.CONFIG
          : SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    { cause: result.error },
  );
}

function requireCommandSuccess(code, result, secrets) {
  if (result.error || result.status !== 0) {
    throw commandFailure(code, result, secrets);
  }
  return result;
}

function composeArguments(instanceDirectory, source, values, composeInput) {
  if (
    !composeInput?.environmentPath ||
    !composeInput?.composePath ||
    (source && !composeInput.buildPath)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "the validated Compose input snapshot is unavailable",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  const args = [
    "compose",
    "--project-name",
    values.get("SELF_HOST_PROJECT_NAME"),
    "--project-directory",
    instanceDirectory,
    "--env-file",
    composeInput.environmentPath,
    "-f",
    composeInput.composePath,
  ];
  if (source) {
    args.push("-f", composeInput.buildPath);
  }
  return args;
}

async function readComposeDefinitions(context) {
  if (context.composeDefinitions) return context.composeDefinitions;
  const definitions = [];
  for (const name of [
    "compose.yml",
    ...(context.source ? ["compose.build.yml"] : []),
  ]) {
    const path = resolve(context.instanceDirectory, name);
    const stat = await requireRegularFile(path, "SELF_HOST_BUNDLE_INCOMPLETE");
    if (stat.size > MAX_CONFIG_BYTES) {
      throw new SelfHostManagementError(
        "SELF_HOST_BUNDLE_INCOMPLETE",
        `${name} exceeds 1 MiB`,
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    try {
      const { contents } = await readRegularFileBounded(path, {
        maximumBytes: MAX_CONFIG_BYTES,
        expectedSizeBytes: stat.size,
        label: `${name} Compose definition`,
      });
      requireAuthenticatedBundleContents(context, name, contents);
      definitions.push({ name, text: contents.toString("utf8") });
    } catch (error) {
      if (error instanceof SelfHostManagementError) throw error;
      throw new SelfHostManagementError(
        "SELF_HOST_BUNDLE_INCOMPLETE",
        `${name} changed or became unreadable during validation`,
        SELF_HOST_CLI_EXIT.CONFIG,
        { cause: error },
      );
    }
  }
  context.composeDefinitions = definitions;
  return definitions;
}

function composeInputSnapshotError(code, message, cause = undefined) {
  return new SelfHostManagementError(
    code,
    message,
    SELF_HOST_CLI_EXIT.FILESYSTEM,
    { cause },
  );
}

function composeInputDigest(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function authenticatedBundleChecksum(context, relativePath) {
  const authenticated = context.authenticatedBundle;
  if (!authenticated) return null;
  const expected = authenticated.checksums.get(relativePath);
  if (!SHA256_PATTERN.test(expected ?? "")) {
    throw new SelfHostManagementError(
      "SELF_HOST_RELEASE_STATE_INVALID",
      `the authenticated release inventory does not cover ${relativePath}`,
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  return expected;
}

function requireAuthenticatedBundleContents(context, relativePath, contents) {
  const expected = authenticatedBundleChecksum(context, relativePath);
  if (
    expected !== null &&
    createHash("sha256").update(contents).digest("hex") !== expected
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_RELEASE_STATE_INVALID",
      `${relativePath} changed after release authentication`,
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
}

function composeInputSnapshotLocation(context) {
  if (!UUID_PATTERN.test(context.operationId)) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "the Compose input snapshot identity is invalid",
    );
  }
  const parent = resolve(context.instanceDirectory, ".selfhost");
  const directory = resolve(parent, `.compose-input-${context.operationId}`);
  if (dirname(directory) !== parent) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "the Compose input snapshot escaped the private state directory",
    );
  }
  return { parent, directory };
}

async function ensureComposeInputSnapshot(
  context,
  configText,
  definitions,
) {
  const { parent, directory } = composeInputSnapshotLocation(context);
  const requested = [
    { role: "environment", name: "instance.env", text: configText },
    ...definitions.map(({ name, text }) => ({
      role: name === "compose.yml" ? "compose" : "build",
      name,
      text,
    })),
  ];
  if (context.composeInputSnapshot) {
    const existing = context.composeInputSnapshot;
    const matches =
      existing.files.length === requested.length &&
      requested.every(({ role, name, text }) => {
        const file = existing.files.find((entry) => entry.role === role);
        return (
          file?.name === name && file.currentSha256 === composeInputDigest(text)
        );
      });
    if (!matches) {
      throw composeInputSnapshotError(
        "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
        "Compose inputs changed during one management operation",
      );
    }
    return existing;
  }

  const snapshot = {
    parent,
    directory,
    owned: false,
    files: requested.map(({ role, name, text }) => {
      const sha256 = composeInputDigest(text);
      return {
        role,
        name,
        path: resolve(directory, name),
        text,
        currentSha256: sha256,
        allowedSha256: new Set([sha256]),
      };
    }),
  };
  context.composeInputSnapshot = snapshot;
  try {
    await ensurePrivateDirectory(parent);
    await fs.mkdir(directory, { mode: 0o700 });
    snapshot.owned = true;
    await hardenPrivatePath(directory, { kind: "directory", mode: 0o700 });
    for (const file of snapshot.files) {
      await atomicWrite(file.path, file.text, 0o600);
    }
  } catch (error) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "could not create the private validated Compose input snapshot",
      error,
    );
  }
  return snapshot;
}

function composeInputPaths(snapshot) {
  return {
    environmentPath: snapshot.files.find((file) => file.role === "environment")
      ?.path,
    composePath: snapshot.files.find((file) => file.role === "compose")?.path,
    buildPath: snapshot.files.find((file) => file.role === "build")?.path,
  };
}

async function prepareComposeInvocation(context, config) {
  const definitions = await readComposeDefinitions(context);
  context.env = isolateComposeEnvironment(context.env, [
    config.text,
    ...definitions.map(({ text }) => text),
  ]);
  const snapshot = await ensureComposeInputSnapshot(
    context,
    config.text,
    definitions,
  );
  return composeInputPaths(snapshot);
}

async function replaceComposeEnvironmentSnapshot(context, text) {
  const snapshot = context.composeInputSnapshot;
  const environment = snapshot?.files.find(
    (file) => file.role === "environment",
  );
  if (!snapshot?.owned || !environment) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "the validated Compose environment snapshot is unavailable",
    );
  }
  const sha256 = composeInputDigest(text);
  environment.allowedSha256.add(sha256);
  try {
    await atomicReplace(environment.path, text, 0o600);
    environment.currentSha256 = sha256;
    environment.text = text;
  } catch (error) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_FAILED",
      "could not update the validated Compose environment snapshot",
      error,
    );
  }
}

async function removeComposeInputSnapshot(context) {
  const snapshot = context.composeInputSnapshot;
  if (!snapshot?.owned) return;
  let cleanupError = null;
  for (const file of snapshot.files) {
    try {
      const stat = await lstatOrNull(file.path);
      if (!stat) continue;
      const { contents } = await readRegularFileBounded(file.path, {
        maximumBytes: MAX_CONFIG_BYTES,
        expectedSizeBytes: stat.size,
        label: "Compose input snapshot",
      });
      const sha256 = createHash("sha256").update(contents).digest("hex");
      if (!file.allowedSha256.has(sha256)) {
        throw new Error("Compose input snapshot content changed");
      }
      await fs.unlink(file.path);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  try {
    const stat = await lstatOrNull(snapshot.directory);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("Compose input snapshot directory became unsafe");
      }
      const remaining = await fs.readdir(snapshot.directory);
      if (remaining.length) {
        throw new Error("Compose input snapshot directory is not empty");
      }
      await fs.rmdir(snapshot.directory);
      await syncDirectory(snapshot.parent);
    }
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) {
    throw composeInputSnapshotError(
      "SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED",
      "could not safely remove the private Compose input snapshot",
      cleanupError,
    );
  }
  context.composeInputSnapshot = null;
}

function runDocker(context, args, code, options = {}) {
  const result = context.runner("docker", args, {
    cwd: context.instanceDirectory,
    env: options.env ?? context.env,
    timeoutMs: options.timeoutMs,
    maxBuffer: options.maxBuffer,
  });
  return requireCommandSuccess(code, result, context.secrets);
}

async function runDockerStream(context, args, code, options = {}) {
  const result = await context.streamRunner("docker", args, {
    cwd: context.instanceDirectory,
    env: options.env ?? context.env,
    timeoutMs: options.timeoutMs,
    maxBuffer: options.maxBuffer,
    inputPath: options.inputPath,
    inheritStdin: options.inheritStdin,
    outputPath: options.outputPath,
  });
  return requireCommandSuccess(code, result, context.secrets);
}

function databaseCommandEnvironment(context, config) {
  return {
    ...context.env,
    PGPASSWORD: config.values.get("SELF_HOST_DATABASE_PASSWORD"),
  };
}

function psqlArguments(composeArgs, config, sql) {
  return [
    ...composeArgs,
    "exec",
    "-T",
    "--env",
    "PGPASSWORD",
    "postgres",
    "psql",
    "--username",
    config.values.get("SELF_HOST_DATABASE_USER") || "trainingload",
    "--dbname",
    config.values.get("SELF_HOST_DATABASE_NAME") || "trainingload",
    "--tuples-only",
    "--no-align",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    sql,
  ];
}

function queryDatabase(context, composeArgs, config, sql, code) {
  return runDocker(context, psqlArguments(composeArgs, config, sql), code, {
    env: databaseCommandEnvironment(context, config),
  }).stdout.trim();
}

function readDatabaseInventory(context, composeArgs, config) {
  const size = Number(
    queryDatabase(
      context,
      composeArgs,
      config,
      "SELECT pg_database_size(current_database())::text;",
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED",
    ),
  );
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_INVALID",
      "PostgreSQL returned an invalid database size",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  const hasCoreMigrationLedger =
    queryDatabase(
      context,
      composeArgs,
      config,
      `SELECT (to_regclass('public."_trainingload_core_migrations"') IS NOT NULL)::text;`,
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED",
    ) === "true";
  const migrationPayload = queryDatabase(
    context,
    composeArgs,
    config,
    hasCoreMigrationLedger
      ? `SELECT COALESCE(
           json_agg(
             json_build_object('id', id, 'checksum', sha256)
             ORDER BY id
           ),
           '[]'::json
         )::text
         FROM "_trainingload_core_migrations";`
      : `SELECT COALESCE(
           json_agg(
             json_build_object('id', migration_name, 'checksum', checksum)
             ORDER BY migration_name
           ),
           '[]'::json
         )::text
         FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`,
    "SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED",
  );
  let migrations;
  try {
    migrations = JSON.parse(migrationPayload);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_MIGRATION_STATE_INVALID",
      "PostgreSQL returned an unreadable migration inventory",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
  if (
    !Array.isArray(migrations) ||
    migrations.some(
      (migration) =>
        typeof migration?.id !== "string" ||
        typeof migration?.checksum !== "string",
    )
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_MIGRATION_STATE_INVALID",
      "PostgreSQL returned an invalid migration inventory",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  const countsPayload = queryDatabase(
    context,
    composeArgs,
    config,
    `SELECT json_build_object(
       'selfHostInstance', (SELECT COUNT(*)::int FROM "t_self_host_instance"),
       'ownerReady', EXISTS(
         SELECT 1
         FROM "t_self_host_instance"
         WHERE "state" = 'READY' AND "owner_user_id" IS NOT NULL
       ),
       'user', (SELECT COUNT(*)::int FROM "t_user"),
       'activity', (SELECT COUNT(*)::int FROM "t_activity")
     )::text;`,
    "SELF_HOST_BACKUP_DATABASE_INSPECTION_FAILED",
  );
  let recordCounts;
  try {
    recordCounts = JSON.parse(countsPayload);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_INVALID",
      "PostgreSQL returned unreadable core record counts",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
  if (
    !["selfHostInstance", "user", "activity"].every(
      (name) =>
        Number.isSafeInteger(recordCounts?.[name]) && recordCounts[name] >= 0,
    ) ||
    typeof recordCounts?.ownerReady !== "boolean"
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_DATABASE_INSPECTION_INVALID",
      "PostgreSQL returned invalid core record counts",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  return {
    sizeBytes: size,
    migrations,
    ownerReady: recordCounts.ownerReady,
    recordCounts: {
      selfHostInstance: recordCounts.selfHostInstance,
      user: recordCounts.user,
      activity: recordCounts.activity,
    },
  };
}

function ensureDocker(context) {
  ensureSupportedHost(context);
  const dockerVersion = runDocker(
    context,
    ["version", "--format", "{{.Server.Version}}"],
    "SELF_HOST_DOCKER_UNAVAILABLE",
    { maxBuffer: 1024 },
  ).stdout.trim();
  if (!validRuntimeVersion(dockerVersion)) {
    throw new SelfHostManagementError(
      "SELF_HOST_DOCKER_INFO_FAILED",
      "Docker Engine returned an invalid server version",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }

  const dockerInfo = runDocker(
    context,
    ["info", "--format", "{{json .}}"],
    "SELF_HOST_DOCKER_INFO_FAILED",
    { maxBuffer: 64 * 1024 },
  );
  const platform = parseDockerPlatform(dockerInfo.stdout.trim());
  if (!platform) {
    throw new SelfHostManagementError(
      "SELF_HOST_DOCKER_INFO_FAILED",
      "Docker daemon returned invalid platform information",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  if (!isSupportedDockerPlatform(platform)) {
    throw new SelfHostManagementError(
      "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED",
      "Docker daemon must run Linux containers on amd64 or arm64",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    );
  }

  const composeVersion = runDocker(
    context,
    ["compose", "version", "--short"],
    "SELF_HOST_COMPOSE_UNAVAILABLE",
    { maxBuffer: 1024 },
  ).stdout.trim();
  if (!isSupportedComposeVersion(composeVersion)) {
    throw new SelfHostManagementError(
      "SELF_HOST_COMPOSE_UNAVAILABLE",
      "Docker Compose returned an invalid version",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    );
  }
  return {
    docker: dockerVersion,
    compose: composeVersion,
  };
}

function readComposeRows(context, composeArgs) {
  const result = runDocker(
    context,
    [...composeArgs, "ps", "--all", "--format", "json"],
    "SELF_HOST_STATUS_FAILED",
  );
  try {
    const rows = parseComposePs(result.stdout);
    const identified = rows.find((row) => row.ID || row.Id);
    if (identified) {
      const containerId = String(identified.ID ?? identified.Id);
      const ownership = runDocker(
        context,
        [
          "inspect",
          "--format",
          '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}',
          containerId,
        ],
        "SELF_HOST_STATUS_FAILED",
        { maxBuffer: 4096 },
      ).stdout.trim();
      if (!ownership || resolve(ownership) !== context.instanceDirectory) {
        throw new SelfHostManagementError(
          "SELF_HOST_PROJECT_NAME_CONFLICT",
          "the configured Compose project name belongs to another instance directory",
          SELF_HOST_CLI_EXIT.STATE_CONFLICT,
        );
      }
    }
    return rows;
  } catch (error) {
    if (error instanceof SelfHostManagementError) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_STATUS_INVALID",
      "Docker Compose returned an unreadable status payload",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
}

function httpEndpointDetails(rows, config) {
  if (!config?.values) return null;
  const bind = normalizeBindAddress(config.values.get("SELF_HOST_HTTP_BIND"));
  const port = integerSetting(config.values, "SELF_HOST_HTTP_PORT", {
    defaultValue: "43210",
    minimum: 1,
    maximum: 65_535,
  });
  const client = rows.find((row) => row.Service === "client");
  const publishers = Array.isArray(client?.Publishers) ? client.Publishers : [];
  const matching = publishers.some((publisher) => {
    const targetPort = Number(publisher.TargetPort);
    const publishedPort = Number(publisher.PublishedPort);
    const protocol = String(publisher.Protocol ?? "tcp").toLowerCase();
    const publishedBind = normalizeBindAddress(publisher.URL ?? bind);
    return (
      targetPort === 3002 &&
      publishedPort === port &&
      protocol === "tcp" &&
      publishedBind === bind
    );
  });
  return { bind, port, published: matching };
}

function statusDetails(rows, versions, config = null) {
  const requiredOptionalServices = [];
  const state = evaluateComposeState(rows, requiredOptionalServices);
  const endpoint = httpEndpointDetails(rows, config);
  if (
    rows.length > 0 &&
    rows.some((row) => row.Service === "client" && row.State === "running") &&
    endpoint &&
    !endpoint.published
  ) {
    state.waiting.push("client:http-port-unpublished");
  }
  const ready =
    rows.length > 0 && !state.failures.length && !state.waiting.length;
  return {
    state: rows.length === 0 ? "not_started" : ready ? "ready" : "degraded",
    ready,
    failures: state.failures,
    waiting: state.waiting,
    services: composeServiceSnapshots(rows),
    httpEndpoint: endpoint,
    engine: versions,
  };
}

async function probeTcpPort(bind, port, createServer = createNetServer) {
  const server = createServer();
  return await new Promise((resolvePromise, reject) => {
    const finish = (available, error = null) => {
      server.removeAllListeners();
      if (!server.listening) {
        if (error) reject(error);
        else resolvePromise(available);
        return;
      }
      server.close((closeError) => {
        if (error) reject(error);
        else if (closeError) reject(closeError);
        else resolvePromise(available);
      });
    };
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") finish(false);
      else finish(false, error);
    });
    server.once("listening", () => finish(true));
    server.listen({ host: bind, port, exclusive: true });
  });
}

async function initialize(context) {
  await requireBundleArtifacts(context.instanceDirectory, false);
  if (context.authenticatedBundle) {
    await readComposeDefinitions(context);
  }
  const templatePath = resolve(
    context.instanceDirectory,
    ".env.example",
  );
  const templateStat = await requireRegularFile(
    templatePath,
    "SELF_HOST_BUNDLE_INCOMPLETE",
  );
  if (templateStat.size > MAX_CONFIG_BYTES) {
    throw new SelfHostManagementError(
      "SELF_HOST_BUNDLE_INCOMPLETE",
      ".env.example exceeds 1 MiB",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  let template;
  try {
    const { contents } = await readRegularFileBounded(templatePath, {
      maximumBytes: MAX_CONFIG_BYTES,
      expectedSizeBytes: templateStat.size,
      label: "self-host configuration template",
    });
    requireAuthenticatedBundleContents(
      context,
      ".env.example",
      contents,
    );
    template = contents.toString("utf8");
  } catch (error) {
    if (error instanceof SelfHostManagementError) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_BUNDLE_INCOMPLETE",
      ".env.example changed or became unreadable during validation",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  const templateValues = parseEnvironmentFile(template);
  const templateMigrateImage = templateValues.get("SELF_HOST_MIGRATE_IMAGE");
  if (!templateMigrateImage?.trim()) {
    throw new SelfHostManagementError(
      "SELF_HOST_BUNDLE_INCOMPLETE",
      ".env.example must declare SELF_HOST_MIGRATE_IMAGE",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const configPath = resolve(context.instanceDirectory, ".env.selfhost");
  const existingStat = await lstatOrNull(configPath);
  let values;
  let generatedConfig = null;
  let migratedConfig = null;
  let configNeedsHardening = false;
  const actions = [];

  if (existingStat) {
    if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
      throw new SelfHostManagementError(
        "SELF_HOST_CONFIG_PATH_UNSAFE",
        ".env.selfhost must be a regular file, not a symlink",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    const existing = await readConfig(context.instanceDirectory, {
      generateMissingIntegrationSecret: () => context.randomBytes(32),
      generateMissingSettings: (existingValues) =>
        existingValues.has("SELF_HOST_MIGRATE_IMAGE")
          ? {}
          : { SELF_HOST_MIGRATE_IMAGE: templateMigrateImage },
    });
    values = existing.values;
    context.secrets = existing.secrets;
    if (existing.generatedIntegrationSecret) {
      migratedConfig = existing.text;
      actions.push(
        action(
          "GENERATE_INTEGRATION_SECRET",
          context.dryRun ? "planned" : "completed",
          "Generate the missing instance-local integration encryption secret",
        ),
      );
    }
    if (existing.generatedSettings.includes("SELF_HOST_MIGRATE_IMAGE")) {
      migratedConfig = existing.text;
      actions.push(
        action(
          "ADD_MIGRATE_IMAGE",
          context.dryRun ? "planned" : "completed",
          "Add the release-owned database migration image to legacy configuration",
        ),
      );
    }
    if (!existing.permissionsSecure) {
      configNeedsHardening = true;
      actions.push(
        action(
          "HARDEN_CONFIG_PERMISSIONS",
          context.dryRun ? "planned" : "completed",
          "Restrict .env.selfhost to the current user",
        ),
      );
    } else if (
      !existing.generatedIntegrationSecret &&
      existing.generatedSettings.length === 0
    ) {
      actions.push(
        action(
          "KEEP_EXISTING_CONFIG",
          "skipped",
          "Keep the valid existing .env.selfhost without rotating secrets",
        ),
      );
    }
  } else {
    generatedConfig = template
      .replace(
        /^SELF_HOST_PROJECT_NAME=.*$/m,
        `SELF_HOST_PROJECT_NAME=${instanceProjectName(context.instanceDirectory)}`,
      )
      .replace(
        /^SELF_HOST_AUTH_SECRET=.*$/m,
        `SELF_HOST_AUTH_SECRET=${context.randomBytes(32).toString("hex")}`,
      )
      .replace(
        /^SELF_HOST_DATABASE_PASSWORD=.*$/m,
        `SELF_HOST_DATABASE_PASSWORD=${context.randomBytes(32).toString("hex")}`,
      )
      .replace(
        /^SELF_HOST_INTEGRATION_SECRET=.*$/m,
        `SELF_HOST_INTEGRATION_SECRET=${context.randomBytes(32).toString("hex")}`,
      );
    values = validateSelfHostEnvironment(parseEnvironmentFile(generatedConfig));
    context.secrets = [...values.entries()]
      .filter(
        ([name, value]) => isSensitiveConfigKey(name) && value.length >= 6,
      )
      .map(([, value]) => value);
    actions.push(
      action(
        "CREATE_CONFIG",
        context.dryRun ? "planned" : "completed",
        "Create .env.selfhost with generated local secrets",
      ),
    );
  }

  requireMatchingReleaseVersion(context, values);

  const dataRoot = await validateDataRootBoundary(
    context.instanceDirectory,
    values,
  );
  const dataRootState = await inspectDataRoot(dataRoot);
  const markerMissing = !dataRootState.markerStat;
  actions.push(
    action(
      "DECLARE_DATA_ROOT",
      markerMissing ? (context.dryRun ? "planned" : "completed") : "skipped",
      "Declare the configured directory as dedicated self-host data",
    ),
  );
  if (
    dataRootState.permissionsNeedHardening ||
    dataRootState.markerPermissionsNeedHardening
  ) {
    actions.push(
      action(
        "HARDEN_DATA_ROOT_PERMISSIONS",
        context.dryRun ? "planned" : "completed",
        "Restrict the dedicated self-host data root to the current user",
      ),
    );
  }
  let directoriesChanged = false;
  for (const directory of dataDirectories(dataRoot)) {
    const stat = await lstatOrNull(directory);
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new SelfHostManagementError(
        "SELF_HOST_DATA_PATH_UNSAFE",
        `declared data path is not a real directory: ${directory}`,
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    if (!stat) directoriesChanged = true;
  }
  actions.push(
    action(
      "CREATE_DATA_DIRECTORIES",
      directoriesChanged
        ? context.dryRun
          ? "planned"
          : "completed"
        : "skipped",
      "Ensure every declared persistent data directory exists",
    ),
  );
  if (!context.dryRun) {
    if (generatedConfig) {
      try {
        await context.atomicWrite(configPath, generatedConfig, 0o600);
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new SelfHostManagementError(
            "SELF_HOST_INIT_CONFLICT",
            "another initializer created .env.selfhost concurrently; rerun init to validate the winning configuration",
            SELF_HOST_CLI_EXIT.STATE_CONFLICT,
          );
        }
        throw error;
      }
    } else if (migratedConfig) {
      await atomicReplace(configPath, migratedConfig, 0o600);
    } else if (configNeedsHardening) {
      await hardenPrivatePath(configPath, { kind: "file" });
    }
    await ensurePrivateDirectory(dataRoot);
    if (markerMissing) {
      await context.atomicWrite(
        dataRootState.markerPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            purpose: "trainingload-selfhost-data-root",
          },
          null,
          2,
        )}\n`,
        0o600,
      );
    } else if (dataRootState.markerPermissionsNeedHardening) {
      await hardenPrivatePath(dataRootState.markerPath, { kind: "file" });
    }
    for (const directory of dataDirectories(dataRoot)) {
      await ensurePrivateDirectory(directory);
    }
  }

  const changed =
    Boolean(generatedConfig) ||
    Boolean(migratedConfig) ||
    markerMissing ||
    dataRootState.permissionsNeedHardening ||
    dataRootState.markerPermissionsNeedHardening ||
    directoriesChanged ||
    actions.some((item) => item.code === "HARDEN_CONFIG_PERMISSIONS");
  return {
    status: changed ? (context.dryRun ? "planned" : "completed") : "unchanged",
    summary: changed
      ? context.dryRun
        ? "Initialization changes are planned; no instance state was changed"
        : "Self-host configuration and persistent directories are initialized"
      : "Self-host initialization is already complete",
    actions,
    details: {
      initialized: !context.dryRun || !changed,
      configPresent: existingStat !== null || !context.dryRun,
      mode: values.get("SELF_HOST_MODE"),
      configurationWarnings: validateSelfHostNetworkPolicy(
        values,
        validateOrigin(
          values.get("SELF_HOST_SITE_ADDRESS"),
          "SELF_HOST_SITE_ADDRESS",
        ),
      ),
    },
  };
}

async function composeContext(context) {
  await requireBundleArtifacts(context.instanceDirectory, context.source);
  const config = await readConfig(context.instanceDirectory, {
    generateMissingSettings: context.source
      ? (values) => {
          if (
            !values.get("SELF_HOST_PROJECT_NAME")?.trim() ||
            !values.get("SELF_HOST_VERSION")?.trim()
          ) {
            return {};
          }
          const settings = sourceBuildImageSettings(values);
          return Object.fromEntries(
            Object.entries(settings).filter(
              ([name]) => !values.get(name)?.trim(),
            ),
          );
        }
      : undefined,
  });
  context.secrets = config.secrets;
  if (!config.permissionsSecure) {
    throw new SelfHostManagementError(
      "SELF_HOST_CONFIG_PERMISSIONS_INSECURE",
      ".env.selfhost must not be readable or writable by group or other users; run self-host init to repair it",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  // Rollback is the sole repair path when a failed upgrade or rollback has
  // intentionally switched configuration before committing release state.
  if (context.command !== "rollback") {
    requireMatchingReleaseVersion(context, config.values);
  }
  const composeInput = await prepareComposeInvocation(context, config);
  const versions = ensureDocker(context);
  const composeArgs = composeArguments(
    context.instanceDirectory,
    context.source,
    config.values,
    composeInput,
  );
  runDocker(
    context,
    [...composeArgs, "config", "--quiet"],
    "SELF_HOST_COMPOSE_CONFIG_INVALID",
  );
  return { config, versions, composeArgs };
}

async function start(context) {
  await assertNoIncompleteLifecycle(context);
  const { config, versions, composeArgs } = await composeContext(context);
  const sourceImageSettings = context.source
    ? sourceBuildImageSettings(config.values)
    : null;
  const pinSourceImages =
    sourceImageSettings !== null &&
    (config.generatedSettings.length > 0 ||
      sourceBuildImagesNeedPinning(config.values, sourceImageSettings));
  const before = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  // `start --source` is an explicit rebuild request. A ready stack may still
  // reference containers created from the previous image behind the same
  // project-scoped tag, so it must not take the normal idempotent fast path.
  if (before.ready && !pinSourceImages && !context.source) {
    return {
      status: "unchanged",
      summary: "Self-host services are already ready",
      actions: [
        action(
          "START_SERVICES",
          "skipped",
          "Keep the ready Compose stack running",
        ),
      ],
      details: { ...before, configurationWarnings: config.warnings },
    };
  }
  const runningClientOwnsEndpoint =
    before.httpEndpoint?.published &&
    before.services.some(
      (service) => service.name === "client" && service.state === "running",
    );
  if (!runningClientOwnsEndpoint) {
    let available;
    try {
      available = await context.portAvailable(
        before.httpEndpoint.bind,
        before.httpEndpoint.port,
      );
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_HTTP_PORT_CHECK_FAILED",
        `could not verify ${before.httpEndpoint.bind}:${before.httpEndpoint.port} before startup`,
        SELF_HOST_CLI_EXIT.COMMAND_FAILED,
        { cause: error },
      );
    }
    if (!available) {
      throw new SelfHostManagementError(
        "SELF_HOST_HTTP_PORT_IN_USE",
        `${before.httpEndpoint.bind}:${before.httpEndpoint.port} is already in use; choose an unused port or stop the conflicting instance`,
        SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      );
    }
  }
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Compose startup is planned; no service state was changed",
      actions: [
        action(
          "VALIDATE_COMPOSE",
          "completed",
          "Validate the resolved Compose model",
        ),
        action(
          "PULL_IMAGES",
          context.source ? "skipped" : "planned",
          context.source
            ? "Build source images locally"
            : "Pull the release images before starting services",
        ),
        action(
          "START_SERVICES",
          "planned",
          "Start and wait for the self-host services",
        ),
        action(
          "VERIFY_READINESS",
          "planned",
          "Verify dependency-aware readiness",
        ),
        ...(pinSourceImages
          ? [
              action(
                "PIN_SOURCE_IMAGES",
                "planned",
                "Persist the project-scoped source-build image references",
              ),
            ]
          : []),
      ],
      details: { ...before, configurationWarnings: config.warnings },
    };
  }
  if (!context.source) {
    runDocker(context, [...composeArgs, "pull"], "SELF_HOST_IMAGE_PULL_FAILED", {
      timeoutMs: 60 * 60_000,
    });
  }
  const upArgs = [
    ...composeArgs,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "600",
    ...(context.source
      ? ["--build", "--force-recreate"]
      : ["--pull", "never", "--force-recreate"]),
  ];
  runDocker(context, upArgs, "SELF_HOST_START_FAILED", {
    timeoutMs: 15 * 60_000,
  });
  const after = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (!after.ready) {
    throw new SelfHostManagementError(
      "SELF_HOST_NOT_READY",
      `services did not become ready: ${[...after.failures, ...after.waiting].join(", ")}`,
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  if (pinSourceImages) {
    const pinnedConfigText = replaceEnvironmentSettings(
      config.text,
      sourceImageSettings,
    );
    const pinnedConfigValues = validateSelfHostEnvironment(
      parseEnvironmentFile(pinnedConfigText),
    );
    await validateDataRootBoundary(
      context.instanceDirectory,
      pinnedConfigValues,
    );
    await atomicReplace(config.configPath, pinnedConfigText, 0o600);
  }
  return {
    status: "completed",
    summary: "Self-host services are ready",
    actions: [
      action(
        "VALIDATE_COMPOSE",
        "completed",
        "Validate the resolved Compose model",
      ),
      action(
        "PULL_IMAGES",
        context.source ? "skipped" : "completed",
        context.source
          ? "Build source images locally"
          : "Pull the release images before starting services",
      ),
      action("START_SERVICES", "completed", "Start the self-host services"),
      action(
        "VERIFY_READINESS",
        "completed",
        "Verify dependency-aware readiness",
      ),
      ...(pinSourceImages
        ? [
            action(
              "PIN_SOURCE_IMAGES",
              "completed",
              "Persist the project-scoped source-build image references",
            ),
          ]
        : []),
    ],
    details: { ...after, configurationWarnings: config.warnings },
  };
}

async function status(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const details = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  return {
    status: "completed",
    summary:
      details.state === "ready"
        ? "Self-host services are ready"
        : details.state === "not_started"
          ? "Self-host services have not been started"
          : "Self-host services are not ready",
    actions: [
      action(
        "READ_STATUS",
        "completed",
        "Read the current Compose service state",
      ),
    ],
    details: { ...details, configurationWarnings: config.warnings },
  };
}

function doctorCheck(
  code,
  category,
  status,
  summary,
  { errorCode = null, details = {} } = {},
) {
  if (errorCode !== null && !isCatalogedSelfHostError(errorCode)) {
    throw new Error(`uncataloged self-host doctor error: ${errorCode}`);
  }
  return createDoctorCheck({
    code,
    category,
    status,
    summary,
    errorCode,
    remediation: DOCTOR_REMEDIATIONS[category],
    details,
  });
}

function commandProbe(context, command, args, options = {}) {
  const result = context.runner(command, args, {
    cwd: context.instanceDirectory,
    env: context.env,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxBuffer: options.maxBuffer,
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout?.trim() ?? "",
  };
}

function normalizeDockerArchitecture(value) {
  if (typeof value !== "string" || value.length > 32) return null;
  const architecture = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(architecture)) return null;
  if (["amd64", "x64", "x86_64"].includes(architecture)) return "amd64";
  if (["arm64", "aarch64"].includes(architecture)) return "arm64";
  return architecture || null;
}

function normalizeHostPlatform(value) {
  if (typeof value !== "string" || value.length > 32) return null;
  const platform = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(platform)) return null;
  return platform || null;
}

export function isSupportedHostPlatform(platform, architecture) {
  const normalizedPlatform = normalizeHostPlatform(platform);
  const normalizedArchitecture = normalizeDockerArchitecture(architecture);
  return (
    (normalizedPlatform === "linux" &&
      ["amd64", "arm64"].includes(normalizedArchitecture)) ||
    (normalizedPlatform === "darwin" && normalizedArchitecture === "arm64") ||
    (normalizedPlatform === "win32" && normalizedArchitecture === "amd64")
  );
}

function ensureSupportedHost(context) {
  if (
    !isSupportedHostPlatform(context.hostPlatform(), context.hostArchitecture())
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_HOST_PLATFORM_UNSUPPORTED",
      "The host must be Linux amd64/arm64, macOS Apple Silicon, or Windows amd64",
      SELF_HOST_CLI_EXIT.PREREQUISITE,
    );
  }
}

export function validRuntimeVersion(value) {
  return (
    typeof value === "string" && /^v?[0-9][0-9A-Za-z.+_~-]{0,127}$/.test(value)
  );
}

export function isSupportedComposeVersion(value) {
  if (!validRuntimeVersion(value)) return false;
  const match = value.match(/^v?([0-9]+)(?:\.|$)/);
  if (!match) return false;
  const major = Number(match[1]);
  return Number.isSafeInteger(major) && major >= 2;
}

export function parseDockerPlatform(stdout) {
  try {
    const payload = JSON.parse(stdout);
    const architecture = normalizeDockerArchitecture(payload?.Architecture);
    if (typeof payload?.OSType !== "string" || payload.OSType.length > 32) {
      return null;
    }
    const osType = payload.OSType.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(osType)) return null;
    if (!architecture || !osType) return null;
    return { architecture, osType };
  } catch {
    return null;
  }
}

export function isSupportedDockerPlatform(platform) {
  return (
    platform?.osType === "linux" &&
    ["amd64", "arm64"].includes(platform.architecture)
  );
}

function isTlsFailure(error) {
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const code = typeof current.code === "string" ? current.code : "";
    if (
      TLS_ERROR_CODES.has(code) ||
      code.startsWith("ERR_TLS_") ||
      code.includes("CERT")
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

async function readBoundedResponseJson(
  response,
  maxBytes = DOCTOR_GATEWAY_RESPONSE_BYTES,
) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("response-too-large");
  }
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new Error("response-too-large");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else if (typeof response.text === "function") {
    text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("response-too-large");
    }
  } else {
    throw new Error("response-body-unavailable");
  }
  return JSON.parse(text);
}

function validGatewayReadiness(payload) {
  return (
    hasExactKeys(payload, ["status", "timestamp", "checks"]) &&
    payload.status === "ready" &&
    Number.isFinite(Date.parse(payload.timestamp ?? "")) &&
    hasExactKeys(payload.checks, ["configuration", "database"]) &&
    payload.checks.configuration === "ready" &&
    payload.checks.database === "ready"
  );
}

async function probePublicGateway(context, site) {
  const protocol = site.protocol.slice(0, -1);
  const baseDetails = {
    protocol,
    port: configuredOriginPort(site),
  };
  try {
    const response = await context.fetcher(
      new URL("/api/health/ready", site).href,
      {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const contentType = response.headers?.get?.("content-type") ?? "";
    if (
      response.status !== 200 ||
      response.redirected === true ||
      !/^application\/json(?:\s*;|$)/i.test(contentType)
    ) {
      await Promise.resolve(response.body?.cancel?.()).catch(() => undefined);
      return doctorCheck(
        "SELF_HOST_DOCTOR_GATEWAY",
        "security",
        "fail",
        "The Client endpoint did not return the exact readiness endpoint response",
        {
          errorCode: "SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID",
          details: {
            ...baseDetails,
            httpStatus: Number.isInteger(response.status)
              ? response.status
              : null,
            tlsVerified: site.protocol === "https:" ? true : null,
            reverseProxyVerified: false,
          },
        },
      );
    }
    let payload;
    try {
      payload = await readBoundedResponseJson(response);
    } catch {
      payload = null;
    }
    if (!validGatewayReadiness(payload)) {
      return doctorCheck(
        "SELF_HOST_DOCTOR_GATEWAY",
        "security",
        "fail",
        "The Client endpoint readiness payload is invalid or not ready",
        {
          errorCode: "SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID",
          details: {
            ...baseDetails,
            httpStatus: response.status,
            tlsVerified: site.protocol === "https:" ? true : null,
            reverseProxyVerified: false,
          },
        },
      );
    }
    return doctorCheck(
      "SELF_HOST_DOCTOR_GATEWAY",
      "security",
      "pass",
      site.protocol === "https:"
        ? "The Client endpoint, TLS certificate, reverse proxy, and readiness endpoint are valid"
        : "The Client endpoint, reverse proxy, and readiness endpoint are valid",
      {
        details: {
          ...baseDetails,
          httpStatus: response.status,
          tlsVerified: site.protocol === "https:" ? true : null,
          reverseProxyVerified: true,
          readiness: {
            status: payload.status,
            configuration: payload.checks.configuration,
            database: payload.checks.database,
          },
        },
      },
    );
  } catch (error) {
    const tlsFailed = site.protocol === "https:" && isTlsFailure(error);
    return doctorCheck(
      "SELF_HOST_DOCTOR_GATEWAY",
      "security",
      "fail",
      tlsFailed
        ? "The Client endpoint TLS handshake or certificate validation failed"
        : "The Client endpoint readiness endpoint is unreachable",
      {
        errorCode: tlsFailed
          ? "SELF_HOST_DOCTOR_TLS_FAILED"
          : "SELF_HOST_DOCTOR_GATEWAY_UNREACHABLE",
        details: {
          ...baseDetails,
          httpStatus: null,
          tlsVerified: site.protocol === "https:" ? false : null,
          reverseProxyVerified: false,
        },
      },
    );
  }
}

async function readDoctorJson(
  path,
  maxBytes = MAX_CONFIG_BYTES,
  byteBudget = null,
) {
  let read;
  try {
    read = await readRegularFileBounded(path, {
      maximumBytes: maxBytes,
      label: "diagnostic source",
    });
  } catch (error) {
    throw new Error("diagnostic source is not a bounded regular file", {
      cause: error,
    });
  }
  if (byteBudget) consumeByteBudget(byteBudget, read.stat.size);
  return JSON.parse(read.contents.toString("utf8"));
}

function historyScanDetails(history) {
  return {
    scannedEntries: history.scannedEntries,
    maximumEntries: history.maximumEntries,
    scannedBytes: history.scannedBytes,
    maximumBytes: history.maximumBytes,
    entryLimitExceeded: history.entryLimitExceeded,
    byteLimitExceeded: history.byteLimitExceeded,
    limitExceeded: history.limitExceeded,
  };
}

function historyScanResult({
  latest = null,
  scannedEntries,
  maximumEntries,
  byteBudget,
  entryLimitExceeded = false,
  byteLimitExceeded = false,
}) {
  return {
    latest,
    scannedEntries,
    maximumEntries,
    scannedBytes: byteBudget.consumedBytes,
    maximumBytes: byteBudget.maximumBytes,
    entryLimitExceeded,
    byteLimitExceeded,
    limitExceeded: entryLimitExceeded || byteLimitExceeded,
  };
}

async function latestBackupSummary(dataRoot, now) {
  const directory = resolve(dataRoot, "backups");
  const stat = await lstatOrNull(directory);
  const maximumEntries = SELF_HOST_HISTORY_LIMITS.maximumBackupEntries;
  const byteBudget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumBackupBytes,
  };
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return historyScanResult({
      scannedEntries: 0,
      maximumEntries,
      byteBudget,
    });
  }
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(directory, maximumEntries);
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    return historyScanResult({
      scannedEntries: maximumEntries,
      maximumEntries,
      byteBudget,
      entryLimitExceeded: true,
    });
  }
  let latest = null;
  let byteLimitExceeded = false;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const root = resolve(directory, entry.name);
    try {
      const manifest = await readDoctorJson(
        resolve(root, "backup-manifest.json"),
        MAX_CONFIG_BYTES,
        byteBudget,
      );
      const result = await readDoctorJson(
        resolve(root, "backup-result.json"),
        HISTORY_RECORD_BYTES,
        byteBudget,
      );
      if (
        manifest?.schemaVersion !== 1 ||
        manifest.kind !== "trainingload-selfhost-backup" ||
        result?.schemaVersion !== 1 ||
        result.kind !== "trainingload-selfhost-backup-result" ||
        result.status !== "completed" ||
        result.backupId !== manifest.backupId ||
        result.verified !== true ||
        !Number.isFinite(Date.parse(manifest.createdAt ?? ""))
      ) {
        continue;
      }
      const candidate = {
        backupId: manifest.backupId,
        createdAt: manifest.createdAt,
        releaseVersion: manifest.release?.version ?? "unknown",
        ageHours: Math.max(
          0,
          Math.floor(
            (now.getTime() - Date.parse(manifest.createdAt)) / (60 * 60 * 1000),
          ),
        ),
      };
      if (
        !latest ||
        Date.parse(candidate.createdAt) > Date.parse(latest.createdAt)
      ) {
        latest = candidate;
      }
    } catch (error) {
      if (error instanceof CumulativeByteLimitError) {
        byteLimitExceeded = true;
        break;
      }
      // An incomplete or foreign directory is not accepted as a backup.
    }
  }
  return historyScanResult({
    latest: byteLimitExceeded ? null : latest,
    scannedEntries: entries.length,
    maximumEntries,
    byteBudget,
    byteLimitExceeded,
  });
}

async function latestRestoreSummary(dataRoot) {
  const directory = resolve(dataRoot, "diagnostics");
  const stat = await lstatOrNull(directory);
  const maximumEntries = SELF_HOST_HISTORY_LIMITS.maximumRestoreEntries;
  const byteBudget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumRestoreBytes,
  };
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return historyScanResult({
      scannedEntries: 0,
      maximumEntries,
      byteBudget,
    });
  }
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(directory, maximumEntries);
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    return historyScanResult({
      scannedEntries: maximumEntries,
      maximumEntries,
      byteBudget,
      entryLimitExceeded: true,
    });
  }
  let latest = null;
  let byteLimitExceeded = false;
  for (const { name } of entries) {
    if (!/^restore-.*\.json$/.test(name)) continue;
    try {
      const report = await readDoctorJson(
        resolve(directory, name),
        HISTORY_RECORD_BYTES,
        byteBudget,
      );
      if (
        report?.schemaVersion !== 1 ||
        report.kind !== "trainingload-selfhost-restore-report" ||
        !["completed", "failed"].includes(report.status) ||
        !Number.isFinite(Date.parse(report.finishedAt ?? "")) ||
        typeof report.sourceReleaseVersion !== "string" ||
        typeof report.targetReleaseVersion !== "string" ||
        !(
          report.errorCode === null ||
          (typeof report.errorCode === "string" &&
            /^SELF_HOST_[A-Z0-9_]+$/.test(report.errorCode))
        )
      ) {
        continue;
      }
      const candidate = {
        status: report.status,
        finishedAt: report.finishedAt,
        sourceReleaseVersion: report.sourceReleaseVersion,
        targetReleaseVersion: report.targetReleaseVersion,
        errorCode: report.errorCode ?? null,
      };
      if (
        !latest ||
        Date.parse(candidate.finishedAt) > Date.parse(latest.finishedAt) ||
        (candidate.finishedAt === latest.finishedAt &&
          candidate.status === "failed" &&
          latest.status !== "failed")
      ) {
        latest = candidate;
      }
    } catch (error) {
      if (error instanceof CumulativeByteLimitError) {
        byteLimitExceeded = true;
        break;
      }
      // Malformed reports are ignored here and surfaced by diagnostics tests.
    }
  }
  return historyScanResult({
    latest: byteLimitExceeded ? null : latest,
    scannedEntries: entries.length,
    maximumEntries,
    byteBudget,
    byteLimitExceeded,
  });
}

async function recentFailureSummary(instanceDirectory) {
  const directory = resolve(instanceDirectory, ".selfhost/operations");
  const stat = await lstatOrNull(directory);
  const maximumEntries = SELF_HOST_HISTORY_LIMITS.maximumOperationEntries;
  const byteBudget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumOperationBytes,
  };
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return historyScanResult({
      scannedEntries: 0,
      maximumEntries,
      byteBudget,
    });
  }
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(directory, maximumEntries);
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    return historyScanResult({
      scannedEntries: maximumEntries,
      maximumEntries,
      byteBudget,
      entryLimitExceeded: true,
    });
  }
  const names = entries
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 50);
  for (const name of names) {
    try {
      const record = await readDoctorJson(
        resolve(directory, name),
        HISTORY_RECORD_BYTES,
        byteBudget,
      );
      if (
        record?.schemaVersion === 1 &&
        record.status === "failed" &&
        typeof record.command === "string" &&
        Number.isFinite(Date.parse(record.startedAt ?? "")) &&
        typeof record.errorCode === "string" &&
        /^SELF_HOST_[A-Z0-9_]+$/.test(record.errorCode) &&
        isCatalogedSelfHostError(record.errorCode) &&
        Number.isInteger(record.exitCode)
      ) {
        return historyScanResult({
          latest: {
            command: record.command,
            startedAt: record.startedAt,
            errorCode: record.errorCode,
            exitCode: record.exitCode,
          },
          scannedEntries: entries.length,
          maximumEntries,
          byteBudget,
        });
      }
    } catch (error) {
      if (error instanceof CumulativeByteLimitError) {
        return historyScanResult({
          scannedEntries: entries.length,
          maximumEntries,
          byteBudget,
          byteLimitExceeded: true,
        });
      }
      // Continue to the next bounded operation record.
    }
  }
  return historyScanResult({
    scannedEntries: entries.length,
    maximumEntries,
    byteBudget,
  });
}

async function inspectLocalDem(dataRoot, tileZoom) {
  const root = resolve(dataRoot, "elevation");
  const manifestPath = resolve(root, "source.json");
  try {
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return { ready: false, reason: "unsafe-root" };
    }
    const manifest = await readDoctorJson(
      manifestPath,
      LOCAL_DEM_MANIFEST_BYTES,
    );
    if (
      manifest?.schemaVersion !== 1 ||
      manifest.format !== "mapbox-terrain-rgb" ||
      typeof manifest.source !== "string" ||
      !manifest.source.trim() ||
      typeof manifest.attribution !== "string" ||
      !manifest.attribution.trim() ||
      typeof manifest.license !== "string" ||
      !manifest.license.trim()
    ) {
      return { ready: false, reason: "invalid-manifest" };
    }
    const zoomRoot = resolve(root, String(tileZoom));
    const zoomStat = await fs.lstat(zoomRoot);
    if (!zoomStat.isDirectory() || zoomStat.isSymbolicLink()) {
      return { ready: false, reason: "missing-zoom-directory" };
    }
    const coordinateLimit = 2 ** tileZoom;
    let scanned = 0;
    const xEntries = await fs.opendir(zoomRoot);
    for await (const xEntry of xEntries) {
      scanned += 1;
      if (scanned > LOCAL_DEM_SCAN_ENTRIES) break;
      if (!xEntry.isDirectory() || !/^\d+$/.test(xEntry.name)) continue;
      const x = Number(xEntry.name);
      if (!Number.isSafeInteger(x) || x < 0 || x >= coordinateLimit) continue;
      const xRoot = resolve(zoomRoot, xEntry.name);
      const xStat = await fs.lstat(xRoot);
      if (!xStat.isDirectory() || xStat.isSymbolicLink()) continue;
      const yEntries = await fs.opendir(xRoot);
      for await (const yEntry of yEntries) {
        scanned += 1;
        if (scanned > LOCAL_DEM_SCAN_ENTRIES) break;
        const match = yEntry.name.match(/^(\d+)\.png$/);
        if (!yEntry.isFile() || !match) continue;
        const y = Number(match[1]);
        if (!Number.isSafeInteger(y) || y < 0 || y >= coordinateLimit) {
          continue;
        }
        const tileStat = await fs.lstat(resolve(xRoot, yEntry.name));
        if (
          tileStat.isFile() &&
          !tileStat.isSymbolicLink() &&
          tileStat.size > 0 &&
          tileStat.size <= LOCAL_DEM_TILE_BYTES
        ) {
          return { ready: true, reason: null };
        }
      }
      if (scanned > LOCAL_DEM_SCAN_ENTRIES) break;
    }
    return { ready: false, reason: "missing-valid-tile-sample" };
  } catch {
    return { ready: false, reason: "missing-or-unreadable" };
  }
}

async function expectedDoctorMigrations(
  context,
  releaseVersion,
  appliedMigrations,
) {
  const manifestPath = resolve(
    context.instanceDirectory,
    "release-manifest.json",
  );
  const manifestStat = await lstatOrNull(manifestPath);
  if (manifestStat?.isFile() && !manifestStat.isSymbolicLink()) {
    try {
      const manifest = validateReleaseManifest(
        await readDoctorJson(manifestPath, 32 * 1024 * 1024),
      );
      if (manifest.releaseVersion === releaseVersion) {
        return migrationIdentities(manifest.database.migrations);
      }
    } catch {
      // Source checkouts and incomplete release directories may not carry it.
    }
  }
  const policyPath = resolve(
    context.instanceDirectory,
    "docker/selfhost/release-policy.json",
  );
  const migrationsRoot = resolve(
    context.instanceDirectory,
    "packages/prisma/core/migrations",
  );
  const [policyStat, migrationsStat] = await Promise.all([
    lstatOrNull(policyPath),
    lstatOrNull(migrationsRoot),
  ]);
  if (
    policyStat?.isFile() &&
    !policyStat.isSymbolicLink() &&
    migrationsStat?.isDirectory() &&
    !migrationsStat.isSymbolicLink()
  ) {
    try {
      const policy = await readDoctorJson(policyPath);
      if (policy.releaseVersion === releaseVersion) {
        return migrationIdentities(
          (await buildMigrationInventory(migrationsRoot, policy)).migrations,
        );
      }
    } catch {
      // A dedicated doctor check reports the inability to prove the inventory.
    }
  }
  try {
    const report = await findUpgradeReport(
      context.instanceDirectory,
      (candidate) => {
        const expected = migrationIdentities(candidate.migrations.target);
        return migrationsEqual(appliedMigrations, expected);
      },
    );
    if (report) {
      const expected = migrationIdentities(report.migrations.target);
      return expected;
    }
  } catch {
    // Upgrade state corruption is reported by the recent lifecycle checks.
  }
  return null;
}

function capabilitySummary(snapshot) {
  if (
    snapshot?.schemaVersion !== 1 ||
    snapshot.deployment !== "self-host" ||
    !SELF_HOST_MODES.has(snapshot.mode) ||
    typeof snapshot.ready !== "boolean" ||
    typeof snapshot.map !== "object" ||
    snapshot.map === null ||
    typeof snapshot.map.provider !== "string" ||
    !(
      snapshot.map.styleUrl === null ||
      typeof snapshot.map.styleUrl === "string"
    ) ||
    !(
      snapshot.map.tileUrl === null || typeof snapshot.map.tileUrl === "string"
    ) ||
    typeof snapshot.capabilities !== "object" ||
    snapshot.capabilities === null ||
    Array.isArray(snapshot.capabilities)
  ) {
    throw new Error("runtime capability response is invalid");
  }
  const capabilities = Object.values(snapshot.capabilities)
    .map((item) => {
      if (
        typeof item?.name !== "string" ||
        typeof item?.required !== "boolean" ||
        typeof item?.state !== "string" ||
        typeof item?.provider !== "string"
      ) {
        throw new Error("runtime capability entry is invalid");
      }
      return {
        name: item.name,
        required: item.required,
        state: item.state,
        provider: item.provider,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    ready: snapshot.ready,
    mode: snapshot.mode,
    deployment: snapshot.deployment,
    capabilities,
    map: {
      provider: snapshot.map.provider,
      styleUrl: snapshot.map.styleUrl,
      tileUrl: snapshot.map.tileUrl,
    },
  };
}

function readCapabilitySnapshot(context, composeArgs) {
  const script = `fetch("http://127.0.0.1:3001/api/runtime/capabilities",{signal:AbortSignal.timeout(5000)}).then(async response=>{if(!response.ok)throw new Error("HTTP "+response.status);process.stdout.write(await response.text())}).catch(error=>{console.error(error.message);process.exit(1)})`;
  const result = runDocker(
    context,
    [...composeArgs, "exec", "-T", "server", "node", "-e", script],
    "SELF_HOST_DOCTOR_CAPABILITY_FAILED",
    { timeoutMs: 15_000 },
  );
  return capabilitySummary(JSON.parse(result.stdout));
}

function mapProviderProbeUrl(map, siteAddress) {
  const raw = map?.styleUrl || map?.tileUrl;
  if (typeof raw !== "string" || !raw.trim()) return null;
  let target;
  try {
    if (/^https?:\/\//i.test(raw)) {
      target = new URL(raw);
    } else {
      const site = new URL(siteAddress);
      target = new URL(raw, site);
      if (target.origin !== site.origin) return null;
    }
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(target.protocol)) return null;
  return target.href
    .replaceAll("{z}", "0")
    .replaceAll("{x}", "0")
    .replaceAll("{y}", "0")
    .replaceAll("{s}", "a");
}

async function doctor(context) {
  const checks = [];
  let bundleReady = false;
  let config = null;
  let composeInput = null;
  let composeArgs = null;
  let rows = null;
  let currentStatus = null;

  try {
    await requireBundleArtifacts(context.instanceDirectory, false);
    await requireRegularFile(
      resolve(context.instanceDirectory, ".env.example"),
      "SELF_HOST_BUNDLE_INCOMPLETE",
    );
    const releaseMetadata = await Promise.all(
      ["release-manifest.json", "package.json"].map((name) =>
        lstatOrNull(resolve(context.instanceDirectory, name)),
      ),
    );
    if (
      !releaseMetadata.some(
        (stat) => stat?.isFile() && !stat.isSymbolicLink(),
      ) ||
      !SEMVER_PATTERN.test(context.releaseVersion)
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_BUNDLE_INCOMPLETE",
        "release metadata is missing, unsafe, or has no semantic version",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    const definitions = await readComposeDefinitions(context);
    context.env = isolateComposeEnvironment(
      context.env,
      definitions.map(({ text }) => text),
    );
    bundleReady = true;
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_RELEASE_BUNDLE",
        "release",
        "pass",
        "Required self-host release files are present",
      ),
    );
  } catch (error) {
    const known = normalizeManagementError(error);
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_RELEASE_BUNDLE",
        "release",
        "fail",
        "Required self-host release files are missing or unsafe",
        { errorCode: known.code },
      ),
    );
  }

  const cpuCount = hostCpus().length;
  const totalMemoryBytes = hostTotalMemory();
  const freeMemoryBytes = hostFreeMemory();
  const platform = context.hostPlatform();
  const architecture = context.hostArchitecture();
  const normalizedArchitecture = normalizeDockerArchitecture(architecture);
  const architectureSupported = ["amd64", "arm64"].includes(
    normalizedArchitecture,
  );
  const platformSupported = ["linux", "darwin", "win32"].includes(
    normalizeHostPlatform(platform),
  );
  const hostSupported = isSupportedHostPlatform(platform, architecture);
  const hostWarning = cpuCount < 2 || totalMemoryBytes < 2 * 1024 ** 3;
  const hostStatus = !hostSupported ? "fail" : hostWarning ? "warning" : "pass";
  checks.push(
    doctorCheck(
      "SELF_HOST_DOCTOR_HOST_RESOURCES",
      "host",
      hostStatus,
      !hostSupported
        ? "Host operating system or architecture is unsupported"
        : hostWarning
          ? "Host resources are below the recommended baseline"
          : "Host platform, CPU, and memory meet the baseline",
      {
        errorCode: hostSupported ? null : "SELF_HOST_HOST_PLATFORM_UNSUPPORTED",
        details: {
          platform,
          architecture,
          platformSupported,
          architectureSupported,
          hostSupported,
          cpuCount,
          totalMemoryBytes,
          freeMemoryBytes,
        },
      },
    ),
  );

  try {
    config = await readConfig(context.instanceDirectory);
    context.secrets = config.secrets;
    composeInput = await prepareComposeInvocation(context, config);
    const permissionsSecure = config.permissionsSecure;
    const releaseConsistent =
      config.values.get("SELF_HOST_VERSION") === context.releaseVersion;
    const configurationValid = permissionsSecure && releaseConsistent;
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_CONFIGURATION",
        "configuration",
        configurationValid ? "pass" : "fail",
        configurationValid
          ? "Self-host configuration is valid and private"
          : !permissionsSecure
            ? "Self-host configuration permissions are too broad"
            : "Configured release version differs from the installed release",
        {
          errorCode: configurationValid
            ? null
            : permissionsSecure
              ? "SELF_HOST_RELEASE_STATE_INVALID"
              : "SELF_HOST_CONFIG_PERMISSIONS_INSECURE",
          details: {
            mode: config.values.get("SELF_HOST_MODE"),
            releaseVersion: config.values.get("SELF_HOST_VERSION"),
            installedReleaseVersion: context.releaseVersion,
            projectName: config.values.get("SELF_HOST_PROJECT_NAME"),
          },
        },
      ),
    );
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_NETWORK_POLICY",
        "security",
        config.warnings.length ? "warning" : "pass",
        config.warnings.length
          ? "Network policy is valid but has explicit security warnings"
          : "Origin and bind settings satisfy the security policy",
        { details: { warnings: config.warnings } },
      ),
    );
  } catch (error) {
    const known = normalizeManagementError(error);
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_CONFIGURATION",
        "configuration",
        "fail",
        "Self-host configuration is missing or invalid",
        { errorCode: known.code },
      ),
      doctorCheck(
        "SELF_HOST_DOCTOR_NETWORK_POLICY",
        "security",
        "skipped",
        "Network policy cannot be evaluated without valid configuration",
      ),
    );
  }

  if (config) {
    const site = new URL(config.values.get("SELF_HOST_SITE_ADDRESS"));
    if (
      site.hostname === "localhost" ||
      site.hostname.endsWith(".localhost") ||
      isIP(site.hostname)
    ) {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_DNS",
          "host",
          "skipped",
          "DNS lookup is not required for a local or literal-IP origin",
          { details: { hostnameType: isIP(site.hostname) ? "ip" : "local" } },
        ),
      );
    } else {
      try {
        const addresses = await context.lookup(site.hostname, { all: true });
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DNS",
            "host",
            addresses.length ? "pass" : "fail",
            addresses.length
              ? "Configured public hostname resolves"
              : "Configured public hostname returned no addresses",
            {
              errorCode: addresses.length
                ? null
                : "SELF_HOST_DOCTOR_DNS_FAILED",
              details: { addressCount: addresses.length },
            },
          ),
        );
      } catch {
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DNS",
            "host",
            "fail",
            "Configured public hostname does not resolve",
            { errorCode: "SELF_HOST_DOCTOR_DNS_FAILED" },
          ),
        );
      }
    }
  } else {
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_DNS",
        "host",
        "skipped",
        "DNS lookup cannot be evaluated without valid configuration",
      ),
    );
  }

  if (config) {
    checks.push(
      await probePublicGateway(
        context,
        new URL(config.values.get("SELF_HOST_SITE_ADDRESS")),
      ),
    );
  } else {
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_GATEWAY",
        "security",
        "skipped",
        "Client endpoint, TLS, and reverse proxy checks require valid configuration",
      ),
    );
  }

  const docker = commandProbe(
    context,
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    { maxBuffer: 1024 },
  );
  const dockerVersionValid = docker.ok && validRuntimeVersion(docker.stdout);
  const dockerInfo = docker.ok
    ? commandProbe(context, "docker", ["info", "--format", "{{json .}}"], {
        maxBuffer: 64 * 1024,
      })
    : { ok: false, stdout: "" };
  const dockerPlatform = dockerInfo.ok
    ? parseDockerPlatform(dockerInfo.stdout)
    : null;
  const dockerArchitectureSupported = ["amd64", "arm64"].includes(
    dockerPlatform?.architecture,
  );
  const dockerPlatformSupported = isSupportedDockerPlatform(dockerPlatform);
  const dockerRuntimeSupported = dockerVersionValid && dockerPlatformSupported;
  const normalizedHostArchitecture = normalizeDockerArchitecture(
    context.hostArchitecture(),
  );
  const dockerMatchesHost =
    normalizedHostArchitecture && dockerPlatform
      ? dockerPlatform.architecture === normalizedHostArchitecture
      : null;
  const dockerStatus =
    !docker.ok || !dockerVersionValid || !dockerInfo.ok || !dockerPlatform
      ? "fail"
      : !dockerPlatformSupported
        ? "fail"
        : dockerMatchesHost === false
          ? "warning"
          : "pass";
  const dockerErrorCode = !docker.ok
    ? "SELF_HOST_DOCKER_UNAVAILABLE"
    : !dockerVersionValid || !dockerInfo.ok || !dockerPlatform
      ? "SELF_HOST_DOCKER_INFO_FAILED"
      : !dockerPlatformSupported
        ? "SELF_HOST_DOCKER_PLATFORM_UNSUPPORTED"
        : null;
  checks.push(
    doctorCheck(
      "SELF_HOST_DOCTOR_DOCKER_ENGINE",
      "runtime",
      dockerStatus,
      dockerStatus === "pass"
        ? "Docker Engine version and daemon platform are supported"
        : dockerStatus === "warning"
          ? "Docker daemon architecture differs from the host architecture"
          : !docker.ok
            ? "Docker Engine is unavailable"
            : !dockerVersionValid || !dockerInfo.ok || !dockerPlatform
              ? "Docker daemon version or platform information is invalid"
              : "Docker daemon OS or architecture is unsupported",
      {
        errorCode: dockerErrorCode,
        details: docker.ok
          ? {
              version: dockerVersionValid ? docker.stdout : null,
              osType: dockerPlatform?.osType ?? null,
              architecture: dockerPlatform?.architecture ?? null,
              architectureSupported: dockerArchitectureSupported,
              matchesHost: dockerMatchesHost,
            }
          : {},
      },
    ),
  );
  const compose = docker.ok
    ? commandProbe(context, "docker", ["compose", "version", "--short"], {
        maxBuffer: 1024,
      })
    : { ok: false, stdout: "" };
  const composeAvailable =
    compose.ok && isSupportedComposeVersion(compose.stdout);
  checks.push(
    doctorCheck(
      "SELF_HOST_DOCTOR_COMPOSE",
      "runtime",
      composeAvailable ? "pass" : "fail",
      composeAvailable
        ? "Docker Compose v2 version is available"
        : "Docker Compose v2 is unavailable or returned an invalid version",
      {
        errorCode: composeAvailable ? null : "SELF_HOST_COMPOSE_UNAVAILABLE",
        details: composeAvailable ? { version: compose.stdout } : {},
      },
    ),
  );

  if (config) {
    const dataRoot = resolveDataRoot(context.instanceDirectory, config.values);
    try {
      const stat = await context.statfs(
        (await lstatOrNull(dataRoot)) ? dataRoot : context.instanceDirectory,
        { bigint: true },
      );
      const free = BigInt(stat.bavail) * BigInt(stat.bsize);
      const total =
        stat.blocks === undefined
          ? null
          : BigInt(stat.blocks) * BigInt(stat.bsize);
      const status =
        free < BigInt(DOCTOR_DISK_FAILURE_BYTES)
          ? "fail"
          : free < BigInt(DOCTOR_DISK_WARNING_BYTES) ||
              (total !== null && total > 0n && free * 10n < total)
            ? "warning"
            : "pass";
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_DISK",
          "storage",
          status,
          status === "fail"
            ? "Free disk space is critically low"
            : status === "warning"
              ? "Free disk space is below the recommended reserve"
              : "Disk space is sufficient",
          {
            errorCode:
              status === "fail" ? "SELF_HOST_DOCTOR_DISK_INSUFFICIENT" : null,
            details: {
              freeBytes: free.toString(),
              totalBytes: total?.toString() ?? null,
            },
          },
        ),
      );

      const freeInodes =
        typeof stat.ffree === "bigint" && stat.ffree >= 0n
          ? stat.ffree
          : Number.isSafeInteger(stat.ffree) && stat.ffree >= 0
            ? BigInt(stat.ffree)
            : null;
      const totalInodes =
        typeof stat.files === "bigint" && stat.files > 0n
          ? stat.files
          : Number.isSafeInteger(stat.files) && stat.files > 0
            ? BigInt(stat.files)
            : null;
      const zeroInodeStatistics =
        freeInodes === 0n && (stat.files === 0n || Object.is(stat.files, 0));
      if (freeInodes === null || zeroInodeStatistics) {
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_INODES",
            "storage",
            "skipped",
            "The host filesystem does not report inode availability",
            { details: { supported: false } },
          ),
        );
      } else {
        const inodeStatus =
          freeInodes < BigInt(DOCTOR_INODE_FAILURE_COUNT) ||
          (totalInodes !== null && freeInodes * 100n < totalInodes)
            ? "fail"
            : freeInodes < BigInt(DOCTOR_INODE_WARNING_COUNT) ||
                (totalInodes !== null && freeInodes * 20n < totalInodes)
              ? "warning"
              : "pass";
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_INODES",
            "storage",
            inodeStatus,
            inodeStatus === "fail"
              ? "Free inode capacity is critically low"
              : inodeStatus === "warning"
                ? "Free inode capacity is below the recommended reserve"
                : "Inode capacity is sufficient",
            {
              errorCode:
                inodeStatus === "fail"
                  ? "SELF_HOST_DOCTOR_INODES_INSUFFICIENT"
                  : null,
              details: {
                supported: true,
                freeInodes: freeInodes.toString(),
                totalInodes: totalInodes?.toString() ?? null,
              },
            },
          ),
        );
      }
    } catch {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_DISK",
          "storage",
          "fail",
          "Disk capacity cannot be inspected",
          { errorCode: "SELF_HOST_FILESYSTEM_ERROR" },
        ),
        doctorCheck(
          "SELF_HOST_DOCTOR_INODES",
          "storage",
          "skipped",
          "Inode capacity cannot be inspected until the filesystem is readable",
        ),
      );
    }

    try {
      const state = await inspectDataRoot(dataRoot);
      if (!state.rootStat) {
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DATA_ROOT",
            "storage",
            "warning",
            "Persistent data root has not been initialized",
            { details: { initialized: false } },
          ),
        );
      } else {
        await fs.access(dataRoot, constants.R_OK | constants.W_OK);
        const secure =
          !state.permissionsNeedHardening &&
          !state.markerPermissionsNeedHardening &&
          Boolean(state.markerStat);
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DATA_ROOT",
            "storage",
            secure ? "pass" : "fail",
            secure
              ? "Persistent data root is declared, private, and writable"
              : "Persistent data root marker or permissions are unsafe",
            {
              errorCode: secure ? null : "SELF_HOST_DATA_ROOT_UNSAFE",
              details: { initialized: true },
            },
          ),
        );
      }
    } catch (error) {
      const known = normalizeManagementError(error);
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_DATA_ROOT",
          "storage",
          "fail",
          "Persistent data root is unsafe or not writable",
          { errorCode: known.code },
        ),
      );
    }

    const restoreMarker = await lstatOrNull(
      restoreMarkerPath(context.instanceDirectory),
    );
    const upgradeMarker = await lstatOrNull(
      upgradeMarkerPath(context.instanceDirectory),
    );
    const markerFailure = restoreMarker || upgradeMarker;
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_LIFECYCLE",
        "recovery",
        markerFailure ? "fail" : "pass",
        markerFailure
          ? "An incomplete restore, upgrade, or rollback requires recovery"
          : "No incomplete lifecycle marker is present",
        {
          errorCode: restoreMarker
            ? "SELF_HOST_RESTORE_INCOMPLETE"
            : upgradeMarker
              ? "SELF_HOST_UPGRADE_INCOMPLETE"
              : null,
          details: {
            restoreIncomplete: Boolean(restoreMarker),
            upgradeIncomplete: Boolean(upgradeMarker),
          },
        },
      ),
    );

    const lockPath = operationLockPath(context.instanceDirectory);
    const reclaimPath = operationLockReclaimPath(context.instanceDirectory);
    const lockStat = await lstatOrNull(lockPath);
    const reclaimStat = await lstatOrNull(reclaimPath);
    if (!lockStat) {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_OPERATION_LOCK",
          "recovery",
          reclaimStat ? "fail" : "pass",
          reclaimStat
            ? "A stale-lock reclaim record exists without its operation lock"
            : "No instance mutation is currently locked",
          {
            errorCode: reclaimStat ? "SELF_HOST_OPERATION_LOCK_INVALID" : null,
            details: {
              present: false,
              reclaimPresent: Boolean(reclaimStat),
              reclaimOwnerAlive: null,
              reclaimCommand: null,
              reclaimAgeSeconds: null,
              releaseSnapshotPresent: false,
              command: null,
              ageSeconds: null,
              ownerAlive: null,
              staleEligible: false,
            },
          },
        ),
      );
    } else {
      let releaseSnapshotPresent = false;
      try {
        const lock = await readOperationLock(lockPath);
        const releasedPath = `${lockPath}.released-${lock.record.operationId}`;
        releaseSnapshotPresent = Boolean(await lstatOrNull(releasedPath));
        const releaseSnapshot = releaseSnapshotPresent
          ? await readOperationLock(releasedPath)
          : null;
        const reclaimState = reclaimStat
          ? await inspectOperationReclaim(context, lockPath, reclaimPath)
          : null;
        if (
          reclaimState &&
          (!reclaimState.matches ||
            reclaimState.futureTimestamp ||
            reclaimState.expired ||
            !reclaimState.ownerAlive)
        ) {
          throw operationLockFailure(
            "SELF_HOST_OPERATION_LOCK_INVALID",
            "the stale-lock reclaim record is mismatched, future-dated, expired, or abandoned",
          );
        }
        const ageMs = Math.max(0, context.now().getTime() - lock.startedAt);
        let ownerAlive = true;
        try {
          ownerAlive = Boolean(
            await context.processAlive(lock.record.processId),
          );
        } catch {
          ownerAlive = true;
        }
        if (
          releaseSnapshot &&
          (!releaseSnapshot.contents.equals(lock.contents) || !ownerAlive)
        ) {
          throw operationLockFailure(
            "SELF_HOST_OPERATION_LOCK_INVALID",
            "the operation lock release snapshot is mismatched or abandoned",
          );
        }
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_OPERATION_LOCK",
            "recovery",
            "warning",
            releaseSnapshot
              ? "An instance mutation lock is being durably released"
              : reclaimState
                ? "A stale instance mutation lock is being reclaimed"
                : ownerAlive
                  ? "A management mutation is currently in progress"
                  : ageMs >= OPERATION_LOCK_STALE_GRACE_MS
                    ? "A dead management mutation left a reclaimable stale lock"
                    : "A dead management mutation remains inside the stale-lock safety window",
            {
              errorCode: "SELF_HOST_OPERATION_IN_PROGRESS",
              details: {
                present: true,
                reclaimPresent: Boolean(reclaimState),
                reclaimOwnerAlive: reclaimState?.ownerAlive ?? null,
                reclaimCommand: reclaimState?.reclaim.record.command ?? null,
                reclaimAgeSeconds: reclaimState
                  ? Math.floor(Math.max(0, reclaimState.ageMs) / 1000)
                  : null,
                releaseSnapshotPresent: Boolean(releaseSnapshot),
                command: lock.record.command,
                ageSeconds: Math.floor(ageMs / 1000),
                ownerAlive,
                staleEligible:
                  !ownerAlive && ageMs >= OPERATION_LOCK_STALE_GRACE_MS,
              },
            },
          ),
        );
      } catch (error) {
        const disappeared =
          error?.cause?.code === "ENOENT" && !(await lstatOrNull(lockPath));
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_OPERATION_LOCK",
            "recovery",
            disappeared ? "pass" : "fail",
            disappeared
              ? "No instance mutation is currently locked"
              : "The instance mutation lock is invalid or unsafe",
            {
              errorCode: disappeared
                ? null
                : "SELF_HOST_OPERATION_LOCK_INVALID",
              details: {
                present: !disappeared,
                reclaimPresent: Boolean(await lstatOrNull(reclaimPath)),
                reclaimOwnerAlive: null,
                reclaimCommand: null,
                reclaimAgeSeconds: null,
                releaseSnapshotPresent,
                command: null,
                ageSeconds: null,
                ownerAlive: null,
                staleEligible: false,
              },
            },
          ),
        );
      }
    }

    const images = releaseImagesFromConfig(config);
    const references = Object.values(images);
    const digestBound = references.every((reference) =>
      /@sha256:[a-f0-9]{64}$/.test(reference),
    );
    const official = references.every((reference) =>
      reference.startsWith(SELF_HOST_RELEASE_TRUST.imageRepositoryPrefix),
    );
    if (!digestBound || !official) {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_IMAGE_TRUST",
          "security",
          "warning",
          !digestBound
            ? "Installed application images are not all digest-bound"
            : "Installed digest images are outside the official release namespace",
          {
            errorCode: !digestBound ? "SELF_HOST_CONFIG_MUTABLE_IMAGE" : null,
            details: { digestBound, officialNamespace: official },
          },
        ),
      );
    } else {
      const cosign = commandProbe(context, "cosign", ["version"]);
      let signaturesValid = cosign.ok;
      if (cosign.ok) {
        const identity = `${SELF_HOST_RELEASE_TRUST.sourceRepository}/${SELF_HOST_RELEASE_TRUST.workflow}@refs/tags/v${config.values.get("SELF_HOST_VERSION")}`;
        for (const reference of references) {
          const verification = commandProbe(
            context,
            "cosign",
            [
              "verify",
              "--certificate-identity",
              identity,
              "--certificate-oidc-issuer",
              SELF_HOST_RELEASE_TRUST.oidcIssuer,
              reference,
            ],
            { timeoutMs: 5 * 60_000 },
          );
          signaturesValid &&= verification.ok;
        }
      }
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_IMAGE_TRUST",
          "security",
          signaturesValid ? "pass" : "fail",
          signaturesValid
            ? "Installed image digests have valid official signatures"
            : "Installed image signatures could not be verified",
          {
            errorCode: signaturesValid
              ? null
              : cosign.ok
                ? "SELF_HOST_UPGRADE_SIGNATURE_INVALID"
                : "SELF_HOST_COSIGN_UNAVAILABLE",
            details: { digestBound: true, officialNamespace: true },
          },
        ),
      );
    }

    if (
      dockerRuntimeSupported &&
      composeAvailable &&
      bundleReady &&
      config.permissionsSecure &&
      composeInput
    ) {
      composeArgs = composeArguments(
        context.instanceDirectory,
        false,
        config.values,
        composeInput,
      );
      const model = commandProbe(context, "docker", [
        ...composeArgs,
        "config",
        "--quiet",
      ]);
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_COMPOSE_MODEL",
          "runtime",
          model.ok ? "pass" : "fail",
          model.ok
            ? "Resolved Compose model is valid"
            : "Resolved Compose model is invalid",
          {
            errorCode: model.ok ? null : "SELF_HOST_COMPOSE_CONFIG_INVALID",
          },
        ),
      );
      if (model.ok) {
        try {
          rows = readComposeRows(context, composeArgs);
          currentStatus = statusDetails(
            rows,
            {
              docker: docker.stdout || "unknown",
              compose: compose.stdout || "unknown",
            },
            config,
          );
          const status =
            currentStatus.state === "ready"
              ? "pass"
              : currentStatus.state === "not_started"
                ? "warning"
                : "fail";
          checks.push(
            doctorCheck(
              "SELF_HOST_DOCTOR_SERVICE_STATE",
              "runtime",
              status,
              status === "pass"
                ? "All mandatory services and one-shot jobs are ready"
                : status === "warning"
                  ? "Self-host services have not been started"
                  : "One or more self-host services are degraded",
              {
                errorCode: status === "fail" ? "SELF_HOST_NOT_READY" : null,
                details: {
                  state: currentStatus.state,
                  failures: currentStatus.failures,
                  waiting: currentStatus.waiting,
                },
              },
            ),
          );
        } catch (error) {
          const known = normalizeManagementError(error);
          checks.push(
            doctorCheck(
              "SELF_HOST_DOCTOR_SERVICE_STATE",
              "runtime",
              "fail",
              "Compose service state could not be read",
              { errorCode: known.code },
            ),
          );
        }
      } else {
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_SERVICE_STATE",
            "runtime",
            "skipped",
            "Service state cannot be read until the Compose model is valid",
          ),
        );
      }
    } else {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_COMPOSE_MODEL",
          "runtime",
          "skipped",
          "Compose model validation requires Docker and valid configuration",
        ),
        doctorCheck(
          "SELF_HOST_DOCTOR_SERVICE_STATE",
          "runtime",
          "skipped",
          "Service state requires a valid Compose model",
        ),
      );
    }

    const postgres = rows?.find((row) => row.Service === "postgres");
    const postgresReady =
      postgres?.State === "running" &&
      (!postgres.Health || postgres.Health === "healthy");
    let databaseInventory = null;
    if (composeArgs && postgresReady) {
      try {
        databaseInventory = readDatabaseInventory(context, composeArgs, config);
        const databaseMetadata = JSON.parse(
          queryDatabase(
            context,
            composeArgs,
            config,
            `SELECT json_build_object(
               'version', current_setting('server_version'),
               'postgisInstalled', EXISTS(
                 SELECT 1 FROM pg_extension WHERE extname = 'postgis'
               )
             )::text;`,
            "SELF_HOST_DOCTOR_DATABASE_FAILED",
          ),
        );
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DATABASE",
            "database",
            "pass",
            "PostgreSQL is reachable and core records can be inspected",
            {
              details: {
                version: String(databaseMetadata.version ?? "unknown"),
                postgisRequired: false,
                postgisInstalled: databaseMetadata.postgisInstalled === true,
                sizeBytes: databaseInventory.sizeBytes,
              },
            },
          ),
        );
        const expected = await expectedDoctorMigrations(
          context,
          config.values.get("SELF_HOST_VERSION"),
          databaseInventory.migrations,
        );
        const migrationsVerified =
          expected && migrationsEqual(databaseInventory.migrations, expected);
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_MIGRATIONS",
            "database",
            migrationsVerified ? "pass" : expected ? "fail" : "warning",
            migrationsVerified
              ? "Applied migration inventory matches a trusted release inventory"
              : expected
                ? "Applied migration inventory differs from the release"
                : "No trusted local release inventory is available for comparison",
            {
              errorCode:
                expected && !migrationsVerified
                  ? "SELF_HOST_BACKUP_MIGRATION_STATE_INVALID"
                  : null,
              details: {
                appliedCount: databaseInventory.migrations.length,
                expectedCount: expected?.length ?? null,
                migrationHead: databaseInventory.migrations.at(-1)?.id ?? null,
              },
            },
          ),
        );
        const ownerReady = databaseInventory.ownerReady;
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_OWNER",
            "security",
            ownerReady ? "pass" : "fail",
            ownerReady
              ? "Initial self-host owner has been claimed"
              : "Initial self-host owner has not been claimed",
            {
              errorCode: ownerReady ? null : "SELF_HOST_DOCTOR_OWNER_MISSING",
              details: { initialized: ownerReady },
            },
          ),
        );
      } catch (error) {
        const known = normalizeManagementError(error);
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_DATABASE",
            "database",
            "fail",
            "PostgreSQL inspection failed",
            { errorCode: known.code },
          ),
          doctorCheck(
            "SELF_HOST_DOCTOR_MIGRATIONS",
            "database",
            "skipped",
            "Migration inventory requires a reachable database",
          ),
          doctorCheck(
            "SELF_HOST_DOCTOR_OWNER",
            "security",
            "skipped",
            "Owner state requires a reachable database",
          ),
        );
      }
    } else {
      const databaseUnavailable = Boolean(postgres) && !postgresReady;
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_DATABASE",
          "database",
          databaseUnavailable ? "fail" : "skipped",
          databaseUnavailable
            ? "PostgreSQL is present but is not running and healthy"
            : "PostgreSQL inspection requires a running healthy database service",
          {
            errorCode: databaseUnavailable
              ? "SELF_HOST_DOCTOR_DATABASE_FAILED"
              : null,
            details: databaseUnavailable
              ? {
                  state: String(postgres.State ?? "unknown"),
                  health: postgres.Health ? String(postgres.Health) : null,
                }
              : {},
          },
        ),
        doctorCheck(
          "SELF_HOST_DOCTOR_MIGRATIONS",
          "database",
          "skipped",
          "Migration inventory requires a running healthy database service",
        ),
        doctorCheck(
          "SELF_HOST_DOCTOR_OWNER",
          "security",
          "skipped",
          "Owner state requires a running healthy database service",
        ),
      );
    }

    let runtimeCapabilities = null;
    const serverReady = rows?.some(
      (row) =>
        row.Service === "server" &&
        row.State === "running" &&
        (!row.Health || row.Health === "healthy"),
    );
    if (composeArgs && serverReady) {
      try {
        runtimeCapabilities = readCapabilitySnapshot(context, composeArgs);
        const requiredInvalid = runtimeCapabilities.capabilities.filter(
          (item) => item.required && item.state !== "enabled",
        );
        const optionalInvalid = runtimeCapabilities.capabilities.filter(
          (item) => !item.required && item.state === "misconfigured",
        );
        const capabilityStatus =
          !runtimeCapabilities.ready || requiredInvalid.length
            ? "fail"
            : optionalInvalid.length
              ? "warning"
              : "pass";
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_CAPABILITIES",
            "capability",
            capabilityStatus,
            capabilityStatus === "pass"
              ? "Runtime capability registry is ready"
              : capabilityStatus === "warning"
                ? "Optional runtime capabilities are misconfigured"
                : "Required runtime capabilities are not ready",
            {
              errorCode:
                capabilityStatus === "fail"
                  ? "SELF_HOST_DOCTOR_CAPABILITY_FAILED"
                  : null,
              details: {
                deployment: runtimeCapabilities.deployment,
                mode: runtimeCapabilities.mode,
                capabilities: runtimeCapabilities.capabilities,
              },
            },
          ),
        );
      } catch (error) {
        const known = normalizeManagementError(error);
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_CAPABILITIES",
            "capability",
            "fail",
            "Runtime capability registry could not be read",
            { errorCode: known.code },
          ),
        );
      }
    } else {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_CAPABILITIES",
          "capability",
          "skipped",
          "Runtime capabilities require a ready server service",
        ),
      );
    }

    const providerUrl = mapProviderProbeUrl(
      runtimeCapabilities?.map,
      config.values.get("SELF_HOST_SITE_ADDRESS"),
    );
    if (providerUrl) {
      try {
        const response = await context.fetcher(providerUrl, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8_000),
        });
        await response.body?.cancel();
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
            "capability",
            response.ok ? "pass" : "warning",
            response.ok
              ? "Configured map provider is reachable"
              : "Configured map provider returned an error",
            {
              errorCode: response.ok
                ? null
                : "SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE",
              details: { provider: runtimeCapabilities.map.provider },
            },
          ),
        );
      } catch {
        checks.push(
          doctorCheck(
            "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
            "capability",
            "warning",
            "Configured map provider is unreachable",
            {
              errorCode: "SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE",
              details: { provider: runtimeCapabilities.map.provider },
            },
          ),
        );
      }
    } else {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
          "capability",
          "skipped",
          "No probe-safe map provider URL is enabled",
        ),
      );
    }

    const elevationProvider = (
      config.values.get("ELEVATION_PROVIDER") ?? "none"
    ).toLowerCase();
    if (elevationProvider === "local-dem") {
      const tileZoom = Number(config.values.get("ELEVATION_TILE_ZOOM") ?? "13");
      const localDem = await inspectLocalDem(dataRoot, tileZoom);
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_LOCAL_DEM",
          "capability",
          localDem.ready ? "pass" : "warning",
          localDem.ready
            ? "Local DEM manifest and a bounded tile sample are readable"
            : "Local DEM data is incomplete, invalid, or unreadable",
          {
            errorCode: localDem.ready
              ? null
              : "SELF_HOST_DOCTOR_LOCAL_DEM_INVALID",
            details: {
              provider: elevationProvider,
              tileZoom,
              ready: localDem.ready,
              reason: localDem.reason,
            },
          },
        ),
      );
    } else {
      checks.push(
        doctorCheck(
          "SELF_HOST_DOCTOR_LOCAL_DEM",
          "capability",
          "skipped",
          "Local DEM diagnostics are not required for the configured elevation provider",
          { details: { provider: elevationProvider } },
        ),
      );
    }

    const now = context.now();
    const backupHistory = await latestBackupSummary(dataRoot, now);
    const backup = backupHistory.latest;
    const backupFresh =
      backup &&
      now.getTime() - Date.parse(backup.createdAt) <= DOCTOR_BACKUP_WARNING_MS;
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_BACKUP",
        "recovery",
        backupHistory.limitExceeded
          ? "warning"
          : backupFresh
            ? "pass"
            : "warning",
        backupHistory.limitExceeded
          ? "Backup history exceeds the bounded doctor scan"
          : backupFresh
            ? "A recent verified backup is available"
            : backup
              ? "The latest verified backup is older than seven days"
              : "No verified backup is available",
        {
          errorCode: backupHistory.limitExceeded
            ? "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED"
            : null,
          details: {
            latest: backup,
            history: historyScanDetails(backupHistory),
          },
        },
      ),
    );
    const restoreHistory = await latestRestoreSummary(dataRoot);
    const restore = restoreHistory.latest;
    checks.push(
      doctorCheck(
        "SELF_HOST_DOCTOR_RESTORE_DRILL",
        "recovery",
        restoreHistory.limitExceeded
          ? "warning"
          : restore?.status === "completed"
            ? "pass"
            : restore?.status === "failed"
              ? "fail"
              : "warning",
        restoreHistory.limitExceeded
          ? "Restore history exceeds the bounded doctor scan"
          : restore?.status === "completed"
            ? "A completed restore report is available"
            : restore?.status === "failed"
              ? "The most recent restore report is failed"
              : "No restore drill report is available",
        {
          errorCode: restoreHistory.limitExceeded
            ? "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED"
            : restore?.status === "failed"
              ? isCatalogedSelfHostError(restore.errorCode)
                ? restore.errorCode
                : "SELF_HOST_RESTORE_NOT_READY"
              : null,
          details: {
            latest: restore,
            history: historyScanDetails(restoreHistory),
          },
        },
      ),
    );
  } else {
    for (const [code, category, summary] of [
      [
        "SELF_HOST_DOCTOR_DISK",
        "storage",
        "Disk check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_INODES",
        "storage",
        "Inode check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_DATA_ROOT",
        "storage",
        "Data root check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_LIFECYCLE",
        "recovery",
        "Lifecycle check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_IMAGE_TRUST",
        "security",
        "Image trust check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_COMPOSE_MODEL",
        "runtime",
        "Compose check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_SERVICE_STATE",
        "runtime",
        "Service state requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_DATABASE",
        "database",
        "Database check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_MIGRATIONS",
        "database",
        "Migration check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_OWNER",
        "security",
        "Owner check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_CAPABILITIES",
        "capability",
        "Capability check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_PROVIDER_CONNECTIVITY",
        "capability",
        "Provider check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_LOCAL_DEM",
        "capability",
        "Local DEM check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_BACKUP",
        "recovery",
        "Backup check requires valid configuration",
      ],
      [
        "SELF_HOST_DOCTOR_RESTORE_DRILL",
        "recovery",
        "Restore drill check requires valid configuration",
      ],
    ]) {
      checks.push(doctorCheck(code, category, "skipped", summary));
    }
  }

  const operationHistory = await recentFailureSummary(
    context.instanceDirectory,
  );
  const recentFailure = operationHistory.latest;
  checks.push(
    doctorCheck(
      "SELF_HOST_DOCTOR_RECENT_FAILURE",
      "recovery",
      recentFailure || operationHistory.limitExceeded ? "warning" : "pass",
      operationHistory.limitExceeded
        ? "Operation history exceeds the bounded doctor scan"
        : recentFailure
          ? "A recent failed management operation needs review"
          : "No recent failed management operation was found",
      {
        errorCode: operationHistory.limitExceeded
          ? "SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED"
          : (recentFailure?.errorCode ?? null),
        details: {
          latest: recentFailure,
          history: historyScanDetails(operationHistory),
        },
      },
    ),
  );

  const report = buildDoctorReport({
    generatedAt: context.now().toISOString(),
    releaseVersion: context.releaseVersion,
    mode: config?.values.get("SELF_HOST_MODE") ?? "unknown",
    checks,
  });
  const failed = report.overall === "fail";
  return {
    status: failed ? "failed" : "completed",
    exitCode: failed ? SELF_HOST_CLI_EXIT.UNHEALTHY : SELF_HOST_CLI_EXIT.OK,
    summary: failed
      ? "Self-host doctor found blocking failures"
      : report.overall === "warning"
        ? "Self-host doctor completed with warnings"
        : "Self-host doctor passed",
    actions: [
      action(
        "RUN_DOCTOR",
        failed ? "failed" : "completed",
        "Inspect the self-host release, host, runtime, data, and recovery state",
      ),
    ],
    details: { doctor: report },
    error: failed
      ? {
          code: "SELF_HOST_DOCTOR_FAILED",
          message: "One or more blocking doctor checks failed",
          retryable: false,
        }
      : null,
  };
}

function validDiagnosticOperation(record) {
  return (
    hasExactKeys(record, [
      "schemaVersion",
      "operationId",
      "command",
      "status",
      "ok",
      "exitCode",
      "dryRun",
      "startedAt",
      "finishedAt",
      "releaseVersion",
      "actionCodes",
      "errorCode",
    ]) &&
    record.schemaVersion === 1 &&
    UUID_PATTERN.test(record.operationId ?? "") &&
    COMMANDS.has(record.command) &&
    ["completed", "planned", "unchanged", "failed"].includes(record.status) &&
    typeof record.ok === "boolean" &&
    Number.isInteger(record.exitCode) &&
    typeof record.dryRun === "boolean" &&
    Number.isFinite(Date.parse(record.startedAt ?? "")) &&
    Number.isFinite(Date.parse(record.finishedAt ?? "")) &&
    typeof record.releaseVersion === "string" &&
    Array.isArray(record.actionCodes) &&
    record.actionCodes.every(
      (code) => typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code),
    ) &&
    (record.errorCode === null ||
      (typeof record.errorCode === "string" &&
        /^SELF_HOST_[A-Z0-9_]+$/.test(record.errorCode)))
  );
}

async function recentDiagnosticOperations(instanceDirectory) {
  const directory = resolve(instanceDirectory, ".selfhost/operations");
  const stat = await lstatOrNull(directory);
  const maximumEntries = SELF_HOST_HISTORY_LIMITS.maximumOperationEntries;
  const byteBudget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumOperationBytes,
  };
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return { records: [], byteLimitExceeded: false, limitExceeded: false };
  }
  const records = [];
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(directory, maximumEntries);
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    return { records: [], byteLimitExceeded: false, limitExceeded: true };
  }
  const names = entries
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 50);
  for (const name of names) {
    try {
      const record = await readDoctorJson(
        resolve(directory, name),
        HISTORY_RECORD_BYTES,
        byteBudget,
      );
      if (validDiagnosticOperation(record)) records.push(record);
      if (records.length === 20) break;
    } catch (error) {
      if (error instanceof CumulativeByteLimitError) {
        return { records: [], byteLimitExceeded: true, limitExceeded: true };
      }
      // Malformed or unsafe records are omitted from the support artifact.
    }
  }
  return { records, byteLimitExceeded: false, limitExceeded: false };
}

function diagnosticsOutputName(context) {
  const generated = `diagnostics-v${context.releaseVersion}-${context.startedAt.replace(/[:.]/g, "-")}-${context.operationId.slice(0, 8)}.json`;
  const requested = context.output
    ? context.output.endsWith(".json")
      ? context.output
      : `${context.output}.json`
    : generated;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.json$/.test(requested) ||
    requested.endsWith("..json") ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(requested)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_DIAGNOSTICS_PATH_INVALID",
      "--output must be a portable diagnostics file name, not a path",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  return requested;
}

async function diagnosticsDirectory(context, config) {
  if (config) {
    try {
      const dataRoot = resolveDataRoot(
        context.instanceDirectory,
        config.values,
      );
      const state = await inspectDataRoot(dataRoot);
      if (
        state.rootStat &&
        state.markerStat &&
        !state.permissionsNeedHardening &&
        !state.markerPermissionsNeedHardening
      ) {
        return resolve(dataRoot, "diagnostics");
      }
    } catch {
      // Fall back to release-local diagnostic state when the data root is unsafe.
    }
  }
  return resolve(context.instanceDirectory, ".selfhost/diagnostics");
}

function displayedArtifactPath(instanceDirectory, path) {
  const candidate = relative(instanceDirectory, path);
  return candidate && !candidate.startsWith("..") && !isAbsolute(candidate)
    ? candidate.replaceAll("\\", "/")
    : path;
}

async function collectDiagnosticLogs(context) {
  try {
    const outcome = await logs({ ...context, dryRun: false });
    return {
      status:
        outcome.details.state === "not_started" ? "not-started" : "collected",
      errorCode: null,
      state: outcome.details.state,
      tail: context.tail,
      selectedServices: context.services,
      services: outcome.details.services,
      lines: outcome.details.lines,
    };
  } catch (error) {
    const known = normalizeManagementError(error);
    return {
      status: "unavailable",
      errorCode: known.code,
      state: "unknown",
      tail: context.tail,
      selectedServices: context.services,
      services: [],
      lines: [],
    };
  }
}

async function removePublishedDiagnosticsArtifact(
  context,
  destination,
  publishedIdentity,
) {
  const current = await lstatOrNull(destination);
  if (!current) return;
  if (
    !publishedIdentity ||
    current.dev !== publishedIdentity.dev ||
    current.ino !== publishedIdentity.ino
  ) {
    throw new Error(
      "published diagnostics artifact changed identity before cleanup",
    );
  }
  await context.removeDiagnosticsArtifact(destination);
  await context.diagnosticsCleanupSync(dirname(destination));
}

async function diagnostics(context) {
  const doctorOutcome = await doctor(context);
  const report = doctorOutcome.details.doctor;
  let config = null;
  try {
    config = await readConfig(context.instanceDirectory);
    context.secrets = config.secrets;
  } catch {
    // Doctor already contains the stable configuration failure.
  }
  const directory = await diagnosticsDirectory(context, config);
  const name = diagnosticsOutputName(context);
  const destination = resolve(directory, name);
  const displayedPath = displayedArtifactPath(
    context.instanceDirectory,
    destination,
  );

  if (context.dryRun) {
    return {
      status: "planned",
      summary:
        "Diagnostics bundle creation is planned; no artifact was written",
      actions: [
        action("RUN_DOCTOR", "completed", "Run the complete self-host doctor"),
        action(
          "CREATE_DIAGNOSTICS_BUNDLE",
          "planned",
          "Create a redacted allowlist-only support artifact",
        ),
      ],
      details: {
        doctor: report,
        diagnosticsPath: displayedPath,
        includedFields: DIAGNOSTICS_INCLUDED_FIELDS,
        secretScan: "planned",
        operatorReviewRequired: true,
      },
    };
  }

  const [diagnosticLogs, operationHistory] = await Promise.all([
    collectDiagnosticLogs(context),
    recentDiagnosticOperations(context.instanceDirectory),
  ]);
  let bundle;
  try {
    bundle = buildDiagnosticsBundle({
      bundleId: context.operationId,
      generatedAt: context.now().toISOString(),
      releaseVersion: context.releaseVersion,
      mode: report.mode,
      doctor: report,
      configuration: {
        available: Boolean(config),
        settings: config ? safeConfigurationSnapshot(config) : {},
      },
      logs: diagnosticLogs,
      operations: operationHistory.records,
      secretValues: context.secrets,
    });
  } catch (error) {
    if (error?.message?.includes("secret scan failed")) {
      throw new SelfHostManagementError(
        "SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED",
        "diagnostics artifact failed the mandatory secret scan and was not written",
        SELF_HOST_CLI_EXIT.COMMAND_FAILED,
        { cause: error },
      );
    }
    throw error;
  }

  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  try {
    const fallbackRoot = resolve(context.instanceDirectory, ".selfhost");
    if (directory === resolve(fallbackRoot, "diagnostics")) {
      await ensurePrivateDirectory(fallbackRoot);
    }
    await ensurePrivateDirectory(directory);
    await context.atomicWrite(destination, serialized, 0o600);
  } catch (error) {
    throw new SelfHostManagementError(
      error?.code === "EEXIST"
        ? "SELF_HOST_DIAGNOSTICS_EXISTS"
        : "SELF_HOST_DIAGNOSTICS_WRITE_FAILED",
      error?.code === "EEXIST"
        ? "the diagnostics output already exists; choose another --output name"
        : "could not publish the private diagnostics artifact",
      error?.code === "EEXIST"
        ? SELF_HOST_CLI_EXIT.STATE_CONFLICT
        : SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }

  let publishedIdentity = null;
  try {
    const publishedRead = await readRegularFileBounded(destination, {
      maximumBytes: 32 * 1024 * 1024,
      minimumBytes: 1,
      label: "published diagnostics artifact",
    });
    publishedIdentity = publishedRead.stat;
    const expectedContents = Buffer.from(serialized);
    if (!publishedRead.contents.equals(expectedContents)) {
      throw new Error("published diagnostics artifact differs from its input");
    }
    const published = JSON.parse(publishedRead.contents.toString("utf8"));
    validateDiagnosticsBundle(published, context.secrets);
    const access = await inspectPrivatePath(destination, { kind: "file" });
    const finalStat = await fs.lstat(destination);
    if (
      !access.secure ||
      !finalStat.isFile() ||
      finalStat.isSymbolicLink() ||
      finalStat.dev !== publishedRead.stat.dev ||
      finalStat.ino !== publishedRead.stat.ino ||
      finalStat.size !== publishedRead.stat.size ||
      finalStat.mtimeMs !== publishedRead.stat.mtimeMs ||
      finalStat.ctimeMs !== publishedRead.stat.ctimeMs
    ) {
      throw new Error("published diagnostics artifact is not private");
    }
    return {
      status: "completed",
      summary:
        report.overall === "fail"
          ? "Private diagnostics bundle created with blocking doctor findings"
          : "Private diagnostics bundle created",
      actions: [
        action("RUN_DOCTOR", "completed", "Run the complete self-host doctor"),
        action(
          "REDACT_DIAGNOSTICS",
          "completed",
          "Apply exact-value and generic credential redaction",
        ),
        action(
          "VERIFY_DIAGNOSTICS",
          "completed",
          "Verify schema, checksum, permissions, and mandatory secret scan",
        ),
        action(
          "CREATE_DIAGNOSTICS_BUNDLE",
          "completed",
          "Publish the private allowlist-only support artifact",
        ),
      ],
      details: {
        diagnosticsPath: displayedPath,
        includedFields: DIAGNOSTICS_INCLUDED_FIELDS,
        sizeBytes: publishedRead.stat.size,
        sha256: createHash("sha256")
          .update(publishedRead.contents)
          .digest("hex"),
        doctorOverall: report.overall,
        redactionsApplied: bundle.privacy.redactionsApplied,
        secretScan: bundle.privacy.secretScan,
        operatorReviewRequired: true,
      },
    };
  } catch (error) {
    try {
      await removePublishedDiagnosticsArtifact(
        context,
        destination,
        publishedIdentity,
      );
    } catch (cleanupError) {
      throw new SelfHostManagementError(
        "SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED",
        "published diagnostics verification failed and the untrusted artifact could not be safely removed",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: new AggregateError([error, cleanupError]) },
      );
    }
    throw new SelfHostManagementError(
      "SELF_HOST_DIAGNOSTICS_VERIFY_FAILED",
      "published diagnostics artifact failed verification",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
}

async function logs(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const current = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Log collection is planned; no logs were read",
      actions: [
        action("READ_LOGS", "planned", "Read and redact bounded Compose logs"),
      ],
      details: {
        ...current,
        tail: context.tail,
        selectedServices: context.services,
        lines: [],
        configurationWarnings: config.warnings,
      },
    };
  }
  if (current.state === "not_started") {
    return {
      status: "unchanged",
      summary: "No Compose services exist, so there are no logs",
      actions: [
        action("READ_LOGS", "skipped", "No service logs are available"),
      ],
      details: {
        ...current,
        tail: context.tail,
        selectedServices: context.services,
        lines: [],
        configurationWarnings: config.warnings,
      },
    };
  }
  const result = runDocker(
    context,
    [
      ...composeArgs,
      "logs",
      "--no-color",
      "--timestamps",
      "--tail",
      String(context.tail),
      ...context.services,
    ],
    "SELF_HOST_LOGS_FAILED",
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const lines = redactWithSecrets(combined, context.secrets)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-5000)
    .map((line) => line.slice(0, MAX_LOG_LINE_LENGTH));
  return {
    status: "completed",
    summary: `Collected ${lines.length} redacted log lines`,
    actions: [
      action("READ_LOGS", "completed", "Read and redact bounded Compose logs"),
    ],
    details: {
      ...current,
      tail: context.tail,
      selectedServices: context.services,
      lines,
      configurationWarnings: config.warnings,
    },
  };
}

function lastJsonObject(text) {
  for (const line of String(text ?? "")
    .split(/\r?\n/)
    .reverse()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
    } catch {
      // Docker may add bounded, non-JSON diagnostics around the command output.
    }
  }
  return null;
}

function throwOwnerBootstrapFailure(result) {
  const payload = lastJsonObject(result.stderr);
  const expectedKeys =
    payload?.code === "SELF_HOST_BOOTSTRAP_INPUT_INVALID"
      ? ["schemaVersion", "operation", "status", "code", "passwordPolicy"]
      : ["schemaVersion", "operation", "status", "code"];
  const contractValid =
    hasExactKeys(payload, expectedKeys) &&
    payload.schemaVersion === 1 &&
    payload.operation === "self-host-owner-bootstrap" &&
    payload.status === "failed" &&
    typeof payload.code === "string" &&
    (payload.passwordPolicy === undefined ||
      typeof payload.passwordPolicy === "string");
  const known = contractValid ? OWNER_BOOTSTRAP_FAILURES[payload.code] : null;
  if (known) {
    throw new SelfHostManagementError(
      payload.code,
      known.message,
      known.exitCode,
      { cause: result.error },
    );
  }
  throw new SelfHostManagementError(
    "SELF_HOST_OWNER_BOOTSTRAP_FAILED",
    "The local owner bootstrap command failed",
    SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    { cause: result.error },
  );
}

async function ownerBootstrap(context) {
  await assertNoIncompleteLifecycle(context);
  const { config, versions, composeArgs } = await composeContext(context);
  const current = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (!current.ready) {
    throw new SelfHostManagementError(
      "SELF_HOST_NOT_READY",
      "Owner bootstrap requires a ready self-host stack",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  const details = {
    ...current,
    ownerEmailValidated: true,
    ownerNameValidated: true,
    passwordInput: "stdin",
    configurationWarnings: config.warnings,
  };
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Owner bootstrap is planned; no owner credential was created",
      actions: [
        action(
          "VALIDATE_OWNER_BOOTSTRAP",
          "completed",
          "Validate the ready instance and owner identity syntax",
        ),
        action(
          "BOOTSTRAP_OWNER",
          "planned",
          "Create the singleton owner from local stdin",
        ),
      ],
      details,
    };
  }
  if (context.stdinIsTTY) {
    throw new SelfHostManagementError(
      "SELF_HOST_OWNER_BOOTSTRAP_STDIN_REQUIRED",
      "Pipe the owner password to stdin; interactive terminal input is not accepted",
      SELF_HOST_CLI_EXIT.USAGE,
    );
  }
  const result = await context.streamRunner(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "server",
      "node",
      "dist/apps/server/src/self-host/self-host-owner-bootstrap.command.js",
      "--email",
      context.ownerEmail,
      "--name",
      context.ownerName,
    ],
    {
      cwd: context.instanceDirectory,
      env: context.env,
      timeoutMs: 5 * 60_000,
      maxBuffer: 1024 * 1024,
      inheritStdin: true,
    },
  );
  if (result.error || result.status !== 0) {
    throwOwnerBootstrapFailure(result);
  }
  const payload = lastJsonObject(result.stdout);
  if (
    !hasExactKeys(payload, [
      "schemaVersion",
      "state",
      "owner",
      "initializedAt",
      "operation",
      "status",
    ]) ||
    payload.schemaVersion !== 1 ||
    payload.state !== "READY" ||
    payload.operation !== "self-host-owner-bootstrap" ||
    payload.status !== "completed" ||
    !hasExactKeys(payload.owner, ["email", "name"]) ||
    typeof payload.owner.email !== "string" ||
    typeof payload.owner.name !== "string" ||
    payload.owner.email.toLowerCase() !== context.ownerEmail.toLowerCase() ||
    payload.owner.name !== context.ownerName ||
    !Number.isFinite(Date.parse(payload.initializedAt ?? ""))
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_OWNER_BOOTSTRAP_RESPONSE_INVALID",
      "The owner bootstrap command returned an invalid completion result",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  return {
    status: "completed",
    summary: "The singleton self-host owner was initialized",
    actions: [
      action(
        "VALIDATE_OWNER_BOOTSTRAP",
        "completed",
        "Validate the ready instance and owner identity syntax",
      ),
      action(
        "BOOTSTRAP_OWNER",
        "completed",
        "Create the singleton owner from local stdin",
      ),
    ],
    details: { ...details, ownerInitialized: true },
  };
}

function throwOwnerRecoveryFailure(result) {
  const payload = lastJsonObject(result.stderr);
  const expectedKeys =
    payload?.code === "SELF_HOST_RECOVERY_PASSWORD_INVALID"
      ? ["schemaVersion", "operation", "status", "code", "passwordPolicy"]
      : ["schemaVersion", "operation", "status", "code"];
  const contractValid =
    hasExactKeys(payload, expectedKeys) &&
    payload.schemaVersion === 1 &&
    payload.operation === "self-host-owner-password-recovery" &&
    payload.status === "failed" &&
    typeof payload.code === "string" &&
    (payload.passwordPolicy === undefined ||
      typeof payload.passwordPolicy === "string");
  const known = contractValid ? OWNER_RECOVERY_FAILURES[payload.code] : null;
  if (known) {
    throw new SelfHostManagementError(
      payload.code,
      known.message,
      known.exitCode,
      { cause: result.error },
    );
  }
  throw new SelfHostManagementError(
    "SELF_HOST_OWNER_RECOVERY_FAILED",
    "The local owner password recovery command failed",
    SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    { cause: result.error },
  );
}

async function ownerRecovery(context) {
  await assertNoIncompleteLifecycle(context);
  const { config, versions, composeArgs } = await composeContext(context);
  const current = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (!current.ready) {
    throw new SelfHostManagementError(
      "SELF_HOST_NOT_READY",
      "Owner recovery requires a ready self-host stack",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  const details = {
    ...current,
    ownerEmailValidated: true,
    passwordInput: "stdin",
    configurationWarnings: config.warnings,
  };
  if (context.dryRun) {
    return {
      status: "planned",
      summary:
        "Owner password recovery is planned; no credential or session was changed",
      actions: [
        action(
          "VALIDATE_OWNER_RECOVERY",
          "completed",
          "Validate the ready instance and owner email syntax",
        ),
        action(
          "RECOVER_OWNER_PASSWORD",
          "planned",
          "Replace the initialized owner credential and revoke owner sessions",
        ),
      ],
      details,
    };
  }
  if (context.stdinIsTTY) {
    throw new SelfHostManagementError(
      "SELF_HOST_OWNER_RECOVERY_STDIN_REQUIRED",
      "Pipe the new owner password to stdin; interactive terminal input is not accepted",
      SELF_HOST_CLI_EXIT.USAGE,
    );
  }
  const result = await context.streamRunner(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "server",
      "node",
      "dist/apps/server/src/self-host/self-host-owner-recovery.command.js",
      "--email",
      context.ownerEmail,
    ],
    {
      cwd: context.instanceDirectory,
      env: context.env,
      timeoutMs: 5 * 60_000,
      maxBuffer: 1024 * 1024,
      inheritStdin: true,
    },
  );
  if (result.error || result.status !== 0) {
    throwOwnerRecoveryFailure(result);
  }
  const payload = lastJsonObject(result.stdout);
  if (
    !hasExactKeys(payload, [
      "schemaVersion",
      "operation",
      "status",
      "ownerEmail",
      "revokedSessions",
    ]) ||
    payload.schemaVersion !== 1 ||
    payload.operation !== "self-host-owner-password-recovery" ||
    payload.status !== "completed" ||
    typeof payload.ownerEmail !== "string" ||
    payload.ownerEmail.toLowerCase() !== context.ownerEmail.toLowerCase() ||
    !Number.isSafeInteger(payload.revokedSessions) ||
    payload.revokedSessions < 0
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_OWNER_RECOVERY_RESPONSE_INVALID",
      "The owner recovery command returned an invalid completion result",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  return {
    status: "completed",
    summary: "The initialized owner password was replaced and sessions revoked",
    actions: [
      action(
        "VALIDATE_OWNER_RECOVERY",
        "completed",
        "Validate the ready instance and owner email syntax",
      ),
      action(
        "RECOVER_OWNER_PASSWORD",
        "completed",
        "Replace the initialized owner credential and revoke owner sessions",
      ),
    ],
    details: { ...details, sessionsRevoked: payload.revokedSessions },
  };
}

async function stop(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const before = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  const active = before.services.some((service) =>
    ["running", "restarting", "paused", "removing"].includes(service.state),
  );
  if (!active) {
    return {
      status: "unchanged",
      summary: "Self-host services are already stopped",
      actions: [action("STOP_SERVICES", "skipped", "Keep services stopped")],
      details: { ...before, configurationWarnings: config.warnings },
    };
  }
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Compose stop is planned; no service state was changed",
      actions: [
        action(
          "STOP_SERVICES",
          "planned",
          "Stop services without deleting containers or data",
        ),
      ],
      details: { ...before, configurationWarnings: config.warnings },
    };
  }
  runDocker(
    context,
    [...composeArgs, "stop", "--timeout", "30"],
    "SELF_HOST_STOP_FAILED",
  );
  const after = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (
    after.services.some((service) =>
      ["running", "restarting", "paused", "removing"].includes(service.state),
    )
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_STOP_INCOMPLETE",
      "one or more services are still running",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  return {
    status: "completed",
    summary: "Self-host services are stopped; containers and data are retained",
    actions: [
      action(
        "STOP_SERVICES",
        "completed",
        "Stop services without deleting containers or data",
      ),
    ],
    details: { ...after, configurationWarnings: config.warnings },
  };
}

async function confirmedUninstallDataRoot(context, config) {
  const dataRoot = resolveDataRoot(context.instanceDirectory, config.values);
  let initialStat;
  try {
    initialStat = await fs.lstat(dataRoot, { bigint: true });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED",
      "refusing to delete a data root that cannot be identified safely",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  if (!initialStat.isDirectory() || initialStat.isSymbolicLink()) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED",
      "refusing to delete a data root that is not a real directory",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const state = await inspectDataRoot(dataRoot);
  if (!state.rootStat || !state.markerStat) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED",
      "refusing to delete a data root without the self-host ownership marker",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }

  let actualRoot;
  let confirmedRoot;
  try {
    [actualRoot, confirmedRoot] = await Promise.all([
      fs.realpath(dataRoot),
      fs.realpath(resolve(context.confirmDataRoot)),
    ]);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_CONFIRMATION_INVALID",
      "the confirmed data-root path must resolve to the existing configured data root",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  if (actualRoot !== confirmedRoot) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_CONFIRMATION_INVALID",
      "the confirmed data-root path does not match SELF_HOST_DATA_ROOT",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }

  const [instanceRoot, unexpected] = await Promise.all([
    fs.realpath(context.instanceDirectory),
    unexpectedDirectoryEntryNames(actualRoot, DATA_ROOT_TOP_LEVEL, 1),
  ]);
  if (
    actualRoot === parse(actualRoot).root ||
    actualRoot === instanceRoot ||
    pathStrictlyContains(actualRoot, instanceRoot) ||
    unexpected.length > 0
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_UNVERIFIED",
      "refusing to delete a broad, shared, or non-contract data root",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  let confirmedStat;
  try {
    confirmedStat = await fs.lstat(actualRoot, { bigint: true });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "the confirmed data root changed while it was being inspected",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      { cause: error },
    );
  }
  if (
    !confirmedStat.isDirectory() ||
    confirmedStat.isSymbolicLink() ||
    confirmedStat.dev !== initialStat.dev ||
    confirmedStat.ino !== initialStat.ino
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "the confirmed data root changed while it was being inspected",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  return {
    path: actualRoot,
    identity: { dev: confirmedStat.dev, ino: confirmedStat.ino },
  };
}

function sameDirectoryIdentity(stat, identity) {
  return (
    stat?.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.dev === identity.dev &&
    stat.ino === identity.ino
  );
}

function uninstallQuarantinePath(context, dataRoot) {
  if (!UUID_PATTERN.test(context.operationId)) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "the uninstall operation identity is invalid",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  const parent = dirname(dataRoot);
  const quarantine = resolve(
    parent,
    `.${basename(dataRoot)}.selfhost-uninstall-${context.operationId}`,
  );
  if (dirname(quarantine) !== parent || quarantine === dataRoot) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "the uninstall quarantine path is invalid",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  return { parent, quarantine };
}

async function restoreChangedUninstallRoot(context, dataRoot, quarantine) {
  try {
    if (!(await lstatOrNull(dataRoot)) && (await lstatOrNull(quarantine))) {
      await context.renameDataRoot(quarantine, dataRoot);
      await context.syncDirectory(dirname(dataRoot));
    }
  } catch {
    // Preserve both paths for operator inspection when safe restoration fails.
  }
}

async function quarantineConfirmedDataRoot(context, confirmed) {
  const { parent, quarantine } = uninstallQuarantinePath(
    context,
    confirmed.path,
  );
  if (await lstatOrNull(quarantine)) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "the uninstall quarantine path already exists",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }

  let currentStat;
  try {
    currentStat = await fs.lstat(confirmed.path, { bigint: true });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "the confirmed data root changed before deletion",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      { cause: error },
    );
  }
  if (!sameDirectoryIdentity(currentStat, confirmed.identity)) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "the confirmed data root changed before deletion",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }

  try {
    await context.renameDataRoot(confirmed.path, quarantine);
    await context.syncDirectory(parent);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "the confirmed data root could not be moved into its private deletion quarantine",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }

  let quarantinedStat;
  try {
    quarantinedStat = await fs.lstat(quarantine, { bigint: true });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
      "the quarantined data root could not be identified safely",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
  if (
    !sameDirectoryIdentity(quarantinedStat, confirmed.identity) ||
    (await lstatOrNull(confirmed.path))
  ) {
    await restoreChangedUninstallRoot(context, confirmed.path, quarantine);
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED",
      "the confirmed data root changed while entering deletion quarantine; no recursive deletion was attempted",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  return { parent, quarantine };
}

async function uninstall(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const before = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  const confirmedDataRoot = context.deleteData
    ? await confirmedUninstallDataRoot(context, config)
    : null;
  const dataRoot =
    confirmedDataRoot?.path ??
    resolveDataRoot(context.instanceDirectory, config.values);
  const actions = [
    action(
      "REMOVE_COMPOSE_RESOURCES",
      context.dryRun ? "planned" : "completed",
      "Remove self-host containers and network without deleting volumes",
    ),
    action(
      context.deleteData ? "DELETE_DATA_ROOT" : "RETAIN_DATA_ROOT",
      context.deleteData
        ? context.dryRun
          ? "planned"
          : "completed"
        : "completed",
      context.deleteData
        ? "Delete the explicitly confirmed self-host data root"
        : "Retain configuration, lifecycle records, and all persistent data",
    ),
  ];

  if (context.dryRun) {
    return {
      status: "planned",
      summary:
        "Uninstall changes are planned; no containers or data were changed",
      actions,
      details: {
        ...before,
        dataRoot,
        dataRetained: !context.deleteData,
        configurationRetained: true,
        configurationWarnings: config.warnings,
      },
    };
  }

  runDocker(
    context,
    [...composeArgs, "down", "--remove-orphans", "--timeout", "30"],
    "SELF_HOST_UNINSTALL_FAILED",
    { timeoutMs: 10 * 60_000 },
  );
  const remaining = readComposeRows(context, composeArgs);
  if (remaining.length > 0) {
    throw new SelfHostManagementError(
      "SELF_HOST_UNINSTALL_INCOMPLETE",
      "one or more self-host Compose resources still exist",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }

  if (context.deleteData) {
    let quarantined;
    try {
      quarantined = await quarantineConfirmedDataRoot(
        context,
        confirmedDataRoot,
      );
      await context.removeTree(quarantined.quarantine, {
        recursive: true,
        force: false,
      });
      await context.syncDirectory(quarantined.parent);
    } catch (error) {
      if (error instanceof SelfHostManagementError) throw error;
      throw new SelfHostManagementError(
        "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
        "Compose resources were removed but the quarantined data root could not be deleted",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
    if (
      (await lstatOrNull(dataRoot)) ||
      (await lstatOrNull(quarantined.quarantine))
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_UNINSTALL_DATA_DELETE_FAILED",
        "the confirmed data root or its deletion quarantine still exists after deletion",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
  }

  return {
    status: "completed",
    summary: context.deleteData
      ? "Self-host Compose resources and the confirmed data root were removed"
      : "Self-host Compose resources were removed; configuration and data were retained",
    actions,
    details: {
      state: "uninstalled",
      ready: false,
      failures: [],
      waiting: [],
      services: [],
      engine: versions,
      dataRoot,
      dataRetained: !context.deleteData,
      configurationRetained: true,
      configurationWarnings: config.warnings,
    },
  };
}

function restoreMarkerPath(instanceDirectory) {
  return resolve(instanceDirectory, ".selfhost/restore-incomplete.json");
}

function upgradeMarkerPath(instanceDirectory) {
  return resolve(instanceDirectory, ".selfhost/upgrade-incomplete.json");
}

async function assertNoIncompleteRestore(context) {
  const marker = await lstatOrNull(
    restoreMarkerPath(context.instanceDirectory),
  );
  if (marker) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_INCOMPLETE",
      "an earlier restore did not complete; use a new clean target directory and preserve this instance for diagnostics",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
}

async function assertNoIncompleteLifecycle(context) {
  await assertNoIncompleteRestore(context);
  const marker = await lstatOrNull(
    upgradeMarkerPath(context.instanceDirectory),
  );
  if (marker) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_INCOMPLETE",
      "an earlier upgrade or rollback did not complete; inspect its report and run the declared rollback instead of starting services directly",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
}

function permissionsHelperArguments(composeArgs, options, script) {
  return [
    ...composeArgs,
    "run",
    "--rm",
    "--no-deps",
    "--user",
    "0:0",
    ...(options.volumes ?? []).flatMap((volume) => ["--volume", volume]),
    "permissions",
    "node",
    "-e",
    script,
  ];
}

function readUploadUsage(context, composeArgs) {
  const result = runDocker(
    context,
    [
      ...composeArgs,
      "exec",
      "-T",
      "server",
      "node",
      "-e",
      `const fs=require("node:fs");const path=require("node:path");let bytes=0;let files=0;let directories=0;
       const maximumFiles=${BACKUP_ARTIFACT_LIMITS.maximumUploadFiles};const maximumDirectories=${BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories};const maximumDepth=${BACKUP_ARTIFACT_LIMITS.maximumTreeDepth};
       function walk(root,depth){const directory=fs.opendirSync(root);try{let entry;while((entry=directory.readSync())!==null){const file=path.join(root,entry.name);const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new Error("uploads contain a symlink");if(stat.isDirectory()){directories+=1;if(directories>maximumDirectories||depth===maximumDepth)throw new Error("uploads exceed the directory limit");walk(file,depth+1);}else if(stat.isFile()){files+=1;if(files>maximumFiles)throw new Error("uploads exceed the file limit");bytes+=stat.size;}else throw new Error("uploads contain a non-regular entry");}}finally{directory.closeSync();}}
       walk("/data/uploads",0);process.stdout.write("SELF_HOST_UPLOAD_BYTES="+bytes);`,
    ],
    "SELF_HOST_BACKUP_UPLOAD_INSPECTION_FAILED",
  );
  const match = result.stdout.trim().match(/^SELF_HOST_UPLOAD_BYTES=(\d+)$/);
  const bytes = Number(match?.[1]);
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_UPLOAD_INSPECTION_INVALID",
      "the upload volume returned an invalid size",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  return bytes;
}

function dockerRunsRootless(context) {
  const result = runDocker(
    context,
    ["info", "--format", "{{json .SecurityOptions}}"],
    "SELF_HOST_DOCKER_INFO_FAILED",
  );
  return /rootless/i.test(result.stdout);
}

function copyUploadsForBackup(
  context,
  composeArgs,
  stagingName,
  rootlessDocker,
) {
  if (!/^\.[A-Za-z0-9._-]+$/.test(stagingName)) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_PATH_INVALID",
      "internal backup staging name is invalid",
      SELF_HOST_CLI_EXIT.INTERNAL,
    );
  }
  const owner = rootlessDocker ? [0,0] :
    Number.isInteger(context.hostUid) && Number.isInteger(context.hostGid) ? [context.hostUid,context.hostGid] : null;
  runDocker(
    context,
    permissionsHelperArguments(
      composeArgs,
      {},
      uploadCopyScript({operation:"backup-uploads", source:"/state/uploads", target:`/state/backups/${stagingName}/uploads`,
        owner, hardenParent:true, maximumFiles:BACKUP_ARTIFACT_LIMITS.maximumUploadFiles,
        maximumDirectories:BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories, maximumDepth:BACKUP_ARTIFACT_LIMITS.maximumTreeDepth}),
    ),
    "SELF_HOST_BACKUP_UPLOAD_COPY_FAILED",
    { timeoutMs: 30 * 60_000 },
  );
}

async function assertRestoreTargetEmpty(dataRoot) {
  for (const relativePath of [
    "postgres",
    "uploads",
    "operations",
  ]) {
    const path = resolve(dataRoot, relativePath);
    const stat = await fs.lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_TARGET_NOT_CLEAN",
        `restore target path is unsafe: ${relativePath}`,
        SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      );
    }
    if (!(await directoryIsEmpty(path))) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_TARGET_NOT_CLEAN",
        "restore requires empty authoritative data directories",
        SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      );
    }
  }
}

function restoreUploads(context, composeArgs, bundleRoot) {
  runDocker(
    context,
    permissionsHelperArguments(
      composeArgs,
      { volumes: [`${bundleRoot}:/restore:ro`] },
      uploadCopyScript({operation:"restore-uploads", source:"/restore/uploads", target:"/state/uploads", owner:[10001,10001],
        checksums:"/restore/checksums.txt", maximumFiles:BACKUP_ARTIFACT_LIMITS.maximumUploadFiles,
        maximumDirectories:BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories, maximumDepth:BACKUP_ARTIFACT_LIMITS.maximumTreeDepth}),
    ),
    "SELF_HOST_RESTORE_UPLOAD_COPY_FAILED",
    { timeoutMs: 30 * 60_000 },
  );
}

function restoreSnapshotLocation(dataRoot, operationId) {
  if (!UUID_PATTERN.test(operationId)) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_SNAPSHOT_FAILED",
      "restore operation identity is invalid",
      SELF_HOST_CLI_EXIT.INTERNAL,
    );
  }
  const parent = resolve(dataRoot, "operations");
  const path = resolve(parent, `.restore-input-${operationId}`);
  if (dirname(path) !== parent) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_SNAPSHOT_FAILED",
      "restore snapshot path escaped its private operations directory",
      SELF_HOST_CLI_EXIT.INTERNAL,
    );
  }
  return { parent, path };
}

function verifiedBackupIdentity(verified) {
  return JSON.stringify({
    backupId: verified.manifest.backupId,
    fileCount: verified.fileCount,
    sizeBytes: verified.sizeBytes,
    checksums: [...verified.checksums.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  });
}

async function snapshotVerifiedBackup(source, snapshotPath) {
  try {
    await copyRegularTreeBounded(source.root, snapshotPath, {
      maximumBytes: source.sizeBytes,
      maximumFileBytes: source.sizeBytes,
      maximumFiles: source.fileCount + 1,
      maximumDirectories: BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories,
      maximumDepth: BACKUP_ARTIFACT_LIMITS.maximumTreeDepth,
      directoryMode: 0o700,
      fileMode: 0o600,
      label: "restore backup snapshot",
    });
    const snapshot = await verifyBackupBundle(snapshotPath);
    if (verifiedBackupIdentity(snapshot) !== verifiedBackupIdentity(source)) {
      throw new Error("restore backup changed after its initial verification");
    }
    return snapshot;
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_SNAPSHOT_FAILED",
      "could not bind restore to the backup bytes that passed verification",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
}

async function removeRestoreSnapshot(context, location) {
  try {
    const stat = await lstatOrNull(location.path);
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("restore snapshot path is no longer a real directory");
    }
    await context.removeTree(location.path, {
      recursive: true,
      force: false,
    });
    await context.syncDirectory(location.parent);
    if (await lstatOrNull(location.path)) {
      throw new Error("restore snapshot remains after deletion");
    }
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED",
      "could not remove the private restore input snapshot",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
}

async function availableBytes(context, path) {
  const stat = await context.statfs(path, { bigint: true });
  return BigInt(stat.bavail) * BigInt(stat.bsize);
}

async function requireDiskSpace(context, path, requiredBytes, code) {
  const available = await availableBytes(context, path);
  const required = BigInt(requiredBytes);
  if (available < required) {
    throw new SelfHostManagementError(
      code,
      `insufficient disk space: ${required} bytes required, ${available} bytes available`,
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  return available > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(available);
}

function checkedByteEstimate(code, terms) {
  let total = 0n;
  for (const { bytes, multiplier = 1 } of terms) {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      !Number.isSafeInteger(multiplier) ||
      multiplier < 1
    ) {
      throw new SelfHostManagementError(
        code,
        "storage size estimate contains an invalid value",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    total += BigInt(bytes) * BigInt(multiplier);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SelfHostManagementError(
      code,
      "storage size estimate exceeds the supported safe integer range",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  return Number(total);
}

function backupDestination(context, dataRoot) {
  const generated = `backup-v${context.releaseVersion}-${context.startedAt.replace(/[:.]/g, "-")}-${context.operationId.slice(0, 8)}`;
  const name = context.output ?? generated;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) ||
    name.includes(".partial-") ||
    name.endsWith(".") ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_PATH_INVALID",
      "--output must be a portable backup name, not a path",
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const backupsDirectory = resolve(dataRoot, "backups");
  return {
    name,
    backupsDirectory,
    destination: resolve(backupsDirectory, name),
    stagingName: `.${name}.partial-${context.operationId}`,
    staging: resolve(
      backupsDirectory,
      `.${name}.partial-${context.operationId}`,
    ),
    lock: resolve(backupsDirectory, `.${name}.lock`),
  };
}

function safeConfigurationSnapshot(config) {
  return Object.fromEntries(
    [...config.values.entries()]
      .filter(
        ([name, value]) =>
          BACKUP_SAFE_SETTINGS.has(name) && !config.secrets.includes(value),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function secretReferenceSnapshot(values) {
  return [...values.entries()]
    .filter(([name]) => isSensitiveConfigKey(name))
    .map(([name, value]) => ({ name, present: Boolean(value) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function writeJsonExclusive(context, path, payload, maximumBytes = null) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (
    maximumBytes !== null &&
    Buffer.byteLength(serialized, "utf8") > maximumBytes
  ) {
    throw new Error(`JSON artifact exceeds the ${maximumBytes} byte limit`);
  }
  await context.atomicWrite(path, serialized, 0o600);
}

async function clearLifecycleMarker(context, markerPath, marker) {
  try {
    await fs.unlink(markerPath);
    await context.syncDirectory(dirname(markerPath));
  } catch (error) {
    let rearmError = null;
    if (!(await lstatOrNull(markerPath))) {
      try {
        await writeJsonExclusive(context, markerPath, marker);
      } catch (candidate) {
        rearmError = candidate;
      }
    }
    throw new SelfHostManagementError(
      "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
      rearmError
        ? "the completed lifecycle could not durably clear or restore its blocking marker"
        : "the completed lifecycle could not durably clear its blocking marker; the marker remains armed",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: rearmError ? new AggregateError([error, rearmError]) : error },
    );
  }
}

async function createBackupMetadata(
  context,
  config,
  staging,
  databaseInventory,
) {
  const databasePath = resolve(staging, "database.dump");
  const databaseStat = await fs.lstat(databasePath);
  if (
    !databaseStat.isFile() ||
    databaseStat.isSymbolicLink() ||
    databaseStat.size < 1
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_DATABASE_DUMP_INVALID",
      "pg_dump did not produce a non-empty regular file",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
  let uploads;
  try {
    uploads = await inspectRegularTree(resolve(staging, "uploads"), {
      maximumFiles: BACKUP_ARTIFACT_LIMITS.maximumUploadFiles,
      maximumDirectories: BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories,
      maximumDepth: BACKUP_ARTIFACT_LIMITS.maximumTreeDepth,
    });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_UPLOAD_INSPECTION_FAILED",
      "copied uploads exceed the supported portable tree boundary",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
  const release = await readReleaseMetadata(context.instanceDirectory);
  const manifest = {
    schemaVersion: 1,
    kind: "trainingload-selfhost-backup",
    backupId: context.operationId,
    createdAt: context.startedAt,
    release: {
      version: release.version,
      configSchemaVersion: release.configSchemaVersion,
      sourceRevision: release.sourceRevision,
    },
    database: {
      engine: "postgresql",
      format: "pg_dump-custom",
      file: "database.dump",
      sizeBytes: databaseStat.size,
      logicalSizeBytes: databaseInventory.sizeBytes,
      sha256: await sha256File(databasePath),
      appliedMigrations: databaseInventory.migrations,
      recordCounts: databaseInventory.recordCounts,
    },
    uploads: {
      root: "uploads",
      fileCount: uploads.files.length,
      sizeBytes: uploads.files.reduce((sum, file) => sum + file.sizeBytes, 0),
    },
    configuration: {
      snapshotFile: "configuration.json",
      secretReferencesFile: "secret-references.json",
    },
    integrity: { algorithm: "sha256", checksumsFile: "checksums.txt" },
    consistency: {
      method: "application-quiesce-plus-pg-dump",
      quiescedServices: ["client", "server"],
    },
    compatibility: {
      restoreMode: "exact-release",
      requiredReleaseVersion: release.version,
    },
  };
  try {
    await writeJsonExclusive(
      context,
      resolve(staging, "configuration.json"),
      {
        schemaVersion: 1,
        settings: safeConfigurationSnapshot(config),
      },
      BACKUP_ARTIFACT_LIMITS.maximumJsonMetadataBytes,
    );
    await writeJsonExclusive(
      context,
      resolve(staging, "secret-references.json"),
      {
        schemaVersion: 1,
        references: secretReferenceSnapshot(config.values),
      },
      BACKUP_ARTIFACT_LIMITS.maximumJsonMetadataBytes,
    );
    await writeJsonExclusive(
      context,
      resolve(staging, "backup-manifest.json"),
      manifest,
      BACKUP_ARTIFACT_LIMITS.maximumJsonMetadataBytes,
    );
    await writeJsonExclusive(
      context,
      resolve(staging, "backup-result.json"),
      {
        schemaVersion: 1,
        kind: "trainingload-selfhost-backup-result",
        backupId: context.operationId,
        status: "completed",
        verified: true,
      },
      BACKUP_ARTIFACT_LIMITS.maximumJsonMetadataBytes,
    );
    await createChecksums(staging);
    await normalizePrivateTree(staging);
    return await verifyBackupBundle(staging);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_VERIFICATION_FAILED",
      "the staged backup failed its bounded integrity verification",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
}

async function cleanupBackupOperation(
  context,
  paths,
  { lockHandle, lockCreated, stagingCreated, publicationMoved, published },
) {
  let cleanupError = null;
  try {
    await lockHandle?.close();
  } catch (error) {
    cleanupError ??= error;
  }
  if (!published && stagingCreated) {
    try {
      await context.removeTree(
        publicationMoved ? paths.destination : paths.staging,
        {
          recursive: true,
          force: true,
        },
      );
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (lockCreated) {
    try {
      const stat = await fs.lstat(paths.lock);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== Buffer.byteLength(`${context.operationId}\n`, "utf8")
      ) {
        throw new Error("backup operation lock changed identity");
      }
      const { contents, stat: verifiedStat } = await readRegularFileBounded(
        paths.lock,
        {
          maximumBytes: 128,
          expectedSizeBytes: stat.size,
          label: "backup operation lock",
        },
      );
      if (!contents.equals(Buffer.from(`${context.operationId}\n`, "utf8"))) {
        throw new Error("backup operation lock changed ownership");
      }
      const currentStat = await fs.lstat(paths.lock);
      if (
        !currentStat.isFile() ||
        currentStat.isSymbolicLink() ||
        currentStat.dev !== verifiedStat.dev ||
        currentStat.ino !== verifiedStat.ino ||
        currentStat.size !== verifiedStat.size ||
        currentStat.mtimeMs !== verifiedStat.mtimeMs ||
        currentStat.ctimeMs !== verifiedStat.ctimeMs
      ) {
        throw new Error("backup operation lock changed before removal");
      }
      await fs.unlink(paths.lock);
      await context.backupCleanupSync(paths.backupsDirectory);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (cleanupError) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_CLEANUP_FAILED",
      "backup staging or operation lock cleanup failed",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: cleanupError },
    );
  }
}

async function backup(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const before = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (!before.ready) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_REQUIRES_READY_INSTANCE",
      "backup requires a ready instance so application writes can be quiesced safely",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  const dataRoot = resolveDataRoot(context.instanceDirectory, config.values);
  const paths = backupDestination(context, dataRoot);
  for (const path of [paths.destination, paths.staging, paths.lock]) {
    if (await lstatOrNull(path)) {
      throw new SelfHostManagementError(
        "SELF_HOST_BACKUP_ALREADY_EXISTS",
        "the selected backup name or its operation lock already exists",
        SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      );
    }
  }
  const databasePreview = readDatabaseInventory(context, composeArgs, config);
  const uploadBytes = readUploadUsage(context, composeArgs);
  const rootlessDocker = dockerRunsRootless(context);
  const requiredBytes = checkedByteEstimate("SELF_HOST_BACKUP_SIZE_INVALID", [
    { bytes: databasePreview.sizeBytes, multiplier: 2 },
    { bytes: uploadBytes },
    { bytes: BACKUP_DISK_RESERVE_BYTES },
  ]);
  const freeBytes = await requireDiskSpace(
    context,
    paths.backupsDirectory,
    requiredBytes,
    "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT",
  );
  const plannedActions = [
    action("QUIESCE_SERVICES", "planned", "Pause application writes"),
    action("DUMP_DATABASE", "planned", "Create a consistent PostgreSQL dump"),
    action("COPY_UPLOADS", "planned", "Copy authoritative upload files"),
    action("VERIFY_BACKUP", "planned", "Verify manifest and every checksum"),
    action("RESUME_SERVICES", "planned", "Return services to ready state"),
  ];
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Backup is planned; instance and data were not changed",
      actions: plannedActions,
      details: {
        backupName: paths.name,
        databaseBytes: databasePreview.sizeBytes,
        uploadBytes,
        requiredBytes,
        freeBytes,
        serviceState: before.state,
      },
    };
  }

  let lockHandle;
  let lockCreated = false;
  let stagingCreated = false;
  let servicesStopped = false;
  let publicationMoved = false;
  let published = false;
  let verified = null;
  let primaryError = null;
  let restartError = null;
  try {
    try {
      lockHandle = await fs.open(
        paths.lock,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new SelfHostManagementError(
          "SELF_HOST_BACKUP_ALREADY_EXISTS",
          "the selected backup name or its operation lock was claimed concurrently",
          SELF_HOST_CLI_EXIT.STATE_CONFLICT,
          { cause: error },
        );
      }
      throw error;
    }
    lockCreated = true;
    await lockHandle.writeFile(`${context.operationId}\n`, "utf8");
    await lockHandle.sync();
    await lockHandle.close();
    lockHandle = undefined;
    try {
      await fs.mkdir(paths.staging, { mode: 0o700 });
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new SelfHostManagementError(
          "SELF_HOST_BACKUP_ALREADY_EXISTS",
          "the selected backup staging directory was claimed concurrently",
          SELF_HOST_CLI_EXIT.STATE_CONFLICT,
          { cause: error },
        );
      }
      throw error;
    }
    stagingCreated = true;
    servicesStopped = true;
    runDocker(
      context,
      [
        ...composeArgs,
        "stop",
        "--timeout",
        "30",
        "client",
        "server",
      ],
      "SELF_HOST_BACKUP_QUIESCE_FAILED",
    );
    const inventory = readDatabaseInventory(context, composeArgs, config);
    await runDockerStream(
      context,
      [
        ...composeArgs,
        "exec",
        "-T",
        "--env",
        "PGPASSWORD",
        "postgres",
        "pg_dump",
        "--username",
        config.values.get("SELF_HOST_DATABASE_USER") || "trainingload",
        "--dbname",
        config.values.get("SELF_HOST_DATABASE_NAME") || "trainingload",
        "--format=custom",
        "--compress=6",
        "--no-owner",
        "--no-acl",
      ],
      "SELF_HOST_BACKUP_DATABASE_DUMP_FAILED",
      {
        env: databaseCommandEnvironment(context, config),
        outputPath: resolve(paths.staging, "database.dump"),
        timeoutMs: 60 * 60_000,
      },
    );
    copyUploadsForBackup(
      context,
      composeArgs,
      paths.stagingName,
      rootlessDocker,
    );
    verified = await createBackupMetadata(
      context,
      config,
      paths.staging,
      inventory,
    );
    await fs.rename(paths.staging, paths.destination);
    publicationMoved = true;
    await context.backupPublishSync(paths.backupsDirectory);
    published = true;
  } catch (error) {
    primaryError = error;
  }

  if (servicesStopped) {
    try {
      runDocker(
        context,
        [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "600"],
        "SELF_HOST_BACKUP_RESUME_FAILED",
        { timeoutMs: 15 * 60_000 },
      );
      const resumed = statusDetails(
        readComposeRows(context, composeArgs),
        versions,
        config,
      );
      if (!resumed.ready) {
        throw new SelfHostManagementError(
          "SELF_HOST_BACKUP_RESUME_NOT_READY",
          "backup finished but the instance did not return to ready state",
          SELF_HOST_CLI_EXIT.UNHEALTHY,
        );
      }
    } catch (error) {
      restartError = error;
    }
  }
  let cleanupError = null;
  try {
    await cleanupBackupOperation(context, paths, {
      lockHandle,
      lockCreated,
      stagingCreated,
      publicationMoved,
      published,
    });
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError && (primaryError || restartError)) {
    queueSecondaryFailure(
      context,
      cleanupError,
      "Backup staging or operation lock cleanup also failed; inspect the backups directory before retrying",
    );
  } else if (cleanupError) {
    throw cleanupError;
  }
  if (primaryError && restartError) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_AND_RESUME_FAILED",
      "backup failed and services could not be returned to ready state",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
      { cause: primaryError },
    );
  }
  if (primaryError) throw primaryError;
  if (restartError) throw restartError;
  return {
    status: "completed",
    summary: "Verified self-host backup created and services resumed",
    actions: plannedActions.map((item) => ({ ...item, status: "completed" })),
    details: {
      backupPath: paths.destination,
      backupId: verified.manifest.backupId,
      fileCount: verified.fileCount,
      sizeBytes: verified.sizeBytes,
      releaseVersion: verified.manifest.release.version,
    },
  };
}

function migrationsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function writeRestoreReport(context, dataRoot, report) {
  const diagnostics = resolve(dataRoot, "diagnostics");
  const safeTimestamp = context.startedAt.replace(/[:.]/g, "-");
  const path = resolve(
    diagnostics,
    `restore-${safeTimestamp}-${context.operationId}-${report.status}.json`,
  );
  await writeJsonExclusive(context, path, report, HISTORY_RECORD_BYTES);
  return path;
}

async function restore(context) {
  const bundlePath = resolve(context.invocationDirectory, context.backupPath);
  let verified;
  try {
    verified = await verifyBackupBundle(bundlePath);
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_BACKUP_VERIFICATION_FAILED",
      "backup manifest, structure, or checksums failed verification",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  await assertNoIncompleteLifecycle(context);
  const { config, versions, composeArgs } = await composeContext(context);
  const targetRelease = await readReleaseMetadata(context.instanceDirectory);
  if (
    verified.manifest.compatibility.requiredReleaseVersion !==
      context.releaseVersion ||
    config.values.get("SELF_HOST_VERSION") !== context.releaseVersion ||
    verified.manifest.release.configSchemaVersion !==
      targetRelease.configSchemaVersion
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_VERSION_INCOMPATIBLE",
      `backup requires release ${verified.manifest.compatibility.requiredReleaseVersion} with config schema ${verified.manifest.release.configSchemaVersion}; target is ${context.releaseVersion} with config schema ${targetRelease.configSchemaVersion}`,
      SELF_HOST_CLI_EXIT.CONFIG,
    );
  }
  const currentRows = readComposeRows(context, composeArgs);
  if (currentRows.length) {
    throw new SelfHostManagementError(
      "SELF_HOST_RESTORE_TARGET_NOT_CLEAN",
      "restore requires a newly initialized target with no existing Compose containers",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  const dataRoot = resolveDataRoot(context.instanceDirectory, config.values);
  await assertRestoreTargetEmpty(dataRoot);
  const databaseRestoreBytes = Math.max(
    checkedByteEstimate("SELF_HOST_RESTORE_SIZE_INVALID", [
      { bytes: verified.manifest.database.logicalSizeBytes, multiplier: 2 },
    ]),
    checkedByteEstimate("SELF_HOST_RESTORE_SIZE_INVALID", [
      { bytes: verified.manifest.database.sizeBytes, multiplier: 4 },
    ]),
  );
  const requiredBytes = checkedByteEstimate("SELF_HOST_RESTORE_SIZE_INVALID", [
    { bytes: databaseRestoreBytes },
    { bytes: verified.manifest.uploads.sizeBytes },
    { bytes: verified.sizeBytes },
    { bytes: BACKUP_DISK_RESERVE_BYTES },
  ]);
  const freeBytes = await requireDiskSpace(
    context,
    dataRoot,
    requiredBytes,
    "SELF_HOST_RESTORE_DISK_SPACE_INSUFFICIENT",
  );
  const plannedActions = [
    action("VERIFY_BACKUP", "completed", "Verify manifest and every checksum"),
    action(
      "SNAPSHOT_BACKUP",
      "planned",
      "Bind restore to a private copy of the verified backup bytes",
    ),
    action(
      "RESTORE_DATABASE",
      "planned",
      "Restore PostgreSQL into a clean target",
    ),
    action(
      "RESTORE_UPLOADS",
      "planned",
      "Restore and verify authoritative uploads",
    ),
    action(
      "START_SERVICES",
      "planned",
      "Run migrations and start the restored instance",
    ),
    action(
      "VERIFY_RESTORE",
      "planned",
      "Verify migrations, core records, files, and readiness",
    ),
  ];
  if (context.dryRun) {
    return {
      status: "planned",
      summary: "Restore is planned; target data and services were not changed",
      actions: plannedActions,
      details: {
        backupId: verified.manifest.backupId,
        sourceReleaseVersion: verified.manifest.release.version,
        targetReleaseVersion: context.releaseVersion,
        requiredBytes,
        freeBytes,
        fileCount: verified.fileCount,
      },
    };
  }

  const stateDirectory = resolve(context.instanceDirectory, ".selfhost");
  await ensurePrivateDirectory(stateDirectory);
  const markerPath = restoreMarkerPath(context.instanceDirectory);
  const marker = {
    schemaVersion: 1,
    restoreId: context.operationId,
    backupId: verified.manifest.backupId,
    startedAt: context.startedAt,
    state: "in-progress-or-failed",
  };
  await writeJsonExclusive(context, markerPath, marker);
  let databaseRestored = false;
  let uploadsRestored = false;
  let serviceReady = false;
  let restoreCompleted = false;
  const snapshotLocation = restoreSnapshotLocation(
    dataRoot,
    context.operationId,
  );
  let snapshotMayExist = false;
  try {
    snapshotMayExist = true;
    verified = await snapshotVerifiedBackup(verified, snapshotLocation.path);
    runDocker(
      context,
      [
        ...composeArgs,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "300",
        "postgres",
      ],
      "SELF_HOST_RESTORE_DATABASE_START_FAILED",
      { timeoutMs: 10 * 60_000 },
    );
    await runDockerStream(
      context,
      [
        ...composeArgs,
        "exec",
        "-T",
        "--env",
        "PGPASSWORD",
        "postgres",
        "pg_restore",
        "--username",
        config.values.get("SELF_HOST_DATABASE_USER") || "trainingload",
        "--dbname",
        config.values.get("SELF_HOST_DATABASE_NAME") || "trainingload",
        "--clean",
        "--if-exists",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
      ],
      "SELF_HOST_RESTORE_DATABASE_FAILED",
      {
        env: databaseCommandEnvironment(context, config),
        inputPath: resolve(verified.root, "database.dump"),
        timeoutMs: 60 * 60_000,
      },
    );
    const restoredDatabase = readDatabaseInventory(
      context,
      composeArgs,
      config,
    );
    if (
      !migrationsEqual(
        restoredDatabase.migrations,
        verified.manifest.database.appliedMigrations,
      ) ||
      !migrationsEqual(
        restoredDatabase.recordCounts,
        verified.manifest.database.recordCounts,
      )
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_DATABASE_VERIFICATION_FAILED",
        "restored migrations or core record counts do not match the backup",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    databaseRestored = true;
    restoreUploads(context, composeArgs, verified.root);
    uploadsRestored = true;
    await removeRestoreSnapshot(context, snapshotLocation);
    snapshotMayExist = false;
    runDocker(
      context,
      [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "600"],
      "SELF_HOST_RESTORE_START_FAILED",
      { timeoutMs: 15 * 60_000 },
    );
    const ready = statusDetails(
      readComposeRows(context, composeArgs),
      versions,
      config,
    );
    if (!ready.ready) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_NOT_READY",
        "restored services did not become ready",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    const finalDatabase = readDatabaseInventory(context, composeArgs, config);
    if (
      !migrationsEqual(
        finalDatabase.migrations,
        verified.manifest.database.appliedMigrations,
      ) ||
      !migrationsEqual(
        finalDatabase.recordCounts,
        verified.manifest.database.recordCounts,
      )
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_POST_START_VERIFICATION_FAILED",
        "restored data changed unexpectedly while starting the exact release",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    serviceReady = true;
    let reportPath;
    try {
      reportPath = await writeRestoreReport(context, dataRoot, {
        schemaVersion: 1,
        kind: "trainingload-selfhost-restore-report",
        restoreId: context.operationId,
        backupId: verified.manifest.backupId,
        status: "completed",
        startedAt: context.startedAt,
        finishedAt: context.now().toISOString(),
        sourceReleaseVersion: verified.manifest.release.version,
        targetReleaseVersion: context.releaseVersion,
        checksumsVerified: true,
        databaseRestored,
        uploadsRestored,
        serviceReady,
        errorCode: null,
      });
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_RESTORE_REPORT_FAILED",
        "restore verification passed but its required report could not be persisted",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
    await clearLifecycleMarker(context, markerPath, marker);
    restoreCompleted = true;
    return {
      status: "completed",
      summary: "Backup restored into a clean ready instance",
      actions: plannedActions.map((item) => ({ ...item, status: "completed" })),
      details: {
        backupId: verified.manifest.backupId,
        restoreReport: reportPath,
        sourceReleaseVersion: verified.manifest.release.version,
        targetReleaseVersion: context.releaseVersion,
        fileCount: verified.fileCount,
        ready: true,
      },
    };
  } catch (error) {
    let known = normalizeManagementError(error);
    if (snapshotMayExist) {
      try {
        await removeRestoreSnapshot(context, snapshotLocation);
        snapshotMayExist = false;
      } catch (cleanupError) {
        const cleanupFailure = new SelfHostManagementError(
          "SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED",
          "restore failed and its private input snapshot could not be removed",
          SELF_HOST_CLI_EXIT.FILESYSTEM,
          { cause: new AggregateError([known, cleanupError]) },
        );
        if (cleanupFailure.code !== known.code) {
          queueSecondaryFailure(
            context,
            known,
            "Restore also failed before its private input snapshot cleanup failed",
          );
        }
        known = cleanupFailure;
      }
    }
    if (!restoreCompleted) {
      if (!(await lstatOrNull(markerPath))) {
        try {
          await writeJsonExclusive(context, markerPath, marker);
        } catch (markerError) {
          if (known.code !== "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED") {
            queueSecondaryFailure(
              context,
              known,
              "Restore also failed before its blocking marker could be re-armed",
            );
          }
          known = new SelfHostManagementError(
            "SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED",
            "restore failed and its blocking lifecycle marker could not be re-armed",
            SELF_HOST_CLI_EXIT.FILESYSTEM,
            { cause: markerError },
          );
        }
      }
      try {
        runDocker(
          context,
          [...composeArgs, "stop", "--timeout", "30"],
          "SELF_HOST_STOP_FAILED",
          { timeoutMs: 10 * 60_000 },
        );
      } catch (stopError) {
        queueSecondaryFailure(
          context,
          stopError,
          "Restore failure containment could not stop all services",
        );
      }
      try {
        await writeRestoreReport(context, dataRoot, {
          schemaVersion: 1,
          kind: "trainingload-selfhost-restore-report",
          restoreId: context.operationId,
          backupId: verified.manifest.backupId,
          status: "failed",
          startedAt: context.startedAt,
          finishedAt: context.now().toISOString(),
          sourceReleaseVersion: verified.manifest.release.version,
          targetReleaseVersion: context.releaseVersion,
          checksumsVerified: true,
          databaseRestored,
          uploadsRestored,
          serviceReady,
          errorCode: known.code,
        });
      } catch (reportError) {
        if (known.code !== "SELF_HOST_RESTORE_REPORT_FAILED") {
          queueSecondaryFailure(
            context,
            known,
            "Restore also failed before its required failure report could be persisted",
          );
        }
        throw new SelfHostManagementError(
          "SELF_HOST_RESTORE_REPORT_FAILED",
          "restore failed and its required report could not be persisted",
          SELF_HOST_CLI_EXIT.FILESYSTEM,
          { cause: reportError },
        );
      }
    }
    throw known;
  }
}

function releaseImagesFromConfig(config) {
  return {
    migrate: config.values.get("SELF_HOST_MIGRATE_IMAGE"),
    server: config.values.get("SELF_HOST_SERVER_IMAGE"),
    client: config.values.get("SELF_HOST_CLIENT_IMAGE"),
  };
}

function releaseImagesEqual(left, right) {
  return (
    left?.migrate === right?.migrate &&
    left?.server === right?.server &&
    left?.client === right?.client
  );
}

function releaseDescriptor(metadata, images) {
  return {
    version: metadata.version,
    configSchemaVersion: metadata.configSchemaVersion,
    composeSchemaVersion: metadata.composeSchemaVersion,
    schemaEpoch: metadata.schemaEpoch,
    sourceRevision: metadata.sourceRevision ?? null,
    images,
  };
}

function targetReleaseDescriptor(manifest) {
  return {
    version: manifest.releaseVersion,
    configSchemaVersion: manifest.configSchemaVersion,
    composeSchemaVersion: manifest.composeSchemaVersion,
    schemaEpoch: manifest.database.schemaEpoch,
    sourceRevision: manifest.source.revision,
    images: {
      migrate: manifest.images.migrate.reference,
      server: manifest.images.server.reference,
      client: manifest.images.client.reference,
    },
  };
}

function migrationIdentities(migrations) {
  return migrations.map(({ id, checksum }) => ({ id, checksum }));
}

function upgradeReportsDirectory(instanceDirectory) {
  return resolve(instanceDirectory, ".selfhost/upgrades");
}

async function writeUpgradeReport(context, report) {
  const directory = upgradeReportsDirectory(context.instanceDirectory);
  await ensurePrivateDirectory(directory);
  const safeTimestamp = context.startedAt.replace(/[:.]/g, "-");
  const path = resolve(
    directory,
    `${report.command}-${safeTimestamp}-${context.operationId}-${report.status}.json`,
  );
  await writeJsonExclusive(context, path, report, MAX_CONFIG_BYTES);
  return path;
}

async function writeRequiredFailureReport(context, report, originalError) {
  const original = normalizeManagementError(originalError);
  try {
    return await writeUpgradeReport(context, report);
  } catch (error) {
    if (original.code !== "SELF_HOST_UPGRADE_REPORT_FAILED") {
      queueSecondaryFailure(
        context,
        original,
        `${report.command} also failed before its required failure report could be persisted`,
      );
    }
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_REPORT_FAILED",
      `${report.command} failed with ${original.code}, and its required failure report could not be persisted`,
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
}

async function writeCurrentReleaseState(context, release) {
  const stateDirectory = resolve(context.instanceDirectory, ".selfhost");
  await ensurePrivateDirectory(stateDirectory);
  const path = currentReleaseStatePath(context.instanceDirectory);
  const payload = `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "trainingload-selfhost-current-release",
      releaseVersion: release.version,
      configSchemaVersion: release.configSchemaVersion,
      composeSchemaVersion: release.composeSchemaVersion,
      schemaEpoch: release.schemaEpoch,
      sourceRevision: release.sourceRevision,
      images: release.images,
      updatedAt: context.now().toISOString(),
    },
    null,
    2,
  )}\n`;
  if (await lstatOrNull(path)) await atomicReplace(path, payload, 0o600);
  else await writeJsonExclusive(context, path, JSON.parse(payload));
  return path;
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isReleaseDescriptor(value) {
  return (
    hasExactKeys(value, [
      "version",
      "configSchemaVersion",
      "composeSchemaVersion",
      "schemaEpoch",
      "sourceRevision",
      "images",
    ]) &&
    SEMVER_PATTERN.test(value.version ?? "") &&
    Number.isInteger(value.configSchemaVersion) &&
    value.configSchemaVersion >= 1 &&
    Number.isInteger(value.composeSchemaVersion) &&
    value.composeSchemaVersion >= 1 &&
    Number.isInteger(value.schemaEpoch) &&
    value.schemaEpoch >= 1 &&
    (value.sourceRevision === null ||
      /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.sourceRevision)) &&
    hasExactKeys(value.images, ["migrate", "server", "client"]) &&
    Object.values(value.images).every(
      (reference) =>
        typeof reference === "string" && OCI_IMAGE_REFERENCE.test(reference),
    )
  );
}

function isMigrationList(value, releaseInventory) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  let previousId = "";
  for (const migration of value) {
    const keys = releaseInventory
      ? ["id", "checksum", "phase", "releaseVersion"]
      : ["id", "checksum"];
    if (
      !hasExactKeys(migration, keys) ||
      !MIGRATION_ID_PATTERN.test(migration.id ?? "") ||
      !SHA256_PATTERN.test(migration.checksum ?? "") ||
      ids.has(migration.id) ||
      migration.id <= previousId ||
      (releaseInventory &&
        (!["baseline", "expand", "backfill", "contract"].includes(
          migration.phase,
        ) ||
          !SEMVER_PATTERN.test(migration.releaseVersion ?? "")))
    ) {
      return false;
    }
    ids.add(migration.id);
    previousId = migration.id;
  }
  return true;
}

function isUpgradeReport(value) {
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "kind",
      "lifecycleId",
      "command",
      "status",
      "startedAt",
      "finishedAt",
      "source",
      "target",
      "backup",
      "migrations",
      "applicationRollbackAllowed",
      "databaseRollback",
      "errorCode",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "trainingload-selfhost-upgrade-report" ||
    !UUID_PATTERN.test(value.lifecycleId ?? "") ||
    !["upgrade", "rollback"].includes(value.command) ||
    !["completed", "failed"].includes(value.status) ||
    !isIsoDateTime(value.startedAt) ||
    !isIsoDateTime(value.finishedAt) ||
    Date.parse(value.finishedAt) < Date.parse(value.startedAt) ||
    !isReleaseDescriptor(value.source) ||
    !isReleaseDescriptor(value.target) ||
    !hasExactKeys(value.migrations, ["before", "after", "target", "pending"]) ||
    !isMigrationList(value.migrations.before, false) ||
    !(
      value.migrations.after === null ||
      isMigrationList(value.migrations.after, false)
    ) ||
    !isMigrationList(value.migrations.target, true) ||
    !isMigrationList(value.migrations.pending, true) ||
    typeof value.applicationRollbackAllowed !== "boolean" ||
    value.databaseRollback !== "unsupported" ||
    (value.status === "completed"
      ? value.errorCode !== null || value.migrations.after === null
      : typeof value.errorCode !== "string" || value.errorCode.length === 0)
  ) {
    return false;
  }
  if (
    value.backup !== null &&
    (!hasExactKeys(value.backup, ["id", "path"]) ||
      !UUID_PATTERN.test(value.backup.id ?? "") ||
      typeof value.backup.path !== "string" ||
      !isAbsolute(value.backup.path))
  ) {
    return false;
  }
  const targetById = new Map(
    value.migrations.target.map((migration) => [migration.id, migration]),
  );
  if (
    value.source.version === value.target.version ||
    value.migrations.before.some((migration, index) => {
      const target = value.migrations.target[index];
      return (
        !target ||
        target.id !== migration.id ||
        target.checksum !== migration.checksum
      );
    }) ||
    !value.migrations.pending.every((migration) => {
      const target = targetById.get(migration.id);
      return (
        target &&
        target.checksum === migration.checksum &&
        target.phase === migration.phase &&
        target.releaseVersion === migration.releaseVersion
      );
    })
  ) {
    return false;
  }
  if (value.command !== "upgrade") return true;
  const expectedPending = value.migrations.target.slice(
    value.migrations.before.length,
  );
  const afterMatchesTarget =
    value.migrations.after === null ||
    (value.migrations.after.length === value.migrations.target.length &&
      value.migrations.after.every((migration, index) => {
        const target = value.migrations.target[index];
        return (
          target.id === migration.id && target.checksum === migration.checksum
        );
      }));
  return (
    JSON.stringify(value.migrations.pending) ===
      JSON.stringify(expectedPending) &&
    afterMatchesTarget &&
    (value.status !== "completed" || value.backup !== null)
  );
}

async function findUpgradeReport(instanceDirectory, predicate) {
  const directory = upgradeReportsDirectory(instanceDirectory);
  const stat = await lstatOrNull(directory);
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_STATE_INVALID",
      "upgrade report path is unsafe",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(
      directory,
      SELF_HOST_HISTORY_LIMITS.maximumUpgradeReportEntries,
    );
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_STATE_INVALID",
      "upgrade report history exceeds the supported scan limit",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
  const byteBudget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_HISTORY_LIMITS.maximumUpgradeReportBytes,
  };
  let selected = null;
  for (const name of entries
    .map((entry) => entry.name)
    .sort()
    .reverse()) {
    if (!/^upgrade-.*\.json$/.test(name)) continue;
    const path = resolve(directory, name);
    const file = await fs.lstat(path);
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.size > MAX_CONFIG_BYTES
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_STATE_INVALID",
        "upgrade report is unsafe or unexpectedly large",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
      );
    }
    let contents;
    try {
      contents = (
        await readRegularFileBounded(path, {
          maximumBytes: MAX_CONFIG_BYTES,
          expectedSizeBytes: file.size,
          label: "upgrade report",
        })
      ).contents;
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_STATE_INVALID",
        "upgrade report is unreadable",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
    try {
      consumeByteBudget(byteBudget, contents.length);
    } catch (error) {
      if (!(error instanceof CumulativeByteLimitError)) throw error;
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_STATE_INVALID",
        "upgrade report history exceeds the supported byte limit",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
    try {
      const report = JSON.parse(contents.toString("utf8"));
      if (!isUpgradeReport(report) || report.command !== "upgrade") {
        throw new Error("unexpected upgrade report content");
      }
      if (selected === null && predicate(report)) selected = report;
    } catch (error) {
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_STATE_INVALID",
        "upgrade report is unreadable",
        SELF_HOST_CLI_EXIT.FILESYSTEM,
        { cause: error },
      );
    }
  }
  return selected;
}

async function readUpgradeMarker(instanceDirectory) {
  const path = upgradeMarkerPath(instanceDirectory);
  const stat = await lstatOrNull(path);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CONFIG_BYTES) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_STATE_INVALID",
      "upgrade marker is not a safe regular file",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
    );
  }
  try {
    const { contents } = await readRegularFileBounded(path, {
      maximumBytes: MAX_CONFIG_BYTES,
      expectedSizeBytes: stat.size,
      label: "upgrade marker",
    });
    const marker = JSON.parse(contents.toString("utf8"));
    const isUpgrade =
      marker?.kind === "trainingload-selfhost-upgrade-incomplete";
    const expectedKeys = isUpgrade
      ? [
          "schemaVersion",
          "kind",
          "lifecycleId",
          "sourceVersion",
          "targetVersion",
          "backupId",
          "backupPath",
          "startedAt",
        ]
      : [
          "schemaVersion",
          "kind",
          "lifecycleId",
          "sourceVersion",
          "targetVersion",
          "startedAt",
        ];
    if (
      !hasExactKeys(marker, expectedKeys) ||
      marker.schemaVersion !== 1 ||
      ![
        "trainingload-selfhost-upgrade-incomplete",
        "trainingload-selfhost-rollback-incomplete",
      ].includes(marker.kind) ||
      !UUID_PATTERN.test(marker.lifecycleId ?? "") ||
      !SEMVER_PATTERN.test(marker.sourceVersion ?? "") ||
      !SEMVER_PATTERN.test(marker.targetVersion ?? "") ||
      marker.sourceVersion === marker.targetVersion ||
      !isIsoDateTime(marker.startedAt) ||
      (isUpgrade &&
        (!UUID_PATTERN.test(marker.backupId ?? "") ||
          typeof marker.backupPath !== "string" ||
          !isAbsolute(marker.backupPath)))
    ) {
      throw new Error("unexpected upgrade marker content");
    }
    return marker;
  } catch (error) {
    if (error instanceof SelfHostManagementError) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_STATE_INVALID",
      "upgrade marker is unreadable or incompatible",
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
}

function verifyPulledImage(context, reference) {
  runDocker(
    context,
    ["pull", reference],
    "SELF_HOST_UPGRADE_IMAGE_PULL_FAILED",
    {
      timeoutMs: 30 * 60_000,
    },
  );
  const inspected = runDocker(
    context,
    ["image", "inspect", "--format", "{{json .RepoDigests}}", reference],
    "SELF_HOST_UPGRADE_IMAGE_VERIFY_FAILED",
  );
  let digests;
  try {
    digests = JSON.parse(inspected.stdout.trim());
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_IMAGE_VERIFY_FAILED",
      "Docker returned unreadable image digest metadata",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
      { cause: error },
    );
  }
  if (!Array.isArray(digests) || !digests.includes(reference)) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_IMAGE_VERIFY_FAILED",
      "pulled image is not bound to the release manifest digest",
      SELF_HOST_CLI_EXIT.COMMAND_FAILED,
    );
  }
}

function verifyReleaseEvidenceSignature(context, verification) {
  requireCommandSuccess(
    "SELF_HOST_COSIGN_UNAVAILABLE",
    context.runner("cosign", ["version"], {
      cwd: context.instanceDirectory,
      env: context.env,
    }),
    context.secrets,
  );
  requireCommandSuccess(
    "SELF_HOST_UPGRADE_SIGNATURE_INVALID",
    context.runner(
      "cosign",
      [
        "verify-blob",
        "--bundle",
        verification.bundlePath,
        "--certificate-identity",
        verification.identity,
        "--certificate-oidc-issuer",
        verification.oidcIssuer,
        verification.checksumsPath,
      ],
      {
        cwd: context.instanceDirectory,
        env: context.env,
        timeoutMs: 5 * 60_000,
      },
    ),
    context.secrets,
  );
}

function upgradeReportPayload({
  context,
  command,
  status,
  source,
  target,
  backupResult,
  beforeMigrations,
  afterMigrations,
  pendingMigrations,
  applicationRollbackAllowed,
  errorCode,
}) {
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-upgrade-report",
    lifecycleId: context.operationId,
    command,
    status,
    startedAt: context.startedAt,
    finishedAt: context.now().toISOString(),
    source,
    target,
    backup: backupResult
      ? {
          id: backupResult.details.backupId,
          path: backupResult.details.backupPath,
        }
      : null,
    migrations: {
      before: beforeMigrations,
      after: afterMigrations,
      target: pendingMigrations.target,
      pending: pendingMigrations.pending,
    },
    applicationRollbackAllowed,
    databaseRollback: "unsupported",
    errorCode,
  };
}

async function upgrade(context) {
  await assertNoIncompleteLifecycle(context);
  const { config, versions, composeArgs } = await composeContext(context);
  const beforeStatus = statusDetails(
    readComposeRows(context, composeArgs),
    versions,
    config,
  );
  if (!beforeStatus.ready) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_REQUIRES_READY_INSTANCE",
      "upgrade requires a ready source instance",
      SELF_HOST_CLI_EXIT.UNHEALTHY,
    );
  }
  const evidencePath = resolve(
    context.invocationDirectory,
    context.releasePath,
  );
  let verifiedRelease;
  try {
    verifiedRelease = await context.releaseVerifier(evidencePath, {
      verifySignature: (verification) =>
        verifyReleaseEvidenceSignature(context, verification),
    });
    if (verifiedRelease?.signatureVerified !== true) {
      throw new Error("release evidence signature was not verified");
    }
  } catch (error) {
    if (error instanceof SelfHostManagementError) throw error;
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_RELEASE_INVALID",
      "target release manifest, checksums, or supply-chain evidence is invalid",
      SELF_HOST_CLI_EXIT.CONFIG,
      { cause: error },
    );
  }
  const sourceMetadata = await readReleaseMetadata(context.instanceDirectory);
  const configuredSourceImages = releaseImagesFromConfig(config);
  const source = releaseDescriptor(sourceMetadata, configuredSourceImages);
  if (
    config.values.get("SELF_HOST_VERSION") !== source.version ||
    (sourceMetadata.images &&
      !releaseImagesEqual(sourceMetadata.images, configuredSourceImages))
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_STATE_INVALID",
      "configured and recorded source release versions or images do not match",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  const databaseBefore = readDatabaseInventory(context, composeArgs, config);
  let plan;
  try {
    plan = createUpgradePlan({
      current: {
        releaseVersion: source.version,
        configSchemaVersion: source.configSchemaVersion,
        composeSchemaVersion: source.composeSchemaVersion,
        schemaEpoch: source.schemaEpoch,
      },
      target: verifiedRelease.manifest,
      appliedMigrations: databaseBefore.migrations,
      acceptNoApplicationRollback: context.acceptNoApplicationRollback,
      sourceImagesImmutable: Object.values(configuredSourceImages).every(
        (reference) => /@sha256:[a-f0-9]{64}$/.test(reference),
      ),
    });
  } catch (error) {
    throw new SelfHostManagementError(
      "SELF_HOST_UPGRADE_INCOMPATIBLE",
      error instanceof Error ? error.message : "release is incompatible",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      { cause: error },
    );
  }
  const dataRoot = resolveDataRoot(context.instanceDirectory, config.values);
  const uploadBytes = readUploadUsage(context, composeArgs);
  const requiredBytes = checkedByteEstimate("SELF_HOST_UPGRADE_SIZE_INVALID", [
    { bytes: databaseBefore.sizeBytes, multiplier: 2 },
    { bytes: uploadBytes },
    { bytes: BACKUP_DISK_RESERVE_BYTES },
    { bytes: UPGRADE_IMAGE_RESERVE_BYTES },
  ]);
  const freeBytes = await requireDiskSpace(
    context,
    resolve(dataRoot, "backups"),
    requiredBytes,
    "SELF_HOST_UPGRADE_DISK_SPACE_INSUFFICIENT",
  );
  const target = targetReleaseDescriptor(verifiedRelease.manifest);
  const plannedActions = [
    action(
      "VERIFY_RELEASE",
      "completed",
      "Verify release evidence and compatibility",
    ),
    action(
      "BACKUP_INSTANCE",
      "planned",
      "Create and verify a pre-upgrade backup",
    ),
    action("PULL_IMAGES", "planned", "Pull each application image by digest"),
    action(
      "APPLY_MIGRATIONS",
      "planned",
      "Apply declared expand-contract migrations",
    ),
    action("VERIFY_UPGRADE", "planned", "Verify migrations and full readiness"),
  ];
  if (context.dryRun) {
    return {
      status: "planned",
      summary:
        "Upgrade is planned; no images, data, config, or services were changed",
      actions: plannedActions,
      details: {
        sourceVersion: source.version,
        targetVersion: target.version,
        pendingMigrations: plan.pendingMigrations.map(({ id, phase }) => ({
          id,
          phase,
        })),
        applicationRollbackAllowed: plan.applicationRollbackAllowed,
        databaseRollback: plan.databaseRollback,
        requiredBytes,
        freeBytes,
      },
    };
  }

  let backupResult = null;
  let markerWritten = false;
  let configSwitched = false;
  let databaseAfter = null;
  const markerPath = upgradeMarkerPath(context.instanceDirectory);
  const previousOutput = context.output;
  try {
    context.output = `pre-upgrade-${target.version}-${context.operationId.slice(0, 8)}`;
    backupResult = await backup(context);
    context.output = previousOutput;
    for (const reference of Object.values(target.images)) {
      verifyPulledImage(context, reference);
    }
    await ensurePrivateDirectory(
      resolve(context.instanceDirectory, ".selfhost"),
    );
    const marker = {
      schemaVersion: 1,
      kind: "trainingload-selfhost-upgrade-incomplete",
      lifecycleId: context.operationId,
      sourceVersion: source.version,
      targetVersion: target.version,
      backupId: backupResult.details.backupId,
      backupPath: backupResult.details.backupPath,
      startedAt: context.startedAt,
    };
    await writeJsonExclusive(context, markerPath, marker);
    markerWritten = true;
    const targetConfigText = replaceEnvironmentSettings(config.text, {
      SELF_HOST_MIGRATE_IMAGE: target.images.migrate,
      SELF_HOST_SERVER_IMAGE: target.images.server,
      SELF_HOST_CLIENT_IMAGE: target.images.client,
      SELF_HOST_VERSION: target.version,
    });
    const targetConfigValues = validateSelfHostEnvironment(
      parseEnvironmentFile(targetConfigText),
    );
    await validateDataRootBoundary(
      context.instanceDirectory,
      targetConfigValues,
    );
    await atomicReplace(config.configPath, targetConfigText, 0o600);
    await replaceComposeEnvironmentSnapshot(context, targetConfigText);
    configSwitched = true;
    runDocker(
      context,
      [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "600"],
      "SELF_HOST_UPGRADE_START_FAILED",
      { timeoutMs: 20 * 60_000 },
    );
    const ready = statusDetails(
      readComposeRows(context, composeArgs),
      versions,
      config,
    );
    if (!ready.ready) {
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_NOT_READY",
        "target release did not become ready",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    const targetConfig = await readConfig(context.instanceDirectory);
    databaseAfter = readDatabaseInventory(context, composeArgs, targetConfig);
    if (
      !migrationsEqual(
        databaseAfter.migrations,
        migrationIdentities(verifiedRelease.manifest.database.migrations),
      )
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_UPGRADE_MIGRATION_VERIFICATION_FAILED",
        "applied migration inventory does not match the target release",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    await writeCurrentReleaseState(context, target);
    const reportPath = await writeUpgradeReport(
      context,
      upgradeReportPayload({
        context,
        command: "upgrade",
        status: "completed",
        source,
        target,
        backupResult,
        beforeMigrations: databaseBefore.migrations,
        afterMigrations: databaseAfter.migrations,
        pendingMigrations: {
          target: verifiedRelease.manifest.database.migrations,
          pending: plan.pendingMigrations,
        },
        applicationRollbackAllowed: plan.applicationRollbackAllowed,
        errorCode: null,
      }),
    );
    await clearLifecycleMarker(context, markerPath, marker);
    context.releaseVersion = target.version;
    return {
      status: "completed",
      summary: "Self-host instance upgraded and verified",
      actions: plannedActions.map((item) => ({ ...item, status: "completed" })),
      details: {
        sourceVersion: source.version,
        targetVersion: target.version,
        backupPath: backupResult.details.backupPath,
        upgradeReport: reportPath,
        applicationRollbackAllowed: plan.applicationRollbackAllowed,
        databaseRollback: "unsupported",
        ready: true,
      },
    };
  } catch (error) {
    context.output = previousOutput;
    const known = normalizeManagementError(error);
    if (markerWritten || configSwitched) {
      try {
        runDocker(
          context,
          [
            ...composeArgs,
            "stop",
            "--timeout",
            "30",
            "client",
            "server",
          ],
          "SELF_HOST_STOP_FAILED",
          { timeoutMs: 10 * 60_000 },
        );
      } catch (stopError) {
        queueSecondaryFailure(
          context,
          stopError,
          "Upgrade failure containment could not stop application services",
        );
      }
    }
    await writeRequiredFailureReport(
      context,
      upgradeReportPayload({
        context,
        command: "upgrade",
        status: "failed",
        source,
        target,
        backupResult,
        beforeMigrations: databaseBefore.migrations,
        afterMigrations: databaseAfter?.migrations ?? null,
        pendingMigrations: {
          target: verifiedRelease.manifest.database.migrations,
          pending: plan.pendingMigrations,
        },
        applicationRollbackAllowed: plan.applicationRollbackAllowed,
        errorCode: known.code,
      }),
      known,
    );
    throw known;
  }
}

function isRollbackSourceReport(
  report,
  currentVersion,
  requestedVersion,
  incomplete,
) {
  const markerMatches =
    !incomplete ||
    (incomplete.kind === "trainingload-selfhost-upgrade-incomplete" &&
      incomplete.sourceVersion === report?.source?.version &&
      incomplete.targetVersion === report?.target?.version &&
      incomplete.backupId === report?.backup?.id &&
      incomplete.backupPath === report?.backup?.path) ||
    (incomplete.kind === "trainingload-selfhost-rollback-incomplete" &&
      incomplete.sourceVersion === report?.target?.version &&
      incomplete.targetVersion === report?.source?.version);
  return (
    report?.schemaVersion === 1 &&
    report.kind === "trainingload-selfhost-upgrade-report" &&
    report.command === "upgrade" &&
    ["completed", "failed"].includes(report.status) &&
    report.source?.version === requestedVersion &&
    markerMatches &&
    (report.target?.version === currentVersion ||
      (incomplete && report.source.version === currentVersion))
  );
}

async function rollback(context) {
  const { config, versions, composeArgs } = await composeContext(context);
  const currentVersion = config.values.get("SELF_HOST_VERSION");
  const incomplete = await readUpgradeMarker(context.instanceDirectory);
  const report = await findUpgradeReport(
    context.instanceDirectory,
    (candidate) =>
      isRollbackSourceReport(
        candidate,
        currentVersion,
        context.rollbackVersion,
        incomplete,
      ),
  );
  if (!report) {
    throw new SelfHostManagementError(
      "SELF_HOST_ROLLBACK_SOURCE_NOT_FOUND",
      "no matching upgrade report can prove the requested application rollback",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  if (!report.applicationRollbackAllowed) {
    throw new SelfHostManagementError(
      "SELF_HOST_ROLLBACK_UNSUPPORTED",
      "the target release did not declare application rollback to this version",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  const expectedCurrentImages =
    currentVersion === report.target.version
      ? report.target.images
      : report.source.images;
  if (
    !releaseImagesEqual(releaseImagesFromConfig(config), expectedCurrentImages)
  ) {
    throw new SelfHostManagementError(
      "SELF_HOST_ROLLBACK_STATE_INVALID",
      "configured application images do not match the recorded rollback lifecycle",
      SELF_HOST_CLI_EXIT.STATE_CONFLICT,
    );
  }
  const databaseCurrent = readDatabaseInventory(context, composeArgs, config);
  const targetMap = new Map(
    report.migrations.target.map((migration) => [migration.id, migration]),
  );
  const sourceIds = new Set(
    report.migrations.before.map((migration) => migration.id),
  );
  for (const migration of databaseCurrent.migrations) {
    const declared = targetMap.get(migration.id);
    if (
      declared?.checksum !== migration.checksum ||
      (!sourceIds.has(migration.id) && declared.phase === "contract")
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_ROLLBACK_DATABASE_INCOMPATIBLE",
        "current database migrations are not safe for the declared application rollback",
        SELF_HOST_CLI_EXIT.STATE_CONFLICT,
      );
    }
  }
  const plannedActions = [
    action(
      "VALIDATE_ROLLBACK",
      "completed",
      "Verify immutable upgrade record and database compatibility",
    ),
    action(
      "SWITCH_APPLICATION",
      "planned",
      "Switch application images without downgrading the database",
    ),
    action("VERIFY_ROLLBACK", "planned", "Verify source application readiness"),
  ];
  if (context.dryRun) {
    return {
      status: "planned",
      summary:
        "Application rollback is planned; database downgrade is not performed",
      actions: plannedActions,
      details: {
        sourceVersion: currentVersion,
        targetVersion: report.source.version,
        applicationRollbackAllowed: true,
        databaseRollback: "unsupported",
        backupPath: report.backup?.path ?? null,
      },
    };
  }
  const markerPath = upgradeMarkerPath(context.instanceDirectory);
  const marker = incomplete ?? {
    schemaVersion: 1,
    kind: "trainingload-selfhost-rollback-incomplete",
    lifecycleId: context.operationId,
    sourceVersion: currentVersion,
    targetVersion: report.source.version,
    startedAt: context.startedAt,
  };
  if (!incomplete) {
    await writeJsonExclusive(context, markerPath, marker);
  }
  try {
    for (const reference of Object.values(report.source.images)) {
      const inspected = context.runner(
        "docker",
        ["image", "inspect", reference],
        { cwd: context.instanceDirectory, env: context.env },
      );
      requireCommandSuccess(
        "SELF_HOST_ROLLBACK_IMAGE_MISSING",
        inspected,
        context.secrets,
      );
    }
    const rollbackConfigText = replaceEnvironmentSettings(config.text, {
      SELF_HOST_MIGRATE_IMAGE: report.source.images.migrate,
      SELF_HOST_SERVER_IMAGE: report.source.images.server,
      SELF_HOST_CLIENT_IMAGE: report.source.images.client,
      SELF_HOST_VERSION: report.source.version,
    });
    const rollbackConfigValues = validateSelfHostEnvironment(
      parseEnvironmentFile(rollbackConfigText),
    );
    await validateDataRootBoundary(
      context.instanceDirectory,
      rollbackConfigValues,
    );
    await atomicReplace(config.configPath, rollbackConfigText, 0o600);
    await replaceComposeEnvironmentSnapshot(context, rollbackConfigText);
    runDocker(
      context,
      [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "600"],
      "SELF_HOST_ROLLBACK_START_FAILED",
      { timeoutMs: 20 * 60_000 },
    );
    const ready = statusDetails(
      readComposeRows(context, composeArgs),
      versions,
      config,
    );
    if (!ready.ready) {
      throw new SelfHostManagementError(
        "SELF_HOST_ROLLBACK_NOT_READY",
        "rollback application release did not become ready",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    const rolledBackConfig = await readConfig(context.instanceDirectory);
    const databaseAfter = readDatabaseInventory(
      context,
      composeArgs,
      rolledBackConfig,
    );
    if (
      !migrationsEqual(databaseAfter.migrations, databaseCurrent.migrations)
    ) {
      throw new SelfHostManagementError(
        "SELF_HOST_ROLLBACK_DATABASE_CHANGED",
        "application rollback unexpectedly changed database migration state",
        SELF_HOST_CLI_EXIT.UNHEALTHY,
      );
    }
    await writeCurrentReleaseState(context, report.source);
    const rollbackReport = await writeUpgradeReport(
      context,
      upgradeReportPayload({
        context,
        command: "rollback",
        status: "completed",
        source: report.target,
        target: report.source,
        backupResult: report.backup
          ? {
              details: {
                backupId: report.backup.id,
                backupPath: report.backup.path,
              },
            }
          : null,
        beforeMigrations: databaseCurrent.migrations,
        afterMigrations: databaseAfter.migrations,
        pendingMigrations: { target: report.migrations.target, pending: [] },
        applicationRollbackAllowed: true,
        errorCode: null,
      }),
    );
    await clearLifecycleMarker(context, markerPath, marker);
    context.releaseVersion = report.source.version;
    return {
      status: "completed",
      summary:
        "Application release rolled back; database was left forward-only",
      actions: plannedActions.map((item) => ({ ...item, status: "completed" })),
      details: {
        sourceVersion: currentVersion,
        targetVersion: report.source.version,
        rollbackReport,
        backupPath: report.backup?.path ?? null,
        databaseRollback: "unsupported",
        ready: true,
      },
    };
  } catch (error) {
    const known = normalizeManagementError(error);
    try {
      runDocker(
        context,
        [
          ...composeArgs,
          "stop",
          "--timeout",
          "30",
          "client",
          "server",
        ],
        "SELF_HOST_STOP_FAILED",
        { timeoutMs: 10 * 60_000 },
      );
    } catch (stopError) {
      queueSecondaryFailure(
        context,
        stopError,
        "Rollback failure containment could not stop application services",
      );
    }
    await writeRequiredFailureReport(
      context,
      upgradeReportPayload({
        context,
        command: "rollback",
        status: "failed",
        source: report.target,
        target: report.source,
        backupResult: report.backup
          ? {
              details: {
                backupId: report.backup.id,
                backupPath: report.backup.path,
              },
            }
          : null,
        beforeMigrations: databaseCurrent.migrations,
        afterMigrations: null,
        pendingMigrations: { target: report.migrations.target, pending: [] },
        applicationRollbackAllowed: true,
        errorCode: known.code,
      }),
      known,
    );
    throw known;
  }
}

function operationRecord(result) {
  return {
    schemaVersion: SELF_HOST_CLI_SCHEMA_VERSION,
    operationId: result.operationId,
    command: result.command,
    status: result.status,
    ok: result.ok,
    exitCode: result.exitCode,
    dryRun: result.dryRun,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    releaseVersion: result.releaseVersion,
    actionCodes: result.actions.map((item) => item.code),
    errorCode: result.error?.code ?? null,
  };
}

async function writeOperationRecord(instanceDirectory, result) {
  const stateDirectory = resolve(instanceDirectory, ".selfhost");
  const operationsDirectory = resolve(stateDirectory, "operations");
  await ensurePrivateDirectory(stateDirectory);
  await ensurePrivateDirectory(operationsDirectory);
  const safeTimestamp = result.startedAt.replace(/[:.]/g, "-");
  const path = resolve(
    operationsDirectory,
    `${safeTimestamp}-${result.operationId}.json`,
  );
  await atomicWrite(
    path,
    `${JSON.stringify(operationRecord(result), null, 2)}\n`,
  );
  return path;
}

function resultEnvelope(context, outcome, finishedAt) {
  return {
    schemaVersion: SELF_HOST_CLI_SCHEMA_VERSION,
    operationId: context.operationId,
    command: context.command,
    status: outcome.status,
    ok: outcome.status !== "failed",
    exitCode:
      outcome.status === "failed" ? outcome.exitCode : SELF_HOST_CLI_EXIT.OK,
    dryRun: context.dryRun,
    startedAt: context.startedAt,
    finishedAt,
    releaseVersion: context.releaseVersion,
    summary: outcome.summary,
    actions: outcome.actions ?? [],
    details: outcome.details ?? {},
    error: outcome.error ?? null,
    operationRecord: null,
  };
}

function normalizeManagementError(error) {
  if (error instanceof SelfHostManagementError) return error;
  if (isFilesystemErrorCode(error?.code)) {
    return new SelfHostManagementError(
      "SELF_HOST_FILESYSTEM_ERROR",
      `${error.code}: a required filesystem operation failed`,
      SELF_HOST_CLI_EXIT.FILESYSTEM,
      { cause: error },
    );
  }
  return new SelfHostManagementError(
    "SELF_HOST_INTERNAL_ERROR",
    "The self-host management command failed unexpectedly",
    SELF_HOST_CLI_EXIT.INTERNAL,
    { cause: error },
  );
}

function appendSecondaryFailure(outcome, error, message) {
  const known = normalizeManagementError(error);
  const secondaryFailures = Array.isArray(outcome.details?.secondaryFailures)
    ? outcome.details.secondaryFailures
    : [];
  return {
    ...outcome,
    actions: [
      ...(outcome.actions ?? []),
      action(known.code, "failed", message),
    ],
    details: {
      ...(outcome.details ?? {}),
      secondaryFailures: [
        ...secondaryFailures,
        {
          code: known.code,
          exitCode: known.exitCode,
          retryable: selfHostErrorDefinition(known.code)?.retryable ?? false,
        },
      ],
    },
  };
}

function queueSecondaryFailure(context, error, message) {
  const known = normalizeManagementError(error);
  if (
    context.secondaryFailures.some(
      (secondary) => secondary.error.code === known.code,
    )
  ) {
    return;
  }
  context.secondaryFailures.push({ error: known, message });
}

export async function executeManagementCommand(options, dependencies = {}) {
  if (!COMMANDS.has(options.command)) {
    throw usageError(`unknown command: ${options.command}`);
  }
  const cwd = dependencies.cwd ?? process.cwd();
  const instanceDirectory = resolve(cwd, options.directory ?? ".");
  const now = dependencies.now ?? (() => new Date());
  const context = {
    ...options,
    invocationDirectory: cwd,
    instanceDirectory,
    operationId: (dependencies.randomUUID ?? randomUUID)(),
    startedAt: now().toISOString(),
    releaseVersion: "unknown",
    env: dependencies.env ?? process.env,
    runner: dependencies.runner ?? defaultCommandRunner,
    streamRunner: dependencies.streamRunner ?? defaultStreamRunner,
    releaseVerifier:
      dependencies.releaseVerifier ?? verifySelfHostReleaseBundle,
    lookup: dependencies.lookup ?? nodeLookup,
    fetcher: dependencies.fetcher ?? ((...args) => globalThis.fetch(...args)),
    portAvailable:
      dependencies.portAvailable ??
      ((bind, port) => probeTcpPort(bind, port, createNetServer)),
    statfs: dependencies.statfs ?? fs.statfs,
    stdinIsTTY: dependencies.stdinIsTTY ?? Boolean(process.stdin.isTTY),
    hostUid:
      dependencies.hostUid ??
      (typeof process.getuid === "function" ? process.getuid() : null),
    hostGid:
      dependencies.hostGid ??
      (typeof process.getgid === "function" ? process.getgid() : null),
    hostPlatform: dependencies.hostPlatform ?? hostPlatform,
    hostArchitecture: dependencies.hostArchitecture ?? hostArchitecture,
    processId: dependencies.processId ?? process.pid,
    processAlive: dependencies.processAlive ?? defaultProcessAlive,
    now,
    randomBytes: dependencies.randomBytes ?? nodeRandomBytes,
    atomicWrite: dependencies.atomicWrite ?? atomicWrite,
    syncDirectory: dependencies.syncDirectory ?? syncDirectory,
    backupPublishSync: dependencies.backupPublishSync ?? syncDirectory,
    backupCleanupSync: dependencies.backupCleanupSync ?? syncDirectory,
    diagnosticsCleanupSync:
      dependencies.diagnosticsCleanupSync ?? syncDirectory,
    operationLockSync: dependencies.operationLockSync ?? syncDirectory,
    removeDiagnosticsArtifact:
      dependencies.removeDiagnosticsArtifact ?? fs.unlink,
    removeTree: dependencies.removeTree ?? fs.rm,
    renameDataRoot: dependencies.renameDataRoot ?? fs.rename,
    authenticatedBundle: dependencies.authenticatedBundle ?? null,
    secondaryFailures: [],
    secrets: [],
    composeDefinitions: null,
    composeInputSnapshot: null,
  };

  let outcome;
  let canWriteOperationRecord = false;
  let operationLock = null;
  try {
    const directoryStat = await lstatOrNull(instanceDirectory);
    if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new SelfHostManagementError(
        "SELF_HOST_INSTANCE_DIRECTORY_INVALID",
        "--directory must point to an existing real release directory",
        SELF_HOST_CLI_EXIT.CONFIG,
      );
    }
    canWriteOperationRecord = !(
      context.dryRun && dependencies.suppressOperationRecord === true
    );
    if (!context.dryRun && SERIALIZED_MUTATION_COMMANDS.has(context.command)) {
      operationLock = await acquireOperationLock(context);
    }
    if (context.authenticatedBundle) {
      const authenticated = context.authenticatedBundle;
      if (
        resolve(authenticated.root) !== instanceDirectory ||
        authenticated.signatureVerified !== true ||
        !(authenticated.checksums instanceof Map) ||
        !SEMVER_PATTERN.test(authenticated.manifest?.releaseVersion ?? "")
      ) {
        throw new SelfHostManagementError(
          "SELF_HOST_RELEASE_STATE_INVALID",
          "the authenticated release context is invalid or mismatched",
          SELF_HOST_CLI_EXIT.FILESYSTEM,
        );
      }
      context.releaseVersion = authenticated.manifest.releaseVersion;
    } else {
      context.releaseVersion = await readReleaseVersion(instanceDirectory);
    }
    outcome = await {
      init: initialize,
      doctor,
      diagnostics,
      start,
      status,
      logs,
      backup,
      restore,
      upgrade,
      rollback,
      stop,
      "owner-bootstrap": ownerBootstrap,
      "owner-recovery": ownerRecovery,
      uninstall,
    }[context.command](context);
  } catch (error) {
    const known = normalizeManagementError(error);
    outcome = {
      status: "failed",
      exitCode: known.exitCode,
      summary: known.code,
      actions: [],
      details: {},
      error: {
        code: known.code,
        message: redactWithSecrets(known.message, context.secrets),
        retryable: selfHostErrorDefinition(known.code)?.retryable ?? false,
      },
    };
    for (const secondary of context.secondaryFailures) {
      outcome = appendSecondaryFailure(
        outcome,
        secondary.error,
        secondary.message,
      );
    }
  }

  if (context.composeInputSnapshot) {
    try {
      await removeComposeInputSnapshot(context);
    } catch (error) {
      if (outcome.status === "failed") {
        outcome = appendSecondaryFailure(
          outcome,
          error,
          "Private Compose input snapshot cleanup also failed; inspect .selfhost before retrying",
        );
      } else {
        const known = normalizeManagementError(error);
        outcome = {
          status: "failed",
          exitCode: known.exitCode,
          summary: known.code,
          actions: outcome.actions ?? [],
          details: outcome.details ?? {},
          error: {
            code: known.code,
            message: redactWithSecrets(known.message, context.secrets),
            retryable: selfHostErrorDefinition(known.code)?.retryable ?? false,
          },
        };
      }
    }
  }

  if (operationLock) {
    try {
      await releaseOperationLock(context, operationLock);
    } catch (error) {
      if (outcome.status === "failed") {
        outcome = appendSecondaryFailure(
          outcome,
          error,
          "Operation lock release also failed; run doctor before retrying",
        );
      } else {
        const known = normalizeManagementError(error);
        outcome = {
          status: "failed",
          exitCode: known.exitCode,
          summary: known.code,
          actions: outcome.actions ?? [],
          details: outcome.details ?? {},
          error: {
            code: known.code,
            message: redactWithSecrets(known.message, context.secrets),
            retryable: selfHostErrorDefinition(known.code)?.retryable ?? false,
          },
        };
      }
    }
  }

  let result = resultEnvelope(context, outcome, now().toISOString());
  if (!canWriteOperationRecord) return result;
  try {
    const path = await writeOperationRecord(instanceDirectory, result);
    result.operationRecord = path.slice(instanceDirectory.length + 1);
  } catch {
    const commandFailure =
      result.status === "failed" && result.error
        ? {
            code: result.error.code,
            exitCode: result.exitCode,
            retryable: result.error.retryable,
          }
        : null;
    result = resultEnvelope(
      context,
      {
        status: "failed",
        exitCode: SELF_HOST_CLI_EXIT.FILESYSTEM,
        summary: "SELF_HOST_OPERATION_RECORD_FAILED",
        actions: commandFailure
          ? [
              ...result.actions,
              action(
                commandFailure.code,
                "failed",
                "Command also failed before its required operation record could be persisted",
              ),
            ]
          : result.actions,
        details: commandFailure
          ? { ...result.details, commandFailure }
          : result.details,
        error: {
          code: "SELF_HOST_OPERATION_RECORD_FAILED",
          message: "Could not persist the required redacted operation record",
          retryable: false,
        },
      },
      now().toISOString(),
    );
  }
  return result;
}

export function renderHumanResult(result) {
  const lines = [
    `[${result.status}] self-host ${result.command}: ${result.summary}`,
  ];
  for (const item of result.actions) {
    lines.push(`- ${item.status}: ${item.message} (${item.code})`);
  }
  if (
    result.command === "status" ||
    result.command === "start" ||
    result.command === "stop" ||
    result.command === "uninstall"
  ) {
    for (const service of result.details.services ?? []) {
      lines.push(
        `- ${service.name}: ${service.state}${service.health ? `/${service.health}` : ""}`,
      );
    }
  }
  if (result.command === "logs") {
    lines.push(...(result.details.lines ?? []));
  }
  if (result.command === "backup" && result.details.backupPath) {
    lines.push(`backup: ${result.details.backupPath}`);
  }
  if (result.command === "restore" && result.details.restoreReport) {
    lines.push(`restore report: ${result.details.restoreReport}`);
  }
  if (result.command === "upgrade" && result.details.upgradeReport) {
    lines.push(`upgrade report: ${result.details.upgradeReport}`);
  }
  if (result.command === "rollback" && result.details.rollbackReport) {
    lines.push(`rollback report: ${result.details.rollbackReport}`);
  }
  if (result.command === "doctor" && result.details.doctor) {
    lines.push(`doctor: ${result.details.doctor.overall}`);
    for (const check of result.details.doctor.checks) {
      lines.push(`  [${check.status}] ${check.code}: ${check.summary}`);
    }
  }
  if (result.command === "diagnostics" && result.details.diagnosticsPath) {
    lines.push(`diagnostics: ${result.details.diagnosticsPath}`);
    lines.push(
      `included fields: ${(result.details.includedFields ?? []).join(", ")}`,
    );
    lines.push(`secret scan: ${result.details.secretScan}`);
    if (result.details.operatorReviewRequired) {
      lines.push("operator review required before sharing: yes");
    }
  }
  if (result.error)
    lines.push(`error: ${result.error.code}: ${result.error.message}`);
  if (result.operationRecord)
    lines.push(`operation record: ${result.operationRecord}`);
  return `${lines.join("\n")}\n`;
}
