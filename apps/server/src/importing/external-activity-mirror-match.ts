import {
  CROSS_SOURCE_ACTIVITY_MATCH_POLICY,
  evaluateCrossSourceActivityMatch,
} from './cross-source-activity-match.policy';

type JsonRecord = Record<string, unknown>;

export type ExternalActivityMatchCandidate = {
  startTime: Date | null;
  timezone: string | null;
  sportType: string | null;
  elapsedTime: number | null;
  distance: number | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function localStartKey(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw.replace(/\.\d{1,6}/, '').slice(0, 19);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim()))
    return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wallClockMs(value: unknown): number | null {
  const key = localStartKey(value);
  if (!key) return null;
  const parsed = new Date(`${key}Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function instantMs(value: unknown): number | null {
  const raw = text(value);
  if (!raw || !/[zZ]|[+-]\d\d:\d\d$/.test(raw)) return null;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function localKeyForInstant(value: Date | null, timezone: string | null) {
  if (!value || !timezone) return null;
  try {
    const values = new Map(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .map((part) => [part.type, part.value]),
    );
    return `${values.get('year')}-${values.get('month')}-${values.get('day')}T${values.get('hour')}:${values.get('minute')}:${values.get('second')}`;
  } catch {
    return null;
  }
}

function sportFamily(value: unknown): string | null {
  const normalized = text(value)
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!normalized) return null;
  if (normalized.includes('RUN')) return 'RUNNING';
  if (
    normalized.includes('RIDE') ||
    normalized.includes('BIKE') ||
    normalized.includes('CYCL')
  )
    return 'CYCLING';
  if (normalized.includes('SWIM')) return 'SWIMMING';
  if (normalized.includes('WALK')) return 'WALKING';
  if (normalized.includes('HIKE')) return 'HIKING';
  if (normalized.includes('STRENGTH') || normalized.includes('WEIGHT'))
    return 'STRENGTH';
  return normalized;
}

/**
 * 将 Intervals 影子的稀疏摘要适配到统一跨来源匹配策略。
 * 对同一用户的影子而言，秒级一致且候选唯一的当地开始时间就是精确证据，
 * 与 Provider 无关；未精确命中时再使用正式导入关联所用的近似匹配规则。
 */
export function evaluateExternalActivityMirrorMatch(args: {
  mirror: JsonRecord;
  importedRaw: JsonRecord;
  activity: ExternalActivityMatchCandidate;
  providerAligned: boolean;
  sameSourceObject: boolean;
}) {
  const mirrorLocal = wallClockMs(args.mirror.start_date_local);
  const mirrorInstant = instantMs(args.mirror.start_date);
  const importedLocalCandidates = [
    wallClockMs(args.importedRaw.start_date_local),
    wallClockMs(args.importedRaw.local_start_time),
    wallClockMs(args.importedRaw.startTimeLocal),
    wallClockMs(
      localKeyForInstant(args.activity.startTime, args.activity.timezone),
    ),
  ].filter((value): value is number => value != null);
  const localStartDiffs: number[] = [];
  if (mirrorLocal != null) {
    localStartDiffs.push(
      ...importedLocalCandidates.map(
        (candidate) => Math.abs(mirrorLocal - candidate) / 1000,
      ),
    );
  }
  const instantStartDiffSeconds =
    mirrorInstant != null && args.activity.startTime
      ? Math.abs(mirrorInstant - args.activity.startTime.getTime()) / 1000
      : null;
  const localStartDiffSeconds = localStartDiffs.length
    ? Math.min(...localStartDiffs)
    : null;
  const startDiffs = [localStartDiffSeconds, instantStartDiffSeconds].filter(
    (value): value is number => value != null,
  );
  const startDiffSeconds = startDiffs.length
    ? Math.min(...startDiffs)
    : Number.POSITIVE_INFINITY;
  if (startDiffSeconds > CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds)
    return null;

  const exactStartMatch =
    startDiffSeconds <=
    CROSS_SOURCE_ACTIVITY_MATCH_POLICY.nearExactStartDiffSeconds;
  // 影子场景允许不同 Provider 通过秒级当地开始时间命中。这里仅生成候选，
  // “同一用户且只有一个唯一候选”的约束由 ExternalActivityMirrorService 负责。
  if (args.sameSourceObject || exactStartMatch) {
    return {
      confidence: 1,
      evidence: {
        startDiffSeconds,
        localStartDiffSeconds,
        instantStartDiffSeconds,
        exactStartMatch,
        providerAligned: args.providerAligned,
        sameSourceObject: args.sameSourceObject,
        matcherVersion: 'external-mirror-exact-start-v1',
      },
    };
  }

  const mirrorSport = sportFamily(
    args.mirror.sport_type ?? args.mirror.type ?? args.mirror.sport,
  );
  const importedSport = sportFamily(args.activity.sportType);
  if (!mirrorSport || !importedSport || mirrorSport !== importedSport)
    return null;

  const mirrorDuration = finiteNumber(
    args.mirror.moving_time ??
      args.mirror.elapsed_time ??
      args.mirror.elapsedTime,
  );
  const mirrorDistance = finiteNumber(
    args.mirror.distance ?? args.mirror.total_distance,
  );
  const match = evaluateCrossSourceActivityMatch({
    startDiffSeconds,
    leftElapsedTime: mirrorDuration,
    rightElapsedTime: args.activity.elapsedTime,
    leftDistance: mirrorDistance,
    rightDistance: args.activity.distance,
  });
  if (!match) return null;
  return {
    confidence: match.confidence,
    evidence: {
      ...match.evidence,
      sportFamily: mirrorSport,
      mirrorAdapterVersion: 'external-mirror-v3',
    },
  };
}
