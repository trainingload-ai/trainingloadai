import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const cloudEnvironment = "desktop-macos-release";
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktop, "../..");

export function assertCloudEnvironment(environment, policies) {
  if (
    environment.deployment_branch_policy?.custom_branch_policies !== true ||
    environment.deployment_branch_policy?.protected_branches !== false ||
    policies.branch_policies?.length !== 1 ||
    policies.branch_policies[0].name !== "main" ||
    policies.branch_policies[0].type !== "branch"
  )
    throw new Error(
      "DESKTOP_CLOUD_ENVIRONMENT: environment must allow only the main branch",
    );
}

export function cloudSecretPreflight(repository, execute = execFileSync) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("Invalid GitHub repository");
  const api = (path) =>
    JSON.parse(
      execute("gh", ["api", `repos/${repository}/${path}`], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
  const repo = JSON.parse(
    execute("gh", ["api", `repos/${repository}`], {
      encoding: "utf8",
      stdio: "pipe",
    }),
  );
  if (
    repo.private !== false ||
    repo.default_branch !== "main" ||
    repo.permissions?.admin !== true
  )
    throw new Error(
      "DESKTOP_CLOUD_REPOSITORY: an administrator of the public repository is required",
    );
  assertCloudEnvironment(
    api(`environments/${cloudEnvironment}`),
    api(`environments/${cloudEnvironment}/deployment-branch-policies`),
  );
  // Do not send credentials until the reviewed signing workflow and helpers
  // are actually present on the protected default branch.
  for (const path of [
    ".github/workflows/desktop-macos-release.yml",
    "apps/desktop/scripts/macos-ci-credentials.mjs",
    "apps/desktop/scripts/release-macos.mjs",
    "apps/desktop/scripts/macos-signing.mjs",
    "apps/desktop/electron-builder.macos-signed.config.cjs",
  ]) {
    const remote = api(`contents/${path}?ref=main`);
    if (
      !Buffer.from(remote.content.replace(/\s/g, ""), "base64").equals(
        readFileSync(resolve(root, path)),
      )
    )
      throw new Error(
        "DESKTOP_CLOUD_WORKFLOW: merge the reviewed workflow into main before configuring credentials",
      );
  }
}

export function inspectMacCertificate(
  file,
  environment = process.env,
  execute = execFileSync,
) {
  const path = realpathSync(file);
  const local = relative(root, path);
  if (local !== ".." && !local.startsWith(`..${sep}`))
    throw new Error(
      "Keep the exported certificate outside the source repository",
    );
  if (!environment.DESKTOP_MAC_P12_PASSWORD)
    throw new Error("The exported PKCS#12 must have a password");
  const base = [
    "pkcs12",
    "-in",
    path,
    "-passin",
    "env:DESKTOP_MAC_P12_PASSWORD",
  ];
  let certificate, subject;
  try {
    // No private key is exported to PEM or displayed. Only bag counts and the
    // public leaf certificate are inspected before encrypted upload.
    const details = spawnSync(
      "/usr/bin/openssl",
      [...base, "-info", "-noout"],
      { encoding: "utf8", stdio: "pipe", env: environment },
    );
    if (
      details.status !== 0 ||
      (details.stderr.match(/Shrouded Keybag:/g) ?? []).length !== 1 ||
      /(?:^|\n)Key bag/.test(details.stderr)
    )
      throw new Error(
        "The PKCS#12 must contain exactly one encrypted private key",
      );
    certificate = execute(
      "/usr/bin/openssl",
      [...base, "-clcerts", "-nokeys"],
      { encoding: "utf8", stdio: "pipe", env: environment },
    );
    subject = execute(
      "/usr/bin/openssl",
      ["x509", "-noout", "-subject", "-nameopt", "RFC2253"],
      { encoding: "utf8", stdio: "pipe", input: certificate },
    );
  } catch {
    throw new Error(
      "DESKTOP_CLOUD_CERTIFICATE: cannot decrypt the selected PKCS#12 certificate",
    );
  }
  if (
    (certificate.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1 ||
    !subject.includes("CN=Developer ID Application:")
  )
    throw new Error(
      "Export exactly one Developer ID Application identity, not the entire Keychain",
    );
  const teamId = subject.match(/(?:^|,)OU=([A-Z0-9]{10})(?:,|$)/)?.[1];
  if (!teamId)
    throw new Error("Developer ID certificate has no valid team identifier");
  return { path, teamId, subject: subject.trim() };
}

export function uploadMacCloudSecrets(
  repository,
  certificate,
  environment = process.env,
  execute = execFileSync,
) {
  if (
    environment.DESKTOP_CLOUD_CONFIRM_UPLOAD !==
    `${repository}/${cloudEnvironment}`
  )
    throw new Error(
      "Credential upload needs the operator's explicit confirmation",
    );
  cloudSecretPreflight(repository, execute);
  const identity = inspectMacCertificate(certificate, environment, execute);
  if (
    !environment.DESKTOP_MAC_APPLE_ID ||
    !environment.DESKTOP_MAC_APP_PASSWORD
  )
    throw new Error("Apple account and app-specific password are required");
  const values = {
    DESKTOP_MAC_P12_BASE64: readFileSync(identity.path).toString("base64"),
    DESKTOP_MAC_P12_PASSWORD: environment.DESKTOP_MAC_P12_PASSWORD,
    DESKTOP_MAC_APPLE_ID: environment.DESKTOP_MAC_APPLE_ID,
    DESKTOP_MAC_APP_PASSWORD: environment.DESKTOP_MAC_APP_PASSWORD,
    DESKTOP_MAC_TEAM_ID: identity.teamId,
  };
  if (values.DESKTOP_MAC_P12_BASE64.length > 48 * 1024)
    throw new Error("Certificate exceeds the GitHub Secret size limit");
  for (const [name, value] of Object.entries(values)) {
    try {
      execute(
        "gh",
        [
          "secret",
          "set",
          name,
          "--repo",
          repository,
          "--env",
          cloudEnvironment,
        ],
        { input: value, stdio: "pipe" },
      );
    } catch {
      throw new Error(
        `DESKTOP_CLOUD_SECRET_UPLOAD: failed to set ${name}; credential-bearing output is suppressed`,
      );
    }
  }
  return Object.keys(values);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, repository, certificate] = process.argv.slice(2);
    if (command === "preflight") {
      cloudSecretPreflight(repository);
      console.log(
        `Protected public destination: ${repository} / ${cloudEnvironment}`,
      );
    } else if (command === "inspect")
      console.log(inspectMacCertificate(certificate).subject);
    else if (command === "upload")
      console.log(
        JSON.stringify({
          ok: true,
          environment: cloudEnvironment,
          secrets: uploadMacCloudSecrets(repository, certificate),
        }),
      );
    else throw new Error("Unknown cloud credential setup command");
  } catch (error) {
    console.error(
      error.message.startsWith("DESKTOP_")
        ? error.message
        : "DESKTOP_CLOUD_SETUP: verify the merged workflow, protected environment and selected certificate",
    );
    process.exitCode = 1;
  }
}
