import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import {
  repositoryRoot,
  validateCompose,
  validateEnvironmentExample,
  validateGateway,
  validateRepository,
  validateSmokeCleanupSource,
} from "./verify-compose-contract.mjs";

const contract = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "docker/selfhost/compose-contract.json"),
    "utf8",
  ),
);
const composeText = await readFile(
  resolve(repositoryRoot, contract.compose),
  "utf8",
);

test("repository self-host Compose contract is internally consistent", async () => {
  const result = await validateRepository();
  assert.deepEqual(result.errors, []);
});

test("Compose compatibility schema is explicit and versioned", () => {
  assert.equal(contract.schemaVersion, 3);
  assert.equal(contract.composeSchemaVersion, 2);
});

test("requires fail-closed Compose smoke cleanup", async () => {
  const smoke = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/smoke-compose.mjs"),
    "utf8",
  );
  assert.deepEqual(validateSmokeCleanupSource(smoke), []);
  for (const weakened of [
    smoke.replace('"down", "--remove-orphans"', '"down"'),
    smoke.replace("terminalError = error", "terminalError = null"),
    smoke.replace("try {\n    const dataRoot", "const dataRoot"),
    smoke.replace(
      "throw aggregateSmokeCleanupFailure(terminalError, cleanupErrors);",
      "console.error(cleanupErrors);",
    ),
  ]) {
    assert.ok(
      validateSmokeCleanupSource(weakened).some(
        ({ code }) => code === "SMOKE_CLEANUP",
      ),
    );
  }
});

test("publishes only the Client port and rejects additional runtime services", () => {
  const model = YAML.parse(composeText);
  model.services.client.ports = ["0.0.0.0:80:3002"];
  assert.ok(validateCompose(model, composeText, contract).some(x => x.code === "CLIENT_PORT"));
  for (const name of ["docs", "gateway"]) {
    const invalid = YAML.parse(composeText);
    invalid.services[name] = { image: "unwanted:1.0.0" };
    assert.ok(validateCompose(invalid, composeText, contract).some(x => x.code === "SERVICE_BOUNDARY"));
  }
});

test("rejects migration startup races", () => {
  const invalid = composeText.replace(
    "condition: service_completed_successfully\n    volumes:",
    "condition: service_started\n    volumes:",
  );
  const errors = validateCompose(YAML.parse(invalid), invalid, contract);
  assert.ok(errors.some((error) => error.code === "SERVER_ORDER"));
});

test("requires the validated owner bootstrap TTL to reach the server", () => {
  const model = YAML.parse(composeText);
  delete model.services.server.environment
    .SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS;
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "SERVER_ENVIRONMENT"));

  const weakened = structuredClone(contract);
  delete weakened.requiredServerEnvironment
    .SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS;
  const weakenedErrors = validateCompose(
    YAML.parse(composeText),
    composeText,
    weakened,
  );
  assert.ok(
    weakenedErrors.some(
      (error) => error.code === "SERVER_ENVIRONMENT_CONTRACT",
    ),
  );
});

test("pins unsupported signed-v1 capabilities off across server and browser roles", () => {
  const model = YAML.parse(composeText);
  model.services.server.environment.TELEMETRY_ENABLED = "true";
  model.services.client.environment.NEXT_PUBLIC_TELEMETRY_ENABLED = "true";
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "SERVER_ENVIRONMENT"));
  assert.ok(errors.some((error) => error.code === "CLIENT_ENVIRONMENT"));

  const weakened = structuredClone(contract);
  delete weakened.requiredServerEnvironment.TELEMETRY_ENABLED;
  delete weakened.requiredFrontendEnvironment.NEXT_PUBLIC_TELEMETRY_ENABLED;
  const weakenedErrors = validateCompose(
    YAML.parse(composeText),
    composeText,
    weakened,
  );
  assert.ok(
    weakenedErrors.some(
      (error) => error.code === "SERVER_ENVIRONMENT_CONTRACT",
    ),
  );
  assert.ok(
    weakenedErrors.some(
      (error) => error.code === "FRONTEND_ENVIRONMENT_CONTRACT",
    ),
  );
});

test("rejects mutable or unpinned infrastructure images", () => {
  const invalid = composeText.replace(
    contract.externalImages.postgres.reference,
    "postgres:latest",
  );
  const errors = validateCompose(YAML.parse(invalid), invalid, contract);
  assert.ok(errors.some((error) => error.code === "POSTGRES_IMAGE"));
});

test("rejects production-only secret dependencies", () => {
  const invalid = `${composeText}\n# CLOUDFLARE_API_TOKEN`;
  const errors = validateCompose(YAML.parse(invalid), invalid, contract);
  assert.ok(errors.some((error) => error.code === "PRODUCTION_SECRET"));
});

test("rejects publishing the database directly", () => {
  const model = YAML.parse(composeText);
  model.services.postgres.ports = ["5432:5432"];
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "PRIVATE_PORT"));
});

test("rejects a persistent mount that is missing from the data contract", () => {
  const model = YAML.parse(composeText);
  model.services.client.volumes.push(
    "${SELF_HOST_DATA_ROOT:-./data}/unclassified:/app/unclassified",
  );
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "PERSISTENCE_UNDECLARED"));
});

test("rejects credentials and public upstreams in browser-facing roles", () => {
  const model = YAML.parse(composeText);
  model.services.client.environment.DATABASE_URL = "secret";
  model.services.client.environment.CLIENT_INTERNAL_API_URL =
    "https://api.trainingload.ai";
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "CLIENT_SECRET"));
  assert.ok(errors.some((error) => error.code === "PRIVATE_API"));
});

test("rejects broader container capabilities and writable app roots", () => {
  const model = YAML.parse(composeText);
  model.services.server.cap_drop = [];
  model.services.client.cap_add = ["NET_ADMIN"];
  model.services.migrate.read_only = false;
  const errors = validateCompose(model, composeText, contract);
  assert.ok(errors.some((error) => error.code === "CAP_DROP"));
  assert.ok(errors.some((error) => error.code === "CAP_ADD"));
  assert.ok(errors.some((error) => error.code === "READ_ONLY_ROOT"));
});

test("rejects any bundled gateway configuration", () => {
  assert.ok(validateGateway("reverse_proxy server:3001", contract).some(x => x.code === "GATEWAY_FORBIDDEN"));
});

test("rejects an example that hand-copies a database URL", async () => {
  const errors = validateEnvironmentExample(
    `${await readFile(resolve(repositoryRoot, contract.environmentExample), "utf8")}\nDATABASE_URL=postgres://secret`,
    "1.1.14",
    contract,
  );
  assert.ok(errors.some((error) => error.code === "PRODUCTION_ENV"));
});

test("rejects hidden Compose profile controls", async () => {
  const example = await readFile(resolve(repositoryRoot, contract.environmentExample), "utf8");
  const errors = validateEnvironmentExample(`${example}\nCOMPOSE_PROFILES=docs\n`, "1.1.14", contract);
  assert.ok(errors.some(x => x.code === "COMPOSE_CONTROL"));
});
