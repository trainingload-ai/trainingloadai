import { HealthDataProvider, ThirdPartyProvider } from '@prisma/client';

export interface HealthDataProviderPolicyExtension {
  priority(provider: string): number | undefined;
}

const corePriority: Readonly<Record<string, number>> = {
  [HealthDataProvider.MANUAL]: 100,
  [HealthDataProvider.INTERVALS_ICU]: 60,
  [HealthDataProvider.GARMIN]: 55,
  [HealthDataProvider.COROS]: 40,
  [HealthDataProvider.HEALTH_CONNECT]: 30,
};

const extensions: HealthDataProviderPolicyExtension[] = [];

export function registerHealthDataProviderPolicyExtension(
  extension: HealthDataProviderPolicyExtension,
) {
  extensions.push(extension);
  return () => {
    const index = extensions.indexOf(extension);
    if (index >= 0) extensions.splice(index, 1);
  };
}

export function healthDataProviderPriority(provider?: string | null): number {
  const normalized = String(provider ?? '');
  const core = corePriority[normalized];
  if (core !== undefined) return core;
  for (const extension of extensions) {
    const priority = extension.priority(normalized);
    if (priority !== undefined) return priority;
  }
  return 0;
}

/** Third-party ingestion is independent of eligibility for canonical Health. */
export const HEALTH_FACT_PROVIDERS = [
  HealthDataProvider.GARMIN,
  HealthDataProvider.INTERVALS_ICU,
  HealthDataProvider.MANUAL,
] as const;

export const GarminHealthMessageType = {
  BLOOD_PRESSURES: 'bloodPressures',
  BODY_COMPS: 'bodyComps',
  BREATHING_VARIATIONS: 'breathingVariations',
  DAILIES: 'dailies',
  EPOCHS: 'epochs',
  HRV: 'hrv',
  HEALTH_SNAPSHOT: 'healthSnapshot',
  HYDRATION: 'hydration',
  NUTRITION: 'nutrition',
  PULSEOX: 'pulseox',
  ALL_DAY_RESPIRATION: 'allDayRespiration',
  SKIN_TEMP: 'skinTemp',
  SLEEPS: 'sleeps',
  STRESS_DETAILS: 'stressDetails',
  USER_METRICS: 'userMetrics',
} as const;

export const GARMIN_CONNECT_MODE = 'connect_developer';
export const GARMIN_CONNECT_NAMESPACE = `${ThirdPartyProvider.garmin}:${GARMIN_CONNECT_MODE}`;
export const GARMIN_MOVE_IQ_ACTIVITIES = 'moveIQActivities';

const garminHealthIntake: Readonly<Record<string, 'EVALUATE' | 'RETAIN'>> = {
  [GarminHealthMessageType.DAILIES]: 'EVALUATE',
  [GarminHealthMessageType.SLEEPS]: 'EVALUATE',
  [GarminHealthMessageType.BODY_COMPS]: 'EVALUATE',
  [GarminHealthMessageType.USER_METRICS]: 'EVALUATE',
  [GarminHealthMessageType.PULSEOX]: 'EVALUATE',
  [GarminHealthMessageType.HRV]: 'EVALUATE',
  [GarminHealthMessageType.BLOOD_PRESSURES]: 'EVALUATE',
  // Epoch reports stay at source level until their coverage contract is verified.
  [GarminHealthMessageType.EPOCHS]: 'RETAIN',
  [GarminHealthMessageType.STRESS_DETAILS]: 'RETAIN',
  [GarminHealthMessageType.ALL_DAY_RESPIRATION]: 'RETAIN',
  [GarminHealthMessageType.HEALTH_SNAPSHOT]: 'RETAIN',
  [GarminHealthMessageType.SKIN_TEMP]: 'RETAIN',
  [GarminHealthMessageType.NUTRITION]: 'RETAIN',
  [GarminHealthMessageType.HYDRATION]: 'RETAIN',
  [GarminHealthMessageType.BREATHING_VARIATIONS]: 'RETAIN',
  [GARMIN_MOVE_IQ_ACTIVITIES]: 'RETAIN',
} satisfies Record<
  | (typeof GarminHealthMessageType)[keyof typeof GarminHealthMessageType]
  | typeof GARMIN_MOVE_IQ_ACTIVITIES,
  'EVALUATE' | 'RETAIN'
>;

export const GARMIN_RETAINED_HEALTH_SUMMARY_TYPES = Object.keys(
  garminHealthIntake,
).filter((type) => garminHealthIntake[type] === 'RETAIN');

export function garminHealthTypeCanBeEvaluated(type: string): boolean {
  return garminHealthIntake[type] === 'EVALUATE';
}
