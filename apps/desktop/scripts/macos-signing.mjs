import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

export function macSigningOptions(environment = process.env) {
  const teamId = environment.APPLE_TEAM_ID?.trim();
  const profile = environment.APPLE_KEYCHAIN_PROFILE?.trim();
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? "") || !profile)
    fail(
      "DESKTOP_MAC_SIGNING_CONFIG",
      "Set APPLE_TEAM_ID and APPLE_KEYCHAIN_PROFILE. Credentials must already be stored in Keychain.",
    );
  const requestedIdentity =
    environment.TRAININGLOAD_MAC_SIGNING_IDENTITY?.trim();
  if (requestedIdentity && !/^[A-Fa-f0-9]{40}$/.test(requestedIdentity))
    fail(
      "DESKTOP_MAC_SIGNING_IDENTITY",
      "TRAININGLOAD_MAC_SIGNING_IDENTITY must be the certificate SHA-1 fingerprint.",
    );
  return {
    teamId,
    profile,
    keychain:
      environment.APPLE_KEYCHAIN ||
      join(homedir(), "Library/Keychains/login.keychain-db"),
    requestedIdentity: requestedIdentity?.toUpperCase(),
  };
}

export function selectMacIdentity(output, { teamId, requestedIdentity }) {
  const matches = output.split("\n").flatMap((line) => {
    const match = line.match(
      /^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(Developer ID Application: .+)"\s*$/,
    );
    if (!match || !match[2].endsWith(` (${teamId})`)) return [];
    const identity = match[1].toUpperCase();
    return requestedIdentity && requestedIdentity !== identity
      ? []
      : [identity];
  });
  const identities = [...new Set(matches)];
  if (identities.length !== 1)
    fail(
      "DESKTOP_MAC_SIGNING_IDENTITY",
      identities.length
        ? "Multiple Developer ID Application identities match. Set TRAININGLOAD_MAC_SIGNING_IDENTITY explicitly."
        : "No valid Developer ID Application identity matches this team and private key.",
    );
  return identities[0];
}

export function notaryArguments(options) {
  return [
    "--keychain-profile",
    options.profile,
    "--keychain",
    options.keychain,
  ];
}

export function checkMacSigning(environment = process.env) {
  if (process.platform !== "darwin")
    fail(
      "DESKTOP_MAC_SIGNING_PLATFORM",
      "Build and sign macOS releases on macOS.",
    );
  const options = macSigningOptions(environment);
  const identities = execFileSync(
    "security",
    ["find-identity", "-v", "-p", "codesigning", options.keychain],
    { encoding: "utf8" },
  );
  const identity = selectMacIdentity(identities, options);
  for (const tool of ["notarytool", "stapler"])
    execFileSync("xcrun", ["--find", tool], { stdio: "pipe" });
  // Capture history privately: filenames from other submissions are not logs.
  try {
    const result = JSON.parse(
      execFileSync(
        "xcrun",
        [
          "notarytool",
          "history",
          ...notaryArguments(options),
          "--output-format",
          "json",
        ],
        { encoding: "utf8", timeout: 60_000, stdio: "pipe" },
      ),
    );
    if (!Array.isArray(result.history))
      throw new Error("Invalid notary response");
  } catch {
    fail(
      "DESKTOP_MAC_NOTARY_AUTH",
      "Apple notarization authentication failed. Validate the selected Keychain profile locally.",
    );
  }
  return { ...options, identity };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { teamId, profile, identity } = checkMacSigning();
    console.log(JSON.stringify({ ok: true, teamId, profile, identity }));
  } catch (error) {
    console.error(
      JSON.stringify({ ok: false, code: error.code, message: error.message }),
    );
    process.exitCode = 1;
  }
}
