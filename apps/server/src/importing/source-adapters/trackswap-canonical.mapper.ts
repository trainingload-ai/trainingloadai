import { createHash } from 'crypto';
import tzLookup = require('tz-lookup');
import type {
  ActivityLapType,
  ActivityLengthType,
  ActivityRecordType,
  ActivityType,
} from 'trackswap';
import type {
  ImportSourceKind,
  SportType,
  ThirdPartyProvider,
} from '@prisma/client';
import type {
  CanonicalActivityPayload,
  CanonicalLap,
  CanonicalLength,
  CanonicalRecord,
} from '../canonical-activity.types';

function isoString(value?: string | number | Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

type Coordinate = { lat: number; lng: number };

function coordinate(lat: unknown, lng: unknown): Coordinate | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function recordCoordinate(
  records: CanonicalRecord[],
  direction: 'first' | 'last',
): Coordinate | null {
  if (direction === 'first') {
    for (const record of records) {
      const found = coordinate(record.positionLat, record.positionLong);
      if (found) return found;
    }
    return null;
  }

  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const found = coordinate(record?.positionLat, record?.positionLong);
    if (found) return found;
  }
  return null;
}

function inferTimezone(point: Coordinate | null) {
  if (!point) return undefined;
  try {
    return tzLookup(point.lat, point.lng);
  } catch {
    return undefined;
  }
}

/**
 * 从 trackswap 活动对象取出 FIT `sub_sport`（字段名随解析器可能为 subSport / sub_sport）。
 */
export function extractTrackSwapSubSport(
  activity: ActivityType,
): number | undefined {
  const a = activity as ActivityType & {
    subSport?: unknown;
    sub_sport?: unknown;
  };
  const raw = a.subSport ?? a.sub_sport;
  if (raw === null || raw === undefined) return undefined;
  const n = typeof raw === 'string' ? Number(raw) : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const t = Math.trunc(n);
  return t >= 0 ? t : undefined;
}

/** FIT Profile sub_sport 数字转稳定名称，供运动目录做组合映射。 */
export function fitSubSportName(value: unknown) {
  if (
    typeof value === 'string' &&
    value.trim() &&
    !/^\d+$/.test(value.trim())
  ) {
    return value.trim();
  }
  const code = Number(value);
  const names: Record<number, string> = {
    1: 'treadmill',
    3: 'trail',
    6: 'indoor_cycling',
    7: 'road',
    8: 'mountain',
    17: 'lap_swimming',
    18: 'open_water',
    19: 'flexibility_training',
    20: 'strength_training',
  };
  return Number.isInteger(code) ? names[code] : undefined;
}

export function mapTrackSwapSportType(input?: string | null): SportType {
  const normalized = String(input ?? '')
    .trim()
    .toUpperCase();

  const mappings: Record<string, SportType> = {
    RUNNING: 'RUN',
    RUN: 'RUN',
    WALKING: 'RUN',
    WALK: 'RUN',
    TRAIL_RUNNING: 'RUN',
    HIKE: 'RUN',
    CYCLING: 'CYCLING',
    BIKE: 'CYCLING',
    INDOOR_BIKE: 'CYCLING',
    TRAINER: 'CYCLING',
    MOUNTAIN_BIKING: 'CYCLING',
    MTB: 'CYCLING',
    SWIMMING: 'SWIM',
    SWIM: 'SWIM',
    STRETCHING: 'STRETCHING',
  };

  return mappings[normalized] ?? 'UNKNOWN';
}

function mapLap(lap: ActivityLapType): CanonicalLap {
  return {
    index: lap.index ?? undefined,
    sportType: lap.sport ?? undefined,
    startTime: isoString(lap.startTime),
    endTime: isoString(lap.endTime),
    elapsedTime: lap.totalElapsedTime ?? undefined,
    timerTime: lap.totalTimerTime ?? undefined,
    distance: lap.totalDistance ?? undefined,
    ascent: lap.totalAscent ?? undefined,
    descent: lap.totalDescent ?? undefined,
    avgHeartRate: lap.avgHeartRate ?? undefined,
    maxHeartRate: lap.maxHeartRate ?? undefined,
    avgPower: lap.avgPower ?? undefined,
    maxPower: lap.maxPower ?? undefined,
    avgSpeed: lap.enhancedAvgSpeed ?? lap.avgSpeed ?? undefined,
    maxSpeed: lap.enhancedMaxSpeed ?? lap.maxSpeed ?? undefined,
    avgCadence: lap.avgCadence ?? undefined,
    maxCadence: lap.maxCadence ?? undefined,
    cycles: lap.totalCycles ?? undefined,
    avgGroundContactTime: lap.avgStanceTime ?? undefined,
    avgStrideLength: lap.avgStepLength ?? undefined,
    avgVerticalOscillation: lap.avgVerticalOscillation ?? undefined,
    avgVerticalRatio: lap.avgVerticalRatio ?? undefined,
    calories: lap.totalCalories ?? undefined,
  };
}

