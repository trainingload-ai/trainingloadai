import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VULNERABILITY_EVIDENCE_POLICY } from "./vulnerability-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const BOUNDED_INPUT_SCRIPTS = Object.freeze([
  "create-image-release-manifest.mjs",
  "verify-published-evidence.mjs",
  "promote-image-release.mjs",
  "scan-image-layers.mjs",
  "vulnerability-evidence.mjs",
]);
const VERIFIED_SOURCE_SCRIPTS = Object.freeze([
  ...BOUNDED_INPUT_SCRIPTS,
  "release-artifact.mjs",
  "release-bundle.mjs",
]);

function issue(code, message) {
  return { code, message };
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

export function validateSupplyChainInputReaders(sources) {
  const errors = [];
  for (const name of BOUNDED_INPUT_SCRIPTS) {
    const source = sources[name] ?? "";
    if (
      !source.includes("readRegularFileBounded") ||
      !/maximumBytes:\s*[A-Z][A-Za-z0-9_.]*/.test(source) ||
      !source.includes("minimumBytes: 1") ||
      /JSON\.parse\(\s*await readFile\(/.test(source)
    ) {
      errors.push(
        issue(
          "BOUNDED_SUPPLY_CHAIN_INPUT",
          `${name} must parse JSON from one bounded stable file handle`,
        ),
      );
    }
  }
  if (
    !sources["promote-image-release.mjs"]?.includes("validateReleaseManifest")
  ) {
    errors.push(
      issue(
        "PROMOTION_MANIFEST",
        "image promotion must validate the complete release manifest before registry writes",
      ),
    );
  }
  const layerScanner = sources["scan-image-layers.mjs"] ?? "";
  if (
    !layerScanner.includes("consumeRegularFileBounded") ||
    !layerScanner.includes("MAXIMUM_IMAGE_SCAN_FILE_BYTES")
  ) {
    errors.push(
      issue(
        "BOUNDED_LAYER_SCAN",
        "image config and layer scans must stream from one bounded stable file handle",
      ),
    );
  }
  if (
    !layerScanner.includes("export async function withImageScanWorkspace") ||
    !layerScanner.includes("await rethrowAfterPathCleanup(") ||
    !layerScanner.includes("operationError,") ||
    !layerScanner.includes("options: { recursive: true, force: true }")
  ) {
    errors.push(
      issue(
        "IMAGE_SCAN_CLEANUP",
        "image layer scan must preserve its primary failure when required workspace cleanup also fails",
      ),
    );
  }
  const vulnerabilityEvidence = sources["vulnerability-evidence.mjs"] ?? "";
  if (
    !vulnerabilityEvidence.includes(
      'createHash("sha256").update(contents).digest("hex")',
    ) ||
    vulnerabilityEvidence.includes("sha256File")
  ) {
    errors.push(
      issue(
        "VULNERABILITY_BYTE_BINDING",
        "vulnerability evidence must validate and hash the same bounded SARIF bytes",
      ),
    );
  }
  for (const [name, primitive] of [
    ["create-image-release-manifest.mjs", "publishRegularFilesExclusive"],
    ["verify-published-evidence.mjs", "publishRegularFileExclusive"],
    ["vulnerability-evidence.mjs", "publishRegularFileExclusive"],
  ]) {
    if (!sources[name]?.includes(primitive)) {
      errors.push(
        issue(
          "ATOMIC_EVIDENCE_PUBLICATION",
          `${name} must publish complete evidence without replacing an existing artifact`,
        ),
      );
    }
  }
  const releaseArtifact = sources["release-artifact.mjs"] ?? "";
  const releaseBundle = sources["release-bundle.mjs"] ?? "";
  if (
    !releaseArtifact.includes("signedArtifactSha256") ||
    !releaseArtifact.includes(
      "release signed artifacts changed during signature verification",
    ) ||
    !releaseBundle.includes("verifyCurrentSignedBundle") ||
    !releaseBundle.includes(
      "release bundle source changed after verification",
    ) ||
    !releaseBundle.includes(
      "release bundle signed artifacts changed after verification",
    )
  ) {
    errors.push(
      issue(
        "SIGNED_BUNDLE_SOURCE_BINDING",
        "release verification must bind the live bundle tree and both signed artifacts to its private snapshot",
      ),
    );
  }
  return errors;
}

export function validateWorkflow(source, contract) {
  const errors = [];
  const vulnerabilityScan = contract.vulnerabilityScan;
  if (
    !vulnerabilityScan ||
    vulnerabilityScan.tool !== VULNERABILITY_EVIDENCE_POLICY.tool ||
    vulnerabilityScan.version !== VULNERABILITY_EVIDENCE_POLICY.version ||
    JSON.stringify(vulnerabilityScan.platforms) !==
      JSON.stringify(["linux/amd64", "linux/arm64"]) ||
    JSON.stringify(vulnerabilityScan.severities) !==
      JSON.stringify(["critical", "high"]) ||
    vulnerabilityScan.onlyFixed !== VULNERABILITY_EVIDENCE_POLICY.onlyFixed ||
    vulnerabilityScan.failOnFinding !== true ||
    vulnerabilityScan.maximumFindings !==
      VULNERABILITY_EVIDENCE_POLICY.maximumFindings ||
    vulnerabilityScan.evidenceFormat !==
      `sarif-${VULNERABILITY_EVIDENCE_POLICY.sarifVersion}` ||
    vulnerabilityScan.maximumEvidenceBytes !==
      VULNERABILITY_EVIDENCE_POLICY.maximumSarifBytes ||
    vulnerabilityScan.evidencePattern !==
      "vulnerability/<role>-<arch>.sarif.json"
  ) {
    errors.push(
      issue(
        "VULNERABILITY_CONTRACT",
        "fixable critical/high image vulnerability policy is invalid",
      ),
    );
  }
  if (!/^\s{2}workflow_dispatch:\s*$/m.test(source)) {
    errors.push(issue("TRIGGER", "workflow must use workflow_dispatch"));
  }
  for (const trigger of ["push", "pull_request", "schedule", "release"]) {
    if (new RegExp(`^  ${trigger}:`, "m").test(source)) {
      errors.push(issue("TRIGGER", `workflow must not auto-run on ${trigger}`));
    }
  }
  if (!/^      publish:\s*$[\s\S]*?^        default: false\s*$/m.test(source)) {
    errors.push(
      issue("PUBLISH_DEFAULT", "publish input must default to false"),
    );
  }
  if (/\b(?:latest|edge|main|master)\b/i.test(source)) {
    errors.push(
      issue(
        "MUTABLE",
        "workflow must not use mutable image or action references",
      ),
    );
  }

  const actionMatches = [
    ...source.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+).*$/gm),
  ];
  for (const match of actionMatches) {
    const [, action, reference] = match;
    if (action.startsWith("./")) continue;
    const expected = contract.actions[action];
    if (!expected) {
      errors.push(issue("ACTION", `unapproved external action: ${action}`));
    } else if (reference !== expected.sha) {
      errors.push(
        issue(
          "ACTION_PIN",
          `${action} must be pinned to ${expected.sha} (${expected.version})`,
        ),
      );
    }
  }
  for (const [action, definition] of Object.entries(contract.actions)) {
    if (!source.includes(`${action}@${definition.sha}`)) {
      errors.push(
        issue(
          "ACTION_MISSING",
          `workflow does not use contracted action ${action}`,
        ),
      );
    }
  }
  const checkoutCount = occurrences(source, /uses: actions\/checkout@/g);
  const nonPersistedCredentialCount = occurrences(
    source,
    /persist-credentials: false/g,
  );
  if (checkoutCount !== nonPersistedCredentialCount) {
    errors.push(
      issue("CHECKOUT", "every checkout must disable persisted credentials"),
    );
  }

  const sourceSmokeJob = source.match(
    /^  smoke-source-images:\s*$([\s\S]*?)(?=^  publish-candidates:\s*$)/m,
  )?.[1];
  const publishCandidateJob = source.match(
    /^  publish-candidates:\s*$([\s\S]*?)(?=^  vulnerability-scan:\s*$)/m,
  )?.[1];
  if (
    !sourceSmokeJob ||
    !/^    needs: validate-contracts\s*$/m.test(sourceSmokeJob) ||
    !/^    if: \$\{\{ !inputs\.publish \}\}\s*$/m.test(sourceSmokeJob)
  ) {
    errors.push(
      issue(
        "SOURCE_SMOKE_ROUTING",
        "source-image smoke builds must run only for non-publishing verification",
      ),
    );
  }
  if (
    !publishCandidateJob ||
    !/^    needs: validate-contracts\s*$/m.test(publishCandidateJob) ||
    !/^    if: \$\{\{ inputs\.publish \}\}\s*$/m.test(publishCandidateJob) ||
    /^    needs: smoke-source-images\s*$/m.test(publishCandidateJob)
  ) {
    errors.push(
      issue(
        "PUBLISH_SINGLE_BUILD",
        "publishing must build each candidate once and validate that exact digest",
      ),
    );
  }

  const requiredSnippets = [
    ["PLATFORM_AMD64", "target: linux/amd64"],
    ["PLATFORM_ARM64", "target: linux/arm64"],
    ["ROLE_MATRIX", "role: [migrate, server, client]"],
    ["MIGRATE_DOCKERFILE", 'migrate) dockerfile="packages/prisma/Dockerfile"'],
    ["SERVER_DOCKERFILE", 'server) dockerfile="apps/server/Dockerfile"'],
    ["SOURCE_LOAD", "load: true"],
    ["SOURCE_NO_PUSH", "push: false"],
    ["PUBLISH_GUARD", "if: ${{ inputs.publish }}"],
    ["PUBLISH", "push: true"],
    ["TAG_GATE", 'expected_ref="refs/tags/v$version"'],
    ["SBOM", "sbom: true"],
    ["PROVENANCE", "provenance: mode=max"],
    ["OIDC", "id-token: write"],
    ["SIGN", "cosign sign --yes"],
    ["VERIFY_SIGNATURE", "cosign verify"],
    ["VERIFY_IDENTITY", "--certificate-identity"],
    ["VERIFY_ISSUER", "--certificate-oidc-issuer"],
    ["EXTRACT_SBOM", "--format '{{json .SBOM}}'"],
    ["EXTRACT_PROVENANCE", "--format '{{json .Provenance}}'"],
    ["EVIDENCE", "verify-published-evidence.mjs"],
    ["SIGNATURE_EVIDENCE", '--signature "dist/selfhost-images/'],
    [
      "PULLED_PLATFORM_IMAGE_ID",
      'image_id="$(docker image inspect "$reference" --format \'{{.Id}}\')"',
    ],
    ["PULLED_PLATFORM_TAG", 'docker image tag "$image_id" "$local_image"'],
    ["PULLED_PLATFORM_RELEASE", 'docker image rm "$reference"'],
    ["PROMOTION", "promote-image-release.mjs"],
    ["ANONYMOUS_PULL_CONFIG", 'export DOCKER_CONFIG="$anonymous_config"'],
    [
      "ANONYMOUS_PULL_REFERENCE",
      "'.images[$role].reference' dist/selfhost-images/release-manifest.json",
    ],
    ["ANONYMOUS_PULL", 'docker pull --platform linux/amd64 "$reference"'],
    ["MANIFEST", "create-image-release-manifest.mjs"],
    ["RELEASE_BUNDLE", "build-selfhost-release.mjs"],
    ["CHECKSUMS", "create-checksums.mjs"],
    ["SIGN_RELEASE_EVIDENCE", "cosign sign-blob --yes"],
    ["VERIFY_RELEASE_EVIDENCE", "cosign verify-blob"],
    ["RELEASE_SIGNATURE_BUNDLE", "checksums.bundle.json"],
    ["INSTALLER_DRY_RUN", 'install.sh" --dry-run --json'],
    ["REPRODUCIBLE_ARCHIVE", "--sort=name"],
    ["REPRODUCIBLE_PAX", "--pax-option=delete=atime,delete=ctime"],
    ["REPRODUCIBLE_GZIP", "gzip -n"],
    ["REPRODUCIBILITY_CHECK", 'cmp "dist/$bundle.tar.gz"'],
    ["ARCHIVE_CHECKSUM", 'sha256sum "$bundle.tar.gz"'],
    ["ARCHIVE_SIGNATURE", '"dist/$bundle.tar.gz.sha256.bundle.json"'],
    ["RELEASE_UPLOAD", "trainingload-selfhost-release-${{ github.sha }}"],
    ["VULNERABILITY_JOB", "vulnerability-scan:"],
    ["VULNERABILITY_TARGET", '"${{ steps.image.outputs.reference }}"'],
    [
      "VULNERABILITY_PLATFORM",
      '--platform "${{ matrix.platform.target }}"',
    ],
    ["VULNERABILITY_SEVERITY", "--severity CRITICAL,HIGH"],
    ["VULNERABILITY_FIXABLE", "--ignore-unfixed"],
    ["VULNERABILITY_EVIDENCE", "--format sarif"],
    ["VULNERABILITY_EVIDENCE_OUTPUT", '--output "$report"'],
    ["VULNERABILITY_COMPLETE_REPORT", "--exit-code 0"],
    [
      "VULNERABILITY_FAIL",
      "[.runs[]?.results[]?] | length == 0",
    ],
    ["VULNERABILITY_GATE", "needs: [publish-candidates, vulnerability-scan]"],
    [
      "VULNERABILITY_VALIDATE",
      "node scripts/selfhost/vulnerability-evidence.mjs",
    ],
    [
      "VULNERABILITY_BIND",
      "--vulnerability-result dist/selfhost-images/vulnerability-result.json",
    ],
  ];
  for (const [code, snippet] of requiredSnippets) {
    if (!source.includes(snippet))
      errors.push(issue(code, `missing workflow control: ${snippet}`));
  }
  const releaseChecksums = source.lastIndexOf(
    "node scripts/selfhost/create-checksums.mjs dist/selfhost-images",
  );
  const releaseSignature = source.lastIndexOf(
    "--bundle dist/selfhost-images/checksums.bundle.json",
  );
  const releaseUpload = source.lastIndexOf("- name: Upload release evidence");
  if (
    releaseChecksums < 0 ||
    releaseSignature <= releaseChecksums ||
    releaseUpload <= releaseSignature
  ) {
    errors.push(
      issue(
        "RELEASE_EVIDENCE_ORDER",
        "release evidence must be checksummed, then signed, then uploaded",
      ),
    );
  }
  const bundleBuild = source.lastIndexOf("build-selfhost-release.mjs");
  const promotion = source.lastIndexOf("promote-image-release.mjs");
  const anonymousPull = source.lastIndexOf(
    'docker pull --platform linux/amd64 "$reference"',
  );
  const bundleSignature = source.lastIndexOf(
    '--bundle "$bundle/checksums.bundle.json"',
  );
  const installerDryRun = source.lastIndexOf('install.sh" --dry-run --json');
  const archive = source.lastIndexOf('gzip -n > "$output"');
  const archiveSignature = source.lastIndexOf(
    '--bundle "dist/$bundle.tar.gz.sha256.bundle.json"',
  );
  const bundleUpload = source.lastIndexOf(
    "name: trainingload-selfhost-release-${{ github.sha }}",
  );
  if (
    promotion < 0 ||
    anonymousPull <= promotion ||
    bundleBuild <= anonymousPull ||
    !source.includes('export DOCKER_CONFIG="$anonymous_config"') ||
    !source.includes(
      "'.images[$role].reference' dist/selfhost-images/release-manifest.json",
    )
  ) {
    errors.push(
      issue(
        "ANONYMOUS_PULL_ORDER",
        "promoted release digests must be pulled without registry credentials before bundle distribution",
      ),
    );
  }
  if (
    bundleBuild < 0 ||
    bundleSignature <= bundleBuild ||
    installerDryRun <= bundleSignature ||
    archive <= installerDryRun ||
    archiveSignature <= archive ||
    bundleUpload <= archiveSignature
  ) {
    errors.push(
      issue(
        "RELEASE_BUNDLE_ORDER",
        "release bundle must be built, signed, installer-tested, archived, archive-signed, then uploaded",
      ),
    );
  }
  if (occurrences(source, /smoke-image\.mjs/g) < 2) {
    errors.push(
      issue(
        "SMOKE",
        "source and pulled images must use the same smoke-image suite",
      ),
    );
  }
  if (occurrences(source, /scan-image-layers\.mjs/g) < 2) {
    errors.push(
      issue(
        "LAYER_SCAN",
        "source and pulled images must use the same layer scanner",
      ),
    );
  }
  const vulnerabilityJob = source.match(
    /^  vulnerability-scan:\s*$([\s\S]*?)(?=^  finalize-release:\s*$)/m,
  )?.[1];
  if (
    !vulnerabilityJob ||
    /^\s{6}[a-z-]+:\s*write\s*$/m.test(vulnerabilityJob) ||
    !/^\s{6}contents:\s*read\s*$/m.test(vulnerabilityJob) ||
    !/\bpackages:\s*read\b/.test(vulnerabilityJob) ||
    !vulnerabilityJob.includes("role: [migrate, server, client]") ||
    !vulnerabilityJob.includes("target: linux/amd64") ||
    !vulnerabilityJob.includes("target: linux/arm64") ||
    !vulnerabilityJob.includes("uses: aquasecurity/setup-trivy@") ||
    !vulnerabilityJob.includes("version: v0.76.1") ||
    !vulnerabilityJob.includes(
      '--platform "${{ matrix.platform.target }}"',
    ) ||
    !vulnerabilityJob.includes("--severity CRITICAL,HIGH") ||
    !vulnerabilityJob.includes("--ignore-unfixed") ||
    !vulnerabilityJob.includes("--format sarif") ||
    !vulnerabilityJob.includes("--exit-code 0") ||
    !vulnerabilityJob.includes("TRIVY_USERNAME: ${{ github.actor }}") ||
    !vulnerabilityJob.includes(
      "TRIVY_PASSWORD: ${{ secrets.GITHUB_TOKEN }}",
    )
  ) {
    errors.push(
      issue(
        "VULNERABILITY_PERMISSIONS",
        "vulnerability scanning must run after publication with read-only registry permission and no OIDC",
      ),
    );
  }
  const vulnerabilityVerify = source.indexOf(
    '--certificate-identity "$expected_identity"',
  );
  const vulnerabilityLogin = vulnerabilityJob?.indexOf(
    "name: Log in read-only to GitHub Container Registry",
  ) ?? -1;
  const vulnerabilityVerifyInJob = vulnerabilityJob?.indexOf(
    '--certificate-identity "$expected_identity"',
  ) ?? -1;
  const vulnerabilitySetupInJob = vulnerabilityJob?.indexOf(
    "uses: aquasecurity/setup-trivy@",
  ) ?? -1;
  const vulnerabilityScanInJob = vulnerabilityJob?.indexOf("trivy image") ?? -1;
  const vulnerabilityRequireInJob = vulnerabilityJob?.indexOf(
    "name: Require the vulnerability evidence file",
  ) ?? -1;
  const vulnerabilityUploadInJob = vulnerabilityJob?.indexOf(
    "name: Upload immutable vulnerability evidence",
  ) ?? -1;
  const vulnerabilityGateInJob = vulnerabilityJob?.indexOf(
    "name: Reject fixable critical or high vulnerabilities",
  ) ?? -1;
  const vulnerabilitySetup = source.indexOf("uses: aquasecurity/setup-trivy@");
  const vulnerabilityUpload = source.indexOf(
    "name: selfhost-vulnerability-${{ matrix.role }}-${{ matrix.platform.arch }}",
  );
  const vulnerabilityDownload = source.indexOf(
    "pattern: selfhost-vulnerability-*",
  );
  const vulnerabilityValidation = source.indexOf(
    "node scripts/selfhost/vulnerability-evidence.mjs",
  );
  const releaseManifest = source.lastIndexOf(
    "node scripts/selfhost/create-image-release-manifest.mjs",
  );
  const finalChecksums = source.lastIndexOf(
    "node scripts/selfhost/create-checksums.mjs dist/selfhost-images",
  );
  if (
    vulnerabilityVerify < 0 ||
    vulnerabilityLogin < 0 ||
    vulnerabilityVerifyInJob <= vulnerabilityLogin ||
    vulnerabilitySetupInJob <= vulnerabilityVerifyInJob ||
    vulnerabilityScanInJob <= vulnerabilitySetupInJob ||
    vulnerabilityRequireInJob <= vulnerabilityScanInJob ||
    vulnerabilityUploadInJob <= vulnerabilityRequireInJob ||
    vulnerabilityGateInJob <= vulnerabilityUploadInJob ||
    vulnerabilitySetup <= vulnerabilityVerify ||
    vulnerabilityUpload <= vulnerabilitySetup ||
    vulnerabilityDownload <= vulnerabilityUpload ||
    vulnerabilityValidation <= vulnerabilityDownload ||
    releaseManifest <= vulnerabilityValidation ||
    finalChecksums <= releaseManifest
  ) {
    errors.push(
      issue(
        "VULNERABILITY_ORDER",
        "the read-only registry login, exact digest verification, pinned scan, evidence retention, zero-findings gate, download, and checksum steps must run in order",
      ),
    );
  }
  if (source.includes('role: [migrate, server, client, docs]')) {
    errors.push(issue("DOCS_RUNTIME", "Docs must not be published with self-host images"));
  }
  if (!source.includes('--forbid-value "$LEAK_CANARY"')) {
    errors.push(
      issue("CANARY", "layer scans must search for the build-context canary"),
    );
  }
  if (!source.includes("$REGISTRY/${GITHUB_REPOSITORY,,}/trainingload-")) {
    errors.push(
      issue("REGISTRY", "published repositories must be lowercase GHCR paths"),
    );
  }
  for (const secret of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "MAPBOX_ACCESS_TOKEN",
    "MAIL_PASSWORD",
    "CLOUDFLARE_SECRET_ACCESS_KEY",
  ]) {
    if (new RegExp(`echo ["']${secret}=`, "m").test(source)) {
      errors.push(
        issue(
          "BUILD_SECRET",
          `${secret} must not be passed as a build argument`,
        ),
      );
    }
  }
  return errors;
}

async function main() {
  const contract = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "docker/selfhost/supply-chain-contract.json"),
      "utf8",
    ),
  );
  const workflow = await readFile(
    resolve(repositoryRoot, contract.workflow),
    "utf8",
  );
  const sources = Object.fromEntries(
    await Promise.all(
      VERIFIED_SOURCE_SCRIPTS.map(async (name) => [
        name,
        await readFile(resolve(scriptDirectory, name), "utf8"),
      ]),
    ),
  );
  const errors = [
    ...validateWorkflow(workflow, contract),
    ...validateSupplyChainInputReaders(sources),
  ];
  if (errors.length > 0) {
    for (const error of errors)
      process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `self-host image workflow: PASS (${Object.keys(contract.actions).length} pinned actions, publish default off)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
