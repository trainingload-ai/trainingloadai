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
  legacyVaults: Array<Pick<DesktopCredentialVault, "get">>;
  initialized: boolean;
  validateAuthSecret: (secret: string) => Promise<boolean>;
}) {
  let unreadable = false;
  for (const candidate of [options.vault, ...options.legacyVaults]) {
    let authSecret: string | null;
    let integrationSecret: string | null;
    try {
      authSecret = await candidate.get(AUTH);
      integrationSecret = await candidate.get(INTEGRATION);
    } catch {
      unreadable = true;
      continue;
    }
    if (!authSecret && !integrationSecret) continue;
    if (options.initialized && (!authSecret || !integrationSecret)) continue;
    const incomplete = !authSecret || !integrationSecret;
    authSecret ??= randomBytes(32).toString("base64url");
    integrationSecret ??= randomBytes(32).toString("base64url");
    if (!(await options.validateAuthSecret(authSecret))) continue;
    if (candidate !== options.vault || incomplete) {
      await options.vault.setMany({
        [AUTH]: authSecret,
        [INTEGRATION]: integrationSecret,
      });
    }
    return { authSecret, integrationSecret };
  }
  if (options.initialized || unreadable) {
    throw Object.assign(
      new Error(
        "找不到与本地数据库匹配的身份密钥。请使用原版本迁移密钥；现有数据和密钥均未重置。",
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