function mapRecord(
  record: ActivityRecordType,
  lapIndex?: number,
): CanonicalRecord {
  return {
    index: record.index ?? undefined,
    lapIndex,
    timestamp: isoString(record.timestamp),
    positionLat: record.positionLat ?? undefined,
    positionLong: record.positionLong ?? undefined,
    altitude: record.altitude ?? undefined,
    enhancedAltitude: record.enhancedAltitude ?? undefined,
    distance: record.distance ?? undefined,
    speed: record.speed ?? undefined,
    heartRate: record.heartRate ?? undefined,
    power: record.power ?? undefined,
    cadence: record.cadence ?? undefined,
    totalCycles: record.totalCycles ?? undefined,
    temperature: record.temperature ?? undefined,
    grade:
      (record as ActivityRecordType & { grade?: number | null }).grade ??
      undefined,
    stepLength: record.stepLength ?? undefined,
    stanceTime: record.stanceTime ?? undefined,
    stanceTimePercent: record.stanceTimePercent ?? undefined,
    stanceTimeBalance: record.stanceTimeBalance ?? undefined,
    verticalOscillation: record.verticalOscillation ?? undefined,
    verticalRatio: record.verticalRatio ?? undefined,
    description:
      record.description !== undefined && record.description !== null
        ? String(record.description)
        : undefined,
    accumulatedPower: record.accumulatedPower ?? undefined,
  };
}

/**
 * TrackSwap/FIT 的单个 lap record 流必须按时间正序排列。
 *
 * 某些 FIT 文件会在正常 record 流之后附带一段解码器回填记录：这些记录的
 * timestamp 会突然回到活动早期，但 distance 等字段仍沿用活动末尾累计值。
 * 如果继续把它们当作轨迹点，会制造“一秒跨越整场距离”的窗口。
 * canonical 边界在第一次时间倒退处截断该损坏尾部，避免把协议解码异常泄漏
 * 给下游所有指标任务。
 */
export function normalizeTrackSwapLapRecords(
  records: ActivityRecordType[],
  lapIndex?: number,
): CanonicalRecord[] {
  const normalized: CanonicalRecord[] = [];
  let previousTimestampMs = Number.NEGATIVE_INFINITY;

  for (const record of records) {
    const mapped = mapRecord(record, lapIndex);
    const timestampMs = mapped.timestamp
      ? new Date(mapped.timestamp).getTime()
      : Number.NaN;
    if (!Number.isFinite(timestampMs)) continue;
    if (timestampMs < previousTimestampMs) break;
    previousTimestampMs = timestampMs;
    normalized.push(mapped);
  }

  return normalized;
}

function mapLength(length: ActivityLengthType): CanonicalLength {
  const lengthWithDistance = length as ActivityLengthType & {
    totalDistance?: number;
  };

  return {
    index: length.index ?? undefined,
    startTime: isoString(length.startTime),
    totalElapsedTime: length.totalElapsedTime ?? undefined,
    totalTimerTime: length.totalTimerTime ?? undefined,
    totalDistance: lengthWithDistance.totalDistance ?? undefined,
    totalStrokes: length.totalStrokes ?? undefined,
    avgSpeed: length.avgSpeed ?? undefined,
    swimStroke: length.swimStroke ?? undefined,
    avgSwimmingCadence: length.avgSwimmingCadence ?? undefined,
    messageIndex: length.messageIndex ?? undefined,
  };
}

