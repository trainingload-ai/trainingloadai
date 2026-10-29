import dayjs = require('dayjs');
import {
  BodyMetricType,
  Gender,
  MetricSource,
  SportType,
  UserFitnessMetricType,
  HeartRateZoneModel,
  type PaceZoneModel,
  type PowerZoneModel,
} from '@prisma/client';
import type { UserProfileResponse } from './user.interface';
import {
  selectEffectiveFitnessMetric,
  type EffectiveFitnessMetricCandidate,
} from './fitness-metric-selection';

export const COMPOSED_PROFILE_SPORTS = [
  SportType.RUN,
  SportType.CYCLING,
  SportType.SWIM,
] as const;
export type ComposedProfileSport = (typeof COMPOSED_PROFILE_SPORTS)[number];

export const PREFERRED_SPORTS = ['RUN', 'CYCLING', 'SWIM', 'STRENGTH'] as const;
export type PreferredSport = (typeof PREFERRED_SPORTS)[number];

export const LOAD_SOURCES = [
  'POWER',
  'HEART_RATE',
  'PACE',
  'SESSIONRPE',
] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];

export const DEFAULT_LOAD_SOURCES: LoadSource[] = [...LOAD_SOURCES];

export const COMPOSED_BODY_METRIC_TYPES = [
  BodyMetricType.WEIGHT,
  BodyMetricType.HEIGHT,
  BodyMetricType.BIRTHDAY,
  BodyMetricType.GENDER,
  BodyMetricType.TIMEZONE,
] as const;

export type ComposedProfileBase = {
  preferredSports?: string | null;
  loadSources?: string | null;
  altitudeOptimizationModel?: string | null;
  altitudeThreshold?: number | null;
  defaultVdotSource?: string | null;
  vo2maxCorrectionFactor?: number | null;
  heartRateZoneModel?: HeartRateZoneModel | null;
  paceZoneModel?: PaceZoneModel | null;
  powerZoneModel?: PowerZoneModel | null;
} | null;

export type ComposedBodyMetric = {
  type: BodyMetricType;
  value: string | null;
};

/**
 * 解析组合档案运动类型。
 * @param sport - 运动类型。
 * @returns 组合档案运动类型。
 */
export function resolveComposedProfileSport(
  sport?: SportType | null,
): ComposedProfileSport | null {
  return sport === SportType.RUN ||
    sport === SportType.CYCLING ||
    sport === SportType.SWIM
    ? sport
    : null;
}

export function normalizePreferredSports(values: string[]): PreferredSport[] {
  const allowed = new Set<string>(PREFERRED_SPORTS);
  const parsed = values
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is PreferredSport => allowed.has(value));
  return Array.from(new Set(parsed));
}

export function parsePreferredSportsCsv(raw?: string | null): PreferredSport[] {
  if (!raw) return [];
  return normalizePreferredSports(raw.split(','));
}

export function normalizeLoadSources(values: string[]): LoadSource[] {
  const allowed = new Set<string>(LOAD_SOURCES);
  return values
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is LoadSource => allowed.has(value));
}

export function parseLoadSourcesCsv(raw?: string | null): LoadSource[] {
  if (!raw) return DEFAULT_LOAD_SOURCES;
  const parsed = normalizeLoadSources(raw.split(','));
  return parsed.length > 0 ? parsed : DEFAULT_LOAD_SOURCES;
}

/**
 * 构建用户健身指标查询条件。
 * @param userId - 用户 ID。
 * @param sport - 运动类型。
 * @param cutoff - 截止时间。
 * @returns 用户健身指标查询条件。
 */
export function composedFitnessMetricWhere(
  userId: string,
  sport: ComposedProfileSport | null,
  cutoff: Date,
) {
  return {
    userId,
    source: { in: [MetricSource.MANUAL, MetricSource.AUTO] },
    OR: sport
      ? [{ sport }, { sport: SportType.UNKNOWN }]
      : [{ sport: SportType.UNKNOWN }],
    ...(sport === SportType.RUN
      ? {
          NOT: {
            type: UserFitnessMetricType.CS,
            sport: SportType.RUN,
            source: MetricSource.AUTO,
            value: { lt: 1.8 },
          },
        }
      : {}),
    recordedAt: { lte: cutoff },
  };
}

export function thresholdPaceToMetersPerSecond(
  value?: number | null,
  value2?: number | null,
): number | undefined {
  if (typeof value2 === 'number' && Number.isFinite(value2) && value2 > 0) {
    return 1000 / value2;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 20 ? 1000 / value : value;
  }
  return undefined;
}

/**
 * 组合用户档案。
 * @param args - 参数。
 * @param args.sport - 运动类型。
 * @param args.base - 用户基本信息。
 * @param args.bodyMetrics - 用户身体指标。
 * @param args.fitnessMetrics - 健身指标。
 * @returns 组合后的用户档案。
 * @throws 如果用户基本信息、身体指标、健身指标不存在。
 */
