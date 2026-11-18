import * as Sentry from "@sentry/nextjs";
import { resolveDocsSentryConfig } from "@/lib/telemetry-config.mjs";
import { sanitizeLactateSentryEvent } from "@/lib/lactate-sentry";

const telemetry = resolveDocsSentryConfig();

Sentry.init({
  dsn: telemetry.dsn,
  enabled: telemetry.enabled,
  sendDefaultPii: telemetry.sendDefaultPii,
  tracesSampleRate: telemetry.enabled ? 1 : 0,
  beforeSend: (event) =>
    sanitizeLactateSentryEvent(event, window.location.pathname),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
