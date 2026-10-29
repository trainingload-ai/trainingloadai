const CHECK_CODE = /^SELF_HOST_DOCTOR_[A-Z0-9_]+$/;
const ERROR_CODE = /^SELF_HOST_[A-Z0-9_]+$/;
const REMEDIATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(["pass", "warning", "fail", "skipped"]);
const CATEGORIES = new Set([
  "release",
  "host",
  "configuration",
  "security",
  "runtime",
  "storage",
  "database",
  "capability",
  "recovery",
]);

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function isJsonValue(value) {
  if (value === null) return true;
  if (["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    typeof value === "object" &&
    Object.entries(value).every(
      ([key, child]) => typeof key === "string" && isJsonValue(child),
    )
  );
}

export function createDoctorCheck({
  code,
  category,
  status,
  summary,
  errorCode = null,
  remediation,
  details = {},
}) {
  const check = {
    code,
    category,
    status,
    summary,
    errorCode,
    remediation,
    details,
  };
  validateDoctorCheck(check);
  return check;
}

export function validateDoctorCheck(check) {
  if (
    !hasExactKeys(check, [
      "code",
      "category",
      "status",
      "summary",
      "errorCode",
      "remediation",
      "details",
    ]) ||
    !CHECK_CODE.test(check.code ?? "") ||
    !CATEGORIES.has(check.category) ||
    !STATUSES.has(check.status) ||
    typeof check.summary !== "string" ||
    !check.summary ||
    !(
      check.errorCode === null ||
      (typeof check.errorCode === "string" && ERROR_CODE.test(check.errorCode))
    ) ||
    !hasExactKeys(check.remediation, ["id", "documentation"]) ||
    !REMEDIATION_ID.test(check.remediation.id ?? "") ||
    typeof check.remediation.documentation !== "string" ||
    !/^docs\/self-hosting\/[a-z0-9./#-]+\.zh\.md(?:#[a-z0-9-]+)?$/.test(
      check.remediation.documentation,
    ) ||
    !isJsonValue(check.details)
  ) {
    throw new Error(
      `invalid self-host doctor check: ${check?.code ?? "unknown"}`,
    );
  }
  return check;
}

export function buildDoctorReport({
  generatedAt,
  releaseVersion,
  mode,
  checks,
}) {
  if (
    !Number.isFinite(Date.parse(generatedAt ?? "")) ||
    typeof releaseVersion !== "string" ||
    !releaseVersion ||
    !["core-local", "connected", "extended", "unknown"].includes(mode) ||
    !Array.isArray(checks) ||
    !checks.length
  ) {
    throw new Error("invalid self-host doctor report input");
  }
  for (const check of checks) validateDoctorCheck(check);
  const codes = checks.map((check) => check.code);
  if (new Set(codes).size !== codes.length) {
    throw new Error("self-host doctor check codes must be unique");
  }
  const counts = Object.fromEntries(
    [...STATUSES].map((status) => [
      status,
      checks.filter((check) => check.status === status).length,
    ]),
  );
  const overall =
    counts.fail > 0 ? "fail" : counts.warning > 0 ? "warning" : "pass";
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-doctor-report",
    generatedAt,
    releaseVersion,
    mode,
    overall,
    counts,
    checks,
  };
}

export function validateDoctorReport(report) {
  if (
    !hasExactKeys(report, [
      "schemaVersion",
      "kind",
      "generatedAt",
      "releaseVersion",
      "mode",
      "overall",
      "counts",
      "checks",
    ]) ||
    report.schemaVersion !== 1 ||
    report.kind !== "trainingload-selfhost-doctor-report" ||
    !Number.isFinite(Date.parse(report.generatedAt ?? "")) ||
    typeof report.releaseVersion !== "string" ||
    !report.releaseVersion ||
    !["core-local", "connected", "extended", "unknown"].includes(report.mode) ||
    !["pass", "warning", "fail"].includes(report.overall) ||
    !hasExactKeys(report.counts, ["pass", "warning", "fail", "skipped"]) ||
    Object.values(report.counts).some(
      (count) => !Number.isInteger(count) || count < 0,
    ) ||
    !Array.isArray(report.checks)
  ) {
    throw new Error("invalid self-host doctor report");
  }
  const rebuilt = buildDoctorReport({
    generatedAt: report.generatedAt,
    releaseVersion: report.releaseVersion,
    mode: report.mode,
    checks: report.checks,
  });
  if (
    rebuilt.overall !== report.overall ||
    JSON.stringify(rebuilt.counts) !== JSON.stringify(report.counts)
  ) {
    throw new Error(
      "self-host doctor report summary does not match its checks",
    );
  }
  return report;
}

export const DOCTOR_REMEDIATIONS = Object.freeze({
  release: {
    id: "repair-release-bundle",
    documentation: "docs/self-hosting/management-cli.zh.md",
  },
  host: {
    id: "check-host-prerequisites",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  configuration: {
    id: "repair-self-host-configuration",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  security: {
    id: "repair-security-boundary",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  runtime: {
    id: "repair-runtime-state",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  storage: {
    id: "repair-storage-state",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  database: {
    id: "repair-database-state",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  capability: {
    id: "repair-capability-state",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
  recovery: {
    id: "verify-recovery-state",
    documentation: "docs/self-hosting/doctor-and-diagnostics.zh.md",
  },
});
