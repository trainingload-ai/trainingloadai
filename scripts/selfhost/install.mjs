#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createInstallUsageFailure,
  executeInstall,
  parseInstallArguments,
  renderInstallResult,
} from "./install-core.mjs";

const releaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const help = `Trainingload self-host signed release installer

Usage:
  install.sh [--dry-run] [--no-start] [--json]
  install.ps1 [--dry-run] [--no-start] [--json]

The installer operates in the extracted release directory. It requires Node.js
22+, Cosign, and (unless --no-start is used) Docker Engine with Compose v2.
It verifies the signed bundle before creating configuration or starting services.
`;

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseInstallArguments(argv);
  } catch (error) {
    const result = createInstallUsageFailure(error, argv);
    process.stderr.write(
      argv.includes("--json")
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${error.message}\n${help}`,
    );
    process.exitCode = result.exitCode;
    return result;
  }
  if (options.help) {
    process.stdout.write(help);
    return null;
  }
  const result = await executeInstall(options, { root: releaseRoot });
  const output = options.json
    ? `${JSON.stringify(result, null, 2)}\n`
    : renderInstallResult(result);
  (result.ok ? process.stdout : process.stderr).write(output);
  process.exitCode = result.exitCode;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
