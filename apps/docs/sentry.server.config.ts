// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { resolveDocsSentryConfig } from "./src/lib/telemetry-config.mjs";

const telemetry = resolveDocsSentryConfig();

Sentry.init({
  dsn: telemetry.dsn,
  enabled: telemetry.enabled,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: telemetry.enabled ? 1 : 0,

  // Enable logs to be sent to Sentry
  enableLogs: telemetry.enabled,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: telemetry.sendDefaultPii,
});