export function composeUserProfile(args: {
  sport: ComposedProfileSport | null;
  base: ComposedProfileBase;
  bodyMetrics: ComposedBodyMetric[];
  fitnessMetrics: EffectiveFitnessMetricCandidate[];
}): UserProfileResponse {
  // 读取用户身体指标
  const body = readBodySnapshot(args.bodyMetrics);
  // 读取用户心率指标
  const heartRate = readHeartRateSnapshot(args.fitnessMetrics, args.sport);
  const power =
    args.sport === SportType.SWIM
      ? {}
      : readPowerSnapshot(args.fitnessMetrics, args.sport);
  const run =
    args.sport === SportType.RUN
      ? readRunPaceSnapshot(args.fitnessMetrics)
      : {};
  const includeRunPrefs = args.sport === SportType.RUN || args.sport == null;

  return {
    type: args.sport,
    preferredSports: parsePreferredSportsCsv(args.base?.preferredSports),
    ...body,
    equipmentWeight: undefined,
    bikeWeight: undefined,
    ...heartRate,
    ...power,
    ...run,
    loadSources: parseLoadSourcesCsv(args.base?.loadSources),
    altitudeOptimizationModel:
      args.base?.altitudeOptimizationModel ?? undefined,
    altitudeThreshold: args.base?.altitudeThreshold ?? undefined,
    defaultVdotSource: includeRunPrefs
      ? (args.base?.defaultVdotSource ?? undefined)
      : undefined,
    vo2maxCorrectionFactor: includeRunPrefs
      ? (args.base?.vo2maxCorrectionFactor ?? undefined)
      : undefined,
    heartRateZoneModel: args.base?.heartRateZoneModel ?? HeartRateZoneModel.MHR,
    paceZoneModel: args.base?.paceZoneModel ?? undefined,
    powerZoneModel: args.base?.powerZoneModel ?? undefined,
  };
}

function latestBodyByType(rows: ComposedBodyMetric[]) {
  const map = new Map<BodyMetricType, ComposedBodyMetric>();
  for (const row of rows) {
    if (!map.has(row.type)) map.set(row.type, row);
  }
  return map;
}

function optionalNumber(value: string | null | undefined) {
  return value ? Number(value) : undefined;
}

function readBodySnapshot(rows: ComposedBodyMetric[]) {
  const map = latestBodyByType(rows);
  const birthday = map.get(BodyMetricType.BIRTHDAY)?.value;
  const birthDate =
    birthday && dayjs(String(birthday)).isValid()
      ? dayjs(String(birthday)).format('YYYY-MM-DD')
      : birthday
        ? String(birthday)
        : undefined;
  const genderValue = map.get(BodyMetricType.GENDER)?.value;
  return {
    weight: optionalNumber(map.get(BodyMetricType.WEIGHT)?.value),
    height: optionalNumber(map.get(BodyMetricType.HEIGHT)?.value),
    birthDate,
    age:
      birthDate && dayjs(birthDate).isValid()
        ? dayjs().diff(dayjs(birthDate), 'year')
        : undefined,
    gender: genderValue
      ? (String(genderValue).toLowerCase() as Gender)
      : undefined,
    timezone: map.get(BodyMetricType.TIMEZONE)?.value
      ? String(map.get(BodyMetricType.TIMEZONE)?.value)
      : undefined,
  };
}

function metricValue(
  rows: EffectiveFitnessMetricCandidate[],
  type: UserFitnessMetricType,
  sport: ComposedProfileSport | null,
) {
  return selectEffectiveFitnessMetric(rows, type, sport);
}

function readHeartRateSnapshot(
  rows: EffectiveFitnessMetricCandidate[],
  sport: ComposedProfileSport | null,
) {
  return {
    maxHeartRate: numericMetricValue(
      metricValue(rows, UserFitnessMetricType.MAX_HR, sport)?.value,
    ),
    restingHeartRate: numericMetricValue(
      metricValue(rows, UserFitnessMetricType.RESTING_HR, sport)?.value,
    ),
    lthr: numericMetricValue(
      metricValue(rows, UserFitnessMetricType.LTHR, sport)?.value,
    ),
  };
}

function numericMetricValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function readPowerSnapshot(
  rows: EffectiveFitnessMetricCandidate[],
  sport: ComposedProfileSport | null,
) {
  const ftp = metricValue(rows, UserFitnessMetricType.FTP, sport);
  const cp = metricValue(rows, UserFitnessMetricType.CP, sport);
  const wPrime = metricValue(rows, UserFitnessMetricType.W_PRIME, sport);
  const pmax = metricValue(rows, UserFitnessMetricType.P_MAX, sport);
  return {
    ftp: ftp ? numericMetricValue(ftp.value) : undefined,
    cp: cp ? numericMetricValue(cp.value) : undefined,
    wPrime:
      numericMetricValue(wPrime?.value) ??
      numericMetricValue(cp?.value2) ??
      undefined,
    Pmax: pmax ? numericMetricValue(pmax.value) : undefined,
  };
}

function readRunPaceSnapshot(rows: EffectiveFitnessMetricCandidate[]) {
  const sport = SportType.RUN;
  const cs = metricValue(rows, UserFitnessMetricType.CS, sport);
  const tp = metricValue(rows, UserFitnessMetricType.TP, sport);
  const aet = metricValue(rows, UserFitnessMetricType.AET_PACE, sport);
  const vo2max = metricValue(rows, UserFitnessMetricType.VO2_MAX, sport);
  return {
    cs: cs ? numericMetricValue(cs.value) : undefined,
    tp: thresholdPaceToMetersPerSecond(
      numericMetricValue(tp?.value),
      numericMetricValue(tp?.value2),
    ),
    dPrime: numericMetricValue(cs?.value2),
    aerobicThresholdPaceSec: aet ? numericMetricValue(aet.value) : undefined,
    vo2max: vo2max ? numericMetricValue(vo2max.value) : undefined,
  };
}
