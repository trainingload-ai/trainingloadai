import type { ActivityType } from 'trackswap';
import {
  PersonalProviderError,
  record,
} from '@/integrations/personal/personal-errors';

/** Personal API SummaryDTO uses meters/seconds and unqualified UTC strings.
 * Apply explicit vendor edits before canonical checksums are calculated. FIT
 * continues to own the detailed track/laps. A multisport file cannot share one
 * aggregate summary across every session, so only single-session files use it.
 */
export function garminPersonalActivity(
  activity: ActivityType,
  detail: unknown,
  singleSession: boolean,
): ActivityType {
  const raw = record(detail),
    summary = record(raw.summaryDTO);
  const result = { ...activity } as ActivityType & {
    activityName?: string;
    description?: string;
    timezone?: string;
  };
  if (typeof raw.activityName === 'string')
    result.activityName = raw.activityName;
  if (typeof raw.description === 'string') result.description = raw.description;
  if (!singleSession) return result;
  const fields = {
    distance: 'totalDistance',
    duration: 'totalTimerTime',
    elapsedDuration: 'totalElapsedTime',
    elevationGain: 'totalAscent',
    elevationLoss: 'totalDescent',
    calories: 'totalCalories',
    averageHR: 'avgHeartRate',
    maxHR: 'maxHeartRate',
    averagePower: 'avgPower',
    maxPower: 'maxPower',
  } as const;
  for (const [source, target] of Object.entries(fields)) {
    const value = summary[source];
    if (value == null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    result[target] = value;
  }
  if (summary.startTimeGMT != null) {
    if (
      typeof summary.startTimeGMT !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+$/.test(summary.startTimeGMT)
    )
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    const start = new Date(`${summary.startTimeGMT}Z`);
    if (!Number.isFinite(start.getTime()))
      throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
    result.startTime = start;
    if (typeof result.totalElapsedTime === 'number')
      result.endTime = new Date(
        start.getTime() + result.totalElapsedTime * 1000,
      );
  }
  const timezone = record(raw.timeZoneUnitDTO).timeZone;
  if (typeof timezone === 'string') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
      result.timezone = timezone;
    } catch {
      throw new PersonalProviderError('PROVIDER_TIMEZONE_INVALID');
    }
  }
  return result;
}
