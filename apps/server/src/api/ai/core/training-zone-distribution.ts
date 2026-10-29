import type {
  ExplorationPanel,
  ExplorationQuery,
} from '@shared/training-exploration';
import dayjs = require('dayjs');
import { formatExplorationValue } from '@shared/training-chart-model';

type Zone = {
  order: number;
  name: string | null;
  duration: number | null;
  min: number | null;
  max: number | null;
};
type Activity = {
  hashId: string;
  sportType: string | null;
  startTime: Date | null;
  activityZones: Zone[];
};
/** Recorded boundaries are part of a distribution's identity, not just its Z-number. */
export function buildZoneDistribution(
  rows: Activity[],
  q: ExplorationQuery,
  timezone: string,
) {
  const periods = [
    { from: q.from!, to: q.to! },
    ...(q.compareFrom ? [{ from: q.compareFrom, to: q.compareTo! }] : []),
  ];
  const groups = new Map<
    string,
    { sport: string; zones: Zone[]; totals: number[][]; counts: number[] }
  >();
  let missing = 0;
  for (const row of rows) {
    if (!row.startTime) {
      missing++;
      continue;
    }
    const date = dayjs(row.startTime).tz(timezone).format('YYYY-MM-DD');
    const membership = periods.map((p) => p.from <= date && date <= p.to);
    if (!membership.some(Boolean)) continue;
    const zones = [...row.activityZones].sort((a, b) => a.order - b.order);
    if (
      !zones.length ||
      zones.some(
        (z) =>
          z.duration == null ||
          z.duration < 0 ||
          !Number.isFinite(z.duration) ||
          (z.min == null && z.max == null) ||
          [z.min, z.max].some((v) => v != null && !Number.isFinite(v)),
      )
    ) {
      missing++;
      continue;
    }
    const key = JSON.stringify([
      row.sportType,
      zones.map((z) => [z.order, z.min, z.max]),
    ]);
    const group = groups.get(key) ?? {
      sport: row.sportType ?? '',
      zones,
      totals: periods.map(() => zones.map(() => 0)),
      counts: periods.map(() => 0),
    };
    membership.forEach((included, p) => {
      if (!included) return;
      group.counts[p]++;
      zones.forEach((z, i) => (group.totals[p][i] += z.duration!));
    });
    groups.set(key, group);
  }
  const percent = q.zoneUnit === 'PERCENT';
  const unit =
    q.zoneType === 'HEART_RATE'
      ? 'bpm'
      : q.zoneType === 'POWER'
        ? 'W'
        : 'min/km';
  const boundary = (z: Zone) =>
    q.zoneType === 'PACE'
      ? `${z.max != null && z.max > 0 ? formatExplorationValue(1000 / z.max, { kind: 'NUMBER', unit: 's/km' }) : '0:00'}–${z.min != null && z.min > 0 ? formatExplorationValue(1000 / z.min, { kind: 'NUMBER', unit: 's/km' }) : '∞'}`
      : `${z.min ?? '−∞'}–${z.max ?? '∞'}`;
  const panels: ExplorationPanel[] = [...groups]
    .slice(0, 24)
    .map(([key, g], index) => ({
      id: key,
      label: `${g.sport} · ${index + 1}`,
      view: 'BAR',
      measure: q.zoneType,
      x: {
        kind: 'CATEGORY',
        categories: g.zones.map((z) => `Z${z.order} · ${boundary(z)} ${unit}`),
      },
      y: {
        kind: 'NUMBER',
        unit: percent ? '%' : 'min',
        zeroBaseline: true,
        ...(percent ? { domain: [0, 100] as [number, number] } : {}),
      },
      series: periods.map((period, p) => ({
        id: String(p),
        label: `${period.from} – ${period.to} · n=${g.counts[p]}`,
        points: g.totals[p].map((value, x) => ({
          x,
          y: !g.counts[p]
            ? null
            : percent
              ? g.totals[p].reduce((s, v) => s + v, 0)
                ? (value / g.totals[p].reduce((s, v) => s + v, 0)) * 100
                : null
              : value / 60,
        })),
      })),
    }));
  return {
    panels,
    missing,
    split: groups.size > 1,
    truncated: groups.size > 24,
  };
}
