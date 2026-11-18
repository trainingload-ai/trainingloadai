import { randomBytes } from "node:crypto";
import type { DesktopCredentialVault } from "./credential-vault.js";

const AUTH = "instance-auth-secret";
const INTEGRATION = "integration-credential-secret";

/** Credentials belong to a data root, not a particular executable/profile.
 * Existing database identity is validated before importing a legacy vault.
 * A missing or unreadable key must never silently replace an existing identity.
 */
export async function resolveInstanceCredentials(options: {
  vault: DesktopCredentialVault;
  legacyVaults: () => Promise<Array<Pick<DesktopCredentialVault, "get">>>;
  initialized: boolean;
  validateAuthSecret: (secret: string) => Promise<boolean>;
}) {
  let unreadable: unknown;
  async function readCandidate(candidate: Pick<DesktopCredentialVault, "get">) {
    let authSecret: string | null;
    let integrationSecret: string | null;
    try {
      authSecret = await candidate.get(AUTH);
      integrationSecret = await candidate.get(INTEGRATION);
    } catch (error) {
      // A locked/denied OS store cannot accept an import either. Stop rather
      // than trying the same Keychain again through another profile.
      if (
        (error as { code?: string })?.code ===
        "DESKTOP_SECURE_STORAGE_UNAVAILABLE"
      )
        throw error;
      unreadable ??= error;
      return null;
    }
    if (!authSecret && !integrationSecret) return null;
    if (options.initialized && (!authSecret || !integrationSecret)) return null;
    const incomplete = !authSecret || !integrationSecret;
    authSecret ??= randomBytes(32).toString("base64url");
    integrationSecret ??= randomBytes(32).toString("base64url");
    if (!(await options.validateAuthSecret(authSecret))) return null;
    if (candidate !== options.vault || incomplete) {
      await options.vault.setMany({
        [AUTH]: authSecret,
        [INTEGRATION]: integrationSecret,
      });
    }
    return { authSecret, integrationSecret };
  }

  const current = await readCandidate(options.vault);
  if (current) return current;
  // A new database gets its own identity. Do not import a developer's keys
  // just because another profile happens to exist on this machine.
  if (options.initialized) {
    for (const candidate of await options.legacyVaults()) {
      const result = await readCandidate(candidate);
      if (result) return result;
    }
  }
  if (unreadable) {
    throw Object.assign(
      new Error(
        "The existing desktop credentials could not be read from OS secure storage",
      ),
      {
        code: "DESKTOP_CREDENTIALS_UNREADABLE",
      },
    );
  }
  if (options.initialized) {
    throw Object.assign(
      new Error(
        "No readable credentials match the existing desktop database; migrate with the original trusted runtime",
      ),
      { code: "DESKTOP_INSTANCE_SECRET_MISMATCH" },
    );
  }
  const authSecret = randomBytes(32).toString("base64url");
  const integrationSecret = randomBytes(32).toString("base64url");
  await options.vault.setMany({
    [AUTH]: authSecret,
    [INTEGRATION]: integrationSecret,
  });
  return { authSecret, integrationSecret };
}
