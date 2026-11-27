import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import tzLookup = require('tz-lookup');
import { round } from 'lodash';
import {
  SportType,
  type Activity,
  type ActivityBikeScore,
  type ActivityCoggan,
  type ActivityFitnessMetricsSnapshot,
  type ActivityTrainingEffect,
  type ActivityTrimp,
  type ActivityVO2Max,
  type ActivityZone,
} from '@prisma/client';
import type { PmcListRangeOptions } from '@/training-load/pmc.service';
import { localDateKeyToUtcDate } from '@/training-load/activity-local-date';
import ComposedProfile, {
  UnifiedActivityAnalysisInput,
  type UnifiedActivityZone,
} from './dto/ai.type';
import {
  activityCoachAllows,
  resolveActivityCoachSportContext,
} from './activity-coach-sport-context';
import {
  labelHeartRateZoneModel,
  labelPaceZoneModel,
  labelPowerZoneModel,
} from '@/utils/zone-models';

dayjs.extend(utc);
dayjs.extend(timezone);

export type PmcCoachRangeRow = {
  date: Date;
  dailyValue: number;
  activityCount: number;
  ATL: number;
  CTL: number;
  TSB: number;
};

export type ActivityReviewGenerationContext = {
  review_local_date: string;
  activity_age_days: number;
  recency: 'same_day' | 'recent' | 'historical';
};

/**
 * Runtime-only time context for an activity review. It is deliberately kept
 * outside the stable evidence hash so reopening the same review on a later day
 * does not create a new evidence identity solely because wall-clock time moved.
 */
export function buildActivityReviewGenerationContext(
  input: UnifiedActivityAnalysisInput,
  reviewedAt = new Date(),
): ActivityReviewGenerationContext | undefined {
  const temporal = input.temporal_context;
  if (!temporal?.activity_local_date || !temporal.activity_timezone) {
    return undefined;
  }
  const reviewLocalDate = dayjs(reviewedAt)
    .tz(temporal.activity_timezone)
    .format('YYYY-MM-DD');
  const rawAgeDays = dayjs(reviewLocalDate).diff(
    dayjs(temporal.activity_local_date),
    'day',
  );
  const activityAgeDays = Math.max(0, rawAgeDays);
  return {
    review_local_date: reviewLocalDate,
    activity_age_days: activityAgeDays,
    recency:
      activityAgeDays === 0
        ? 'same_day'
        : activityAgeDays <= 2
          ? 'recent'
          : 'historical',
  };
}

export type ActivityForCoachUnifiedInput = Activity & {
  actualLoad?: number | null;
  actualLoadSource?: string | null;
  coggan?: ActivityCoggan | null;
  bikeScore?: ActivityBikeScore | null;
  trimp?: ActivityTrimp | null;
  epoc?: ActivityTrainingEffect | null;
  activityZones?: ActivityZone[];
  vo2max?: ActivityVO2Max | null;
  fitnessMetricsSnapshot?: ActivityFitnessMetricsSnapshot | null;
  strengthExercises?: Array<{
    name: string;
    exerciseCode?: string | null;
    equipmentCode?: string | null;
    sets: Array<{
      setIndex: number;
      sourceSequenceIndex?: number | null;
      setType: unknown;
      completedReps?: number | null;
      completedDurationSeconds?: number | null;
      startedAt?: Date | null;
      restAfterSeconds?: number | null;
      loadType: unknown;
      loadValue?: number | null;
      loadUnit?: unknown;
      actualRpe?: number | null;
      actualRir?: number | null;
      completedAt?: Date | null;
      source: unknown;
    }>;
  }>;
};

function primaryActivityZone(
  zones: ActivityZone[] | undefined,
  zoneType: ActivityZone['zoneType'],
) {
  return zones
    ?.filter(
      (zone) =>
        zone.zoneType === zoneType && zone.duration > 0 && zone.percent > 0,
    )
    .sort((left, right) => right.percent - left.percent)?.[0];
}

function inferActivityTimezone(activity: ActivityForCoachUnifiedInput) {
  if (
    typeof activity.startLat !== 'number' ||
    typeof activity.startLng !== 'number'
  ) {
    return undefined;
  }
  try {
    return tzLookup(activity.startLat, activity.startLng);
  } catch {
    return undefined;
  }
}

function presentPrimaryZone(
  zone: ActivityZone | undefined,
): UnifiedActivityZone | undefined {
  if (!zone) return undefined;
  return {
    name: zone.name ?? undefined,
    duration_s: zone.duration ?? undefined,
    percent: zone.percent ?? undefined,
    min: zone.min ?? undefined,
    max: zone.max ?? undefined,
    avg: zone.avg ?? undefined,
  };
}

