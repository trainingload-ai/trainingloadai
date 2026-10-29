import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import v1Contract from "../../docker/selfhost/v1-contract.json" with { type: "json" };
import {
  copyRegularFileBounded,
  copyRegularTreeBounded,
  consumeByteBudget,
  inspectRegularTree,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  sha256File,
} from "./backup-artifact.mjs";
import {
  assertAcceptanceEnvironment,
  assertPassingAcceptanceReport,
} from "./acceptance-core.mjs";
import { createChecksums } from "./create-checksums.mjs";
import { scanDiagnosticsText } from "./diagnostics-artifact.mjs";
import { prepareAcceptanceRelease } from "./prepare-acceptance-release.mjs";
import { readReleaseAttestation } from "./release-attestation.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";
import { verifySelfHostV1Contract } from "./verify-v1-contract.mjs";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const PORTABLE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const CHECKSUM_LINE = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/;

function invariant(condition, message) {
  if (!condition) throw new Error(`release candidate gate failed: ${message}`);
}

function sourceRepositoryPath() {
  return supplyChainContract.sourceRepository.replace(
    /^https:\/\/github\.com\//,
    "",
  );
}

function expectedWorkflowRef(workflow, version) {
  return `${sourceRepositoryPath()}/${workflow}@refs/tags/v${version}`;
}

function expectedWorkflowIdentity(workflow, version) {
  return `${supplyChainContract.sourceRepository}/${workflow}@refs/tags/v${version}`;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

export function parseReleaseCandidateArguments(argv) {
  const options = Object.fromEntries(
    [
      "releaseArtifactDirectory",
      "acceptanceDirectory",
      "outputDirectory",
      "candidateId",
      "workflowRunId",
      "workflowRevision",
      "workflowRef",
      "releaseRunId",
      "releaseVersion",
      "releaseRevision",
      "acceptanceRunId",
      "acceptanceRunAttempt",
      "attestationFile",
    ].map((key) => [key, null]),
  );
  const names = new Map([
    ["--release-artifact-directory", "releaseArtifactDirectory"],
    ["--acceptance-directory", "acceptanceDirectory"],
    ["--output-directory", "outputDirectory"],
    ["--candidate-id", "candidateId"],
    ["--workflow-run-id", "workflowRunId"],
    ["--workflow-revision", "workflowRevision"],
    ["--workflow-ref", "workflowRef"],
    ["--release-run-id", "releaseRunId"],
    ["--release-version", "releaseVersion"],
    ["--release-revision", "releaseRevision"],
    ["--acceptance-run-id", "acceptanceRunId"],
    ["--acceptance-run-attempt", "acceptanceRunAttempt"],
    ["--attestation-file", "attestationFile"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = names.get(argument);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--") || options[key] !== null) {
      throw new Error(`invalid release candidate argument: ${argument}`);
    }
    options[key] = value;
    index += 1;
  }
  for (const [name, key] of names) {
    if (!options[key]) throw new Error(`${name} is required`);
  }
  const candidatePattern = new RegExp(candidateContract.candidatePattern);
  invariant(
    candidatePattern.test(options.candidateId),
    "candidate ID is invalid",
  );
  for (const name of ["workflowRunId", "releaseRunId", "acceptanceRunId"]) {
    invariant(RUN_ID.test(options[name]), `${name} is invalid`);
  }
  options.acceptanceRunAttempt = Number(options.acceptanceRunAttempt);
  invariant(
    Number.isSafeInteger(options.acceptanceRunAttempt) &&
      options.acceptanceRunAttempt >= 1,
    "acceptance run attempt is invalid",
  );
  invariant(VERSION.test(options.releaseVersion), "release version is invalid");
  invariant(
    REVISION.test(options.releaseRevision),
    "release revision is invalid",
  );
  invariant(
    REVISION.test(options.workflowRevision) &&
      options.workflowRevision === options.releaseRevision,
    "workflow revision must equal the release revision",
  );
  invariant(
    options.workflowRef ===
      expectedWorkflowRef(candidateContract.workflow, options.releaseVersion),
    "workflow ref must be the exact release tag",
  );
  const release = resolve(options.releaseArtifactDirectory);
  const acceptance = resolve(options.acceptanceDirectory);
  const output = resolve(options.outputDirectory);
  const attestation = resolve(options.attestationFile);
  invariant(
    release !== acceptance &&
      release !== output &&
      acceptance !== output &&
      attestation !== output &&
      !isInside(release, output) &&
      !isInside(acceptance, output) &&
      !isInside(output, release) &&
      !isInside(output, acceptance) &&
      !isInside(output, attestation),
    "input and output directories must be disjoint",
  );
  return options;
}

function addFormats(ajv) {
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  });
  return ajv;
}

