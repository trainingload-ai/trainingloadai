import { createHash } from 'node:crypto';

export const FITNESS_TIMELINE_PROJECTION_VERSION = 2;
export const DEFAULT_RESTING_HEART_RATE_BPM = 60;

export const FITNESS_TIMELINE_WINDOWS_DAYS = {
  POWER_MODEL: 90,
  CRITICAL_SPEED: 90,
  THRESHOLD_PACE: 180,
  LTHR_AGGREGATION: 90,
  LTHR_CORROBORATION: 42,
  VO2_MAX_DECAY: 40,
  VO2_MAX_TRUNCATION: 120,
} as const;

export type FitnessTimelineMetric =
  | 'FTP'
  | 'CP'
  | 'W_PRIME'
  | 'P_MAX'
  | 'MAX_HR'
  | 'LTHR'
  | 'RESTING_HR'
  | 'CS'
  | 'TP'
  | 'VO2_MAX';

export type FitnessTimelineSport = 'UNKNOWN' | 'RUN' | 'CYCLING' | 'SWIM';

export type FitnessValueOrigin =
  | 'MANUAL'
  | 'AUTHORITY'
  | 'AUTO'
  | 'ACTIVITY_BOOTSTRAP'
  | 'DEFAULT_RESTING_HEART_RATE'
  | 'UNAVAILABLE';

export type FitnessTimelineValue = {
  metric: FitnessTimelineMetric;
  sport: FitnessTimelineSport;
  value: number;
  value2?: number | null;
  effectiveAt: Date;
  origin: Exclude<FitnessValueOrigin, 'UNAVAILABLE'>;
  evidenceFingerprint: string;
  sourceMetricId?: string | null;
  sourceActivityIds?: readonly number[];
};

export type FitnessTimelineObservation = Omit<
  FitnessTimelineValue,
  'origin'
> & {
  origin?: 'AUTO';
};

export type FitnessTimelineChangePoint = FitnessTimelineValue & {
  projectionVersion: number;
  projectionFingerprint: string;
};

export type ResolvedFitnessValue =
  | FitnessTimelineValue
  | {
      metric: FitnessTimelineMetric;
      sport: FitnessTimelineSport;
      value: null;
      value2: null;
      effectiveAt: Date | null;
      origin: 'UNAVAILABLE';
      evidenceFingerprint: string;
      reason: string;
    };

type TimelineEvent =
  | {
      kind: 'ACTIVITY_END';
      at: Date;
      activityId: number;
      observations: readonly FitnessTimelineObservation[];
      autoUpdateEnabled: boolean;
    }
  | {
      kind: 'EXTERNAL_METRIC';
      at: Date;
      metric: FitnessTimelineValue;
    }
  | {
      kind: 'ACTIVITY_START';
      at: Date;
      activityId: number;
    };

const EVENT_ORDER: Record<TimelineEvent['kind'], number> = {
  EXTERNAL_METRIC: 0,
  ACTIVITY_END: 1,
  ACTIVITY_START: 2,
};

function metricKey(metric: FitnessTimelineMetric, sport: FitnessTimelineSport) {
  return `${sport}:${metric}`;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
}

export function fitnessTimelineFingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function compareFitnessTimelineEvents(
  left: TimelineEvent,
  right: TimelineEvent,
): number {
  const time = left.at.getTime() - right.at.getTime();
  if (time !== 0) return time;
  const kind = EVENT_ORDER[left.kind] - EVENT_ORDER[right.kind];
  if (kind !== 0) return kind;
  const leftId = 'activityId' in left ? left.activityId : -1;
  const rightId = 'activityId' in right ? right.activityId : -1;
  return leftId - rightId;
}

function sameValue(
  left: FitnessTimelineValue | undefined,
  right: FitnessTimelineObservation,
) {
  return (
    left?.value === right.value &&
    (left.value2 ?? null) === (right.value2 ?? null) &&
    left.evidenceFingerprint === right.evidenceFingerprint
  );
}

function validObservation(
  observation: FitnessTimelineObservation | FitnessTimelineValue,
) {
  return (
    Number.isFinite(observation.value) &&
    observation.value > 0 &&
    (observation.value2 == null || Number.isFinite(observation.value2))
  );
}

/**
 * 框架无关、无数据库访问的用户体能指标状态机。
 * 调用方负责用现有算法生成候选；本类只负责因果顺序、优先级、去重和 change point。
 */
export class FitnessTimelineProjector {
  private readonly current = new Map<string, FitnessTimelineValue>();
  private readonly emitted: FitnessTimelineChangePoint[] = [];

  constructor(seed: readonly FitnessTimelineValue[] = []) {
    for (const value of [...seed].sort((a, b) => {
      const time = a.effectiveAt.getTime() - b.effectiveAt.getTime();
      if (time !== 0) return time;
      const key = metricKey(a.metric, a.sport).localeCompare(
        metricKey(b.metric, b.sport),
      );
      if (key !== 0) return key;
      if (a.origin === b.origin) return 0;
      return a.origin === 'MANUAL' ? 1 : -1;
    })) {
      this.applyExternal(value);
    }
  }

  applyExternal(value: FitnessTimelineValue): void {
    if (!validObservation(value)) return;
    const key = metricKey(value.metric, value.sport);
    const current = this.current.get(key);
    if (
      current &&
      current.effectiveAt.getTime() === value.effectiveAt.getTime() &&
      current.origin === 'MANUAL' &&
      value.origin !== 'MANUAL'
    ) {
      return;
    }
    this.current.set(key, value);
  }

