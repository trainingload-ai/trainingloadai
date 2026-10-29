export type ActivitySeriesOptions = {
  fromSecond?: number;
  toSecond?: number;
  movingOnly?: boolean;
  excludeZeroPower?: boolean;
  minGrade?: number;
  maxGrade?: number;
  maxPoints?: number;
};

type Sample = { time: string } & Record<string, unknown>;
const METRICS = ['heartRate', 'power', 'speed', 'cadence', 'grade'] as const;
type Metric = (typeof METRICS)[number];
type Values = Record<Metric, number | null>;
type Accumulator = Record<
  Metric,
  { sum: number; seconds: number; min: number; max: number }
>;
const MAX_GAP_SECONDS = 10;

function finite(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function accumulator(): Accumulator {
  return Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      {
        sum: 0,
        seconds: 0,
        min: Infinity,
        max: -Infinity,
      },
    ]),
  ) as Accumulator;
}

function add(target: Accumulator, values: Values, seconds: number) {
  for (const metric of METRICS) {
    const value = values[metric];
    if (value === null) continue;
    const item = target[metric];
    item.sum += value * seconds;
    item.seconds += seconds;
    item.min = Math.min(item.min, value);
    item.max = Math.max(item.max, value);
  }
}

function statistics(target: Accumulator) {
  return Object.fromEntries(
    METRICS.map((metric) => {
      const item = target[metric];
      return [
        metric,
        {
          average: item.seconds
            ? Math.round((item.sum / item.seconds) * 100) / 100
            : null,
          coveredSeconds: item.seconds,
          min: item.seconds ? item.min : null,
          max: item.seconds ? item.max : null,
        },
      ];
    }),
  );
}

/** Time-weight before downsampling; never interpolate pauses or missing metrics. */
export function summarizeActivitySeries(
  rows: Sample[],
  options: ActivitySeriesOptions = {},
) {
  const samples = rows
    .flatMap((row) => {
      // SensorDataService returns UTC timestamps without a timezone suffix.
      const timestamp = Date.parse(
        /[zZ]|[+-]\d\d:\d\d$/.test(row.time)
          ? row.time
          : `${row.time.replace(' ', 'T')}Z`,
      );
      if (!Number.isFinite(timestamp)) return [];
      const values = Object.fromEntries(
        METRICS.map((metric) => {
          let value = finite(
            metric === 'speed'
              ? (finite(row.enhancedSpeed) ?? row.speed)
              : row[metric],
          );
          if (
            value !== null &&
            metric !== 'grade' &&
            (value < 0 || (metric === 'heartRate' && value === 0))
          )
            value = null;
          return [metric, value];
        }),
      ) as Values;
      return [{ timestamp, values }];
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  const start = samples[0]?.timestamp ?? 0;
  const duration = samples.length
    ? (samples[samples.length - 1].timestamp - start) / 1000
    : 0;
  const from = options.fromSecond ?? 0;
  const to = Math.min(options.toSecond ?? duration, duration);
  const maxPoints = Math.max(1, Math.min(120, options.maxPoints ?? 60));
  const bucketWidth = Math.max(
    1,
    Math.ceil(Math.max(0, to - from) / maxPoints),
  );
  const buckets = new Map<number, { seconds: number; metrics: Accumulator }>();
  const total = accumulator();
  let includedSeconds = 0;
  let filteredSeconds = 0;
  let unknownFilterSeconds = 0;
  let gapSeconds = 0;
  let zeroPowerSeconds = 0;
  let movingSeconds = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const sample = samples[i];
    const rawSpan = (samples[i + 1].timestamp - sample.timestamp) / 1000;
    const left = Math.max(from, (sample.timestamp - start) / 1000);
    const right = Math.min(to, (samples[i + 1].timestamp - start) / 1000);
    if (right <= left) continue;
    const seconds = right - left;
    if (rawSpan > MAX_GAP_SECONDS) {
      gapSeconds += seconds;
      continue;
    }
    const v = sample.values;
    const unknownFilter =
      (options.movingOnly && v.speed === null) ||
      (options.excludeZeroPower && v.power === null) ||
      ((options.minGrade !== undefined || options.maxGrade !== undefined) &&
        v.grade === null);
    if (unknownFilter) {
      unknownFilterSeconds += seconds;
      continue;
    }
    if (
      (options.movingOnly && v.speed! <= 0.5) ||
      (options.excludeZeroPower && v.power === 0) ||
      (options.minGrade !== undefined && v.grade! < options.minGrade) ||
      (options.maxGrade !== undefined && v.grade! > options.maxGrade)
    ) {
      filteredSeconds += seconds;
      continue;
    }
    includedSeconds += seconds;
    if (v.power === 0) zeroPowerSeconds += seconds;
    if (v.speed !== null && v.speed > 0.5) movingSeconds += seconds;
    add(total, v, seconds);
    let cursor = left;
    while (cursor < right) {
      const index = Math.floor((cursor - from) / bucketWidth);
      const end = Math.min(right, from + (index + 1) * bucketWidth);
      const bucket = buckets.get(index) ?? {
        seconds: 0,
        metrics: accumulator(),
      };
      bucket.seconds += end - cursor;
      add(bucket.metrics, v, end - cursor);
      buckets.set(index, bucket);
      cursor = end;
    }
  }
  return {
    status: includedSeconds > 0 ? 'AVAILABLE' : 'NO_USABLE_SAMPLES',
    source: 'RECORDED_SENSOR_DATA',
    units: {
      time: 'seconds_from_first_record',
      heartRate: 'bpm',
      power: 'W',
      speed: 'm/s',
      cadence: 'rpm',
      grade: '%',
    },
    method: {
      aggregation: 'TIME_WEIGHTED_LEFT_SAMPLE',
      maxGapSeconds: MAX_GAP_SECONDS,
      movingThresholdMetersPerSecond: 0.5,
      filters: {
        fromSecond: from,
        toSecond: to,
        movingOnly: options.movingOnly ?? false,
        excludeZeroPower: options.excludeZeroPower ?? false,
        minGrade: options.minGrade ?? null,
        maxGrade: options.maxGrade ?? null,
      },
      powerSource: 'device power only; calculatedPower is not substituted',
    },
    coverage: {
      inputRows: rows.length,
      validTimestampRows: samples.length,
      durationSeconds: duration,
      includedSeconds,
      filteredSeconds,
      unknownFilterSeconds,
      gapSeconds,
      zeroPowerSeconds,
      movingSeconds,
    },
    summary: statistics(total),
    points: [...buckets].map(([index, bucket]) => ({
      fromSecond: from + index * bucketWidth,
      toSecond: Math.min(to, from + (index + 1) * bucketWidth),
      includedSeconds: bucket.seconds,
      metrics: statistics(bucket.metrics),
    })),
    limitations: [
      'Missing signals are null, not zero. A missing signal used by a filter excludes that interval.',
      'Gaps longer than maxGapSeconds and the final sample without a following timestamp have no inferred duration.',
      'Moving is a speed threshold, not the device moving-time flag. Zero power alone does not establish downhill coasting.',
      'Bucket averages are not raw samples or peak-test results. These data alone do not establish fitness changes or medical causes.',
    ],
  };
}
