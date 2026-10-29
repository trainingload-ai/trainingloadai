import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "../..");
const BOOTSTRAP_TTL_ENVIRONMENT =
  "${SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS:-86400}";
const REQUIRED_SERVER_ENVIRONMENT = Object.freeze({
  NODE_OPTIONS: "--max-old-space-size=256 --max-semi-space-size=4",
  EXTERNAL_PROVIDER_CREDENTIAL_SECRET:
    "${SELF_HOST_INTEGRATION_SECRET:?Set SELF_HOST_INTEGRATION_SECRET in .env.selfhost}",
  SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS: BOOTSTRAP_TTL_ENVIRONMENT,
  STORAGE_STRATEGY: "LOCAL",
  BILLING_PROVIDER: "none",
  TELEMETRY_ENABLED: "false",
  WEATHER_PROVIDER: "none",
  ACTIVITY_WEATHER_ENABLED: "false",
  AI_TODAY_WEATHER_ENABLED: "false",
  THIRD_PARTY_SYNC_ENABLED: "false",
  THIRD_PARTY_WEBHOOK_BOOTSTRAP: "false",
  AGENT_CAPABILITIES_ENABLED: "false",
  DEPLOYMENT_MODE: "self-host",
  SOCIAL_AUTH_ENABLED: "false",
  PUBLIC_DEMO_ENABLED: "false",
});
const REQUIRED_FRONTEND_ENVIRONMENT = Object.freeze({
  NODE_OPTIONS: "--max-old-space-size=128 --max-semi-space-size=4",
  NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
});

function exactStringMap(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.join(",") === expectedKeys.join(",") &&
    expectedKeys.every((key) => actual[key] === expected[key])
  );
}

function issue(file, code, message) {
  return { file, code, message };
}

function service(model, name) {
  return model?.services?.[name];
}

function dependencyCondition(definition, dependency) {
  const value = definition?.depends_on?.[dependency];
  return typeof value === "object" ? value?.condition : null;
}

function hasVolume(definition, expected) {
  return (definition?.volumes ?? []).some(
    (volume) => volumeSignature(volume) === expected,
  );
}

function volumeSignature(volume) {
  if (typeof volume === "string") return volume;
  return `${volume?.source}:${volume?.target}${volume?.read_only ? ":ro" : ""}`;
}