function formatPacePerKm(secondsPerKm: number): string {
  const totalSeconds = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}/km`;
}

function buildStrengthEvidence(activity: ActivityForCoachUnifiedInput) {
  const exercises = activity.strengthExercises ?? [];
  if (!exercises.length) return undefined;

  let setCount = 0;
  let completedSetCount = 0;
  let completedReps = 0;
  let timedSetSeconds = 0;
  let restSeconds = 0;
  let volumeLoadKg = 0;
  let volumeLoadLb = 0;

  const mappedExercises = exercises.map((exercise) => ({
    name: exercise.name,
    exercise_code: exercise.exerciseCode ?? undefined,
    equipment_code: exercise.equipmentCode ?? undefined,
    sets: exercise.sets.map((set) => {
      setCount += 1;
      if (set.completedAt) completedSetCount += 1;
      completedReps += set.completedReps ?? 0;
      timedSetSeconds += set.completedDurationSeconds ?? 0;
      restSeconds += set.restAfterSeconds ?? 0;
      if (
        set.completedAt &&
        set.loadType === 'ABSOLUTE' &&
        typeof set.loadValue === 'number' &&
        typeof set.completedReps === 'number'
      ) {
        const volume = set.loadValue * set.completedReps;
        if (set.loadUnit === 'KG') volumeLoadKg += volume;
        if (set.loadUnit === 'LB') volumeLoadLb += volume;
      }
      return {
        set_index: set.setIndex,
        source_sequence_index: set.sourceSequenceIndex ?? undefined,
        set_type: String(set.setType),
        completed: Boolean(set.completedAt),
        reps: set.completedReps ?? undefined,
        duration_seconds: set.completedDurationSeconds ?? undefined,
        started_at: set.startedAt?.toISOString(),
        rest_after_seconds: set.restAfterSeconds ?? undefined,
        load_type: String(set.loadType),
        load_value: set.loadValue ?? undefined,
        load_unit: set.loadUnit ? String(set.loadUnit) : undefined,
        rpe: set.actualRpe ?? undefined,
        rir: set.actualRir ?? undefined,
        source: String(set.source),
      };
    }),
  }));

  return {
    exercise_count: exercises.length,
    set_count: setCount,
    completed_set_count: completedSetCount,
    completed_reps: completedReps,
    timed_set_seconds: timedSetSeconds,
    rest_seconds: restSeconds,
    volume_load_kg: round(volumeLoadKg, 1),
    volume_load_lb: round(volumeLoadLb, 1),
    exercises: mappedExercises,
  };
}

/**
 * 单活动 AI 教练解读的稳定输入
 * @param activity - 活动。
 * @param userId - 用户 ID。
 * @param profile - 用户配置。
 * @param pmc - PMC 服务。
 * @param readCadenceStats - Recorded cadence statistics used by the detail chart.
 * @returns 统一活动分析输入。
 */
export async function buildUnifiedActivityAnalysisInput(
  activity: ActivityForCoachUnifiedInput,
  userId?: string | null,
  profile?: ComposedProfile,
  pmc?: {
    listRange: (
      userId: string,
      start: Date,
      end: Date,
      options?: PmcListRangeOptions,
    ) => Promise<PmcCoachRangeRow[]>;
  },
  readCadenceStats?: () => Promise<{ avgValue?: number; maxValue?: number }>,
): Promise<UnifiedActivityAnalysisInput> {
  // 活动时长
  const durationSec: number | undefined =
    activity.timerTime ?? activity.elapsedTime ?? undefined;
  // 活动上下文
  const sportContext = resolveActivityCoachSportContext(activity);
  const cadence: UnifiedActivityAnalysisInput['cadence'] = {};
  if (activityCoachAllows(sportContext, 'cadence')) {
    const recorded = await readCadenceStats?.();
    const running = activity.sportType === SportType.RUN;
    const cycling = activity.sportType === SportType.CYCLING;
    const normalize = (value: number | null | undefined) => {
      if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
      // The detail chart rounds the raw recording before converting running strides to steps.
      const raw = round(value, 2);
      return round(running && raw < 130 ? raw * 2 : raw);
    };
    cadence.avg = normalize(recorded?.avgValue) ?? normalize(activity.avgCadence);
    cadence.max = normalize(recorded?.maxValue) ?? normalize(activity.maxCadence);
    if (cadence.avg !== undefined || cadence.max !== undefined) {
      cadence.unit = running ? 'spm' : cycling ? 'rpm' : undefined;
    }
  }
  // 用户时区
  let userTimezone = activity?.timezone || profile?.timezone || undefined;
  // 如果活动有经纬度，则尝试查找用户时区
  const activityTimezone = inferActivityTimezone(activity);
  userTimezone = userTimezone || activityTimezone || 'UTC';

  // 活动开始时间
  const start_time = activity.startTime
    ? dayjs(activity.startTime).tz(userTimezone).format('YYYY-MM-DD HH:mm')
    : undefined;

  // 主心率区间
  const mainHeartRateZone = primaryActivityZone(
    activity.activityZones,
    'HEART_RATE',
  );
  // 主功率区间
  const mainPowerZone = primaryActivityZone(activity.activityZones, 'POWER');
  // 主配速区间
  const mainPaceZone = primaryActivityZone(activity.activityZones, 'PACE');

  // 当前活动绑定的指标快照
  const snapshot = activity.fitnessMetricsSnapshot ?? null;
  const baselineMaxHr = snapshot?.maxHrValue ?? undefined;
  const baselineRestHr = snapshot?.restHrValue ?? undefined;
  const baselineLthr = snapshot?.lthrValue ?? undefined;
  const baselineFtp = snapshot?.ftpValue ?? undefined;
  const baselineCp = snapshot?.cpValue ?? undefined;
  const baselineWPrime = snapshot?.cpValue2 ?? undefined;

  const activityDay = activity.startTime
    ? dayjs(activity.startTime).tz(userTimezone).startOf('day')
    : null;
  const activityLocalDate =
    activityDay?.isValid() === true
      ? activityDay.format('YYYY-MM-DD')
      : undefined;
  const loadDate = snapshot?.pmcLocalDate ?? activityLocalDate;
  const loadDay = loadDate ? dayjs.utc(localDateKeyToUtcDate(loadDate)) : null;

  const pmcRecords =
    userId && loadDay && pmc
      ? await pmc.listRange(
          userId,
          loadDay.subtract(13, 'day').toDate(),
          loadDay.toDate(),
          { orderBy: 'desc' },
        )
      : [];
  const latestPMC = pmcRecords[0];
  const weekStart = loadDay?.subtract(6, 'day').toDate();
  const last7Days = weekStart
    ? pmcRecords.filter((row) => row.date >= weekStart).reverse()
    : [];

  return {
    sportType: activity.sportType,
    sport_context: sportContext,
    start_time,
    temporal_context: activityLocalDate && loadDate
      ? {
          activity_local_date: activityLocalDate,
          activity_timezone: userTimezone,
          historical_load_as_of: loadDate,
          historical_load_window_days: 14,
        }
      : undefined,
    duration_min: durationSec ? round(durationSec / 60, 1) : undefined,
    session_rpe:
      activityCoachAllows(sportContext, 'session_rpe') &&
      typeof activity.sessionRpe === 'number'
        ? round(activity.sessionRpe, 1)
        : undefined,
    distance_km:
      activityCoachAllows(sportContext, 'distance') && activity.distance
        ? round(activity.distance / 1000, 2)
        : undefined,
    ascent_m:
      activityCoachAllows(sportContext, 'elevation') && activity.ascent
        ? round(activity.ascent, 2)
        : undefined,
    descent_m:
      activityCoachAllows(sportContext, 'elevation') && activity.descent
        ? round(activity.descent, 2)
        : undefined,
    poolLength_m:
      activityCoachAllows(sportContext, 'swim') && activity.poolLength
        ? round(activity.poolLength, 0)
        : undefined,
    calories:
      activityCoachAllows(sportContext, 'calories') &&
      typeof activity.calories === 'number'
        ? activity.calories
        : undefined,
    max_hr_drop:
      typeof activity.maxHrDrop === 'number' ? activity.maxHrDrop : undefined,
    hr: {
      available:
        activityCoachAllows(sportContext, 'heart_rate') &&
        Boolean(
          (activity.avgHeartRate && activity.avgHeartRate > 0) ||
          (activity.maxHeartRate && activity.maxHeartRate > 0),
        ),
      avg:
        activityCoachAllows(sportContext, 'heart_rate') && activity.avgHeartRate
          ? round(activity.avgHeartRate)
          : undefined,
      max:
        activityCoachAllows(sportContext, 'heart_rate') && activity.maxHeartRate
          ? round(activity.maxHeartRate)
          : undefined,
      zone_type: labelHeartRateZoneModel(profile?.heartRateZoneModel),
      primary_zone: activityCoachAllows(sportContext, 'heart_rate')
        ? presentPrimaryZone(mainHeartRateZone)
        : undefined,
      paHr:
        activityCoachAllows(sportContext, 'pace') && activity.paHr
          ? round(activity.paHr)
          : undefined,
    },
    power: {
      avg:
        activityCoachAllows(sportContext, 'power') && activity.avgPower
          ? round(activity.avgPower)
          : undefined,
      max:
        activityCoachAllows(sportContext, 'power') && activity.maxPower
          ? round(activity.maxPower)
          : undefined,
      pw_hr:
        activityCoachAllows(sportContext, 'power') && activity.pwHr
          ? round(activity.pwHr)
          : undefined,
      zone_type: labelPowerZoneModel(profile?.powerZoneModel),
      primary_zone: activityCoachAllows(sportContext, 'power')
        ? presentPrimaryZone(mainPowerZone)
        : undefined,

      coggan:
        activityCoachAllows(sportContext, 'power') &&
        activity.coggan &&
        activity.sportType === SportType.CYCLING
          ? {
              np: activity?.coggan?.isopower,
              vi: activity?.coggan?.variabilityIndex,
              if: activity?.coggan?.intensityFactor,
              tss: activity?.coggan?.bikeStress,
              ef: activity?.coggan?.efficiencyFactor,
            }
          : undefined,
      skiba:
        activityCoachAllows(sportContext, 'power') &&
        activity.bikeScore &&
        (activity.sportType === SportType.CYCLING ||
          activity.sportType === SportType.RUN)
          ? {
              x_power: activity?.bikeScore?.xPower,
              vi: activity?.bikeScore?.variabilityIndex,
              ri: activity?.bikeScore?.responseIndex,
              bike_score: activity?.bikeScore?.bikeScore,
              aerobic_tiss: activity?.bikeScore?.aerobicTISS,
              anaerobic_tiss: activity?.bikeScore?.anaerobicTISS,
            }
          : undefined,
    },
    pace: (() => {
      const averageSecPerKm =
        activityCoachAllows(sportContext, 'pace') &&
        durationSec &&
        durationSec > 0 &&
        activity.distance &&
        activity.distance > 0
          ? round((durationSec * 1000) / activity.distance, 1)
          : undefined;
      return {
        average_sec_per_km: averageSecPerKm,
        average_formatted:
          averageSecPerKm != null
            ? formatPacePerKm(averageSecPerKm)
            : undefined,
        average_basis:
          averageSecPerKm != null
            ? activity.timerTime != null
              ? 'timer_time_distance'
              : 'elapsed_time_distance'
            : undefined,
        zone_type: labelPaceZoneModel(profile?.paceZoneModel),
        primary_zone: activityCoachAllows(sportContext, 'pace')
          ? presentPrimaryZone(mainPaceZone)
          : undefined,
      };
    })(),
    cadence,
    estimate: {
      ftp:
        activityCoachAllows(sportContext, 'power') && activity.eftp
          ? round(activity.eftp)
          : undefined,
      cp:
        activityCoachAllows(sportContext, 'power') && activity.ecp
          ? round(activity.ecp)
          : undefined,
    },
    strength: activityCoachAllows(sportContext, 'strength')
      ? buildStrengthEvidence(activity)
      : undefined,
    activity_fatigue: {
      actual_load: activity.actualLoad,
      source: activity.actualLoadSource,
      tss:
        activity?.coggan?.bikeStress && activity.sportType === SportType.CYCLING
          ? round(activity.coggan.bikeStress)
          : undefined,
      bike_score:
        activity?.bikeScore?.bikeScore &&
        activity.sportType === SportType.CYCLING
          ? round(activity.bikeScore.bikeScore)
          : undefined,
      trimp: activity?.trimp?.trimp100
        ? round(activity.trimp.trimp100)
        : undefined,
    },
    historical_load: latestPMC
      ? {
          ATL: round(latestPMC.ATL, 1),
          CTL: round(latestPMC.CTL, 1),
          TSB: round(latestPMC.TSB, 1),
          AC_ratio:
            latestPMC.CTL > 0
              ? round(latestPMC.ATL / latestPMC.CTL, 2)
              : undefined,
          daily_load_last_7d:
            last7Days.length === 7
              ? last7Days.map((row) => round(row.dailyValue, 1))
              : undefined,
          days_without_recorded_activity_last_14d:
            pmcRecords.length === 14
              ? pmcRecords.filter((row) => row.activityCount === 0).length
              : undefined,
        }
      : undefined,
    user_baseline: {
      max_hr: baselineMaxHr,
      rest_hr: baselineRestHr,
      lthr: baselineLthr,
      hrr:
        baselineMaxHr != null && baselineRestHr != null
          ? baselineMaxHr - baselineRestHr
          : undefined,
      ftp: baselineFtp,
      cp: baselineCp,
      w_prime: baselineWPrime,
    },
  };
}
