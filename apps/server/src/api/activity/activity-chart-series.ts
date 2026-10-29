import {
  EXPLORATION_UNITS,
  type ExplorationPanel,
  type ExplorationQuery,
  type SignalMeasure,
} from '@shared/training-exploration';

type Row = { time: string } & Record<string, unknown>;
const numeric = (v: unknown): number | null =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
function signal(row: Row, measure: SignalMeasure): number | null {
  const speed = numeric(row.enhancedSpeed) ?? numeric(row.speed);
  switch (measure) {
    case 'SPEED':
      return speed != null && speed >= 0 ? speed * 3.6 : null;
    case 'PACE':
      return speed != null && speed > 0.5 ? 1000 / speed : null;
    case 'ELEVATION':
      return numeric(row.enhancedAltitude) ?? numeric(row.altitude);
    case 'GRADE':
      return numeric(row.grade);
    default: {
      const v = numeric(
        row[
          { HEART_RATE: 'heartRate', POWER: 'power', CADENCE: 'cadence' }[
            measure
          ]
        ],
      );
      return v != null && (measure === 'HEART_RATE' ? v > 0 : v >= 0)
        ? v
        : null;
    }
  }
}
function timestamp(value: string): number {
  return (
    Date.parse(
      /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`,
    ) / 1000
  );
}

/** Left-sample time integration. Missing intervals never contribute zero or a bridged line. */
export function buildActivityChartSeries(
  rows: Row[],
  activity: {
    hashId: string;
    activityName: string | null;
    sportType: string | null;
    startTime: Date | null;
    elapsedTime: number | null;
  },
  query: ExplorationQuery,
  timezone = 'UTC',
) {
  const measures = query.measures as SignalMeasure[];
  const samples = rows
    .map((r) => ({ row: r, t: timestamp(r.time) }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
  const anchor = activity.startTime
    ? activity.startTime.getTime() / 1000
    : (samples[0]?.t ?? 0);
  const duration = Math.max(
    activity.elapsedTime ?? 0,
    (samples.at(-1)?.t ?? anchor) - anchor,
  );
  const from = query.fromSecond ?? 0;
  const to = Math.min(query.toSecond ?? duration, duration);
  const distance = query.alignment === 'DISTANCE';
  const progress = query.alignment === 'PROGRESS';
  const coordinate = (sample: (typeof samples)[number]) =>
    distance
      ? (numeric(sample.row.distance) ?? NaN) / 1000
      : progress
        ? ((sample.t - anchor) / duration) * 100
        : sample.t - anchor;
  // Include clipped interval boundaries: a requested segment can lie entirely
  // between two samples. Array indices must not replace elapsed coordinates.
  const relevant = samples.filter(
    (s, i) => s.t - anchor <= to && (samples[i + 1]?.t ?? s.t) - anchor >= from,
  );
  const xs: number[] = [];
  let distanceInvalid = false;
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i],
      b = samples[i + 1];
    const start = Math.max(from + anchor, a.t),
      end = Math.min(to + anchor, b.t);
    if (end <= start) continue;
    const xa = coordinate(a),
      xb = coordinate(b);
    if (
      !Number.isFinite(xa) ||
      !Number.isFinite(xb) ||
      xb < xa ||
      (distance && xa < 0)
    ) {
      if (distance) distanceInvalid = true;
      continue;
    }
    xs.push(
      xa + ((xb - xa) * (start - a.t)) / (b.t - a.t),
      xa + ((xb - xa) * (end - a.t)) / (b.t - a.t),
    );
  }
  distanceInvalid ||=
    distance &&
    (!xs.length || relevant.some((s) => !Number.isFinite(coordinate(s))));
  const lo = xs.length ? xs.reduce((min, x) => Math.min(min, x), Infinity) : 0;
  const hi = xs.length ? xs.reduce((max, x) => Math.max(max, x), -Infinity) : 0;
  const n = Math.max(
    1,
    Math.min(query.maxPoints ?? 240, Math.ceil(Math.max(1, to - from))),
  );
  const width = (hi - lo || 1) / n;
  const paired = query.source === 'RELATIONSHIP';
  const buckets = Array.from({ length: n }, () => ({
    total: 0,
    seconds: measures.map(() => 0),
    sums: measures.map(() => 0),
    min: measures.map(() => Infinity),
    max: measures.map(() => -Infinity),
    gap: false,
  }));
  let gaps = false;
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i],
      b = samples[i + 1];
    const start = Math.max(from + anchor, a.t),
      end = Math.min(to + anchor, b.t);
    if (end <= start || distanceInvalid) continue;
    const xa = coordinate(a),
      xb = coordinate(b);
    if (!Number.isFinite(xa) || !Number.isFinite(xb) || xb < xa) {
      gaps = true;
      continue;
    }
    // Distance cannot represent stationary time; elapsed-time alignment retains it.
    if (distance && xa === xb) continue;
    const x1 = xa + ((xb - xa) * (start - a.t)) / (b.t - a.t);
    const x2 = xa + ((xb - xa) * (end - a.t)) / (b.t - a.t);
    const first = Math.max(0, Math.min(n - 1, Math.floor((x1 - lo) / width)));
    const last = Math.max(
      0,
      Math.min(n - 1, Math.floor((x2 - lo - 1e-9) / width)),
    );
    const values = measures.map((m) => signal(a.row, m));
    const gap = b.t - a.t > 10;
    if (gap) gaps = true;
    for (let j = first; j <= last; j++) {
      const share =
        x2 > x1
          ? Math.max(
              0,
              Math.min(x2, lo + (j + 1) * width) - Math.max(x1, lo + j * width),
            ) /
            (x2 - x1)
          : 1;
      const seconds = (end - start) * share;
      const bucket = buckets[j];
      bucket.total += seconds;
      if (gap) {
        bucket.gap = true;
        continue;
      }
      if (paired && values.some((v) => v === null)) continue;
      values.forEach((v, k) => {
        if (v === null) return;
        bucket.seconds[k] += seconds;
        bucket.sums[k] += v * seconds;
        bucket.min[k] = Math.min(bucket.min[k], v);
        bucket.max[k] = Math.max(bucket.max[k], v);
      });
    }
  }
  const value = (i: number, k: number) => {
    const b = buckets[i];
    return b.seconds[k] > 0 && !b.gap && b.seconds[k] / b.total >= 0.8
      ? b.sums[k] / b.seconds[k]
      : null;
  };
  const date = activity.startTime
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(activity.startTime)
    : '';
  const label = `${date} · ${activity.activityName || activity.hashId}`;
  const seriesBase = {
    id: activity.hashId,
    activityHashId: activity.hashId,
    label,
  };
  const panels: ExplorationPanel[] = paired
    ? [
        {
          id: 'relationship',
          view: 'SCATTER',
          x: {
            kind: 'NUMBER',
            measure: measures[0],
            unit: EXPLORATION_UNITS[measures[0]],
            reverse: measures[0] === 'PACE',
          },
          y: {
            kind: 'NUMBER',
            measure: measures[1],
            unit: EXPLORATION_UNITS[measures[1]],
            reverse: measures[1] === 'PACE',
          },
          series: [
            {
              ...seriesBase,
              points: buckets.flatMap((_, i) => {
                const x = value(i, 0),
                  y = value(i, 1);
                return x !== null && y !== null
                  ? [
                      {
                        x,
                        y,
                        label: `${Math.round(lo + i * width)}–${Math.round(lo + (i + 1) * width)} s`,
                      },
                    ]
                  : [];
              }),
            },
          ],
        },
      ]
    : measures.map((measure, k) => ({
        id: measure,
        measure,
        view: 'LINE',
        x: {
          kind: query.alignment ?? 'ELAPSED_TIME',
          unit: distance ? 'km' : progress ? '%' : 's',
        },
        y: {
          kind: 'NUMBER',
          measure,
          unit: EXPLORATION_UNITS[measure],
          reverse: measure === 'PACE',
        },
        series: [
          {
            ...seriesBase,
            points: buckets.map((b, i) => ({
              x: lo + (i + 0.5) * width,
              y: value(i, k),
              from: lo + i * width,
              to: lo + (i + 1) * width,
              coverage: b.total ? b.seconds[k] / b.total : 0,
              ...(b.seconds[k] ? { min: b.min[k], max: b.max[k] } : {}),
            })),
          },
        ],
      }));
  return {
    panels,
    gaps,
    distanceUnavailable: distanceInvalid,
    recordedStart: !activity.startTime,
    coverage: Object.fromEntries(
      measures.map((m, k) => [
        m,
        buckets.reduce((s, b) => s + b.seconds[k], 0) / Math.max(1, to - from),
      ]),
    ),
  };
}
