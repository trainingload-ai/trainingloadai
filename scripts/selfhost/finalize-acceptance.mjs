import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import {
  assertAcceptanceEnvironment,
  assertPassingAcceptanceReport,
  scenariosForMode,
} from "./acceptance-core.mjs";
import {
  readRegularFileBounded,
  rethrowAfterPathCleanup,
} from "./backup-artifact.mjs";
import { createChecksums } from "./create-checksums.mjs";
import { scanDiagnosticsText } from "./diagnostics-artifact.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const REVISION = /^[a-f0-9]{40}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_REPORT_BYTES = 5 * 1024 * 1024;

const CONTRACT_FILES = Object.freeze({
  acceptance: "docker/selfhost/acceptance-contract.json",
  reportSchema: "schemas/self-host-acceptance-report.schema.json",
  environmentSchema: "schemas/self-host-acceptance-environment.schema.json",
  manifestSchema: "schemas/self-host-acceptance-manifest.schema.json",
});

function expectedCells(contract = acceptanceContract) {
  return contract.platforms.flatMap((platform) =>
    contract.modes.map((mode) => ({
      id: `${platform.id}-${mode}`,
      platform,
      mode,
    })),
  );
}

function addDateTimeFormat(ajv) {
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  });
  return ajv;
}

function compileSchema(schema) {
  return addDateTimeFormat(
    new Ajv2020({ strict: false, allErrors: true }),
  ).compile(schema);
}

function schemaFailure(name, validate) {
  return `${name} failed schema validation: ${JSON.stringify(validate.errors)}`;
}

function releaseFromOptions(options, name) {
  return {
    version: options[`${name}Version`],
    revision: options[`${name}Revision`],
  };
}

export function parseFinalizationArguments(argv) {
  const options = {
    inputDirectory: null,
    outputDirectory: null,
    runId: null,
    workflowRevision: null,
    workflowRef: null,
    currentVersion: null,
    currentRevision: null,
    previousVersion: null,
    previousRevision: null,
  };
  const names = new Map([
    ["--input-directory", "inputDirectory"],
    ["--output-directory", "outputDirectory"],
    ["--run-id", "runId"],
    ["--workflow-revision", "workflowRevision"],
    ["--workflow-ref", "workflowRef"],
    ["--current-version", "currentVersion"],
    ["--current-revision", "currentRevision"],
    ["--previous-version", "previousVersion"],
    ["--previous-revision", "previousRevision"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = names.get(argument);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--") || options[key] !== null) {
      throw new Error(`invalid finalization argument: ${argument}`);
    }
    options[key] = value;
    index += 1;
  }
  for (const [name, key] of names) {
    if (!options[key]) throw new Error(`${name} is required`);
  }
  if (!SAFE_RUN_ID.test(options.runId)) throw new Error("--run-id is invalid");
  if (!REVISION.test(options.workflowRevision)) {
    throw new Error("--workflow-revision is invalid");
  }
  for (const name of ["current", "previous"]) {
    if (!VERSION.test(options[`${name}Version`])) {
      throw new Error(`--${name}-version is invalid`);
    }
    if (!REVISION.test(options[`${name}Revision`])) {
      throw new Error(`--${name}-revision is invalid`);
    }
  }
  if (/\r|\n/.test(options.workflowRef) || options.workflowRef.length > 500) {
    throw new Error("--workflow-ref is invalid");
  }
  if (
    acceptanceContract.gate.workflowRevisionMustMatchRelease &&
    options.workflowRevision !== options.currentRevision
  ) {
    throw new Error("workflow revision does not match the current release");
  }
  const repository = supplyChainContract.sourceRepository.replace(
    /^https:\/\/github\.com\//,
    "",
  );
  const expectedWorkflowRef = `${repository}/${acceptanceContract.workflow}@refs/tags/v${options.currentVersion}`;
  if (options.workflowRef !== expectedWorkflowRef) {
    throw new Error("workflow ref is not the exact current release tag");
  }
  if (
    options.currentVersion === options.previousVersion ||
    options.currentRevision === options.previousRevision
  ) {
    throw new Error("current and previous releases must be distinct");
  }
  for (const cell of expectedCells()) {
    if (`${options.runId}-${cell.id}`.length > 200) {
      throw new Error("--run-id is too long for matrix report identifiers");
    }
  }
  return options;
}

async function readRegularFile(path, maximumBytes = MAX_REPORT_BYTES) {
  return (
    await readRegularFileBounded(path, {
      maximumBytes,
      minimumBytes: 1,
      label: "acceptance evidence",
    })
  ).contents;
}

async function requirePlainDirectory(path) {
  const stat = await fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`unsafe evidence directory: ${path}`);
  }
}

function parseJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function requireMissing(path) {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`acceptance output already exists: ${path}`);
}

function assertPlatform(report, expected) {
  const actual = report.platform;
  for (const field of [
    "id",
    "host",
    "nodePlatform",
    "architecture",
    "containerPlatform",
    "runtime",
  ]) {
    if (actual?.[field] !== expected[field]) {
      throw new Error(`report platform ${field} does not match the contract`);
    }
  }
}

function assertRelease(actual, expected, baseline, label) {
  if (
    actual?.version !== expected.version ||
    actual?.revision !== expected.revision ||
    !/^[a-f0-9]{64}$/.test(actual?.archiveSha256 ?? "")
  ) {
    throw new Error(`${label} release identity is inconsistent`);
  }
  if (baseline && actual.archiveSha256 !== baseline.archiveSha256) {
    throw new Error(`${label} archive digest differs across matrix cells`);
  }
}

async function copyContractFile(output, name, relativePath) {
  const source = resolve(repositoryRoot, relativePath);
  const contents = await readRegularFile(source);
  const destinationPath = `contracts/${relativePath.split("/").at(-1)}`;
  const destination = resolve(output, destinationPath);
  await fs.writeFile(destination, contents, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    name,
    path: destinationPath,
    sha256: sha256Buffer(contents),
    contents,
  };
}

