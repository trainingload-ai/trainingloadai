import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkDesktopCredentials } from "./credential-check.js";

test("release credential check reopens the original secret and refuses a different OS key", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-credential-check-"));
  try {
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`protected:${value}`),
      decryptString: (value: Buffer) =>
        value.toString().slice("protected:".length),
    };
    assert.deepEqual(await checkDesktopCredentials(root, "create", storage), {
      ok: true,
      phase: "create",
    });
    assert.deepEqual(await checkDesktopCredentials(root, "reopen", storage), {
      ok: true,
      phase: "reopen",
    });
    await assert.rejects(checkDesktopCredentials(root, "create", storage), {
      code: "EEXIST",
    });
    const before = await readFile(join(root, "credential-check/vault.json"));
    await assert.rejects(
      checkDesktopCredentials(root, "reopen", {
        ...storage,
        decryptString: () => "wrong-key",
      }),
      /original value/,
    );
    assert.deepEqual(
      await readFile(join(root, "credential-check/vault.json")),
      before,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