  applyObservationGroup(args: {
    effectiveAt: Date;
    observations: readonly FitnessTimelineObservation[];
    autoUpdateEnabled: boolean;
  }): readonly FitnessTimelineChangePoint[] {
    if (!args.autoUpdateEnabled) return [];
    const grouped = new Map<string, FitnessTimelineObservation[]>();
    for (const observation of args.observations) {
      if (!validObservation(observation)) continue;
      const key = metricKey(observation.metric, observation.sport);
      grouped.set(key, [...(grouped.get(key) ?? []), observation]);
    }

    const changes: FitnessTimelineChangePoint[] = [];
    for (const [key, group] of [...grouped.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const previous = this.current.get(key);
      // MANUAL wins an exact-timestamp tie. A later AUTO change point may
      // evolve the timeline again when automatic updates remain enabled,
      // matching the existing recordedAt-based effective-value semantics.
      if (
        previous?.origin === 'MANUAL' &&
        previous.effectiveAt.getTime() === args.effectiveAt.getTime()
      )
        continue;
      const sorted = [...group].sort((left, right) => {
        const activity =
          (left.sourceActivityIds?.[0] ?? 0) -
          (right.sourceActivityIds?.[0] ?? 0);
        return (
          activity ||
          left.evidenceFingerprint.localeCompare(right.evidenceFingerprint)
        );
      });
      let selected = sorted.at(-1)!;
      if (selected.metric === 'MAX_HR') {
        selected = sorted.reduce((best, candidate) =>
          candidate.value > best.value ? candidate : best,
        );
        if (previous && previous.value >= selected.value) continue;
      }
      if (sameValue(previous, selected)) continue;

      const next: FitnessTimelineValue = {
        ...selected,
        effectiveAt: args.effectiveAt,
        origin: 'AUTO',
        sourceActivityIds: sorted.flatMap(
          (observation) => observation.sourceActivityIds ?? [],
        ),
      };
      const change: FitnessTimelineChangePoint = {
        ...next,
        projectionVersion: FITNESS_TIMELINE_PROJECTION_VERSION,
        projectionFingerprint: fitnessTimelineFingerprint({
          metric: next.metric,
          sport: next.sport,
          value: next.value,
          value2: next.value2 ?? null,
          effectiveAt: next.effectiveAt.toISOString(),
          evidence: sorted.map(
            (observation) => observation.evidenceFingerprint,
          ),
        }),
      };
      this.current.set(key, next);
      const sameInstantIndex = this.emitted.findIndex(
        (candidate) =>
          candidate.metric === change.metric &&
          candidate.sport === change.sport &&
          candidate.effectiveAt.getTime() === change.effectiveAt.getTime(),
      );
      if (sameInstantIndex >= 0) {
        // One causal timestamp can be evaluated in more than one wave (for
        // example, a zero-duration activity must first consume the pre-start
        // context before its own end observation becomes visible). The
        // durable timeline still has exactly one change point per key/time.
        this.emitted[sameInstantIndex] = change;
      } else {
        this.emitted.push(change);
      }
      changes.push(change);
    }
    return changes;
  }

  resolve(args: {
    metric: FitnessTimelineMetric;
    sport: FitnessTimelineSport;
    at: Date;
    bootstrap?: FitnessTimelineObservation | null;
    allowRestingHrDefault?: boolean;
  }): ResolvedFitnessValue {
    const specific = this.current.get(metricKey(args.metric, args.sport));
    const global = this.current.get(metricKey(args.metric, 'UNKNOWN'));
    const effective = [specific, global].find(
      (candidate) =>
        candidate != null &&
        candidate.effectiveAt.getTime() <= args.at.getTime(),
    );
    if (effective) return effective;
    if (
      args.bootstrap &&
      validObservation(args.bootstrap) &&
      args.bootstrap.effectiveAt.getTime() >= args.at.getTime()
    ) {
      return { ...args.bootstrap, origin: 'ACTIVITY_BOOTSTRAP' };
    }
    if (args.metric === 'RESTING_HR' && args.allowRestingHrDefault) {
      return {
        metric: 'RESTING_HR',
        sport: 'UNKNOWN',
        value: DEFAULT_RESTING_HEART_RATE_BPM,
        value2: null,
        effectiveAt: args.at,
        origin: 'DEFAULT_RESTING_HEART_RATE',
        evidenceFingerprint: fitnessTimelineFingerprint({
          kind: 'DEFAULT_RESTING_HEART_RATE',
          version: 1,
          value: DEFAULT_RESTING_HEART_RATE_BPM,
        }),
      };
    }
    return {
      metric: args.metric,
      sport: args.sport,
      value: null,
      value2: null,
      effectiveAt: null,
      origin: 'UNAVAILABLE',
      evidenceFingerprint: fitnessTimelineFingerprint({
        kind: 'UNAVAILABLE',
        metric: args.metric,
        sport: args.sport,
        at: args.at.toISOString(),
      }),
      reason: 'metric_unavailable_at_activity_time',
    };
  }

  changePoints(): readonly FitnessTimelineChangePoint[] {
    return [...this.emitted];
  }

  stateFingerprint(): string {
    return fitnessTimelineFingerprint(
      [...this.current.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({
          key,
          value: value.value,
          value2: value.value2 ?? null,
          effectiveAt: value.effectiveAt.toISOString(),
          origin: value.origin,
          evidenceFingerprint: value.evidenceFingerprint,
        })),
    );
  }
}

export type { TimelineEvent as FitnessTimelineEvent };
