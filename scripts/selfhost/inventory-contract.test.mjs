import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import { repositoryRoot } from "./verify-compose-contract.mjs";

test("generated inventory covers the self-host release configuration", async () => {
  const inventory = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        "docs/self-hosting/inventory/environment-variables.json",
      ),
      "utf8",
    ),
  );
  const entries = new Map(
    inventory.entries.map((entry) => [entry.name, entry]),
  );

  for (const name of [
    "SELF_HOST_MODE",
    "SELF_HOST_AUTH_SECRET",
    "SELF_HOST_DATABASE_PASSWORD",
    "SELF_HOST_INTEGRATION_SECRET",
    "SELF_HOST_HTTP_BIND",
    "SELF_HOST_ALLOW_INSECURE_HTTP",
    "SELF_HOST_OPERATIONS_PATH",
    "SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS",
  ]) {
    assert.equal(entries.get(name)?.documented, true, `${name} is documented`);
  }

  assert.equal(entries.get("SELF_HOST_AUTH_SECRET")?.sensitive, true);
  assert.equal(entries.get("SELF_HOST_INTEGRATION_SECRET")?.sensitive, true);
  assert.equal(
    entries.get("SELF_HOST_AUTH_SECRET")?.exampleDefault,
    "<redacted-non-empty-example>",
  );
  assert.equal(
    entries.get("SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS")?.sensitive,
    false,
  );
  for (const name of [
    "NEXT_PUBLIC_GA_MEASUREMENT_ID",
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_TELEMETRY_ENABLED",
  ]) {
    assert.equal(entries.get(name)?.capability, "telemetry", name);
    assert.equal(entries.get(name)?.mode, "optional", name);
  }
  for (const [name, capability] of [
    ["ACCOUNT_DELETION_STORAGE_HOSTS", "storage"],
    ["ACTIVITY_AI_REVIEW_WORKER_ENABLED", "ai"],
    ["ACTIVITY_MAP_THUMB_WORKER_ENABLED", "maps"],
    ["USER_POST_PROCESS_AI_REVIEW_IMPORT_MAX_ACTIVITIES", "ai"],
  ]) {
    assert.equal(entries.get(name)?.capability, capability, name);
  }
  assert.equal(
    entries.has("ADMIN_DAILY_USER_STATS_ENABLED"),
    false,
    "managed-only mail jobs are excluded from the self-host inventory",
  );
  assert.equal(
    entries.has("NEXT_PUBLIC_ENABLE_APPLE_SIGN_IN"),
    false,
    "managed-only social sign-in flags are excluded from the self-host inventory",
  );
  assert.equal(entries.get("SELF_HOST_AUTH_SECRET")?.capability, "auth");
  assert.equal(entries.get("SELF_HOST_AUTH_SECRET")?.mode, "core-local");
  assert.equal(
    entries.get("SELF_HOST_INTEGRATION_SECRET")?.capability,
    "third-party-sync",
  );
  assert.equal(entries.get("SELF_HOST_INTEGRATION_SECRET")?.mode, "core-local");
  for (const name of [
    "ACTIVITY_WEATHER_ENABLED",
    "ACTIVITY_WEATHER_WORKER_BATCH_SIZE",
    "AI_TODAY_WEATHER_ENABLED",
    "NEXT_PUBLIC_AI_TODAY_WEATHER_ENABLED",
  ]) {
    assert.equal(entries.get(name)?.capability, "weather", name);
    assert.equal(entries.get(name)?.mode, "optional", name);
  }
  assert.equal(entries.has("SELF_HOST_GATEWAY_ADDRESS"), false);

  const endpoints = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        "docs/self-hosting/inventory/external-endpoints.json",
      ),
      "utf8",
    ),
  );
  for (const host of [
    "*.analytics.google.com",
    "*.google-analytics.com",
    "www.googletagmanager.com",
  ]) {
    const matches = endpoints.entries.filter((entry) => entry.host === host);
    assert.ok(matches.length > 0, `${host} is inventoried`);
    assert.ok(
      matches.every((entry) => entry.capability === "telemetry"),
      host,
    );
  }
  const weatherKit = endpoints.entries.filter(
    (entry) => entry.host === "weatherkit.apple.com",
  );
  assert.equal(weatherKit.length, 0, "Managed WeatherKit network calls are excluded");
  assert.equal(entries.has("WEATHERKIT_PRIVATE_KEY"), false);
  assert.equal(entries.has("SOCIAL_AUTH_ENABLED"), false);
  const openFreeMap = endpoints.entries.filter(
    (entry) => entry.host === "tiles.openfreemap.org",
  );
  assert.ok(openFreeMap.length > 0, "OpenFreeMap endpoint is inventoried");
  assert.ok(
    openFreeMap.every((entry) => entry.capability === "maps-and-elevation"),
    "OpenFreeMap endpoint is classified as maps-and-elevation",
  );

  const persistentWrites = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        "docs/self-hosting/inventory/persistent-writes.json",
      ),
      "utf8",
    ),
  );
  for (const expression of [
    "await fs.link(lock.path, released);",
    "await fs.link(released, lock.path);",
  ]) {
    assert.ok(
      persistentWrites.entries.some(
        (entry) =>
          entry.file === "scripts/selfhost/management-core.mjs" &&
          entry.expression === expression,
      ),
      `${expression} is inventoried`,
    );
  }
});

test("generated inventory matches the current worktree", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/generate-selfhost-inventory.mjs", "--check"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^self-host inventory: PASS /);
});