export function buildCanonicalDedupeKey(input: {
  sourceUid: string;
  sportType: SportType;
  startTime?: string;
  distance?: number;
  elapsedTime?: number;
}) {
  // sourceUid 只用于来源内幂等，不能参与跨来源活动身份。这里保留参数以兼容
  // 调用方，但去重键只使用平台无关的核心字段。
  return createHash('sha1')
    .update(
      [
        input.sportType,
        input.startTime ?? '',
        input.distance == null ? '' : Math.round(input.distance),
        input.elapsedTime == null ? '' : Math.round(input.elapsedTime),
      ].join('|'),
    )
    .digest('hex');
}

export function buildCanonicalDatasetChecksum(input: {
  sportType: SportType;
  startTime?: string;
  endTime?: string;
  distance?: number;
  elapsedTime?: number;
  timerTime?: number;
  laps: CanonicalLap[];
  records: CanonicalRecord[];
  lengths: CanonicalLength[];
}) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/**
 * 将 trackswap 活动映射为 canonical 活动 payload
 */
export function mapTrackSwapActivityToCanonicalPayload(args: {
  kind: ImportSourceKind;
  sourceUid: string;
  activity: ActivityType;
  provider?: ThirdPartyProvider | null;
  accountRef?: string;
  externalId?: string;
  fileName?: string;
  fileKey?: string;
  rawStorageKey?: string;
  sourceChecksum?: string;
  sourceVersion?: string;
  metadata?: Record<string, unknown>;
  activityIndex?: number;
  activityCount?: number;
}): CanonicalActivityPayload {
  const { activity } = args;
  const activityWithExtensions = activity as ActivityType & {
    timezone?: string;
    activityName?: string;
    description?: string;
    enhancedAscent?: number;
    enhancedDescent?: number;
  };
  const sourceUid =
    typeof args.activityIndex === 'number'
      ? `${args.sourceUid}#${args.activityIndex}`
      : args.sourceUid;
  const sportType = mapTrackSwapSportType(activity.sport);
  const subSport = extractTrackSwapSubSport(activity);
  const activitySubSport = activity as ActivityType & {
    subSport?: unknown;
    sub_sport?: unknown;
  };
  const rawSubSport = activitySubSport.subSport ?? activitySubSport.sub_sport;
  const startTime = isoString(activity.startTime);
  const endTime = isoString(activity.endTime);

  const laps = (activity.laps ?? []).map(mapLap);
  const records = (activity.laps ?? []).flatMap((lap) =>
    normalizeTrackSwapLapRecords(lap.records ?? [], lap.index ?? undefined),
  );
  const lengths = (activity.laps ?? []).flatMap((lap) =>
    (lap.lengths ?? []).map(mapLength),
  );
  const startCoordinate =
    coordinate(activity.startPositionLat, activity.startPositionLong) ??
    recordCoordinate(records, 'first');
  const endCoordinate =
    coordinate(activity.endPositionLat, activity.endPositionLong) ??
    recordCoordinate(records, 'last');
  const explicitTimezone = activityWithExtensions.timezone?.trim();
  const timezone = explicitTimezone || inferTimezone(startCoordinate);
  const datasetChecksum = buildCanonicalDatasetChecksum({
    sportType,
    startTime,
    endTime,
    distance: activity.totalDistance ?? undefined,
    elapsedTime: activity.totalElapsedTime ?? undefined,
    timerTime: activity.totalTimerTime ?? undefined,
    laps,
    records,
    lengths,
  });
  const sourceChecksum =
    args.sourceChecksum &&
    typeof args.activityIndex === 'number' &&
    typeof args.activityCount === 'number' &&
    args.activityCount > 1
      ? createHash('sha256')
          .update(`${args.sourceChecksum}#${args.activityIndex}`)
          .digest('hex')
      : (args.sourceChecksum ?? datasetChecksum);

  return {
    source: {
      kind: args.kind,
      provider: args.provider ?? undefined,
      sourceUid,
      accountRef: args.accountRef,
      externalId: args.externalId,
      fileName: args.fileName,
      fileKey: args.fileKey,
      rawStorageKey: args.rawStorageKey,
      sourceChecksum,
    },
    identity: {
      sourceUid,
      sourceVersion: args.sourceVersion,
      dedupeKey: buildCanonicalDedupeKey({
        sourceUid,
        sportType,
        startTime,
        distance: activity.totalDistance ?? undefined,
        elapsedTime: activity.totalElapsedTime ?? undefined,
      }),
      datasetChecksum,
    },
    summary: {
      name: activityWithExtensions.activityName ?? undefined,
      description: activityWithExtensions.description ?? undefined,
      sportType,
      subSport: subSport ?? null,
      timestamp: isoString(activity.timestamp),
      startTime,
      endTime,
      timezone,
      distance: activity.totalDistance ?? undefined,
      elapsedTime: activity.totalElapsedTime ?? undefined,
      timerTime: activity.totalTimerTime ?? undefined,
      ascent: activity.totalAscent ?? undefined,
      descent: activity.totalDescent ?? undefined,
      enhancedAscent: activityWithExtensions.enhancedAscent ?? undefined,
      enhancedDescent: activityWithExtensions.enhancedDescent ?? undefined,
      avgHeartRate: activity.avgHeartRate ?? undefined,
      maxHeartRate: activity.maxHeartRate ?? undefined,
      avgPower: activity.avgPower ?? undefined,
      maxPower: activity.maxPower ?? undefined,
      avgSpeed: activity.enhancedAvgSpeed ?? activity.avgSpeed ?? undefined,
      maxSpeed: activity.enhancedMaxSpeed ?? activity.maxSpeed ?? undefined,
      avgCadence: activity.avgCadence ?? undefined,
      maxCadence: activity.maxCadence ?? undefined,
      calories: activity.totalCalories ?? undefined,
      startLat: startCoordinate?.lat,
      startLng: startCoordinate?.lng,
      endLat: endCoordinate?.lat,
      endLng: endCoordinate?.lng,
      poolLength: activity.poolLength ?? undefined,
      poolLengthUnit: activity.poolLengthUnit ?? undefined,
      numLaps: activity.numLaps ?? undefined,
      numLengths: activity.numLengths ?? undefined,
      numActiveLengths: activity.numActiveLengths ?? undefined,
    },
    laps,
    records,
    lengths,
    metadata: {
      ...(args.metadata ?? {}),
      ...(args.sourceChecksum && args.activityCount && args.activityCount > 1
        ? { containerChecksum: args.sourceChecksum }
        : {}),
      trackswapSport: activity.sport ?? null,
      trackswapSubSport: subSport ?? null,
      trackswapSubSportRaw: fitSubSportName(rawSubSport) ?? null,
      lapCount: laps.length,
      recordCount: records.length,
      lengthCount: lengths.length,
    },
  };
}
/**
 * 将 canonical 活动 payload 映射为 trackswap 活动
 * @param payload canonical 活动 payload
 * @returns trackswap 活动
 */
