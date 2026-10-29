import * as Sentry from "@sentry/nextjs";
import { resolveDocsSentryConfig } from "@/lib/telemetry-config.mjs";

const telemetry = resolveDocsSentryConfig();

Sentry.init({
  dsn: telemetry.dsn,
  enabled: telemetry.enabled,
  sendDefaultPii: telemetry.sendDefaultPii,
  tracesSampleRate: telemetry.enabled ? 1 : 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
