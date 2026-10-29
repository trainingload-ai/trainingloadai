import { describe, expect, it } from "vitest";
import {
  isDocsTelemetryEnabled,
  resolveDocsSentryConfig,
} from "./telemetry-config.mjs";

describe("docs telemetry configuration", () => {
  it("keeps managed telemetry enabled when providers are configured", () => {
    expect(isDocsTelemetryEnabled({})).toBe(true);
    expect(
      resolveDocsSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      sendDefaultPii: true,
    });
  });

  it("disables self-host telemetry even when a provider value leaks in", () => {
    const environment = {
      NEXT_PUBLIC_SELF_HOST_MODE: "core-local",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_DSN: "https://server@example.ingest.sentry.io/2",
    };

    expect(isDocsTelemetryEnabled(environment)).toBe(false);
    expect(resolveDocsSentryConfig(environment)).toEqual({
      dsn: undefined,
      enabled: false,
      sendDefaultPii: false,
    });
  });

  it("requires explicit self-host opt-in and never enables default PII", () => {
    const environment = {
      NEXT_PUBLIC_SELF_HOST_MODE: "connected",
      NEXT_PUBLIC_TELEMETRY_ENABLED: "true",
      NEXT_PUBLIC_SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
    };

    expect(isDocsTelemetryEnabled(environment)).toBe(true);
    expect(resolveDocsSentryConfig(environment)).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      sendDefaultPii: false,
    });
  });

  it("does not initialize Sentry without an explicit DSN", () => {
    expect(resolveDocsSentryConfig({})).toEqual({
      dsn: undefined,
      enabled: false,
      sendDefaultPii: false,
    });
  });
});
