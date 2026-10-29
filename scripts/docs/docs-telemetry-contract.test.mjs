import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDocsTelemetryEnabled,
  resolveDocsSentryConfig,
} from "../../apps/docs/src/lib/telemetry-config.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const requiredConsumers = new Map([
  [
    "apps/docs/sentry.server.config.ts",
    ["resolveDocsSentryConfig", "enabled: telemetry.enabled"],
  ],
  [
    "apps/docs/sentry.edge.config.ts",
    ["resolveDocsSentryConfig", "enabled: telemetry.enabled"],
  ],
  [
    "apps/docs/src/instrumentation-client.ts",
    ["resolveDocsSentryConfig", "enabled: telemetry.enabled"],
  ],
  ["apps/docs/src/lib/posthog-client.ts", ["isDocsTelemetryEnabled()"]],
  ["apps/docs/src/app/[lang]/layout.tsx", ["isDocsTelemetryEnabled()"]],
  [
    "apps/docs/next.config.mjs",
    [
      "allowDemoFrame: !selfHosted",
      "allowManagedApi: !selfHosted",
      "allowTelemetry: telemetryEnabled",
      "telemetryEnabled\n  ? process.env.SENTRY_AUTH_TOKEN",
    ],
  ],
]);

test("docs self-host telemetry is opt-in across every runtime sink", async () => {
  const disabled = {
    NEXT_PUBLIC_SELF_HOST_MODE: "core-local",
    NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
    NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SENTRY_DSN: "https://server@example.ingest.sentry.io/2",
  };
  assert.equal(isDocsTelemetryEnabled(disabled), false);
  assert.deepEqual(resolveDocsSentryConfig(disabled), {
    dsn: undefined,
    enabled: false,
    sendDefaultPii: false,
  });

  for (const [path, snippets] of requiredConsumers) {
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    assert.doesNotMatch(
      source,
      /https:\/\/[A-Za-z0-9]+@[^/\s"']*\.sentry\.io\/\d+/i,
      path,
    );
    for (const snippet of snippets) assert.ok(source.includes(snippet), path);
  }
});
