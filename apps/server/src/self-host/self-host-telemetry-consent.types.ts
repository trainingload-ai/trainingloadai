export const SELF_HOST_TELEMETRY_CONSENT_VERSION = 'operation-analytics-v1';

export const SELF_HOST_TELEMETRY_CONSENT_SOURCES = [
  'ONBOARDING',
  'SETTINGS',
] as const;

export type SelfHostTelemetryConsentSource =
  (typeof SELF_HOST_TELEMETRY_CONSENT_SOURCES)[number];

export type SelfHostTelemetryConsentView = {
  granted: boolean | null;
  version: string;
  source: SelfHostTelemetryConsentSource | null;
  updatedAt: string | null;
};