export function mapCanonicalPayloadToTrackSwapActivity(
  payload: CanonicalActivityPayload,
): ActivityType {
  const lapMap = new Map<
    number,
    CanonicalLap & { records: CanonicalRecord[]; lengths: CanonicalLength[] }
  >();

  payload.laps.forEach((lap, idx) => {
    const key = typeof lap.index === 'number' ? lap.index : idx;
    lapMap.set(key, {
      ...lap,
      records: [],
      lengths: [],
    });
  });

  if (lapMap.size === 0) {
    lapMap.set(0, {
      index: 0,
      records: [],
      lengths: [],
    });
  }

  for (const record of payload.records) {
    const lapIndex = typeof record.lapIndex === 'number' ? record.lapIndex : 0;
    const target = lapMap.get(lapIndex) ?? lapMap.get(0)!;
    target.records.push(record);
  }

  const fallbackLap = lapMap.get(0) ?? lapMap.values().next().value;

  for (const length of payload.lengths) {
    const target = fallbackLap;
    if (!target) continue;
    target.lengths.push(length);
  }

  const laps = Array.from(lapMap.values())
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((lap) => ({
      index: lap.index ?? undefined,
      activityName: lap.activityName ?? payload.summary.name ?? undefined,
      sport: lap.sportType ?? payload.summary.sportType,
      startTime: lap.startTime ?? payload.summary.startTime,
      endTime: lap.endTime ?? payload.summary.endTime,
      totalElapsedTime: lap.elapsedTime ?? undefined,
      totalTimerTime: lap.timerTime ?? undefined,
      totalDistance: lap.distance ?? undefined,
      totalAscent: lap.ascent ?? undefined,
      totalDescent: lap.descent ?? undefined,
      avgHeartRate: lap.avgHeartRate ?? undefined,
      maxHeartRate: lap.maxHeartRate ?? undefined,
      avgPower: lap.avgPower ?? undefined,
      maxPower: lap.maxPower ?? undefined,
      avgSpeed: lap.avgSpeed ?? undefined,
      maxSpeed: lap.maxSpeed ?? undefined,
      avgCadence: lap.avgCadence ?? undefined,
      maxCadence: lap.maxCadence ?? undefined,
      totalCycles: lap.cycles ?? undefined,
      avgStanceTime: lap.avgGroundContactTime ?? undefined,
      avgStepLength: lap.avgStrideLength ?? undefined,
      avgVerticalOscillation: lap.avgVerticalOscillation ?? undefined,
      avgVerticalRatio: lap.avgVerticalRatio ?? undefined,
      totalCalories: lap.calories ?? undefined,
      records: lap.records.map((record) => ({
        index: record.index ?? undefined,
        timestamp: record.timestamp ?? undefined,
        positionLat: record.positionLat ?? undefined,
        positionLong: record.positionLong ?? undefined,
        altitude: record.altitude ?? undefined,
        enhancedAltitude: record.enhancedAltitude ?? undefined,
        distance: record.distance ?? undefined,
        speed: record.speed ?? undefined,
        heartRate: record.heartRate ?? undefined,
        power: record.power ?? undefined,
        cadence: record.cadence ?? undefined,
        totalCycles: record.totalCycles ?? undefined,
        temperature: record.temperature ?? undefined,
        stepLength: record.stepLength ?? undefined,
        stanceTime: record.stanceTime ?? undefined,
        stanceTimePercent: record.stanceTimePercent ?? undefined,
        stanceTimeBalance: record.stanceTimeBalance ?? undefined,
        verticalOscillation: record.verticalOscillation ?? undefined,
        verticalRatio: record.verticalRatio ?? undefined,
        description: record.description ?? undefined,
        accumulatedPower: record.accumulatedPower ?? undefined,
      })),
      lengths: lap.lengths.map((length) => ({
        index: length.index ?? undefined,
        startTime: length.startTime ?? undefined,
        totalElapsedTime: length.totalElapsedTime ?? undefined,
        totalTimerTime: length.totalTimerTime ?? undefined,
        totalDistance: length.totalDistance ?? undefined,
        totalStrokes: length.totalStrokes ?? undefined,
        avgSpeed: length.avgSpeed ?? undefined,
        swimStroke: length.swimStroke ?? undefined,
        avgSwimmingCadence: length.avgSwimmingCadence ?? undefined,
        messageIndex: length.messageIndex ?? undefined,
      })),
    }));

  return {
    sport: payload.summary.sportType,
    subSport: payload.summary.subSport ?? undefined,
    activityName: payload.summary.name,
    description: payload.summary.description,
    timestamp: payload.summary.timestamp ?? payload.summary.startTime,
    startTime: payload.summary.startTime,
    endTime: payload.summary.endTime,
    timezone: payload.summary.timezone,
    startPositionLat: payload.summary.startLat,
    startPositionLong: payload.summary.startLng,
    endPositionLat: payload.summary.endLat,
    endPositionLong: payload.summary.endLng,
    totalDistance: payload.summary.distance,
    totalElapsedTime: payload.summary.elapsedTime,
    totalTimerTime: payload.summary.timerTime,
    totalAscent: payload.summary.ascent,
    totalDescent: payload.summary.descent,
    enhancedAscent: payload.summary.enhancedAscent,
    enhancedDescent: payload.summary.enhancedDescent,
    avgHeartRate: payload.summary.avgHeartRate,
    maxHeartRate: payload.summary.maxHeartRate,
    avgPower: payload.summary.avgPower,
    maxPower: payload.summary.maxPower,
    avgSpeed: payload.summary.avgSpeed,
    maxSpeed: payload.summary.maxSpeed,
    avgCadence: payload.summary.avgCadence,
    maxCadence: payload.summary.maxCadence,
    totalCalories: payload.summary.calories,
    poolLength: payload.summary.poolLength,
    poolLengthUnit: payload.summary.poolLengthUnit,
    numLaps: payload.summary.numLaps,
    numLengths: payload.summary.numLengths,
    numActiveLengths: payload.summary.numActiveLengths,
    laps,
  } as unknown as ActivityType;
}
