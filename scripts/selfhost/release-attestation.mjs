import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };
import releaseAttestationSchema from "../../schemas/self-host-release-attestation.schema.json" with { type: "json" };
import { isExpectedDockerOperatingSystem } from "./acceptance-core.mjs";
import { readRegularFileBounded } from "./backup-artifact.mjs";
import { scanDiagnosticsText } from "./diagnostics-artifact.mjs";
import {
  isSupportedComposeVersion,
  validRuntimeVersion,
} from "./management-core.mjs";

const MAXIMUM_ATTESTATION_BYTES =
  candidateContract.limits.maximumAttestationBytes;
const MAXIMUM_ATTESTATION_AGE_MS =
  candidateContract.limits.maximumAttestationAgeDays * 24 * 60 * 60 * 1000;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function addFormats(ajv) {
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  });
  return ajv;
}

const validateSchema = addFormats(
  new Ajv2020({ strict: false, allErrors: true }),
).compile(releaseAttestationSchema);

function invariant(condition, message) {
  if (!condition) throw new Error(`release attestation invalid: ${message}`);
}

function validateEvidenceReference(reference) {
  let parsed;
  try {
    parsed = new URL(reference);
  } catch {
    invariant(false, "evidence reference is not a valid URL");
  }
  invariant(
    ["https:", "codex:"].includes(parsed.protocol) &&
      parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search,
    "evidence reference must not contain credentials or query parameters",
  );
}

export function validateReleaseAttestation(
  attestation,
  { releaseVersion, releaseRevision, releaseArchiveSha256, now = new Date() },
) {
  invariant(
    validateSchema(attestation),
    `schema validation failed: ${JSON.stringify(validateSchema.errors)}`,
  );
  invariant(
    attestation.release.version === releaseVersion &&
      attestation.release.revision === releaseRevision &&
      attestation.release.archiveSha256 === releaseArchiveSha256,
    "release identity differs from the candidate",
  );
  const age = now.getTime() - Date.parse(attestation.generatedAt);
  invariant(
    Number.isFinite(age) && age >= -5 * 60 * 1000,
    "generatedAt is unreasonably far in the future",
  );
  invariant(
    age <= MAXIMUM_ATTESTATION_AGE_MS,
    `attestation is older than ${candidateContract.limits.maximumAttestationAgeDays} days`,
  );
  const expectedPlatform = acceptanceContract.platforms.find(
    ({ id }) => id === attestation.codexCleanRoom.platform,
  );
  invariant(
    expectedPlatform &&
      attestation.codexCleanRoom.architecture === expectedPlatform.architecture,
    "clean-room platform and architecture differ",
  );
  validateEvidenceReference(attestation.codexCleanRoom.reference);
  validateEvidenceReference(attestation.issueReview.reference);
  const findings = scanDiagnosticsText(JSON.stringify(attestation));
  invariant(
    findings.length === 0,
    `attestation contains a possible secret: ${findings.join(", ")}`,
  );
  invariant(
    validRuntimeVersion(attestation.codexCleanRoom.dockerVersion) &&
      isSupportedComposeVersion(attestation.codexCleanRoom.composeVersion),
    "clean-room Docker or Compose version is unsupported",
  );
  invariant(
    isExpectedDockerOperatingSystem(
      attestation.codexCleanRoom.dockerOperatingSystem,
      expectedPlatform.nodePlatform,
    ),
    "clean-room Docker operating system differs from the platform runtime",
  );
  return attestation;
}

export function parseReleaseAttestationPreparationArguments(argv) {
  const options = {
    attestationFile: null,
    releaseVersion: null,
    releaseRevision: null,
    releaseArchiveSha256: null,
    json: false,
  };
  const names = new Map([
    ["--attestation-file", "attestationFile"],
    ["--release-version", "releaseVersion"],
    ["--release-revision", "releaseRevision"],
    ["--release-archive-sha256", "releaseArchiveSha256"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const key = names.get(argument);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--") || options[key] !== null) {
      throw new Error(`invalid release attestation argument: ${argument}`);
    }
    options[key] = value;
    index += 1;
  }
  invariant(options.attestationFile, "--attestation-file is required");
  invariant(VERSION.test(options.releaseVersion ?? ""), "version is invalid");
  invariant(
    REVISION.test(options.releaseRevision ?? ""),
    "revision is invalid",
  );
  invariant(
    SHA256.test(options.releaseArchiveSha256 ?? ""),
    "archive SHA-256 is invalid",
  );
  return options;
}

export async function readReleaseAttestation(path, expected) {
  let contents;
  try {
    contents = (
      await readRegularFileBounded(path, {
        maximumBytes: MAXIMUM_ATTESTATION_BYTES,
        minimumBytes: 1,
        label: "release attestation input",
      })
    ).contents;
  } catch {
    invariant(false, "input is not one bounded regular file");
  }
  let attestation;
  try {
    attestation = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error("release attestation invalid: input is not valid JSON");
  }
  return validateReleaseAttestation(attestation, expected);
}

export async function prepareReleaseAttestationSubmission(
  options,
  { now = new Date() } = {},
) {
  const attestation = await readReleaseAttestation(options.attestationFile, {
    releaseVersion: options.releaseVersion,
    releaseRevision: options.releaseRevision,
    releaseArchiveSha256: options.releaseArchiveSha256,
    now,
  });
  const canonicalJson = `${JSON.stringify(attestation)}\n`;
  invariant(
    Buffer.byteLength(canonicalJson) <= MAXIMUM_ATTESTATION_BYTES,
    "canonical attestation is oversized",
  );
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-release-attestation-submission",
    status: "passed",
    releaseVersion: options.releaseVersion,
    releaseRevision: options.releaseRevision,
    releaseArchiveSha256: options.releaseArchiveSha256,
    releaseAttestationBase64: Buffer.from(canonicalJson).toString("base64"),
  };
}

export {
  MAXIMUM_ATTESTATION_AGE_MS,
  MAXIMUM_ATTESTATION_BYTES,
  releaseAttestationSchema,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const options = parseReleaseAttestationPreparationArguments(
      process.argv.slice(2),
    );
    const result = await prepareReleaseAttestationSubmission(options);
    process.stdout.write(
      `${JSON.stringify(result, null, options.json ? 2 : 0)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "trainingload-selfhost-release-attestation-submission",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
