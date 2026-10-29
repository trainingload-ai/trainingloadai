import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import {
  isSupportedComposeVersion,
  validRuntimeVersion,
} from "./management-core.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,199}$/;

export function parseAcceptanceArguments(argv) {
  const options = {
    runId: null,
    platformId: null,
    mode: null,
    releaseDirectory: null,
    releasePreparation: null,
    previousReleaseDirectory: null,
    previousReleasePreparation: null,
    evidenceDirectory: null,
    keepOnFailure: false,
  };
  const names = new Map([
    ["--run-id", "runId"],
    ["--platform-id", "platformId"],
    ["--mode", "mode"],
    ["--release-directory", "releaseDirectory"],
    ["--release-preparation", "releasePreparation"],
    ["--previous-release-directory", "previousReleaseDirectory"],
    ["--previous-release-preparation", "previousReleasePreparation"],
    ["--evidence-directory", "evidenceDirectory"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep-on-failure") {
      options.keepOnFailure = true;
      continue;
    }
    const key = names.get(argument);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--")) {
      throw new Error(`invalid acceptance argument: ${argument}`);
    }
    options[key] = value;
    index += 1;
  }
  for (const [name, key] of names) {
    if (!options[key]) throw new Error(`${name} is required`);
  }
  if (!SAFE_ID.test(options.runId)) throw new Error("--run-id is invalid");
  if (
    !acceptanceContract.platforms.some(({ id }) => id === options.platformId)
  ) {
    throw new Error("--platform-id is not contracted");
  }
  if (!acceptanceContract.modes.includes(options.mode)) {
    throw new Error("--mode is not contracted");
  }
  return options;
}

export function replaceEnvironmentSettings(
  text,
  updates,
  { appendMissing = false } = {},
) {
  const remaining = new Set(Object.keys(updates));
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;
    if (seen.has(match[1])) {
      throw new Error(`duplicate environment setting: ${match[1]}`);
    }
    seen.add(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  if (remaining.size && !appendMissing) {
    throw new Error(
      `missing environment settings: ${[...remaining].join(", ")}`,
    );
  }
  if (appendMissing && remaining.size) {
    while (lines.at(-1) === "") lines.pop();
    for (const name of remaining) lines.push(`${name}=${updates[name]}`);
    lines.push("");
  }
  return lines.join("\n");
}

const BYTE_UNITS = Object.freeze({
  B: 1,
  kB: 1000,
  KB: 1000,
  KiB: 1024,
  MB: 1000 ** 2,
  MiB: 1024 ** 2,
  GB: 1000 ** 3,
  GiB: 1024 ** 3,
});

export function parseDockerByteSize(value) {
  const match = String(value)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*([KMGT]?i?B|kB)$/);
  const multiplier = match ? BYTE_UNITS[match[2]] : null;
  if (!match || !multiplier)
    throw new Error(`invalid Docker byte size: ${value}`);
  return Math.round(Number(match[1]) * multiplier);
}

export function isExpectedDockerOperatingSystem(value, nodePlatform) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 500 ||
    /[\r\n\0]/.test(value)
  ) {
    return false;
  }
  return (
    !["darwin", "win32"].includes(nodePlatform) ||
    /\bdocker desktop\b/i.test(value)
  );
}

export function assertAcceptanceEnvironment(environment, platform) {
  const expectedHostArchitecture =
    platform.architecture === "amd64" ? "x64" : "arm64";
  if (
    environment.platformId !== platform.id ||
    environment.hostPlatform !== platform.nodePlatform ||
    environment.hostArchitecture !== expectedHostArchitecture ||
    !validRuntimeVersion(environment.dockerVersion) ||
    !isSupportedComposeVersion(environment.composeVersion) ||
    environment.dockerArchitecture !== platform.architecture ||
    environment.dockerOsType !== "linux" ||
    !isExpectedDockerOperatingSystem(
      environment.dockerOperatingSystem,
      platform.nodePlatform,
    ) ||
    typeof environment.availableBytes !== "string" ||
    environment.availableBytes.length > 20 ||
    !/^[1-9][0-9]*$/.test(environment.availableBytes) ||
    BigInt(environment.availableBytes) < BigInt(platform.minimumFreeDiskBytes)
  ) {
    throw new Error(
      `${platform.id} environment does not match the contracted runner`,
    );
  }
  return environment;
}

