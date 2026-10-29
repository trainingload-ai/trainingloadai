import { createHash } from "node:crypto";
import { validateDoctorReport } from "./doctor-core.mjs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MODES = new Set(["core-local", "connected", "extended", "unknown"]);

const SENSITIVE_PATTERNS = Object.freeze([
  {
    id: "private-key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi,
  },
  {
    id: "bearer-token",
    expression: /\bBearer\s+(?!\[REDACTED\])[^\s,"'}]+/gi,
  },
  {
    id: "jwt",
    expression:
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: "github-token",
    expression:
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    id: "aws-access-key",
    expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    id: "secret-assignment",
    expression:
      /(?:password|passcode|secret|token|authorization|cookie|credential|api[-_]?key)["']?\s*[:=]\s*["']?(?!\[REDACTED\])[^\s,"'}]{6,}/gi,
  },
  {
    id: "connection-password",
    expression:
      /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/]+:(?!\[REDACTED\])[^@\s/]+@/gi,
  },
  {
    id: "email-address",
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    id: "posix-home-user",
    expression: /(?:\/home|\/Users)\/(?!\[REDACTED_USER\])[^/\s"'\\]+/g,
  },
  {
    id: "windows-home-user",
    expression:
      /\b[A-Za-z]:[\\/]+Users[\\/]+(?!\[REDACTED_USER\])[^\\/\s"']+/gi,
  },
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function replaceWithCount(text, expression, replacement, state) {
  return text.replace(expression, (...args) => {
    state.redactions += 1;
    return typeof replacement === "function"
      ? replacement(...args)
      : replacement;
  });
}

function redactString(value, secrets, state) {
  let output = value;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 6) continue;
    if (!output.includes(secret)) continue;
    const occurrences = output.split(secret).length - 1;
    state.redactions += occurrences;
    output = output.split(secret).join("[REDACTED]");
  }
  output = replaceWithCount(
    output,
    /\bBearer\s+[^\s,"'}]+/gi,
    "Bearer [REDACTED]",
    state,
  );
  output = replaceWithCount(
    output,
    /((?:password|passcode|secret|token|authorization|cookie|credential|api[-_]?key)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
    (_match, prefix) => `${prefix}[REDACTED]`,
    state,
  );
  output = replaceWithCount(
    output,
    /([?&](?:password|secret|token|signature|key)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}[REDACTED]`,
    state,
  );
  output = replaceWithCount(
    output,
    /((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/]+:)[^@\s/]+@/gi,
    (_match, prefix) => `${prefix}[REDACTED]@`,
    state,
  );
  output = replaceWithCount(
    output,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[REDACTED_EMAIL]",
    state,
  );
  output = replaceWithCount(
    output,
    /((?:\/home|\/Users)\/)[^/\s"'\\]+/g,
    (_match, prefix) => `${prefix}[REDACTED_USER]`,
    state,
  );
  output = replaceWithCount(
    output,
    /(\b[A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi,
    (_match, prefix) => `${prefix}[REDACTED_USER]`,
    state,
  );
  return output;
}

function redactValue(value, secrets, state) {
  if (typeof value === "string") return redactString(value, secrets, state);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets, state));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        redactValue(child, secrets, state),
      ]),
    );
  }
  return value;
}

export function scanDiagnosticsText(text, secretValues = []) {
  const findings = [];
  for (const [index, secret] of secretValues.entries()) {
    if (
      typeof secret === "string" &&
      secret.length >= 6 &&
      text.includes(secret)
    ) {
      findings.push(`exact-secret-${index + 1}`);
    }
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.expression.lastIndex = 0;
    if (pattern.expression.test(text)) findings.push(pattern.id);
  }
  return [...new Set(findings)].sort();
}

export function buildDiagnosticsBundle({
  bundleId,
  generatedAt,
  releaseVersion,
  mode,
  doctor,
  configuration,
  logs,
  operations,
  secretValues = [],
}) {
  validateDoctorReport(doctor);
  if (
    !UUID.test(bundleId ?? "") ||
    !Number.isFinite(Date.parse(generatedAt ?? "")) ||
    typeof releaseVersion !== "string" ||
    !releaseVersion ||
    !MODES.has(mode) ||
    !isJsonValue(configuration) ||
    !isJsonValue(logs) ||
    !Array.isArray(operations) ||
    !isJsonValue(operations)
  ) {
    throw new Error("invalid self-host diagnostics bundle input");
  }
  const state = { redactions: 0 };
  const contents = redactValue(
    { doctor, configuration, logs, operations },
    secretValues,
    state,
  );
  const contentsJson = JSON.stringify(contents);
  const findings = scanDiagnosticsText(contentsJson, secretValues);
  if (findings.length) {
    throw new Error(
      `self-host diagnostics secret scan failed: ${findings.join(", ")}`,
    );
  }
  const bundle = {
    schemaVersion: 1,
    kind: "trainingload-selfhost-diagnostics",
    bundleId,
    generatedAt,
    releaseVersion,
    mode,
    privacy: {
      policy: "allowlist-v1",
      redactionsApplied: state.redactions,
      secretScan: "pass",
      operatorReviewRequired: true,
    },
    integrity: {
      algorithm: "sha256",
      contentsSha256: sha256(contentsJson),
    },
    contents,
  };
  return validateDiagnosticsBundle(bundle, secretValues);
}

export function validateDiagnosticsBundle(bundle, secretValues = []) {
  if (
    !hasExactKeys(bundle, [
      "schemaVersion",
      "kind",
      "bundleId",
      "generatedAt",
      "releaseVersion",
      "mode",
      "privacy",
      "integrity",
      "contents",
    ]) ||
    bundle.schemaVersion !== 1 ||
    bundle.kind !== "trainingload-selfhost-diagnostics" ||
    !UUID.test(bundle.bundleId ?? "") ||
    !Number.isFinite(Date.parse(bundle.generatedAt ?? "")) ||
    typeof bundle.releaseVersion !== "string" ||
    !bundle.releaseVersion ||
    !MODES.has(bundle.mode) ||
    !hasExactKeys(bundle.privacy, [
      "policy",
      "redactionsApplied",
      "secretScan",
      "operatorReviewRequired",
    ]) ||
    bundle.privacy.policy !== "allowlist-v1" ||
    !Number.isSafeInteger(bundle.privacy.redactionsApplied) ||
    bundle.privacy.redactionsApplied < 0 ||
    bundle.privacy.secretScan !== "pass" ||
    bundle.privacy.operatorReviewRequired !== true ||
    !hasExactKeys(bundle.integrity, ["algorithm", "contentsSha256"]) ||
    bundle.integrity.algorithm !== "sha256" ||
    !SHA256.test(bundle.integrity.contentsSha256 ?? "") ||
    !hasExactKeys(bundle.contents, [
      "doctor",
      "configuration",
      "logs",
      "operations",
    ]) ||
    !isJsonValue(bundle.contents.configuration) ||
    !isJsonValue(bundle.contents.logs) ||
    !Array.isArray(bundle.contents.operations) ||
    !isJsonValue(bundle.contents.operations)
  ) {
    throw new Error("invalid self-host diagnostics bundle");
  }
  validateDoctorReport(bundle.contents.doctor);
  const contentsJson = JSON.stringify(bundle.contents);
  if (sha256(contentsJson) !== bundle.integrity.contentsSha256) {
    throw new Error("self-host diagnostics contents checksum mismatch");
  }
  const findings = scanDiagnosticsText(JSON.stringify(bundle), secretValues);
  if (findings.length) {
    throw new Error(
      `self-host diagnostics secret scan failed: ${findings.join(", ")}`,
    );
  }
  return bundle;
}
