import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  publishRegularFileExclusive,
  readRegularFileBounded,
} from "./backup-artifact.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const MAXIMUM_JSON_INPUT_BYTES = 32 * 1024 * 1024;

function issue(code, message) {
  return { code, message };
}

function countKey(value, key) {
  if (!value || typeof value !== "object") return 0;
  let count = Object.prototype.hasOwnProperty.call(value, key) ? 1 : 0;
  for (const child of Object.values(value)) count += countKey(child, key);
  return count;
}

export function validatePublishedEvidence(
  manifest,
  sbom,
  provenance,
  expectedPlatforms,
) {
  const errors = [];
  if (!Array.isArray(manifest?.manifests)) {
    return {
      errors: [issue("INDEX", "published image must be an OCI image index")],
      summary: null,
    };
  }
  const runnable = manifest.manifests.filter(
    (descriptor) =>
      descriptor.platform?.os === "linux" &&
      expectedPlatforms.includes(`linux/${descriptor.platform?.architecture}`),
  );
  const runnablePlatforms = runnable.map(
    (descriptor) =>
      `${descriptor.platform.os}/${descriptor.platform.architecture}`,
  );
  if (
    JSON.stringify(runnablePlatforms.sort()) !==
    JSON.stringify([...expectedPlatforms].sort())
  ) {
    errors.push(
      issue(
        "PLATFORMS",
        `published platforms must be exactly ${expectedPlatforms.join(", ")}`,
      ),
    );
  }

  const attestationReferences = new Set(
    manifest.manifests
      .filter(
        (descriptor) =>
          descriptor.annotations?.["vnd.docker.reference.type"] ===
          "attestation-manifest",
      )
      .map(
        (descriptor) => descriptor.annotations?.["vnd.docker.reference.digest"],
      )
      .filter(Boolean),
  );
  for (const descriptor of runnable) {
    if (!attestationReferences.has(descriptor.digest)) {
      errors.push(
        issue(
          "ATTESTATION",
          `platform manifest ${descriptor.digest} has no attached attestation manifest`,
        ),
      );
    }
  }

  const sbomDocuments = countKey(sbom, "spdxVersion");
  if (sbomDocuments < expectedPlatforms.length) {
    errors.push(
      issue(
        "SBOM",
        `expected at least ${expectedPlatforms.length} SPDX documents, found ${sbomDocuments}`,
      ),
    );
  }
  const provenanceStatements = countKey(provenance, "buildType");
  if (provenanceStatements < expectedPlatforms.length) {
    errors.push(
      issue(
        "PROVENANCE",
        `expected at least ${expectedPlatforms.length} provenance statements, found ${provenanceStatements}`,
      ),
    );
  }
  return {
    errors,
    summary: {
      platforms: [...new Set(runnablePlatforms)].sort(),
      platformDigests: Object.fromEntries(
        runnable.map((descriptor) => [
          `${descriptor.platform.os}/${descriptor.platform.architecture}`,
          descriptor.digest,
        ]),
      ),
      attestationManifests: attestationReferences.size,
      sbomDocuments,
      provenanceStatements,
    },
  };
}

export function validateCosignPayload(payload, expectedDigest) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return [
      issue("SIGNATURE", "cosign verification output must contain a signature"),
    ];
  }
  const digests = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase() === "docker-manifest-digest") digests.push(child);
      visit(child);
    }
  };
  visit(payload);
  return digests.includes(expectedDigest)
    ? []
    : [
        issue(
          "SIGNATURE",
          `verified signature payload is not bound to ${expectedDigest}`,
        ),
      ];
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument near ${name ?? "<end>"}`);
    }
    values.set(name.slice(2), value);
  }
  for (const required of [
    "role",
    "image",
    "digest",
    "manifest",
    "sbom",
    "provenance",
    "signature",
    "signature-identity",
    "output",
  ]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }
  return Object.fromEntries(values);
}

async function readJson(path) {
  const { contents } = await readRegularFileBounded(path, {
    maximumBytes: MAXIMUM_JSON_INPUT_BYTES,
    minimumBytes: 1,
    label: "published image evidence",
  });
  return JSON.parse(contents.toString("utf8"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const contract = await readJson(
    resolve(repositoryRoot, "docker/selfhost/image-contract.json"),
  );
  const supplyChain = await readJson(
    resolve(repositoryRoot, "docker/selfhost/supply-chain-contract.json"),
  );
  if (!contract.images[options.role])
    throw new Error(`unknown role: ${options.role}`);
  if (!/^sha256:[a-f0-9]{64}$/.test(options.digest)) {
    throw new Error(`invalid digest: ${options.digest}`);
  }
  const result = validatePublishedEvidence(
    await readJson(options.manifest),
    await readJson(options.sbom),
    await readJson(options.provenance),
    contract.platforms,
  );
  result.errors.push(
    ...validateCosignPayload(await readJson(options.signature), options.digest),
  );
  if (result.errors.length > 0) {
    for (const error of result.errors)
      process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const evidence = {
    schemaVersion: 1,
    role: options.role,
    image: options.image,
    digest: options.digest,
    reference: `${options.image}@${options.digest}`,
    ...result.summary,
    sbom: {
      format: supplyChain.attestations.sbom,
      file: `${options.role}.sbom.json`,
    },
    provenance: {
      mode: supplyChain.attestations.provenance,
      file: `${options.role}.provenance.json`,
    },
    signature: {
      tool: supplyChain.signature.tool,
      version: supplyChain.signature.version,
      oidcIssuer: supplyChain.signature.oidcIssuer,
      identity: options["signature-identity"],
      verified: true,
    },
  };
  await publishRegularFileExclusive(
    options.output,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o644 },
  );
  process.stdout.write(
    `published evidence: PASS ${options.role} ${evidence.reference} (${evidence.platforms.join(", ")})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
