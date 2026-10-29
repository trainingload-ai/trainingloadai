import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildDoctorReport,
  createDoctorCheck,
  DOCTOR_REMEDIATIONS,
  validateDoctorReport,
} from "./doctor-core.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

function check(code, status) {
  return createDoctorCheck({
    code,
    category: "host",
    status,
    summary: `${code} is ${status}`,
    errorCode: status === "fail" ? "SELF_HOST_DOCKER_UNAVAILABLE" : null,
    remediation: DOCTOR_REMEDIATIONS.host,
    details: { count: 1 },
  });
}

test("builds a schema-valid doctor report with deterministic severity", async () => {
  const report = buildDoctorReport({
    generatedAt: "2026-10-17T00:00:00.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    checks: [
      check("SELF_HOST_DOCTOR_HOST", "pass"),
      check("SELF_HOST_DOCTOR_DISK", "warning"),
      check("SELF_HOST_DOCTOR_DOCKER", "fail"),
    ],
  });
  assert.equal(report.overall, "fail");
  assert.deepEqual(report.counts, {
    pass: 1,
    warning: 1,
    fail: 1,
    skipped: 0,
  });
  assert.equal(validateDoctorReport(report), report);

  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-doctor-report.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test("rejects duplicate checks and summary tampering", () => {
  const duplicate = check("SELF_HOST_DOCTOR_HOST", "pass");
  assert.throws(
    () =>
      buildDoctorReport({
        generatedAt: "2026-10-17T00:00:00.000Z",
        releaseVersion: "1.1.13",
        mode: "core-local",
        checks: [duplicate, duplicate],
      }),
    /unique/,
  );
  const report = buildDoctorReport({
    generatedAt: "2026-10-17T00:00:00.000Z",
    releaseVersion: "1.1.13",
    mode: "core-local",
    checks: [duplicate],
  });
  report.overall = "warning";
  assert.throws(() => validateDoctorReport(report), /summary/);
});
