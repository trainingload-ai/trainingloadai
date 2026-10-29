function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @typedef {object} DocsTelemetryEnvironment
 * @property {string} [NEXT_PUBLIC_SELF_HOST_MODE]
 * @property {string} [NEXT_PUBLIC_TELEMETRY_ENABLED]
 * @property {string} [NEXT_PUBLIC_SENTRY_DSN]
 * @property {string} [SENTRY_DSN]
 */

// Keep public keys as direct process.env references so Next.js can inline them
// into browser bundles. Dynamic process.env lookups are intentionally avoided.
/** @returns {DocsTelemetryEnvironment} */
function currentEnvironment() {
  return {
    NEXT_PUBLIC_SELF_HOST_MODE: process.env.NEXT_PUBLIC_SELF_HOST_MODE,
    NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_DSN:
      typeof window === "undefined" ? process.env.SENTRY_DSN : undefined,
  };
}

/** @param {DocsTelemetryEnvironment} [environment] */
export function isSelfHostedDocs(environment = currentEnvironment()) {
  return clean(environment.NEXT_PUBLIC_SELF_HOST_MODE).length > 0;
}

/** @param {DocsTelemetryEnvironment} [environment] */
export function isDocsTelemetryEnabled(environment = currentEnvironment()) {
  return (
    !isSelfHostedDocs(environment) ||
    clean(environment.NEXT_PUBLIC_TELEMETRY_ENABLED).toLowerCase() === "true"
  );
}

/** @param {DocsTelemetryEnvironment} [environment] */
export function resolveDocsSentryConfig(environment = currentEnvironment()) {
  const selfHosted = isSelfHostedDocs(environment);
  const telemetryEnabled = isDocsTelemetryEnabled(environment);
  const dsn = telemetryEnabled
    ? clean(environment.SENTRY_DSN) ||
      clean(environment.NEXT_PUBLIC_SENTRY_DSN) ||
      undefined
    : undefined;

  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: Boolean(dsn) && !selfHosted,
  };
}