function compileSchema(schema) {
  return addFormats(new Ajv2020({ strict: false, allErrors: true })).compile(
    schema,
  );
}

async function requireRegularFile(path, maximumBytes) {
  const stat = await fs.lstat(path);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size > 0 &&
      stat.size <= maximumBytes,
    `unsafe or oversized file: ${path}`,
  );
  return stat;
}

async function readRegularFile(path, maximumBytes) {
  return (
    await readRegularFileBounded(path, {
      maximumBytes,
      minimumBytes: 1,
      label: "release candidate evidence",
    })
  ).contents;
}

async function readJson(path, label, { scanSecrets = false } = {}) {
  const contents = await readRegularFile(
    path,
    candidateContract.limits.maximumMetadataFileBytes,
  );
  if (scanSecrets) {
    const findings = scanDiagnosticsText(contents.toString("utf8"));
    invariant(
      findings.length === 0,
      `${label} failed secret scan: ${findings.join(", ")}`,
    );
  }
  try {
    return JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error(
      `release candidate gate failed: ${label} is not valid JSON`,
    );
  }
}

async function requireDirectory(path) {
  const stat = await fs.lstat(path);
  invariant(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `unsafe evidence directory: ${path}`,
  );
}

function defaultVerifyBlob({ bundlePath, identity, payloadPath }) {
  const result = spawnSync(
    "cosign",
    [
      "verify-blob",
      "--bundle",
      bundlePath,
      "--certificate-identity",
      identity,
      "--certificate-oidc-issuer",
      supplyChainContract.signature.oidcIssuer,
      payloadPath,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5 * 60_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "release candidate gate failed: evidence signature is invalid",
      {
        cause: result.error,
      },
    );
  }
}

function assertPortablePath(path) {
  invariant(
    PORTABLE_PATH.test(path) &&
      !path
        .split("/")
        .some(
          (segment) =>
            segment === "." ||
            segment === ".." ||
            segment.includes(":") ||
            /[. ]$/.test(segment) ||
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
        ),
    `non-portable evidence path: ${path}`,
  );
}

function inspectEvidenceTree(tree, maximumBytes) {
  const byteBudget = { consumedBytes: 0, maximumBytes };
  for (const file of tree.files) consumeByteBudget(byteBudget, file.sizeBytes);
  const expectedDirectories = new Set();
  for (const file of tree.files) {
    const segments = file.relativePath.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      expectedDirectories.add(segments.slice(0, depth).join("/"));
    }
  }
  invariant(
    JSON.stringify([...tree.directories].sort()) ===
      JSON.stringify([...expectedDirectories].sort()),
    "evidence tree contains an unexpected empty directory",
  );
  return byteBudget.consumedBytes;
}

