#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRegularFileBounded } from "./backup-artifact.mjs";
import {
  executeManagementCommand,
  parseManagementArguments,
  renderHumanResult,
  SELF_HOST_CLI_EXIT,
  SELF_HOST_CLI_SCHEMA_VERSION,
  SelfHostManagementError,
} from "./management-core.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MAX_RELEASE_METADATA_BYTES = 1024 * 1024;
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const help = `Trainingload self-host management CLI

Usage:
  self-host init [--dry-run] [--json] [--directory <release-dir>]
  self-host doctor [--json] [--directory <release-dir>]
  self-host diagnostics [--output <name>] [--tail <1-5000>] [--service <name>] [--dry-run] [--json] [--directory <release-dir>]
  self-host start [--source] [--dry-run] [--json] [--directory <release-dir>]
  self-host status [--dry-run] [--json] [--directory <release-dir>]
  self-host logs [--tail <1-5000>] [--service <name>] [--dry-run] [--json] [--directory <release-dir>]
  self-host backup [--output <name>] [--dry-run] [--json] [--directory <release-dir>]
  self-host restore <backup-directory> [--dry-run] [--json] [--directory <clean-release-dir>]
  self-host upgrade <release-evidence-directory> [--accept-no-application-rollback] [--dry-run] [--json] [--directory <release-dir>]
  self-host rollback <previous-version> [--dry-run] [--json] [--directory <release-dir>]
  self-host stop [--dry-run] [--json] [--directory <release-dir>]
  self-host owner-bootstrap --email <owner-email> --name <owner-name> [--dry-run] [--json] [--directory <release-dir>]
  self-host owner-recovery --email <owner-email> [--dry-run] [--json] [--directory <release-dir>]
  self-host uninstall [--delete-data --confirm-data-root <absolute-path>] [--dry-run] [--json] [--directory <release-dir>]

The CLI never prints generated secrets. Every valid operational invocation writes
a redacted append-only record under .selfhost/operations. A dry-run may write only
that audit record; it does not change configuration, data, containers, or services.
`;

export async function releaseVersion(root = repositoryRoot) {
  for (const file of ["release-manifest.json", "package.json"]) {
    try {
      const { contents } = await readRegularFileBounded(resolve(root, file), {
        maximumBytes: MAX_RELEASE_METADATA_BYTES,
        minimumBytes: 1,
        label: "CLI release metadata",
      });
      const payload = JSON.parse(contents.toString("utf8"));
      const version = payload.releaseVersion ?? payload.version;
      if (typeof version === "string" && RELEASE_VERSION.test(version)) {
        return version;
      }
    } catch {
      // Try the next release metadata source.
    }
  }
  return "unknown";
}

function usageFailure(error, argv) {
  const known = error instanceof SelfHostManagementError ? error : null;
  const now = new Date().toISOString();
  return {
    schemaVersion: SELF_HOST_CLI_SCHEMA_VERSION,
    operationId: randomUUID(),
    command: [
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
    ].includes(argv[0])
      ? argv[0]
      : "unknown",
    status: "failed",
    ok: false,
    exitCode: known?.exitCode ?? SELF_HOST_CLI_EXIT.USAGE,
    dryRun: argv.includes("--dry-run"),
    startedAt: now,
    finishedAt: now,
    releaseVersion: "unknown",
    summary: known?.code ?? "SELF_HOST_USAGE_INVALID",
    actions: [],
    details: {},
    error: {
      code: known?.code ?? "SELF_HOST_USAGE_INVALID",
      message: known?.message ?? "Invalid self-host CLI invocation",
      retryable: false,
    },
    operationRecord: null,
  };
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseManagementArguments(argv);
  } catch (error) {
    const result = usageFailure(error, argv);
    const json = argv.includes("--json");
    const output = json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${renderHumanResult(result)}\n${help}`;
    (json ? process.stdout : process.stderr).write(output);
    process.exitCode = result.exitCode;
    return result;
  }

  if (options.help) {
    process.stdout.write(help);
    return null;
  }
  if (options.version) {
    process.stdout.write(`${await releaseVersion()}\n`);
    return null;
  }

  const result = await executeManagementCommand(options);
  const output = options.json
    ? `${JSON.stringify(result, null, 2)}\n`
    : renderHumanResult(result);
  (options.json
    ? process.stdout
    : result.ok
      ? process.stdout
      : process.stderr
  ).write(output);
  process.exitCode = result.exitCode;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
