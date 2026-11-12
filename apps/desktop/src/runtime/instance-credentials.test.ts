import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DesktopCredentialVault } from "./credential-vault.js";
import { resolveInstanceCredentials } from "./instance-credentials.js";

const adapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().slice("encrypted:".length),
};

test("imports the database-matching legacy identity without changing either legacy vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-identity-"));
  try {
    const vault = new DesktopCredentialVault(
      join(root, "data-vault.json"),
      adapter,
    );
    const wrong = new DesktopCredentialVault(
      join(root, "new-profile.json"),
      adapter,
    );
    const original = new DesktopCredentialVault(
      join(root, "old-profile.json"),
      adapter,
    );
    await wrong.setMany({
      "instance-auth-secret": "wrong",
      "integration-credential-secret": "wrong-integration",
    });
    await original.setMany({
      "instance-auth-secret": "matching",
      "integration-credential-secret": "original-integration",
    });
    const before = await readFile(join(root, "old-profile.json"), "utf8");
    const result = await resolveInstanceCredentials({
      vault,
      legacyVaults: [wrong, original],
      initialized: true,
      validateAuthSecret: async (value) => value === "matching",
    });
    assert.deepEqual(result, {
      authSecret: "matching",
      integrationSecret: "original-integration",
    });
    assert.equal(await vault.get("instance-auth-secret"), "matching");
    assert.equal(
      await readFile(join(root, "old-profile.json"), "utf8"),
      before,
    );
    assert.equal(await wrong.get("instance-auth-secret"), "wrong");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses to regenerate an initialized database identity when every candidate mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-identity-"));
  try {
    const path = join(root, "vault.json");
    const vault = new DesktopCredentialVault(path, adapter);
    await vault.setMany({
      "instance-auth-secret": "original",
      "integration-credential-secret": "integration",
    });
    const before = await readFile(path, "utf8");
    await assert.rejects(
      resolveInstanceCredentials({
        vault,
        legacyVaults: [],
        initialized: true,
        validateAuthSecret: async () => false,
      }),
      (error: { code?: string }) =>
        error.code === "DESKTOP_INSTANCE_SECRET_MISMATCH",
    );
    assert.equal(await readFile(path, "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists a fresh identity once and keeps it across subsequent launches", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-identity-"));
  try {
    const vault = new DesktopCredentialVault(join(root, "vault.json"), adapter);
    const options = {
      vault,
      legacyVaults: [],
      initialized: false,
      validateAuthSecret: async () => true,
    };
    const first = await resolveInstanceCredentials(options);
    assert.deepEqual(await resolveInstanceCredentials(options), first);
    assert.equal(
      await vault.get("integration-credential-secret"),
      first.integrationSecret,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