export async function verifyChecksumInventory(
  directory,
  {
    checksumsName,
    signatureName,
    maximumBytes = candidateContract.limits.maximumCandidateBytes,
    expectedChecksumsContents = null,
  },
) {
  const root = resolve(directory);
  await requireDirectory(root);
  const tree = await inspectRegularTree(root, {
    maximumFiles: candidateContract.limits.maximumEvidenceFiles,
    maximumDirectories: candidateContract.limits.maximumEvidenceDirectories,
    maximumDepth: candidateContract.limits.maximumEvidenceDepth,
  });
  const sizeBytes = inspectEvidenceTree(tree, maximumBytes);
  const checksumsPath = resolve(root, checksumsName);
  const signaturePath = resolve(root, signatureName);
  const [checksumsContents] = await Promise.all([
    readRegularFile(
      checksumsPath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
    readRegularFile(
      signaturePath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
  ]);
  invariant(
    expectedChecksumsContents === null ||
      (Buffer.isBuffer(expectedChecksumsContents) &&
        checksumsContents.equals(expectedChecksumsContents)),
    "checksum payload changed during signature verification",
  );
  const lines = checksumsContents
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  invariant(lines.length > 0, "checksum inventory is empty");
  const declared = new Map();
  for (const line of lines) {
    const match = line.match(CHECKSUM_LINE);
    invariant(match, "checksum inventory has an invalid line");
    assertPortablePath(match[2]);
    invariant(
      !declared.has(match[2]),
      "checksum inventory has a duplicate path",
    );
    declared.set(match[2], match[1]);
  }
  const expected = tree.files
    .map((file) => file.relativePath)
    .filter((path) => path !== checksumsName && path !== signatureName)
    .sort();
  invariant(
    JSON.stringify([...declared.keys()].sort()) === JSON.stringify(expected),
    "checksum inventory does not exactly cover the evidence tree",
  );
  for (const [path, expectedSha256] of declared) {
    invariant(
      (await sha256File(resolve(root, ...path.split("/")))) === expectedSha256,
      `checksum mismatch: ${path}`,
    );
  }
  return {
    tree,
    checksumsPath,
    signaturePath,
    entries: declared.size,
    sizeBytes,
  };
}

function sha256Contents(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function schemaFailure(label, validate) {
  return `${label} failed schema validation: ${JSON.stringify(validate.errors)}`;
}

function expectedAcceptanceCells() {
  return acceptanceContract.platforms.flatMap((platform) =>
    acceptanceContract.modes.map((mode) => ({
      id: `${platform.id}-${mode}`,
      platform,
      mode,
    })),
  );
}

async function verifyAcceptanceGateSnapshot(
  directory,
  options,
  { verifyBlob = defaultVerifyBlob } = {},
) {
  const root = resolve(directory);
  const checksumsPath = resolve(root, acceptanceContract.gate.checksums);
  const signaturePath = resolve(root, acceptanceContract.gate.signatureBundle);
  await requireDirectory(root);
  await Promise.all([
    requireRegularFile(
      checksumsPath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
    requireRegularFile(
      signaturePath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
  ]);
  const [signedChecksumsContents, signedSignatureContents] = await Promise.all([
    readRegularFile(
      checksumsPath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
    readRegularFile(
      signaturePath,
      candidateContract.limits.maximumMetadataFileBytes,
    ),
  ]);
  await Promise.resolve(
    verifyBlob({
      bundlePath: signaturePath,
      identity: expectedWorkflowIdentity(
        candidateContract.acceptanceWorkflow,
        options.releaseVersion,
      ),
      payloadPath: checksumsPath,
    }),
  );
  await verifyChecksumInventory(root, {
    checksumsName: acceptanceContract.gate.checksums,
    signatureName: acceptanceContract.gate.signatureBundle,
    maximumBytes: candidateContract.limits.maximumAcceptanceEvidenceBytes,
    expectedChecksumsContents: signedChecksumsContents,
  });
  const signatureAfterVerification = await readRegularFile(
    signaturePath,
    candidateContract.limits.maximumMetadataFileBytes,
  );
  invariant(
    signatureAfterVerification.equals(signedSignatureContents),
    "signature bundle changed during signature verification",
  );

  const manifestPath = resolve(root, acceptanceContract.gate.manifest);
  const manifest = await readJson(manifestPath, "acceptance manifest");
  const schemaPaths = [
    manifest.contracts?.manifestSchema?.path ?? "",
    manifest.contracts?.reportSchema?.path ?? "",
    manifest.contracts?.environmentSchema?.path ?? "",
  ];
  schemaPaths.forEach(assertPortablePath);
  const [manifestSchemaPath, reportSchemaPath, environmentSchemaPath] =
    schemaPaths.map((path) => resolve(root, ...path.split("/")));
  const [manifestSchema, reportSchema, environmentSchema] = await Promise.all([
    readJson(manifestSchemaPath, "acceptance manifest schema"),
    readJson(reportSchemaPath, "acceptance report schema"),
    readJson(environmentSchemaPath, "acceptance environment schema"),
  ]);
  const validateManifest = compileSchema(manifestSchema);
  invariant(
    validateManifest(manifest),
    schemaFailure("acceptance manifest", validateManifest),
  );
  invariant(manifest.status === "passed", "acceptance did not pass");
  invariant(
    manifest.runId ===
      `${options.acceptanceRunId}-${options.acceptanceRunAttempt}`,
    "acceptance run identity differs",
  );
  invariant(
    manifest.workflow.revision === options.releaseRevision &&
      manifest.workflow.ref ===
        expectedWorkflowRef(
          candidateContract.acceptanceWorkflow,
          options.releaseVersion,
        ),
    "acceptance workflow identity differs",
  );
  invariant(
    manifest.releases.current.version === options.releaseVersion &&
      manifest.releases.current.revision === options.releaseRevision,
    "acceptance release identity differs",
  );
  invariant(
    manifest.summary.requiredCells ===
      candidateContract.gates.requiredMatrixCells &&
      manifest.summary.passedCells ===
        candidateContract.gates.requiredMatrixCells,
    "acceptance matrix is incomplete",
  );
  const expectedCells = expectedAcceptanceCells();
  const expectedById = new Map(expectedCells.map((cell) => [cell.id, cell]));
  invariant(
    JSON.stringify(manifest.cells.map((cell) => cell.id).sort()) ===
      JSON.stringify(expectedCells.map((cell) => cell.id).sort()),
    "acceptance cell coverage differs",
  );

  const validateReport = compileSchema(reportSchema);
  const validateEnvironment = compileSchema(environmentSchema);
  let scenarioExecutions = 0;
  let securityChecks = 0;
  for (const cell of manifest.cells) {
    const expected = expectedById.get(cell.id);
    invariant(
      expected &&
        cell.platformId === expected.platform.id &&
        cell.mode === expected.mode &&
        cell.report === `reports/${cell.id}.json` &&
        cell.environment === `environments/${cell.id}.json`,
      `${cell.id} descriptor differs from the matrix contract`,
    );
    assertPortablePath(cell.report);
    assertPortablePath(cell.environment);
    const reportPath = resolve(root, ...cell.report.split("/"));
    const environmentPath = resolve(root, ...cell.environment.split("/"));
    invariant(
      (await sha256File(reportPath)) === cell.reportSha256 &&
        (await sha256File(environmentPath)) === cell.environmentSha256,
      `${cell.id} hashes differ`,
    );
    const report = await readJson(reportPath, `${cell.id} report`, {
      scanSecrets: true,
    });
    const environment = await readJson(
      environmentPath,
      `${cell.id} environment`,
      { scanSecrets: true },
    );
    invariant(
      validateReport(report),
      schemaFailure(`${cell.id} report`, validateReport),
    );
    invariant(
      validateEnvironment(environment),
      schemaFailure(`${cell.id} environment`, validateEnvironment),
    );
    assertPassingAcceptanceReport(report, acceptanceContract);
    assertAcceptanceEnvironment(environment, expected.platform);
    invariant(
      report.status === "passed" &&
        report.runId === cell.reportRunId &&
        report.mode === expected.mode &&
        report.platform?.id === expected.platform.id &&
        report.releases.current.version === options.releaseVersion &&
        report.releases.current.revision === options.releaseRevision &&
        report.releases.current.archiveSha256 ===
          manifest.releases.current.archiveSha256 &&
        report.releases.previous.version ===
          manifest.releases.previous.version &&
        report.releases.previous.revision ===
          manifest.releases.previous.revision &&
        report.releases.previous.archiveSha256 ===
          manifest.releases.previous.archiveSha256 &&
        report.scenarios.length === cell.scenarioCount &&
        report.security.length === cell.securityCheckCount &&
        environment.platformId === expected.platform.id &&
        environment.hostPlatform === expected.platform.nodePlatform &&
        environment.hostArchitecture ===
          (expected.platform.architecture === "amd64" ? "x64" : "arm64") &&
        environment.dockerArchitecture === expected.platform.architecture &&
        environment.dockerOsType === "linux",
      `${cell.id} does not represent the passing release`,
    );
    scenarioExecutions += report.scenarios.length;
    securityChecks += report.security.length;
  }
  invariant(
    manifest.summary.scenarioExecutions === scenarioExecutions &&
      manifest.summary.securityChecks === securityChecks,
    "acceptance summary does not equal the complete matrix evidence",
  );

  for (const [name, contract] of Object.entries(manifest.contracts)) {
    assertPortablePath(contract.path);
    invariant(
      (await sha256File(resolve(root, ...contract.path.split("/")))) ===
        contract.sha256,
      `acceptance contract hash differs: ${name}`,
    );
  }
  const currentContracts = {
    acceptance: "docker/selfhost/acceptance-contract.json",
    reportSchema: "schemas/self-host-acceptance-report.schema.json",
    environmentSchema: "schemas/self-host-acceptance-environment.schema.json",
    manifestSchema: "schemas/self-host-acceptance-manifest.schema.json",
  };
  for (const [name, path] of Object.entries(currentContracts)) {
    invariant(
      manifest.contracts[name].sha256 ===
        (await sha256File(resolve(repositoryRoot, path))),
      `${name} differs from the release revision`,
    );
  }
  return {
    manifest,
    manifestPath,
    manifestSha256: await sha256File(manifestPath),
    signedArtifactSha256: {
      checksums: sha256Contents(signedChecksumsContents),
      signatureBundle: sha256Contents(signedSignatureContents),
    },
    signatureVerified: true,
  };
}

async function copyRegularFile(source, destination, maximumBytes = Infinity) {
  await copyRegularFileBounded(source, destination, {
    maximumBytes,
    minimumBytes: 1,
    mode: 0o600,
    parentMode: 0o700,
    label: "release candidate evidence copy",
  });
  return destination;
}

export async function copyRegularTree(source, destination, maximumBytes) {
  return copyRegularTreeBounded(source, destination, {
    maximumBytes,
    maximumFileBytes: maximumBytes,
    minimumFileBytes: 1,
    maximumFiles: candidateContract.limits.maximumEvidenceFiles,
    maximumDirectories: candidateContract.limits.maximumEvidenceDirectories,
    maximumDepth: candidateContract.limits.maximumEvidenceDepth,
    fileMode: 0o600,
    label: "release candidate evidence copy",
    validateTree: (tree) => inspectEvidenceTree(tree, maximumBytes),
  });
}

export async function verifyAcceptanceGate(
  directory,
  options,
  dependencies = {},
) {
  const source = resolve(directory);
  const work = await fs.mkdtemp(
    resolve(tmpdir(), "selfhost-acceptance-verify-"),
  );
  let result;
  let operationError = null;
  try {
    const snapshot = resolve(work, "acceptance");
    await copyRegularTree(
      source,
      snapshot,
      candidateContract.limits.maximumAcceptanceEvidenceBytes,
    );
    result = await verifyAcceptanceGateSnapshot(
      snapshot,
      options,
      dependencies,
    );
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPathCleanup(operationError, [
    {
      path: work,
      options: { recursive: true, force: true },
    },
  ]);
  return result;
}

async function copyNamedFiles(sourceRoot, destinationRoot, paths) {
  const copied = [];
  for (const path of paths) {
    assertPortablePath(path);
    const destinationPath = `${basename(destinationRoot)}/${basename(path)}`;
    const destination = resolve(destinationRoot, basename(path));
    await copyRegularFile(
      resolve(sourceRoot, ...path.split("/")),
      destination,
      candidateContract.limits.maximumMetadataFileBytes,
    );
    copied.push({
      path: destinationPath,
      sha256: await sha256File(destination),
    });
  }
  return copied;
}

async function lstatOrNull(path) {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function finalizeReleaseCandidate(options, dependencies = {}) {
  const prepareRelease =
    dependencies.prepareRelease ?? prepareAcceptanceRelease;
  const verifyAcceptance =
    dependencies.verifyAcceptance ?? verifyAcceptanceGate;
  const verifyV1 = dependencies.verifyV1 ?? verifySelfHostV1Contract;
  const readAttestation =
    dependencies.readAttestation ?? readReleaseAttestation;
  const now = dependencies.now?.() ?? new Date();
  const output = resolve(options.outputDirectory);
  const parent = dirname(output);
  const staging = resolve(
    parent,
    `.${basename(output)}.partial-${randomUUID()}`,
  );
  const work = resolve(parent, `.${basename(output)}.work-${randomUUID()}`);
  invariant(!(await lstatOrNull(output)), "output directory already exists");
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  await fs.mkdir(staging, { mode: 0o700 });
  let result;
  let operationError = null;
  let workCleaned = false;
  try {
    const frozen = await verifyV1();
    invariant(
      frozen.initialReleaseVersion === options.releaseVersion,
      "release version is not the frozen v1 candidate",
    );
    const prepared = await prepareRelease({
      artifactDirectory: options.releaseArtifactDirectory,
      outputDirectory: work,
      version: options.releaseVersion,
      revision: options.releaseRevision,
    });
    invariant(
      prepared.outerSignatureVerified === true &&
        prepared.innerSignatureVerified === true &&
        Object.values(prepared.outerArtifactSha256 ?? {}).length === 3 &&
        Object.values(prepared.outerArtifactSha256).every((value) =>
          SHA256.test(value),
        ),
      "release signatures were not verified",
    );
    const acceptance = await verifyAcceptance(
      options.acceptanceDirectory,
      options,
      dependencies,
    );
    invariant(
      acceptance.signatureVerified === true &&
        Object.values(acceptance.signedArtifactSha256 ?? {}).length === 2 &&
        Object.values(acceptance.signedArtifactSha256).every((value) =>
          SHA256.test(value),
        ),
      "acceptance signature was not verified",
    );
    invariant(
      acceptance.manifest.releases.current.archiveSha256 ===
        prepared.archiveSha256,
      "release archive differs from the accepted archive",
    );
    const releaseRoot = resolve(prepared.releaseRoot);
    await requireDirectory(releaseRoot);
    const releaseManifestPath = resolve(releaseRoot, "release-manifest.json");
    const bundleManifestPath = resolve(releaseRoot, "bundle-manifest.json");
    const [releaseManifest, bundleManifest] = await Promise.all([
      readJson(releaseManifestPath, "release manifest"),
      readJson(bundleManifestPath, "bundle manifest"),
    ]);
    invariant(
      releaseManifest.releaseVersion === options.releaseVersion &&
        releaseManifest.source?.revision === options.releaseRevision &&
        bundleManifest.releaseVersion === options.releaseVersion,
      "prepared release metadata differs",
    );

    const releaseOutput = resolve(
      staging,
      candidateContract.artifact.releaseDirectory,
    );
    await fs.mkdir(releaseOutput, { mode: 0o700 });
    const archiveName = `trainingload-selfhost-${options.releaseVersion}.tar.gz`;
    const releaseArtifactFiles = [
      archiveName,
      `${archiveName}.sha256`,
      `${archiveName}.sha256.bundle.json`,
    ];
    for (const name of releaseArtifactFiles) {
      await copyRegularFile(
        resolve(options.releaseArtifactDirectory, name),
        resolve(releaseOutput, name),
        name === archiveName
          ? candidateContract.limits.maximumReleaseArchiveBytes
          : candidateContract.limits.maximumMetadataFileBytes,
      );
    }
    const copiedOuterArtifactSha256 = {
      archive: await sha256File(resolve(releaseOutput, archiveName)),
      checksum: await sha256File(
        resolve(releaseOutput, `${archiveName}.sha256`),
      ),
      signatureBundle: await sha256File(
        resolve(releaseOutput, `${archiveName}.sha256.bundle.json`),
      ),
    };
    invariant(
      JSON.stringify(copiedOuterArtifactSha256) ===
        JSON.stringify(prepared.outerArtifactSha256),
      "copied release artifacts differ from the verified snapshot",
    );
    for (const name of [
      "release-manifest.json",
      "bundle-manifest.json",
      "checksums.txt",
      "checksums.bundle.json",
    ]) {
      await copyRegularFile(
        resolve(releaseRoot, name),
        resolve(releaseOutput, name),
        candidateContract.limits.maximumMetadataFileBytes,
      );
    }

    const acceptanceOutput = resolve(
      staging,
      candidateContract.artifact.acceptanceDirectory,
    );
    await copyRegularTree(
      options.acceptanceDirectory,
      acceptanceOutput,
      candidateContract.limits.maximumAcceptanceEvidenceBytes,
    );
    await verifyChecksumInventory(acceptanceOutput, {
      checksumsName: acceptanceContract.gate.checksums,
      signatureName: acceptanceContract.gate.signatureBundle,
      maximumBytes: candidateContract.limits.maximumAcceptanceEvidenceBytes,
    });
    const copiedAcceptanceArtifactSha256 = {
      checksums: await sha256File(
        resolve(acceptanceOutput, acceptanceContract.gate.checksums),
      ),
      signatureBundle: await sha256File(
        resolve(acceptanceOutput, acceptanceContract.gate.signatureBundle),
      ),
    };
    invariant(
      JSON.stringify(copiedAcceptanceArtifactSha256) ===
        JSON.stringify(acceptance.signedArtifactSha256),
      "copied acceptance artifacts differ from the verified snapshot",
    );
    const attestationOutput = resolve(
      staging,
      candidateContract.artifact.attestationsDirectory,
    );
    await fs.mkdir(attestationOutput, { mode: 0o700 });
    const attestationPath = resolve(
      attestationOutput,
      "release-attestation.json",
    );
    await copyRegularFile(
      options.attestationFile,
      attestationPath,
      candidateContract.limits.maximumAttestationBytes,
    );
    const attestation = await readAttestation(attestationPath, {
      releaseVersion: options.releaseVersion,
      releaseRevision: options.releaseRevision,
      releaseArchiveSha256: prepared.archiveSha256,
      now,
    });
    const attestationSha256 = await sha256File(attestationPath);
    const documents = await copyNamedFiles(
      releaseRoot,
      resolve(staging, candidateContract.artifact.documentsDirectory),
      candidateContract.requiredDocuments,
    );
    const contracts = await copyNamedFiles(
      releaseRoot,
      resolve(staging, candidateContract.artifact.contractsDirectory),
      candidateContract.requiredContracts,
    );

    const manifest = {
      schemaVersion: 1,
      kind: "trainingload-selfhost-release-candidate",
      candidateId: options.candidateId,
      generatedAt: now.toISOString(),
      status: "candidate",
      workflow: {
        runId: options.workflowRunId,
        revision: options.workflowRevision,
        ref: options.workflowRef,
      },
      release: {
        version: options.releaseVersion,
        revision: options.releaseRevision,
        workflowRunId: options.releaseRunId,
        archive: `release/${archiveName}`,
        archiveSha256: prepared.archiveSha256,
        checksum: `release/${archiveName}.sha256`,
        signatureBundle: `release/${archiveName}.sha256.bundle.json`,
        releaseManifest: "release/release-manifest.json",
        releaseManifestSha256: await sha256File(
          resolve(releaseOutput, "release-manifest.json"),
        ),
        bundleManifest: "release/bundle-manifest.json",
        bundleManifestSha256: await sha256File(
          resolve(releaseOutput, "bundle-manifest.json"),
        ),
      },
      acceptance: {
        workflowRunId: options.acceptanceRunId,
        workflowRunAttempt: options.acceptanceRunAttempt,
        manifest: "acceptance/acceptance-manifest.json",
        manifestSha256: acceptance.manifestSha256,
        checksums: "acceptance/acceptance-checksums.txt",
        signatureBundle: "acceptance/acceptance-checksums.bundle.json",
        requiredCells: acceptance.manifest.summary.requiredCells,
        passedCells: acceptance.manifest.summary.passedCells,
        scenarioExecutions: acceptance.manifest.summary.scenarioExecutions,
        securityChecks: acceptance.manifest.summary.securityChecks,
      },
      attestations: {
        source: {
          path: "attestations/release-attestation.json",
          sha256: attestationSha256,
        },
        codexCleanRoom: {
          status: attestation.codexCleanRoom.status,
          evidenceSha256: attestation.codexCleanRoom.evidenceSha256,
          reference: attestation.codexCleanRoom.reference,
          platform: attestation.codexCleanRoom.platform,
          architecture: attestation.codexCleanRoom.architecture,
          dockerVersion: attestation.codexCleanRoom.dockerVersion,
          composeVersion: attestation.codexCleanRoom.composeVersion,
          dockerOperatingSystem:
            attestation.codexCleanRoom.dockerOperatingSystem,
          contractSource: attestation.codexCleanRoom.contractSource,
          cleanTarget: attestation.codexCleanRoom.cleanTarget,
          installerDryRunPassed:
            attestation.codexCleanRoom.installerDryRunPassed,
          installationCompleted:
            attestation.codexCleanRoom.installationCompleted,
          deploymentReady: attestation.codexCleanRoom.deploymentReady,
          ownerBootstrapPerformedByOperator:
            attestation.codexCleanRoom.ownerBootstrapPerformedByOperator,
          coreUserJourneyPassed:
            attestation.codexCleanRoom.coreUserJourneyPassed,
          containerRecreatePassed:
            attestation.codexCleanRoom.containerRecreatePassed,
          hostRestartPassed: attestation.codexCleanRoom.hostRestartPassed,
          postRestartDataVerified:
            attestation.codexCleanRoom.postRestartDataVerified,
          diagnosticsReviewed: attestation.codexCleanRoom.diagnosticsReviewed,
          secretScan: attestation.codexCleanRoom.secretScan,
        },
        issueReview: {
          status: attestation.issueReview.status,
          unresolvedP0: attestation.issueReview.unresolvedP0,
          unresolvedP1: attestation.issueReview.unresolvedP1,
          releaseBlockers: attestation.issueReview.releaseBlockers,
          knownLimitationsReviewed:
            attestation.issueReview.knownLimitationsReviewed,
          evidenceSha256: attestation.issueReview.evidenceSha256,
          reference: attestation.issueReview.reference,
        },
      },
      compatibility: {
        v1ContractSchemaVersion: v1Contract.schemaVersion,
        configSchemaVersion: releaseManifest.configSchemaVersion,
        composeSchemaVersion: releaseManifest.composeSchemaVersion,
        releaseBundleSchemaVersion: bundleManifest.schemaVersion,
        databaseSchemaEpoch: releaseManifest.database.schemaEpoch,
        migrationHead: releaseManifest.database.migrationHead,
        compatibilityWindowMinorVersions:
          releaseManifest.database.compatibilityWindowMinorVersions,
        supportedSourceVersions:
          releaseManifest.upgrade.supportedSourceVersions,
        applicationRollbackTo: releaseManifest.upgrade.applicationRollbackTo,
        databaseRollback: releaseManifest.database.databaseRollback,
      },
      documents,
      contracts,
      summary: {
        releaseSignaturesVerified: true,
        acceptanceSignatureVerified: true,
        allMatrixCellsPassed: true,
        structuredAttestationVerified: true,
        codexCleanRoomPassed: true,
        hostRestartVerified: attestation.codexCleanRoom.hostRestartPassed,
        unresolvedP0: attestation.issueReview.unresolvedP0,
        unresolvedP1: attestation.issueReview.unresolvedP1,
        releaseBlockers: attestation.issueReview.releaseBlockers,
      },
    };
    const schema = await readJson(
      resolve(
        releaseRoot,
        "schemas/self-host-release-candidate-manifest.schema.json",
      ),
      "release candidate manifest schema",
    );
    const validate = compileSchema(schema);
    invariant(
      validate(manifest),
      schemaFailure("release candidate manifest", validate),
    );
    const manifestPath = resolve(staging, candidateContract.artifact.manifest);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await createChecksums(staging, candidateContract.artifact.checksums);
    await fs.chmod(
      resolve(staging, candidateContract.artifact.checksums),
      0o600,
    );
    inspectEvidenceTree(
      await inspectRegularTree(staging, {
        maximumFiles: candidateContract.limits.maximumEvidenceFiles,
        maximumDirectories: candidateContract.limits.maximumEvidenceDirectories,
        maximumDepth: candidateContract.limits.maximumEvidenceDepth,
      }),
      candidateContract.limits.maximumCandidateBytes,
    );
    await rethrowAfterPathCleanup(null, [
      {
        path: work,
        options: { recursive: true, force: true },
      },
    ]);
    workCleaned = true;
    invariant(!(await lstatOrNull(output)), "output directory already exists");
    await fs.rename(staging, output);
    result = { manifest, outputDirectory: output };
  } catch (error) {
    operationError = error;
  }
  if (operationError) {
    const cleanups = [
      {
        path: staging,
        options: { recursive: true, force: true },
      },
    ];
    if (!workCleaned) {
      cleanups.push({
        path: work,
        options: { recursive: true, force: true },
      });
    }
    await rethrowAfterPathCleanup(operationError, cleanups);
  }
  return result;
}

async function main() {
  const options = parseReleaseCandidateArguments(process.argv.slice(2));
  const result = await finalizeReleaseCandidate(options);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      candidateId: result.manifest.candidateId,
      releaseVersion: result.manifest.release.version,
      outputDirectory: result.outputDirectory,
    })}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export {
  candidateContract as SELF_HOST_RELEASE_CANDIDATE_CONTRACT,
  defaultVerifyBlob,
  expectedWorkflowIdentity,
  expectedWorkflowRef,
};