function parseYaml(text, file, errors) {
  try {
    return YAML.parse(text, { merge: true });
  } catch (error) {
    errors.push(
      issue(
        file,
        "YAML",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return null;
  }
}

export function validateCompose(compose, text, contract) {
  const file = contract.compose;
  const errors = [];
  if (!compose) return [issue(file, "YAML", "compose document is empty")];
  if (compose.name !== "${SELF_HOST_PROJECT_NAME:-trainingload-selfhost}") {
    errors.push(
      issue(
        file,
        "PROJECT_NAME",
        "compose project name must default to trainingload-selfhost and allow an explicit isolated instance namespace",
      ),
    );
  }

  for (const name of contract.requiredServices) {
    if (!service(compose, name)) {
      errors.push(issue(file, "SERVICE", `missing required service: ${name}`));
    }
  }

  const postgres = service(compose, "postgres");
  const permissions = service(compose, "permissions");
  const client = service(compose, "client");
  if (Object.keys(compose.services ?? {}).sort().join(",") !== [...contract.requiredServices].sort().join(",")) {
    errors.push(issue(file, "SERVICE_BOUNDARY", "Self-host services must exactly match the contracted runtime; Docs and gateway are not allowed"));
  }
  if (postgres?.image !== contract.externalImages.postgres.reference) {
    errors.push(
      issue(
        file,
        "POSTGRES_IMAGE",
        "PostgreSQL must use the contracted version and index digest",
      ),
    );
  }
  if (permissions?.image !== service(compose, "migrate")?.image || permissions?.network_mode !== "none") {
    errors.push(issue(file, "PERMISSIONS_IMAGE", "permissions must reuse the migration image without network access"));
  }

  for (const name of ["migrate", "server", "client"]) {
    const image = String(service(compose, name)?.image ?? "");
    if (!image || /(?:^|:)latest(?:@|$)/i.test(image)) {
      errors.push(
        issue(
          file,
          "APP_IMAGE",
          `${name} must use an explicit non-latest image reference`,
        ),
      );
    }
  }
  for (const [name, expected] of [
    ["migrate", "${SELF_HOST_MIGRATE_IMAGE:?Set SELF_HOST_MIGRATE_IMAGE in .env.selfhost}"],
    ["server", "${SELF_HOST_SERVER_IMAGE:?Set SELF_HOST_SERVER_IMAGE in .env.selfhost}"],
    ["client", "${SELF_HOST_CLIENT_IMAGE:?Set SELF_HOST_CLIENT_IMAGE in .env.selfhost}"],
  ]) {
    if (service(compose, name)?.image !== expected) {
      errors.push(
        issue(
          file,
          "APP_IMAGE_BINDING",
          `${name} must use its dedicated immutable image setting`,
        ),
      );
    }
  }

  for (const [name, definition] of Object.entries(compose.services ?? {})) {
    if (definition?.container_name) {
      errors.push(
        issue(
          file,
          "CONTAINER_NAME",
          `${name} must not reserve a global container name`,
        ),
      );
    }
    if (definition?.env_file) {
      errors.push(
        issue(
          file,
          "ENV_FILE",
          `${name} must not load an implicit application env file`,
        ),
      );
    }
  }
  for (const forbidden of contract.forbiddenConfiguration) {
    if (text.includes(forbidden)) {
      errors.push(
        issue(
          file,
          "PRODUCTION_SECRET",
          `self-host compose must not depend on ${forbidden}`,
        ),
      );
    }
  }

  const migrate = service(compose, "migrate");
  const migrationCommand = (migrate?.command ?? []).join(" ");
  if (
    !migrationCommand.includes("node core/runner/core-migration-runner.mjs")
  ) {
    errors.push(
      issue(
        file,
        "MIGRATION_COMMAND",
        "migration job must run the checksum-verified Core SQL runner from the release image",
      ),
    );
  }
  if (migrate?.restart !== "no") {
    errors.push(
      issue(file, "MIGRATION_RESTART", "migration job must be one-shot"),
    );
  }
  if (dependencyCondition(migrate, "postgres") !== "service_healthy") {
    errors.push(
      issue(
        file,
        "MIGRATION_ORDER",
        "migration must wait for a healthy PostgreSQL service",
      ),
    );
  }

  const server = service(compose, "server");
  if (
    !exactStringMap(
      contract.requiredServerEnvironment,
      REQUIRED_SERVER_ENVIRONMENT,
    )
  ) {
    errors.push(
      issue(
        file,
        "SERVER_ENVIRONMENT_CONTRACT",
        "Compose contract must freeze the validated server environment and disabled v1 capabilities",
      ),
    );
  }
  for (const [name, expected] of Object.entries(
    contract.requiredServerEnvironment ?? {},
  )) {
    if (server?.environment?.[name] !== expected) {
      errors.push(
        issue(
          file,
          "SERVER_ENVIRONMENT",
          `server must receive contracted environment ${name}`,
        ),
      );
    }
  }
  if (
    dependencyCondition(server, "migrate") !== "service_completed_successfully"
  ) {
    errors.push(
      issue(
        file,
        "SERVER_ORDER",
        "server must wait for a successful migration",
      ),
    );
  }
  if (
    !JSON.stringify(server?.healthcheck ?? {}).includes("/api/health/ready")
  ) {
    errors.push(
      issue(
        file,
        "READINESS",
        "server healthcheck must use the dependency-aware readiness endpoint",
      ),
    );
  }
  if (
    dependencyCondition(service(compose, "client"), "server") !==
    "service_healthy"
  ) {
    errors.push(
      issue(file, "CLIENT_ORDER", "client must wait for a ready server"),
    );
  }
  for (const name of ["postgres", "server", "migrate", "permissions"]) {
    if (service(compose, name)?.ports) errors.push(issue(file, "PRIVATE_PORT", `${name} must not publish a host port`));
  }
  if (JSON.stringify(client?.ports) !== JSON.stringify(contract.clientPorts)) {
    errors.push(issue(file, "CLIENT_PORT", "Client must be the only published endpoint and use the contracted bind/port"));
  }

  for (const [label, expected] of Object.entries(contract.persistentMounts)) {
    const owner =
      ["postgres", "server", "client"].find((name) =>
        label.startsWith(name),
      ) ?? "server";
    if (!hasVolume(service(compose, owner), expected)) {
      errors.push(
        issue(
          file,
          "PERSISTENCE",
          `${owner} is missing contracted mount ${expected}`,
        ),
      );
    }
  }

  const contractedMounts = new Set(Object.values(contract.persistentMounts));
  for (const name of ["postgres", "server", "client"]) {
    for (const volume of service(compose, name)?.volumes ?? []) {
      const signature = volumeSignature(volume);
      if (
        signature.startsWith("${SELF_HOST_DATA_ROOT:-./data}/") &&
        !contractedMounts.has(signature)
      ) {
        errors.push(
          issue(
            file,
            "PERSISTENCE_UNDECLARED",
            `${name} has an unclassified persistent mount: ${signature}`,
          ),
        );
      }
    }
  }

  for (const [profile, names] of Object.entries(contract.optionalProfiles)) {
    for (const name of names) {
      if (!(service(compose, name)?.profiles ?? []).includes(profile)) {
        errors.push(
          issue(
            file,
            "PROFILE",
            `${name} must be gated by the ${profile} profile`,
          ),
        );
      }
    }
  }

  for (const name of contract.security.noNewPrivileges) {
    if (
      !(service(compose, name)?.security_opt ?? []).includes(
        "no-new-privileges:true",
      )
    ) {
      errors.push(
        issue(
          file,
          "NO_NEW_PRIVILEGES",
          `${name} must prevent acquisition of additional privileges`,
        ),
      );
    }
  }
  for (const name of contract.security.capDropAll) {
    const dropped = service(compose, name)?.cap_drop ?? [];
    if (dropped.length !== 1 || dropped[0] !== "ALL") {
      errors.push(
        issue(file, "CAP_DROP", `${name} must drop every Linux capability`),
      );
    }
    const expected = contract.security.allowedCapAdd[name] ?? [];
    const actual = service(compose, name)?.cap_add ?? [];
    if ([...actual].sort().join(",") !== [...expected].sort().join(",")) {
      errors.push(
        issue(
          file,
          "CAP_ADD",
          `${name} capability allowlist differs from the contracted minimum`,
        ),
      );
    }
  }
  for (const name of contract.security.readOnlyRoot) {
    if (service(compose, name)?.read_only !== true) {
      errors.push(
        issue(
          file,
          "READ_ONLY_ROOT",
          `${name} root filesystem must be read-only`,
        ),
      );
    }
  }
  for (const name of Object.keys(contract.security.documentedExceptions)) {
    if (!service(compose, name)) {
      errors.push(
        issue(
          file,
          "SECURITY_EXCEPTION",
          `documented security exception references missing service: ${name}`,
        ),
      );
    }
  }

  const clientEnvironment = service(compose, "client")?.environment ?? {};
  for (const key of Object.keys(clientEnvironment)) {
    if (/DATABASE|PASSWORD|AUTH_SECRET/.test(key)) {
      errors.push(
        issue(
          file,
          "CLIENT_SECRET",
          `client environment must not receive ${key}`,
        ),
      );
    }
  }
  if (clientEnvironment.CLIENT_INTERNAL_API_URL !== "http://server:3001") {
    errors.push(
      issue(
        file,
        "PRIVATE_API",
        "client server-side traffic must stay on the private Compose network",
      ),
    );
  }
  if (
    !exactStringMap(
      contract.requiredFrontendEnvironment,
      REQUIRED_FRONTEND_ENVIRONMENT,
    )
  ) {
    errors.push(
      issue(
        file,
        "FRONTEND_ENVIRONMENT_CONTRACT",
        "Compose contract must freeze the browser-facing telemetry policy",
      ),
    );
  }
  for (const [name, expected] of Object.entries(
    contract.requiredFrontendEnvironment ?? {},
  )) {
    if (clientEnvironment[name] !== expected) {
      errors.push(
        issue(
          file,
          "CLIENT_ENVIRONMENT",
          `client must receive contracted environment ${name}`,
        ),
      );
    }
  }


  return errors;
}

export function validateBuildOverride(model, contract) {
  const file = contract.sourceBuildOverride;
  const errors = [];
  for (const [name, dockerfile] of [
    ["migrate", "packages/prisma/Dockerfile"],
    ["server", "apps/server/Dockerfile"],
    ["client", "apps/client/Dockerfile"],
  ]) {
    const definition = service(model, name);
    const expectedImage = `\${SELF_HOST_PROJECT_NAME:-trainingload-selfhost}-${name}:\${SELF_HOST_VERSION:-1.1.14}`;
    if (definition?.image !== expectedImage) {
      errors.push(
        issue(
          file,
          "SOURCE_IMAGE_SCOPE",
          `${name} source image must be scoped by Compose project and version`,
        ),
      );
    }
    if (definition?.pull_policy !== "build") {
      errors.push(
        issue(
          file,
          "PULL_POLICY",
          `${name} source override must use pull_policy: build`,
        ),
      );
    }
    if (
      definition?.build?.context !== "." ||
      definition?.build?.dockerfile !== dockerfile
    ) {
      errors.push(
        issue(
          file,
          "SOURCE_BUILD",
          `${name} must build ${dockerfile} from the repository root`,
        ),
      );
    }
  }
  for (const name of ["client"]) {
    const args = service(model, name)?.build?.args ?? {};
    if (
      !args.SELF_HOST_MODE_MARKER ||
      args.SELF_HOST_TELEMETRY_ENABLED !== "false"
    ) {
      errors.push(
        issue(
          file,
          "SELF_HOST_BUILD",
          `${name} must compile the self-host and telemetry policy markers`,
        ),
      );
    }
  }
  return errors;
}

export function validateGateway(text, contract) {
  return text?.trim() || contract.gatewayConfig
    ? [issue(contract.compose, "GATEWAY_FORBIDDEN", "Self-host does not include a gateway configuration")]
    : [];
}

export function validateEnvironmentExample(text, releaseVersion, contract) {
  const file = contract.environmentExample;
  const errors = [];
  for (const key of [
    "SELF_HOST_AUTH_SECRET",
    "SELF_HOST_DATABASE_PASSWORD",
    "SELF_HOST_INTEGRATION_SECRET",
    "SELF_HOST_SITE_ADDRESS",
    "SELF_HOST_HTTP_BIND",
    "SELF_HOST_MIGRATE_IMAGE",
    "SELF_HOST_SERVER_IMAGE",
    "SELF_HOST_CLIENT_IMAGE",
    "SELF_HOST_VERSION",
    "SELF_HOST_PROJECT_NAME",
  ]) {
    if (!new RegExp(`^${key}=.+$`, "m").test(text)) {
      errors.push(
        issue(
          file,
          "ENVIRONMENT",
          `missing non-empty example value for ${key}`,
        ),
      );
    }
  }
  if (!text.includes(`:${releaseVersion}`)) {
    errors.push(
      issue(
        file,
        "RELEASE_VERSION",
        "example image references must track package.json version",
      ),
    );
  }
  if (
    /^(?:DATABASE_URL|CLOUDFLARE_API_TOKEN|INTERNAL_API_SECRET)=/m.test(text)
  ) {
    errors.push(
      issue(
        file,
        "PRODUCTION_ENV",
        "example must not copy managed-production secrets or a hand-built database URL",
      ),
    );
  }
  if (/^COMPOSE_[A-Z0-9_]*=/m.test(text)) {
    errors.push(
      issue(
        file,
        "COMPOSE_CONTROL",
        "example must not use hidden Docker Compose control settings",
      ),
    );
  }
  return errors;
}

export function validateSmokeCleanupSource(source) {
  const cleanupBlock = source.match(
    /export async function cleanupSmokeResources\([\s\S]*?\n}\n\nasync function materializeReleaseDirectory/,
  )?.[0];
  const mainBlock = source.slice(source.indexOf("async function main()"));
  if (
    !cleanupBlock?.includes('"stop"') ||
    !cleanupBlock.includes('"down", "--remove-orphans"') ||
    !cleanupBlock.includes("cleanupErrors.push(") ||
    !cleanupBlock.includes("return cleanupErrors") ||
    !mainBlock.includes("terminalError = error") ||
    !mainBlock.includes("try {") ||
    mainBlock.indexOf("try {") >
      mainBlock.indexOf("await materializeReleaseDirectory(workspace)") ||
    !mainBlock.includes("await cleanupSmokeResources(") ||
    !mainBlock.includes("aggregateSmokeCleanupFailure(") ||
    mainBlock.includes("if (succeeded) throw error")
  ) {
    return [
      issue(
        "scripts/selfhost/smoke-compose.mjs",
        "SMOKE_CLEANUP",
        "Compose smoke must attempt every cleanup and preserve primary and cleanup failures",
      ),
    ];
  }
  return [];
}

export async function validateRepository() {
  const contract = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "docker/selfhost/compose-contract.json"),
      "utf8",
    ),
  );
  const packageJson = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const [composeText, overrideText, gatewayText, environmentText, smokeText] =
    await Promise.all([
      readFile(resolve(repositoryRoot, contract.compose), "utf8"),
      readFile(resolve(repositoryRoot, contract.sourceBuildOverride), "utf8"),
      Promise.resolve(""),
      readFile(resolve(repositoryRoot, contract.environmentExample), "utf8"),
      readFile(
        resolve(repositoryRoot, "scripts/selfhost/smoke-compose.mjs"),
        "utf8",
      ),
    ]);
  const parseErrors = [];
  if (
    contract.schemaVersion !== 3 ||
    !Number.isInteger(contract.composeSchemaVersion) ||
    contract.composeSchemaVersion < 1
  ) {
    parseErrors.push(
      issue(
        "docker/selfhost/compose-contract.json",
        "CONTRACT_VERSION",
        "Compose contract and compatibility schema versions must be valid",
      ),
    );
  }
  const compose = parseYaml(composeText, contract.compose, parseErrors);
  const override = parseYaml(
    overrideText,
    contract.sourceBuildOverride,
    parseErrors,
  );
  const errors = [
    ...parseErrors,
    ...validateCompose(compose, composeText, contract),
    ...validateBuildOverride(override, contract),
    ...validateGateway(gatewayText, contract),
    ...validateEnvironmentExample(
      environmentText,
      packageJson.version,
      contract,
    ),
    ...validateSmokeCleanupSource(smokeText),
  ];
  return { contract, errors };
}

async function main() {
  const result = await validateRepository();
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(
        `[selfhost-compose:${error.code}] ${error.file}: ${error.message}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `[selfhost-compose] ok: ${result.contract.requiredServices.length} required services, ${Object.keys(result.contract.optionalProfiles).length} optional profile(s)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
