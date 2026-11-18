import {
  HealthDataProvider,
  HealthMetricType,
  type Prisma,
} from '@prisma/client';
import {
  GARMIN_CONNECT_NAMESPACE,
  GARMIN_RETAINED_HEALTH_SUMMARY_TYPES,
  HEALTH_FACT_PROVIDERS,
} from './health-data-provider-policy.port';

const GARMIN_EXCLUDED_METRICS = Object.values(HealthMetricType).filter(
  (metric) =>
    /^(STRESS_|REST_STRESS_|BODY_BATTERY_|RESPIRATION_|DIETARY_)/.test(
      metric,
    ) ||
    metric === 'HYDRATION_ML' ||
    metric === 'SKIN_TEMPERATURE_DELTA_C',
);

// The stored Garmin Connect identity is garmin:connect_developer:<account>:<type>:<id>.
const garminUnqualifiedIdentities = GARMIN_RETAINED_HEALTH_SUMMARY_TYPES.map(
  (type) => ({
    externalId: {
      startsWith: `${GARMIN_CONNECT_NAMESPACE}:`,
      contains: `:${type}:`,
    },
  }),
);

/** Eligibility is applied before aggregation, association and any bounded reads. */
export const healthDailyFactSource = {
  AND: [
    { provider: { in: [...HEALTH_FACT_PROVIDERS] } },
    {
      NOT: {
        AND: [
          { provider: HealthDataProvider.GARMIN },
          {
            OR: [
              { metricType: { in: GARMIN_EXCLUDED_METRICS } },
              ...garminUnqualifiedIdentities,
            ],
          },
        ],
      },
    },
  ],
} satisfies Prisma.ExternalHealthSampleWhereInput;

export const healthSessionFactSource = {
  AND: [
    { provider: { in: [...HEALTH_FACT_PROVIDERS] } },
    {
      NOT: {
        AND: [
          { provider: HealthDataProvider.GARMIN },
          { OR: garminUnqualifiedIdentities },
        ],
      },
    },
  ],
} satisfies Prisma.ExternalHealthSessionWhereInput;

export function canEvaluateHealthProvider(provider: string) {
  return HEALTH_FACT_PROVIDERS.some((eligible) => eligible === provider);
}

export function isHealthSessionFactSource(source: {
  provider: string;
  externalId: string;
}) {
  return (
    canEvaluateHealthProvider(source.provider) &&
    !(
      source.provider === HealthDataProvider.GARMIN &&
      source.externalId.startsWith(`${GARMIN_CONNECT_NAMESPACE}:`) &&
      GARMIN_RETAINED_HEALTH_SUMMARY_TYPES.some((type) =>
        source.externalId.includes(`:${type}:`),
      )
    )
  );
}

export function isHealthDailyFactSource(source: {
  provider: string;
  externalId: string;
  metricType: string;
}) {
  return (
    isHealthSessionFactSource(source) &&
    !(
      source.provider === HealthDataProvider.GARMIN &&
      GARMIN_EXCLUDED_METRICS.some((metric) => metric === source.metricType)
    )
  );
}
