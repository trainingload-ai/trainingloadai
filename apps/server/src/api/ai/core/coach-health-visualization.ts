import { createHash } from 'node:crypto';
import type {
  CoachHealthScope,
  CoachHealthVisualization,
} from '@shared/ai-coach-schema';
import type { HealthDataQueryService } from '@/health-data/health-data-query.service';
import {
  buildHealthOverviewCards,
  calculateHealthBaseline,
  HEALTH_HRV_TYPES,
  type DailyHealthData,
  type HealthHrvType,
  type HealthOverviewCard,
} from '@shared/health-overview';
import { addCalendarDays, isCalendarDate } from '@shared/plan-calendar';

export function coachHealthWindowDays(from: string, to: string) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    throw new Error('Use a valid calendar date range');
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > 90) throw new Error('Choose a health date range of at most 90 days');
  return days;
}

function selectCard(days: DailyHealthData[], scope: CoachHealthScope): HealthOverviewCard | undefined {
  const selectedDays = days.map((day) => ({
    ...day,
    metrics: day.metrics.filter((record) =>
      (scope.provider === undefined || record.provider === scope.provider) &&
      (!scope.hrvType || scope.metric !== 'hrv' || record.type === scope.hrvType) &&
      (scope.metric !== 'sleep' || scope.sleepValueKind !== 'timeInBed' ||
        record.type === 'SLEEP_IN_BED_SECONDS'),
    ),
  }));
  if (scope.metric === 'sleepHeartRate' || scope.metric === 'restingHeartRate') {
    const type = scope.metric === 'sleepHeartRate'
      ? 'SLEEP_AVG_HEART_RATE_BPM' : 'RESTING_HEART_RATE_BPM';
    const latest = selectedDays.flatMap((day) => day.metrics)
      .filter((row) => row.type === type && Number.isFinite(row.value)).at(-1);
    if (!latest) return;
    return buildHealthOverviewCards(selectedDays.map((day) => ({
      ...day,
      metrics: day.metrics.filter((row) => row.type === type && row.provider === latest.provider)
        .map((row) => ({ ...row, type: 'RESTING_HEART_RATE_BPM' })),
    }))).find((card) => card.key === 'restingHeartRate');
  }
  const card = buildHealthOverviewCards(selectedDays).find(
    (candidate) => candidate.key === scope.metric,
  );
  if (!card) return;
  if (scope.metric !== 'sleep') return card;
  const basis = scope.sleepValueKind ??
    (scope.mode !== 'LATEST' && card.points.some((point) => point.sleepValueKind === 'timeAsleep')
      ? 'timeAsleep' : card.sleepValueKind);
  const latest = card.points.filter((point) => point.value != null &&
    point.sleepValueKind === basis).at(-1);
  if (latest?.value == null) return;
  return {
    ...card,
    latestDate: latest.date,
    latestValue: latest.value,
    provider: latest.provider ?? card.provider,
    sleepValueKind: latest.sleepValueKind,
    points: card.points.map((point) =>
      (point.provider === latest.provider) &&
      (scope.metric !== 'sleep' || point.sleepValueKind === latest.sleepValueKind)
        ? point : { date: point.date },
    ),
  };
}

export async function readCoachHealthVisualization(
  health: Pick<HealthDataQueryService, 'getOverview'>,
  userId: string,
  scope: CoachHealthScope,
  options: { chart?: boolean; recent?: boolean; observedAt: string; hrvSourceId?: string },
): Promise<CoachHealthVisualization> {
  async function readDays(range: CoachHealthScope) {
    const days = coachHealthWindowDays(range.from, range.to);
    const result = await health.getOverview(userId, Math.max(7, days), range.to);
    return result.days.filter(({ date }) => date >= range.from && date <= range.to);
  }
  const read = async (range: CoachHealthScope) => selectCard(await readDays(range), range);
  const days = await readDays(scope);
  const hrvSources = options.chart && scope.metric === 'hrv' ? [...new Map(
    days.flatMap((day) => day.metrics.flatMap(({ type, value, provider }) => {
      const hrvType = HEALTH_HRV_TYPES.find((method): method is HealthHrvType => method === type);
      if (!hrvType || !Number.isFinite(value)) return [];
      const id = JSON.stringify([provider, hrvType]);
      return [[id, { id, provider, hrvType }] as const];
    })),
  ).values()] : undefined;
  const selectedSource = hrvSources?.find(({ id }) => id === options.hrvSourceId);
  const selectedScope = selectedSource ? {
    ...scope, provider: selectedSource.provider, hrvType: selectedSource.hrvType,
  } : scope;
  const chart = options.hrvSourceId && !selectedSource ? undefined : selectCard(days, selectedScope);
  const lockedScope: CoachHealthScope = chart ? {
    ...selectedScope,
    provider: chart.provider,
    ...(chart.hrvType ? { hrvType: chart.hrvType } : {}),
    ...(chart.sleepValueKind ? { sleepValueKind: chart.sleepValueKind } : {}),
  } : scope;
  const values = chart?.points.flatMap(({ value }) => value == null ? [] : [value]) ?? [];
  let recent: CoachHealthVisualization['recent'];
  if (!chart && options.recent && scope.from === scope.to) {
    const lookup = await read({
      ...scope, from: addCalendarDays(scope.to, -6), mode: 'LATEST',
    });
    if (lookup) recent = {
      date: lookup.latestDate,
      value: lookup.latestValue,
      scope: {
        ...scope, from: lookup.latestDate, to: lookup.latestDate, mode: 'LATEST',
        compareFrom: undefined, compareTo: undefined,
        provider: lookup.provider,
        ...(lookup.hrvType ? { hrvType: lookup.hrvType } : {}),
        ...(lookup.sleepValueKind ? { sleepValueKind: lookup.sleepValueKind } : {}),
      },
    };
  }
  const baseline = scope.mode === 'BASELINE' && chart
    ? calculateHealthBaseline((await read({
      ...lockedScope,
      from: addCalendarDays(chart.latestDate, -28),
      to: addCalendarDays(chart.latestDate, -1),
    }))?.points ?? [])
    : undefined;
  const value = values.length && (scope.mode === 'AVERAGE' || scope.mode === 'TREND')
    ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length * 10) / 10
    : chart?.latestValue ?? null;
  const compareCard = scope.compareFrom && scope.compareTo ? await read({
    ...lockedScope, from: scope.compareFrom, to: scope.compareTo,
  }) : undefined;
  const compareValues = compareCard?.points.flatMap(({ value }) => value == null ? [] : [value]) ?? [];
  const comparison = scope.compareFrom && scope.compareTo ? {
    value: compareValues.length
      ? scope.mode === 'LATEST' || scope.mode === 'BASELINE' ? compareCard!.latestValue
        : Math.round(compareValues.reduce((sum, item) => sum + item, 0) / compareValues.length * 10) / 10
      : null,
    knownDays: compareValues.length,
    ...(options.chart && compareCard ? { points: compareCard.points } : {}),
  } : undefined;
  return {
    kind: 'coach_health_visualization',
    schemaVersion: 1,
    scope: lockedScope,
    observedAt: options.observedAt,
    fingerprint: createHash('sha256').update(JSON.stringify([lockedScope, chart?.points, compareCard?.points, baseline])).digest('hex'),
    value,
    date: chart?.latestDate ?? null,
    knownDays: values.length,
    ...(recent ? { recent } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
    ...(options.chart && chart ? { chart } : {}),
    ...(hrvSources?.length ? { hrvSources } : {}),
    ...(comparison ? { comparison } : {}),
  };
}
