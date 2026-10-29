import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildMigrationInventory,
  validateReleasePolicy,
} from "./migration-policy.mjs";
import {
  publishRegularFilesExclusive,
  readRegularFileBounded,
} from "./backup-artifact.mjs";
import { validateReleaseManifest } from "./release-artifact.mjs";
import { validateVulnerabilityEvidence } from "./vulnerability-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const MAXIMUM_JSON_INPUT_BYTES = 32 * 1024 * 1024;

export function createReleaseManifest({
  version,
  revision,
  source,
  created,
  results,
  imageContract,
  supplyChainContract,
  composeContract,
  releasePolicy: rawReleasePolicy,
  databaseInventory,
  vulnerabilityEvidence: rawVulnerabilityEvidence,
}) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version}`);
  }
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(revision)) {
    throw new Error(`invalid source revision: ${revision}`);
  }
  if (!Number.isFinite(Date.parse(created)))
    throw new Error(`invalid creation time: ${created}`);
  if (source !== supplyChainContract.sourceRepository) {
    throw new Error(`invalid source repository URL: ${source}`);
  }
  const releasePolicy = validateReleasePolicy(rawReleasePolicy);
  if (releasePolicy.releaseVersion !== version) {
    throw new Error("release policy version does not match the release");
  }
  if (
    !Number.isInteger(composeContract.composeSchemaVersion) ||
    composeContract.composeSchemaVersion < 1
  ) {
    throw new Error("compose schema version is invalid");
  }
  if (
    databaseInventory?.migrationPolicy !== "expand-contract" ||
    databaseInventory.databaseRollback !== "unsupported" ||
    !Array.isArray(databaseInventory.migrations) ||
    !databaseInventory.migrations.length ||
    !/^(?:\d{4}|\d{14})_[a-z0-9_]+$/.test(databaseInventory.migrationHead ?? "") ||
    !/^[a-f0-9]{64}$/.test(databaseInventory.migrationInventorySha256 ?? "")
  ) {
    throw new Error("database migration inventory is invalid");
  }
  const expectedRoles = Object.keys(imageContract.images).sort();
  const vulnerabilityEvidence = validateVulnerabilityEvidence(
    rawVulnerabilityEvidence,
  );
  const actualRoles = results.map((result) => result.role).sort();
  if (JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)) {
    throw new Error(
      `image results must contain exactly: ${expectedRoles.join(", ")}`,
    );
  }

  const images = {};
  for (const result of results) {
    if (!/^sha256:[a-f0-9]{64}$/.test(result.digest)) {
      throw new Error(`invalid ${result.role} digest: ${result.digest}`);
    }
    if (result.reference !== `${result.image}@${result.digest}`) {
      throw new Error(`${result.role} reference is not digest-bound`);
    }
    if (
      JSON.stringify(result.platforms) !==
      JSON.stringify(imageContract.platforms)
    ) {
      throw new Error(
        `${result.role} platforms do not match the image contract`,
      );
    }
    const platformDigestEntries = Object.entries(result.platformDigests ?? {});
    if (
      JSON.stringify(
        platformDigestEntries.map(([platform]) => platform).sort(),
      ) !== JSON.stringify([...imageContract.platforms].sort()) ||
      platformDigestEntries.some(
        ([, digest]) => !/^sha256:[a-f0-9]{64}$/.test(digest),
      )
    ) {
      throw new Error(
        `${result.role} platform digests do not match the contract`,
      );
    }
    if (
      result.sbom?.format !== supplyChainContract.attestations.sbom ||
      result.provenance?.mode !== supplyChainContract.attestations.provenance
    ) {
      throw new Error(
        `${result.role} evidence metadata does not match the contract`,
      );
    }
    if (result.signature?.verified !== true) {
      throw new Error(`${result.role} signature was not verified`);
    }
    if (
      result.signature.oidcIssuer !== supplyChainContract.signature.oidcIssuer
    ) {
      throw new Error(
        `${result.role} signature issuer does not match the contract`,
      );
    }
    const expectedIdentity = `${source}/${supplyChainContract.workflow}@refs/tags/v${version}`;
    if (result.signature.identity !== expectedIdentity) {
      throw new Error(
        `${result.role} signature identity does not match the release workflow`,
      );
    }
    if (
      !result.image.startsWith(supplyChainContract.imageRepositoryPrefix) ||
      !result.image.endsWith(`/${imageContract.images[result.role].name}`)
    ) {
      throw new Error(
        `${result.role} image repository does not match the contract`,
      );
    }
    const vulnerability = vulnerabilityEvidence.images[result.role];
    if (
      vulnerability.reference !== result.reference ||
      vulnerability.digest !== result.digest
    ) {
      throw new Error(
        `${result.role} vulnerability evidence is not bound to the image digest`,
      );
    }
    images[result.role] = {
      name: imageContract.images[result.role].name,
      repository: result.image,
      digest: result.digest,
      reference: result.reference,
      tags: [version, `sha-${revision}`],
      platforms: result.platforms,
      platformDigests: result.platformDigests,
      evidence: {
        sbom: result.sbom,
        provenance: result.provenance,
        signature: result.signature,
        vulnerability: {
          tool: vulnerabilityEvidence.tool.name,
          version: vulnerabilityEvidence.tool.version,
          policy: "zero-fixable-critical-high",
          resultFile: "vulnerability-result.json",
          scans: structuredClone(vulnerability.scans),
        },
      },
    };
  }

  return validateReleaseManifest({
    schemaVersion: 1,
    releaseVersion: version,
    configSchemaVersion: imageContract.configSchemaVersion,
    composeSchemaVersion: composeContract.composeSchemaVersion,
    releaseKind: releasePolicy.releaseKind,
    source: { url: source, revision },
    created,
    registry: supplyChainContract.registry,
    license: imageContract.license,
    runtimeIdentity: imageContract.runtimeIdentity,
    images,
    upgrade: structuredClone(releasePolicy.upgrade),
    database: structuredClone(databaseInventory),
    verification: {
      workflow: supplyChainContract.workflow,
      oidcIssuer: supplyChainContract.signature.oidcIssuer,
      digestAlgorithm: "sha256",
      evidenceFilesCoveredBy: supplyChainContract.releaseEvidence.checksums,
      releaseEvidenceSignature: {
        tool: supplyChainContract.signature.tool,
        version: supplyChainContract.signature.version,
        bundle: supplyChainContract.releaseEvidence.signatureBundle,
      },
    },
  });
}

function parseArguments(argv) {
  const values = new Map();
  const results = [];
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument near ${name ?? "<end>"}`);
    }
    if (name === "--result") results.push(value);
    else values.set(name.slice(2), value);
  }
  for (const required of [
    "version",
    "revision",
    "source",
    "created",
    "output",
    "digests-output",
    "vulnerability-result",
  ]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }
  if (results.length === 0)
    throw new Error("at least one --result is required");
  return { ...Object.fromEntries(values), results };
}

