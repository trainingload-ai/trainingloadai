import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { macSigningOptions, selectMacIdentity } from "./macos-signing.mjs";

const first = "A".repeat(40);
const second = "B".repeat(40);
const teamId = "TEAM123456";
const line = (hash, name) => `  1) ${hash} "${name}"`;

test("release selection requires a valid Developer ID Application and the intended team", () => {
  const output = [
    line(first, `Apple Development: Test (${teamId})`),
    line(second, "Developer ID Application: Test (OTHER12345)"),
    line(
      first,
      `Developer ID Application: Test (${teamId}) (CSSMERR_TP_CERT_EXPIRED)`,
    ),
  ].join("\n");
  assert.throws(() => selectMacIdentity(output, { teamId }), {
    code: "DESKTOP_MAC_SIGNING_IDENTITY",
  });
  assert.equal(
    selectMacIdentity(
      output + "\n" + line(first, `Developer ID Application: Test (${teamId})`),
      { teamId },
    ),
    first,
  );
});

test("ambiguous certificates fail unless a matching fingerprint is selected", () => {
  const output = [first, second]
    .map((hash) => line(hash, `Developer ID Application: Test (${teamId})`))
    .join("\n");
  assert.throws(() => selectMacIdentity(output, { teamId }), {
    code: "DESKTOP_MAC_SIGNING_IDENTITY",
  });
  assert.equal(
    selectMacIdentity(output, { teamId, requestedIdentity: second }),
    second,
  );
  assert.throws(
    () =>
      selectMacIdentity(output, { teamId, requestedIdentity: "C".repeat(40) }),
    { code: "DESKTOP_MAC_SIGNING_IDENTITY" },
  );
});

test("release credentials cannot silently fall back to unsigned output", () => {
  for (const environment of [
    {},
    { APPLE_TEAM_ID: teamId },
    { APPLE_KEYCHAIN_PROFILE: "profile" },
  ])
    assert.throws(() => macSigningOptions(environment), {
      code: "DESKTOP_MAC_SIGNING_CONFIG",
    });
  const config = fileURLToPath(
    new URL("../electron-builder.macos-signed.config.cjs", import.meta.url),
  );
  assert.throws(() =>
    execFileSync(process.execPath, ["-e", "require(process.argv[1])", config], {
      env: {},
      stdio: "pipe",
    }),
  );
  const require = createRequire(import.meta.url);
  assert.equal(require("../electron-builder.config.cjs").mac.identity, null);
});