export function latencySummary(samples) {
  if (
    !Array.isArray(samples) ||
    !samples.length ||
    samples.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error("latency samples are invalid");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const nearestRank = (quantile) =>
    sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
  return {
    samples: sorted.length,
    p50: nearestRank(0.5),
    p95: nearestRank(0.95),
    max: sorted.at(-1),
  };
}

export function scenariosForMode(mode, contract = acceptanceContract) {
  if (!contract.modes.includes(mode))
    throw new Error(`unsupported mode: ${mode}`);
  return contract.scenarios.filter((scenario) => scenario.modes.includes(mode));
}

export function assertAcceptanceResourceBaseline(
  measurements,
  contract = acceptanceContract,
  { requireRestore = true } = {},
) {
  const memoryServices = Object.keys(measurements.memoryBytes).sort();
  if (
    JSON.stringify(memoryServices) !==
      JSON.stringify([...contract.resources.measuredServices].sort()) ||
    Object.values(measurements.memoryBytes).some(
      (value) => !Number.isSafeInteger(value) || value <= 0,
    )
  ) {
    throw new Error("resource baseline does not cover every mandatory service");
  }
  const memoryTotal = Object.values(measurements.memoryBytes).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (memoryTotal > contract.thresholds.memoryTotalBytes) {
    throw new Error("mandatory service memory exceeds the contract");
  }
  const { afterInstall, afterFixtures, afterRestore } = measurements.diskBytes;
  if (
    afterInstall <= 0 ||
    afterInstall > contract.thresholds.dataAfterInstallBytes ||
    afterFixtures < afterInstall ||
    afterFixtures - afterInstall > contract.thresholds.fixtureDiskGrowthBytes ||
    (requireRestore &&
      (afterRestore <= 0 ||
        Math.abs(afterRestore - afterFixtures) >
          contract.thresholds.restoreDiskVarianceBytes))
  ) {
    throw new Error("authoritative data disk baseline exceeds the contract");
  }
  return measurements;
}

export function assertPassingAcceptanceReport(
  report,
  contract = acceptanceContract,
) {
  const expected = scenariosForMode(report.mode, contract);
  const actualById = new Map();
  for (const scenario of report.scenarios) {
    if (actualById.has(scenario.id))
      throw new Error(`duplicate scenario: ${scenario.id}`);
    actualById.set(scenario.id, scenario);
  }
  for (const scenario of expected) {
    const actual = actualById.get(scenario.id);
    if (!actual) throw new Error(`missing scenario: ${scenario.id}`);
    if (actual.priority !== scenario.priority || actual.status !== "pass") {
      throw new Error(`scenario did not pass: ${scenario.id}`);
    }
  }
  if (actualById.size !== expected.length) {
    throw new Error("acceptance report contains undeclared scenarios");
  }
  const scenarioDetails = (id) => actualById.get(id)?.details;
  for (const [scenarioId, requiredDetails] of Object.entries(
    contract.scenarioEvidence,
  )) {
    const actual = actualById.get(scenarioId);
    if (!actual) continue;
    const details = actual.details;
    for (const [field, expectedValue] of Object.entries(requiredDetails)) {
      if (JSON.stringify(details?.[field]) !== JSON.stringify(expectedValue)) {
        throw new Error(`scenario evidence mismatch: ${scenarioId}.${field}`);
      }
    }
  }
  const securityById = new Map();
  for (const item of report.security) {
    if (securityById.has(item.id)) {
      throw new Error(`duplicate security evidence: ${item.id}`);
    }
    securityById.set(item.id, item);
  }
  for (const [id, expectedDetails] of Object.entries(
    contract.security.runtimeEvidence,
  )) {
    const actual = securityById.get(id);
    if (!actual || actual.status !== "pass") {
      throw new Error(`required security evidence did not pass: ${id}`);
    }
    if (JSON.stringify(actual.details) !== JSON.stringify(expectedDetails)) {
      throw new Error(`security evidence details mismatch: ${id}`);
    }
  }
  if (
    securityById.size !== Object.keys(contract.security.runtimeEvidence).length
  ) {
    throw new Error("acceptance report contains undeclared security evidence");
  }
  const freshDetails = scenarioDetails("fresh-install");
  const restartDetails = scenarioDetails("restart-persistence");
  const recreateDetails = scenarioDetails("recreate-persistence");
  const databaseFaultDetails = scenarioDetails("database-unavailable-recovery");
  const upgradeDetails = scenarioDetails("signed-upgrade");
  const rollbackDetails = scenarioDetails("declared-application-rollback");
  const resourceDetails = scenarioDetails("resource-baseline");
  if (freshDetails?.releaseVersion !== report.releases.current.version) {
    throw new Error(
      "fresh install evidence does not match the current release",
    );
  }
  if (
    !Number.isSafeInteger(restartDetails?.migrationCount) ||
    restartDetails.migrationCount <= 0 ||
    recreateDetails?.migrationCount !== restartDetails.migrationCount
  ) {
    throw new Error("persistence evidence has an invalid migration count");
  }
  if (!/^[a-f0-9]{64}$/.test(databaseFaultDetails?.diagnosticsSha256 ?? "")) {
    throw new Error(
      "database recovery evidence has an invalid diagnostics hash",
    );
  }
  if (
    upgradeDetails?.sourceVersion !== report.releases.previous.version ||
    upgradeDetails?.targetVersion !== report.releases.current.version ||
    rollbackDetails?.targetVersion !== report.releases.previous.version
  ) {
    throw new Error("upgrade or rollback evidence does not match the releases");
  }
  const providerDetails = scenarioDetails("provider-timeout-degrades");
  if (
    providerDetails &&
    (!Number.isSafeInteger(providerDetails.probeDurationMs) ||
      providerDetails.probeDurationMs <
        contract.thresholds.providerTimeoutMinimumMs)
  ) {
    throw new Error("provider timeout evidence is below the contract");
  }
  if (
    report.measurements.healthLatencyMs.samples <
    contract.thresholds.healthLatencySamples
  ) {
    throw new Error("health latency sample count is below the contract");
  }
  if (
    report.measurements.healthLatencyMs.p50 >
      report.measurements.healthLatencyMs.p95 ||
    report.measurements.healthLatencyMs.p95 >
      report.measurements.healthLatencyMs.max
  ) {
    throw new Error("health latency quantiles are inconsistent");
  }
  if (
    report.measurements.healthLatencyMs.p95 >
    contract.thresholds.healthLatencyP95Ms
  ) {
    throw new Error("health latency p95 exceeds the contract");
  }
  for (const [field, threshold] of [
    ["freshInstallMs", contract.thresholds.freshInstallMs],
    ["restartMs", contract.thresholds.restartMs],
    ["recreateMs", contract.thresholds.recreateMs],
    ["restoreMs", contract.thresholds.restoreMs],
    ["upgradeMs", contract.thresholds.upgradeMs],
  ]) {
    if (
      !Number.isSafeInteger(report.measurements[field]) ||
      report.measurements[field] <= 0 ||
      report.measurements[field] > threshold
    ) {
      throw new Error(`${field} is invalid or exceeds the contract`);
    }
  }
  if (
    resourceDetails?.healthLatencyP95Ms !==
    report.measurements.healthLatencyMs.p95
  ) {
    throw new Error("resource scenario does not match the latency measurement");
  }
  assertAcceptanceResourceBaseline(report.measurements, contract);
  if (report.status !== "passed" || report.failure !== null) {
    throw new Error("acceptance report is not a passing terminal result");
  }
  return report;
}

export function createAcceptanceReport({
  runId,
  platform,
  mode,
  current,
  previous,
}) {
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-acceptance-report",
    runId,
    generatedAt: new Date().toISOString(),
    status: "running",
    platform: {
      id: platform.id,
      host: platform.host,
      nodePlatform: platform.nodePlatform,
      architecture: platform.architecture,
      containerPlatform: platform.containerPlatform,
      runtime: platform.runtime,
    },
    mode,
    releases: {
      current: {
        version: current.releaseVersion,
        revision: current.sourceRevision,
        archiveSha256: current.archiveSha256,
      },
      previous: {
        version: previous.releaseVersion,
        revision: previous.sourceRevision,
        archiveSha256: previous.archiveSha256,
      },
    },
    scenarios: [],
    measurements: {
      freshInstallMs: 0,
      restartMs: 0,
      recreateMs: 0,
      restoreMs: 0,
      upgradeMs: 0,
      healthLatencyMs: { samples: 1, p50: 0, p95: 0, max: 0 },
      memoryBytes: {},
      diskBytes: { afterInstall: 0, afterFixtures: 0, afterRestore: 0 },
    },
    security: [],
    failure: null,
  };
}

export { acceptanceContract as SELF_HOST_ACCEPTANCE_CONTRACT };
