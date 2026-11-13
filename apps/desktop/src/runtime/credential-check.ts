import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DesktopCredentialVault,
  type SafeStorageAdapter,
} from "./credential-vault.js";

/** Headless signed-release acceptance. Only synthetic credentials in a new,
 * explicitly selected profile; never open a database or create an Owner.
 */
export async function checkDesktopCredentials(
  profile: string,
  phase: string,
  storage: SafeStorageAdapter,
) {
  if (phase !== "create" && phase !== "reopen")
    throw new Error("Unknown credential check phase");
  const directory = join(profile, "credential-check");
  const marker = join(directory, "check.json");
  const vault = new DesktopCredentialVault(
    join(directory, "vault.json"),
    storage,
  );
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  if (phase === "create") {
    // mkdir without recursive prevents overwriting an earlier check/profile.
    await mkdir(directory);
    const value = randomBytes(32).toString("base64url");
    await vault.set("synthetic-release-check", value);
    await writeFile(
      marker,
      JSON.stringify({ schemaVersion: 1, digest: digest(value) }),
      { flag: "wx", mode: 0o600 },
    );
  }
  const expected = JSON.parse(await readFile(marker, "utf8"));
  if (expected.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(expected.digest))
    throw new Error("Invalid credential check marker");
  const value = await vault.get("synthetic-release-check");
  if (!value || digest(value) !== expected.digest)
    throw new Error("Credential check did not recover the original value");
  return { ok: true, phase };
}