export async function finalizeAcceptanceEvidence(options, dependencies = {}) {
  const readEvidenceFile = dependencies.readEvidenceFile ?? readRegularFile;
  const input = resolve(options.inputDirectory);
  const output = resolve(options.outputDirectory);
  const parent = dirname(output);
  await requirePlainDirectory(input);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  await requireMissing(output);
  const staging = await fs.mkdtemp(
    resolve(parent, `.${basename(output)}.partial-${randomUUID()}-`),
  );
  try {
    await fs.chmod(staging, 0o700);
    await fs.mkdir(resolve(staging, "reports"), { mode: 0o700 });
    await fs.mkdir(resolve(staging, "environments"), { mode: 0o700 });
    await fs.mkdir(resolve(staging, "contracts"), { mode: 0o700 });

    const contractCopies = {};
    for (const [name, path] of Object.entries(CONTRACT_FILES)) {
      contractCopies[name] = await copyContractFile(staging, name, path);
    }
    const reportSchema = parseJson(
      contractCopies.reportSchema.contents,
      "acceptance report schema",
    );
    const manifestSchema = parseJson(
      contractCopies.manifestSchema.contents,
      "acceptance manifest schema",
    );
    const environmentSchema = parseJson(
      contractCopies.environmentSchema.contents,
      "acceptance environment schema",
    );
    const validateReport = compileSchema(reportSchema);
    const validateEnvironment = compileSchema(environmentSchema);
    const validateManifest = compileSchema(manifestSchema);
    const cells = [];
    const currentExpected = releaseFromOptions(options, "current");
    const previousExpected = releaseFromOptions(options, "previous");
    let currentBaseline = null;
    let previousBaseline = null;

    for (const cell of expectedCells()) {
      const artifactDirectory = resolve(
        input,
        `selfhost-acceptance-${cell.id}`,
      );
      await requirePlainDirectory(artifactDirectory);
      const source = resolve(artifactDirectory, "acceptance-report.json");
      const contents = await readEvidenceFile(source, MAX_REPORT_BYTES);
      const reportFindings = scanDiagnosticsText(contents.toString("utf8"));
      if (reportFindings.length) {
        throw new Error(
          `${cell.id} report failed secret scan: ${reportFindings.join(", ")}`,
        );
      }
      const report = parseJson(contents, `${cell.id} report`);
      if (!validateReport(report)) {
        throw new Error(schemaFailure(`${cell.id} report`, validateReport));
      }
      assertPassingAcceptanceReport(report, acceptanceContract);
      assertPlatform(report, cell.platform);
      if (report.mode !== cell.mode) {
        throw new Error(
          `${cell.id} report mode does not match the matrix cell`,
        );
      }
      const reportRunId = `${options.runId}-${cell.id}`;
      if (report.runId !== reportRunId) {
        throw new Error(`${cell.id} report run ID does not match the workflow`);
      }
      assertRelease(
        report.releases.current,
        currentExpected,
        currentBaseline,
        "current",
      );
      assertRelease(
        report.releases.previous,
        previousExpected,
        previousBaseline,
        "previous",
      );
      currentBaseline ??= report.releases.current;
      previousBaseline ??= report.releases.previous;

      const environmentSource = resolve(artifactDirectory, "environment.json");
      const environmentContents = await readEvidenceFile(
        environmentSource,
        MAX_REPORT_BYTES,
      );
      const environmentFindings = scanDiagnosticsText(
        environmentContents.toString("utf8"),
      );
      if (environmentFindings.length) {
        throw new Error(
          `${cell.id} environment failed secret scan: ${environmentFindings.join(", ")}`,
        );
      }
      const environment = parseJson(
        environmentContents,
        `${cell.id} environment`,
      );
      if (!validateEnvironment(environment)) {
        throw new Error(
          schemaFailure(`${cell.id} environment`, validateEnvironment),
        );
      }
      assertAcceptanceEnvironment(environment, cell.platform);

      const reportPath = `reports/${cell.id}.json`;
      const destination = resolve(staging, reportPath);
      await fs.writeFile(destination, contents, { flag: "wx", mode: 0o600 });
      const environmentPath = `environments/${cell.id}.json`;
      const environmentDestination = resolve(staging, environmentPath);
      await fs.writeFile(environmentDestination, environmentContents, {
        flag: "wx",
        mode: 0o600,
      });
      cells.push({
        id: cell.id,
        platformId: cell.platform.id,
        mode: cell.mode,
        report: reportPath,
        reportSha256: sha256Buffer(contents),
        environment: environmentPath,
        environmentSha256: sha256Buffer(environmentContents),
        reportRunId,
        generatedAt: report.generatedAt,
        scenarioCount: report.scenarios.length,
        securityCheckCount: report.security.length,
      });
    }

    const manifest = {
      schemaVersion: 1,
      kind: "trainingload-selfhost-acceptance-manifest",
      runId: options.runId,
      generatedAt: new Date().toISOString(),
      status: "passed",
      workflow: {
        revision: options.workflowRevision,
        ref: options.workflowRef,
      },
      releases: {
        current: currentBaseline,
        previous: previousBaseline,
      },
      contracts: Object.fromEntries(
        Object.entries(contractCopies).map(([name, copy]) => [
          name,
          { path: copy.path, sha256: copy.sha256 },
        ]),
      ),
      summary: {
        requiredCells: expectedCells().length,
        passedCells: cells.length,
        scenarioExecutions: cells.reduce(
          (sum, cell) => sum + cell.scenarioCount,
          0,
        ),
        securityChecks: cells.reduce(
          (sum, cell) => sum + cell.securityCheckCount,
          0,
        ),
      },
      cells,
    };
    if (!validateManifest(manifest)) {
      throw new Error(schemaFailure("acceptance manifest", validateManifest));
    }
    if (
      manifest.summary.requiredCells !== manifest.summary.passedCells ||
      new Set(cells.map(({ id }) => id)).size !== expectedCells().length
    ) {
      throw new Error("acceptance matrix coverage is incomplete");
    }
    await fs.writeFile(
      resolve(staging, acceptanceContract.gate.manifest),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await createChecksums(staging, acceptanceContract.gate.checksums);
    await fs.chmod(resolve(staging, acceptanceContract.gate.checksums), 0o600);
    await requireMissing(output);
    await fs.rename(staging, output);
    return manifest;
  } catch (error) {
    await rethrowAfterPathCleanup(error, [
      {
        path: staging,
        options: { recursive: true, force: true },
      },
    ]);
  }
}

async function main() {
  const options = parseFinalizationArguments(process.argv.slice(2));
  const manifest = await finalizeAcceptanceEvidence(options);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      status: manifest.status,
      cells: manifest.summary.passedCells,
      outputDirectory: resolve(options.outputDirectory),
    })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export { CONTRACT_FILES, expectedCells };