async function readJson(path) {
  const { contents } = await readRegularFileBounded(path, {
    maximumBytes: MAXIMUM_JSON_INPUT_BYTES,
    minimumBytes: 1,
    label: "image release manifest input",
  });
  return JSON.parse(contents.toString("utf8"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const rootPackage = await readJson(resolve(repositoryRoot, "package.json"));
  const releasePolicy = await readJson(
    resolve(repositoryRoot, "docker/selfhost/release-policy.json"),
  );
  if (options.version !== rootPackage.version) {
    throw new Error(
      `release version ${options.version} does not match package version ${rootPackage.version}`,
    );
  }
  const manifest = createReleaseManifest({
    version: options.version,
    revision: options.revision,
    source: options.source,
    created: options.created,
    results: await Promise.all(options.results.map(readJson)),
    imageContract: await readJson(
      resolve(repositoryRoot, "docker/selfhost/image-contract.json"),
    ),
    supplyChainContract: await readJson(
      resolve(repositoryRoot, "docker/selfhost/supply-chain-contract.json"),
    ),
    composeContract: await readJson(
      resolve(repositoryRoot, "docker/selfhost/compose-contract.json"),
    ),
    releasePolicy,
    databaseInventory: await buildMigrationInventory(
      resolve(repositoryRoot, "packages/prisma/core/migrations"),
      releasePolicy,
    ),
    vulnerabilityEvidence: await readJson(options["vulnerability-result"]),
  });
  const digestLines = Object.entries(manifest.images)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, image]) => `${role}  ${image.reference}`);
  await publishRegularFilesExclusive([
    {
      path: options["digests-output"],
      content: `${digestLines.join("\n")}\n`,
      mode: 0o644,
    },
    {
      path: options.output,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
      mode: 0o644,
    },
  ]);
  process.stdout.write(
    `image release manifest: PASS ${manifest.releaseVersion} (${Object.keys(manifest.images).join(", ")})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
