import { PersonalProviderError } from '../personal/personal-errors';
import { dateLabel, dateRange, localToday } from '../personal/personal-dates';

/** All 26 documented GET endpoints, with bounded windows and no user-supplied URL. */
export const GARMIN_RESOURCES = {
  profile: { path: '/userprofile-service/userprofile/settings' },
  heartRateZones: { path: '/biometric-service/heartRateZones/v2' },
  activities: {
    path: '/activitylist-service/activities/search/activities',
    activityList: true,
  },
  activity: { path: '/activity-service/activity/{activityId}', activity: true },
  activityWorkouts: {
    path: '/activity-service/activity/{activityId}/workouts',
    activity: true,
  },
  originalActivity: {
    path: '/download-service/files/activity/{activityId}',
    activity: true,
    binary: true,
  },
  dailySummary: {
    path: '/usersummary-service/usersummary/daily',
    dateQuery: 'calendarDate',
  },
  dailySummaries: {
    path: '/usersummary-service/v2/dailysummaries',
    rangeQuery: true,
    maxDays: 366,
  },
  sleep: { path: '/sleep-service/sleep/dailySleep', dateQuery: 'date' },
  sleepSummaries: {
    path: '/sleep-service/sleep/dailySleepSummariesByDate',
    rangeQuery: true,
    maxDays: 31,
  },
  hrv: { path: '/hrv-service/hrv/{date}' },
  hrvSummaries: {
    path: '/hrv-service/hrv/daily/{startDate}/{endDate}',
    maxDays: 28,
  },
  heartRate: {
    path: '/wellness-service/wellness/dailyHeartRate',
    dateQuery: 'date',
  },
  stress: {
    path: '/usersummary-service/stats/stress/daily/{startDate}/{endDate}',
    maxDays: 28,
  },
  steps: {
    path: '/usersummary-service/stats/steps/daily/{startDate}/{endDate}',
    maxDays: 28,
  },
  hydration: {
    path: '/usersummary-service/stats/hydration/daily/{startDate}/{endDate}',
    maxDays: 31,
  },
  bodyBattery: {
    path: '/wellness-service/wellness/bodyBattery/reports/daily',
    rangeQuery: true,
    maxDays: 31,
  },
  spo2: { path: '/wellness-service/wellness/daily/spo2acclimation/{date}' },
  fitnessAge: { path: '/fitnessage-service/fitnessage/v2/{date}' },
  weight: {
    path: '/weight-service/weight/range/{startDate}/{endDate}',
    maxDays: 31,
  },
  allWeight: {
    path: '/weight-service/weight/all/{startDate}/{endDate}',
    maxDays: 31,
  },
  weightGoals: {
    path: '/goal-service/goal/user/effective/weightgoal/{startDate}/{endDate}',
    maxDays: 31,
  },
  wellnessActivities: {
    path: '/wellnessactivity-service/activity/summary/range/{startDate}/{endDate}',
    maxDays: 31,
  },
  nutrition: { path: '/nutrition-service/food/logs/{date}', sensitive: true },
  menstrualSummary: {
    path: '/periodichealth-service/menstrualcycle/summary/{date}',
    sensitive: true,
  },
  menstrualDay: {
    path: '/periodichealth-service/menstrualcycle/dayview/{date}',
    sensitive: true,
  },
} as const;

export function garminResourceRequest(
  name: string,
  input: {
    date?: string;
    startDate?: string;
    endDate?: string;
    activityId?: string;
    offset?: number;
    sensitiveConfirmed?: boolean;
  },
  timezone: string,
) {
  const resource = GARMIN_RESOURCES[name] as
    | {
        path: string;
        sensitive?: boolean;
        activity?: boolean;
        activityList?: boolean;
        binary?: boolean;
        dateQuery?: string;
        rangeQuery?: boolean;
        maxDays?: number;
      }
    | undefined;
  if (!resource)
    throw new PersonalProviderError(
      'PROVIDER_RESOURCE_UNKNOWN',
      undefined,
      400,
    );
  if (resource.sensitive && input.sensitiveConfirmed !== true)
    throw new PersonalProviderError(
      'PROVIDER_SENSITIVE_CONFIRMATION_REQUIRED',
      undefined,
      400,
    );
  const day = dateLabel(input.date ?? localToday(timezone));
  const start = dateLabel(input.startDate ?? day),
    end = dateLabel(input.endDate ?? day);
  dateRange(start, end, resource.maxDays ?? 31);
  const query: Record<string, string | number> = {};
  let path = resource.path
    .replace('{date}', day)
    .replace('{startDate}', start)
    .replace('{endDate}', end);
  if (resource.activity) {
    if (!input.activityId || !/^\d{1,30}$/.test(input.activityId))
      throw new PersonalProviderError(
        'PROVIDER_ACTIVITY_ID_INVALID',
        undefined,
        400,
      );
    path = path.replace('{activityId}', input.activityId);
  }
  if (resource.dateQuery) query[resource.dateQuery] = day;
  if (resource.rangeQuery || resource.activityList) {
    query.startDate = start;
    query.endDate = end;
  }
  if (resource.activityList) {
    query.start = input.offset ?? 0;
    query.limit = 99;
  }
  if (name === 'menstrualDay') query.todayDate = localToday(timezone);
  if (name === 'weight') query.includeAll = 'true';
  return { path, query, binary: resource.binary === true };
}
