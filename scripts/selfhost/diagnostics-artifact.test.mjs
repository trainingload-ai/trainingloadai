import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildDiagnosticsBundle,
  scanDiagnosticsText,
  validateDiagnosticsBundle,
} from "./diagnostics-artifact.mjs";
import {
  buildDoctorReport,
  createDoctorCheck,
  DOCTOR_REMEDIATIONS,
} from "./doctor-core.mjs";

function doctor() {
  return buildDoctorReport({
    generatedAt: "2026-10-17T00:00:00.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    checks: [
      createDoctorCheck({
        code: "SELF_HOST_DOCTOR_HOST",
        category: "host",
        status: "pass",
        summary: "Host passed",
        remediation: DOCTOR_REMEDIATIONS.host,
      }),
    ],
  });
}

test("diagnostics bundle redacts exact and generic secrets before hashing", () => {
  const secret = "exact-secret-that-must-not-leak";
  const bundle = buildDiagnosticsBundle({
    bundleId: "10000000-0000-4000-8000-000000000001",
    generatedAt: "2026-10-17T00:00:01.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    doctor: doctor(),
    configuration: { settings: { SELF_HOST_MODE: "core-local" } },
    logs: {
      status: "collected",
      lines: [
        `authorization=another-sensitive-value ${secret}`,
        "postgresql://user:database-password@example.invalid/db",
      ],
    },
    operations: [],
    secretValues: [secret],
  });
  const serialized = JSON.stringify(bundle);

  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("another-sensitive-value"), false);
  assert.equal(serialized.includes("database-password"), false);
  assert.ok(bundle.privacy.redactionsApplied >= 3);
  assert.equal(validateDiagnosticsBundle(bundle, [secret]), bundle);
});

test("diagnostics validation rejects tampering and unredacted credentials", () => {
  assert.deepEqual(
    scanDiagnosticsText(
      "Bearer raw-token-value eyJheader12345.eyJpayload12345.signature12345",
    ),
    ["bearer-token", "jwt"],
  );
  const bundle = buildDiagnosticsBundle({
    bundleId: "10000000-0000-4000-8000-000000000002",
    generatedAt: "2026-10-17T00:00:01.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    doctor: doctor(),
    configuration: { settings: {} },
    logs: { status: "unavailable", errorCode: "SELF_HOST_LOGS_FAILED" },
    operations: [],
  });
  bundle.contents.logs.status = "collected";
  assert.throws(() => validateDiagnosticsBundle(bundle), /checksum mismatch/);
});

test("diagnostics bundle pseudonymizes email addresses and home-directory users", () => {
  const privateValues = [
    "athlete@example.com",
    "/home/victor/starshards/server.log",
    "/Users/victor/Library/Application Support/Trainingload/config.json",
    String.raw`C:\Users\Victor\AppData\Local\Trainingload\server.log`,
  ];
  const bundle = buildDiagnosticsBundle({
    bundleId: "10000000-0000-4000-8000-000000000003",
    generatedAt: "2026-10-17T00:00:01.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    doctor: doctor(),
    configuration: {
      supportContact: privateValues[0],
      linuxPath: privateValues[1],
      macosPath: privateValues[2],
      windowsPath: privateValues[3],
    },
    logs: { status: "collected", lines: privateValues },
    operations: [],
  });
  const serialized = JSON.stringify(bundle);

  for (const value of privateValues) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(serialized.includes("[REDACTED_EMAIL]"), true);
  assert.equal(serialized.includes("/home/[REDACTED_USER]/"), true);
  assert.equal(serialized.includes("/Users/[REDACTED_USER]/"), true);
  assert.equal(serialized.includes("Victor"), false);
  assert.ok(bundle.privacy.redactionsApplied >= 8);
  assert.deepEqual(scanDiagnosticsText(serialized), []);
});

test("diagnostics validation rejects reintroduced identity data after rehashing", () => {
  const bundle = buildDiagnosticsBundle({
    bundleId: "10000000-0000-4000-8000-000000000004",
    generatedAt: "2026-10-17T00:00:01.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    doctor: doctor(),
    configuration: { supportContact: "athlete@example.com" },
    logs: { status: "collected", lines: ["/Users/victor/server.log"] },
    operations: [],
  });
  bundle.contents.configuration.supportContact = "athlete@example.com";
  bundle.contents.logs.lines[0] = "/Users/victor/server.log";
  bundle.integrity.contentsSha256 = createHash("sha256")
    .update(JSON.stringify(bundle.contents))
    .digest("hex");

  assert.throws(
    () => validateDiagnosticsBundle(bundle),
    /email-address, posix-home-user/,
  );
});
