import { SportType } from '@prisma/client';
import { PersonalProviderError, record } from './personal-errors';

export type PersonalSyncTrigger =
  | 'first_connect'
  | 'focus'
  | 'dawn'
  | 'manual';

/** Focus / dawn use the single-day usersummary; first/manual use V2 dailysummaries. */
export function garminSummaryMode(
  trigger: PersonalSyncTrigger | string | undefined,
): 'daily' | 'range' {
  return trigger === 'focus' || trigger === 'dawn' ? 'daily' : 'range';
}

/**
 * Normalize flat UserDailySummaryDto into the V2 nested shape the health
 * projector already understands.
 */
export function normalizeGarminDailySummary(value: unknown, day: string) {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
  const row = record(value);
  if (typeof row.calendarDate !== 'string' || row.calendarDate !== day)
    throw new PersonalProviderError(
      row.calendarDate == null
        ? 'PROVIDER_HEALTH_DATE_MISSING'
        : 'PROVIDER_HEALTH_DATE_MISMATCH',
    );
  // Already V2-shaped (has nested movement/heartRate groups).
  if (
    row.movement != null ||
    row.calories != null ||
    row.heartRate != null ||
    row.bodyBattery != null
  ) {
    return { data: [row] };
  }
  const num = (key: string) => {
    const v = row[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  return {
    data: [
      {
        calendarDate: day,
        movement: {
          steps: {
            value: num('totalSteps'),
            distanceInMeters: num('wellnessDistanceMeters') ?? num('totalDistanceMeters'),
          },
          floorsAscended: { value: num('floorsAscended') },
        },
        calories: {
          burnedActive: num('activeKilocalories'),
          burnedTotal: num('totalKilocalories'),
        },
        heartRate: {
          restingValue: num('restingHeartRate'),
          minValue: num('minHeartRate'),
          maxValue: num('maxHeartRate'),
        },
        stress: {
          avgLevel: num('averageStressLevel'),
          maxLevel: num('maxStressLevel'),
        },
        bodyBattery: {
          chargedValue: num('bodyBatteryChargedValue'),
          drainedValue: num('bodyBatteryDrainedValue'),
          minValue: num('bodyBatteryLowestValue'),
          maxValue: num('bodyBatteryHighestValue'),
          latestValue: num('bodyBatteryMostRecentValue'),
        },
      },
    ],
  };
}

function mapSport(value: unknown): SportType | null {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!text || text === 'DEFAULT' || text === 'ALL') return SportType.UNKNOWN;
  if (text.includes('RUN')) return SportType.RUN;
  if (text.includes('CYCL') || text.includes('BIKE') || text.includes('RIDE'))
    return SportType.CYCLING;
  if (text.includes('SWIM')) return SportType.SWIM;
  if (text.includes('ROW')) return null;
  return SportType.UNKNOWN;
}

/** Map Personal API heartRateZones/v2 floors into absolute custom zone rows. */
export function mapGarminHeartRateZones(payload: unknown) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(record(payload).userFacingHeartRateZones)
      ? record(payload).userFacingHeartRateZones
      : null;
  if (!rows)
    throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
  const mapped: Array<{
    sportType: SportType;
    zones: Array<{ order: number; min: number; max: number; name: string }>;
    raw: unknown;
  }> = [];
  for (const item of rows) {
    const row = record(item);
    const sport = mapSport(row.sport);
    if (!sport) continue;
    const floors = [
      row.zone1Floor,
      row.zone2Floor,
      row.zone3Floor,
      row.zone4Floor,
      row.zone5Floor,
    ];
    const max = row.maxHeartRateUsed;
    if (
      floors.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
      typeof max !== 'number' ||
      !Number.isFinite(max)
    )
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    const zones = floors.map((floor, index) => {
      const next = index === floors.length - 1 ? max : floors[index + 1];
      if (typeof next !== 'number' || next < Number(floor))
        throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
      return {
        order: index + 1,
        min: Math.round(Number(floor)),
        max: Math.round(Number(next)),
        name: `Z${index + 1}`,
      };
    });
    mapped.push({ sportType: sport, zones, raw: item });
  }
  return mapped;
}
