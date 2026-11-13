import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DesktopCredentialVault,
  type SafeStorageAdapter,
} from "./credential-vault.js";

const testStorage: SafeStorageAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, ""),
};

test("stores only encrypted credential material and can delete it", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-vault-"));
  try {
    const vault = new DesktopCredentialVault(
      join(root, "vault.json"),
      testStorage,
    );
    await vault.set("ai-key", "secret-value");
    assert.equal(await vault.get("ai-key"), "secret-value");
    await vault.delete("ai-key");
    assert.equal(await vault.get("ai-key"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("absent values, deletions and empty writes never request OS secure-storage access", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "trainingload-desktop-no-keychain-"),
  );
  try {
    const path = join(root, "vault.json");
    const fail = () => {
      throw new Error("unexpected Keychain access");
    };
    const vault = new DesktopCredentialVault(path, {
      isEncryptionAvailable: fail,
      encryptString: fail,
      decryptString: fail,
    });
    assert.equal(await vault.get("absent"), null);
    await vault.delete("absent");
    await vault.setMany({});
    assert.deepEqual(await readdir(root), []);
    await new DesktopCredentialVault(path, testStorage).set("existing", "keep");
    assert.equal(await vault.get("absent"), null);
    await vault.delete("existing");
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")).values, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent startup secrets and interleaved mutations survive reopening", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-vault-"));
  try {
    const path = join(root, "vault.json");
    const vault = new DesktopCredentialVault(path, testStorage);
    await vault.set("obsolete", "old-secret");
    await Promise.all([
      ...Array.from({ length: 32 }, (_, i) =>
        vault.set(`key-${i}`, `secret-${i}`),
      ),
      vault.delete("obsolete"),
    ]);
    const reopened = new DesktopCredentialVault(path, testStorage);
    for (let i = 0; i < 32; i++) {
      assert.equal(await reopened.get(`key-${i}`), `secret-${i}`);
    }
    assert.equal(await reopened.get("obsolete"), null);
    assert.deepEqual(await readdir(root), ["vault.json"]);
    if (process.platform !== "win32")
      assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed encryption preserves existing credentials and does not block subsequent writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-vault-"));
  try {
    const path = join(root, "vault.json");
    const vault = new DesktopCredentialVault(path, {
      ...testStorage,
      encryptString: (value) => {
        if (value === "fail") throw new Error("secure storage unavailable");
        return testStorage.encryptString(value);
      },
    });
    await vault.set("existing", "keep");
    const before = await readFile(path, "utf8");
    await assert.rejects(
      vault.set("existing", "fail"),
      /secure storage unavailable/,
    );
    assert.equal(await readFile(path, "utf8"), before);
    await vault.set("next", "works");
    assert.equal(await vault.get("existing"), "keep");
    assert.equal(await vault.get("next"), "works");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
