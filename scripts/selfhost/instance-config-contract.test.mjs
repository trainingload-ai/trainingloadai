import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import instanceConfigSchema from "../../schemas/self-host-instance-config.schema.json" with { type: "json" };
import { composeInterpolationVariables } from "./compose-environment.mjs";
import {
  parseEnvironmentFile,
  SELF_HOST_INSTANCE_CONFIG_KEYS,
  validateSelfHostEnvironment,
} from "./management-core.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile(instanceConfigSchema);

function parsedObject(text) {
  return Object.fromEntries(parseEnvironmentFile(text));
}

async function generatedExample() {
  const source = await readFile(
    resolve(repositoryRoot, ".env.example"),
    "utf8",
  );
  return parsedObject(
    source
      .replace("replace-with-64-hex-characters", "a".repeat(64))
      .replace("replace-with-64-hex-characters", "b".repeat(64))
      .replace("replace-with-64-hex-characters", "c".repeat(64)),
  );
}

test("instance schema exactly matches the signed operator configuration surface", async () => {
  const compose = await readFile(
    resolve(repositoryRoot, "compose.yml"),
    "utf8",
  );
  const expected = [...new Set([...composeInterpolationVariables([compose]), "SELF_HOST_VERSION", "TELEMETRY_ENABLED"])].sort();
  const schemaKeys = Object.keys(instanceConfigSchema.properties).sort();

  assert.deepEqual(schemaKeys, expected);
  assert.deepEqual([...SELF_HOST_INSTANCE_CONFIG_KEYS].sort(), expected);
  assert.equal(instanceConfigSchema.additionalProperties, false);
  assert.match(instanceConfigSchema.description, /\.env\.selfhost/);
});

test("installer-generated .env.selfhost validates as parsed string settings", async () => {
  const config = await generatedExample();
  assert.equal(validate(config), true, JSON.stringify(validate.errors));
});

test("instance schema accepts complete connected providers", async () => {
  const config = {
    ...(await generatedExample()),
    SELF_HOST_MODE: "connected",
    MAP_PROVIDER: "custom-raster",
    MAP_TILE_URL: "https://tiles.example.test/{z}/{x}/{y}.png",
    MAP_ATTRIBUTION: "Operator tiles",
    ELEVATION_PROVIDER: "local-dem",
    ELEVATION_TILE_ZOOM: "13",
    AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "provider-secret",
    DEEPSEEK_DEFAULT_MODEL: "deepseek-chat",
    DEEPSEEK_REASONING_MODEL: "deepseek-reasoner",
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.equal(
    validateSelfHostEnvironment(new Map(Object.entries(config))) instanceof Map,
    true,
  );
});

test("instance schema accepts OpenFreeMap without credentials", async () => {
  const config = {
    ...(await generatedExample()),
    SELF_HOST_MODE: "connected",
    MAP_PROVIDER: "openfreemap",
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.equal(
    validateSelfHostEnvironment(new Map(Object.entries(config))) instanceof Map,
    true,
  );
});

test("instance schema accepts explicit owner-funded AI in core-local", async () => {
  const config = {
    ...(await generatedExample()),
    AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "provider-secret",
    DEEPSEEK_DEFAULT_MODEL: "deepseek-chat",
    DEEPSEEK_REASONING_MODEL: "deepseek-reasoner",
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.equal(
    validateSelfHostEnvironment(new Map(Object.entries(config))) instanceof Map,
    true,
  );
});

test("instance schema accepts OpenAI BYOK in core-local", async () => {
  const config = {
    ...(await generatedExample()),
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "provider-secret",
    OPENAI_DEFAULT_MODEL: "standard-model",
    OPENAI_REASONING_MODEL: "reasoning-model",
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.equal(
    validateSelfHostEnvironment(new Map(Object.entries(config))) instanceof Map,
    true,
  );
});

test("instance schema rejects no-op, unsupported, and incomplete settings", async () => {
  const valid = await generatedExample();
  const cases = [
    { ...valid, TELEMETRY_ENABLED: "true" },
    { ...valid, ELEVATION_PROVIDER: "mapbox" },
    { ...valid, MAIL_PROVIDER: "smtp" },
    { ...valid, SELF_HOST_DOCS_ENABLED: "true" },
    { ...valid, SELF_HOST_GATEWAY_ADDRESS: "http://:80" },
    { ...valid, DISABLE_SIGNUP: "false" },
    { ...valid, BILLING_PROVIDER: "creem" },
    {
      ...valid,
      SELF_HOST_MODE: "connected",
      MAP_PROVIDER: "local",
      MAP_STYLE_URL: "",
      MAP_TILE_URL: "",
      MAP_ATTRIBUTION: "",
    },
    { ...valid, SELF_HOST_MODE: "connected", AI_PROVIDER: "constructor" },
    { ...valid, SELF_HOST_MODE: "connected", MAP_PROVIDER: "MAPBOX" },
  ];

  for (const config of cases) {
    assert.equal(validate(config), false);
    assert.throws(
      () => validateSelfHostEnvironment(new Map(Object.entries(config))),
      (error) => error?.code === "SELF_HOST_CONFIG_INVALID",
    );
  }
});
