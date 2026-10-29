import type { DailyHealthData } from "@/api/health-data";

export type HealthChartKind = "sleep" | "line" | "range" | "bar";
export type HealthCardKey =
  | "sleep"
  | "hrv"
  | "restingHeartRate"
  | "stress"
  | "bodyBattery"
  | "spo2"
  | "steps";

export type HealthChartPoint = {
  date: string;
  value?: number;
  sleepValueKind?: "timeAsleep" | "timeInBed";
  min?: number;
  max?: number;
  range?: [number, number];
  core?: number;
  deep?: number;
  rem?: number;
  awake?: number;
};

export type HealthBaseline = {
  lower: number;
  upper: number;
  center: number;
  sampleSize: number;
};

export type HealthBaselineStatus = "below" | "within" | "above";

export type HealthOverviewCard = {
  key: HealthCardKey;
  chartKind: HealthChartKind;
  latestDate: string;
  latestValue: number;
  latestUnit: string;
  secondaryValue?: number;
  sleepValueKind?: "timeAsleep" | "timeInBed";
  provider: string | null;
  points: HealthChartPoint[];
};

type MetricMap = Map<
  string,
  { value: number; unit: string | null; provider: string | null }
>;

function dayMap(day: DailyHealthData): MetricMap {
  return new Map(day.metrics.map((metric) => [metric.type, metric]));
}

function finiteValue(map: MetricMap, ...keys: string[]) {
  for (const key of keys) {
    const metric = map.get(key);
    if (metric && Number.isFinite(metric.value)) return metric;
  }
  return undefined;
}

function latestPoint(points: HealthChartPoint[]) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].value != null) return points[index];
  }
  return undefined;
}

function quantile(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = index - lowerIndex;
  return (
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  );
}

export function calculateHealthBaseline(
  points: HealthChartPoint[],
): HealthBaseline | null {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (values.length < 7) return null;
  return {
    lower: quantile(values, 0.2),
    upper: quantile(values, 0.8),
    center: quantile(values, 0.5),
    sampleSize: values.length,
  };
}

export function getHealthBaselineStatus(
  value: number,
  baseline: HealthBaseline,
): HealthBaselineStatus {
  if (value < baseline.lower) return "below";
  if (value > baseline.upper) return "above";
  return "within";
}

function buildLineCard(
  days: DailyHealthData[],
  args: {
    key: HealthCardKey;
    metricTypes: string[];
    unit: string;
  },
): HealthOverviewCard | null {
  let provider: string | null = null;
  const points: HealthChartPoint[] = days.map((day) => {
    const metric = finiteValue(dayMap(day), ...args.metricTypes);
    if (metric) provider = metric.provider;
    return { date: day.date, value: metric?.value };
  });
  const latestRecorded = latestPoint(points);
  if (!latestRecorded) return null;
  return {
    key: args.key,
    chartKind: "line",
    latestDate: latestRecorded.date,
    latestValue: latestRecorded.value!,
    latestUnit: args.unit,
    provider,
    points,
  };
}

function buildRangeCard(
  days: DailyHealthData[],
  args: {
    key: HealthCardKey;
    valueTypes: string[];
    minType: string;
    maxType: string;
    unit: string;
  },
): HealthOverviewCard | null {
  let provider: string | null = null;
  const points: HealthChartPoint[] = days.map((day) => {
    const metrics = dayMap(day);
    const valueMetric = finiteValue(metrics, ...args.valueTypes);
    const minMetric = finiteValue(metrics, args.minType);
    const maxMetric = finiteValue(metrics, args.maxType);
    const value = valueMetric?.value ?? maxMetric?.value ?? minMetric?.value;
    if (value == null) return { date: day.date };
    provider =
      valueMetric?.provider ??
      maxMetric?.provider ??
      minMetric?.provider ??
      null;
    const min = minMetric?.value ?? value;
    const max = maxMetric?.value ?? value;
    return {
      date: day.date,
      value,
      min,
      max,
      range: [Math.min(min, max), Math.max(min, max)],
    };
  });
  const latestRecorded = latestPoint(points);
  if (!latestRecorded) return null;
  return {
    key: args.key,
    chartKind: "range",
    latestDate: latestRecorded.date,
    latestValue: latestRecorded.value!,
    latestUnit: args.unit,
    secondaryValue: latestRecorded.max,
    provider,
    points,
  };
}

function buildSleepCard(days: DailyHealthData[]): HealthOverviewCard | null {
  let provider: string | null = null;
  const points: HealthChartPoint[] = days.map((day) => {
    const metrics = dayMap(day);
    const core = finiteValue(metrics, "SLEEP_CORE_SECONDS")?.value;
    const deep = finiteValue(metrics, "SLEEP_DEEP_SECONDS")?.value;
    const rem = finiteValue(metrics, "SLEEP_REM_SECONDS")?.value;
    const awake = finiteValue(metrics, "SLEEP_AWAKE_SECONDS")?.value;
    const stageValues = [core, deep, rem].filter(
      (value): value is number => value != null && Number.isFinite(value),
    );
    const stageTotal =
      stageValues.length > 0
        ? stageValues.reduce((total, value) => total + value, 0)
        : undefined;
    const asleep = finiteValue(metrics, "SLEEP_ASLEEP_SECONDS");
    const timeAsleep = asleep?.value ?? stageTotal;
    const inBed = finiteValue(metrics, "SLEEP_IN_BED_SECONDS");
    const value = timeAsleep ?? inBed?.value;
    if (value == null) return { date: day.date };
    provider = asleep?.provider ?? inBed?.provider ?? null;
    return {
      date: day.date,
      value,
      sleepValueKind: timeAsleep == null ? "timeInBed" : "timeAsleep",
      core:
        core ?? (deep == null && rem == null && timeAsleep != null ? value : 0),
      deep: deep ?? 0,
      rem: rem ?? 0,
      awake: awake ?? 0,
    };
  });
  const latestRecorded = latestPoint(points);
  if (!latestRecorded) return null;
  const latestDay = days.find((day) => day.date === latestRecorded.date);
  const score = latestDay
    ? finiteValue(dayMap(latestDay), "SLEEP_SCORE")?.value
    : undefined;
  return {
    key: "sleep",
    chartKind: "sleep",
    latestDate: latestRecorded.date,
    latestValue: latestRecorded.value!,
    latestUnit: "s",
    sleepValueKind: latestRecorded.sleepValueKind,
    secondaryValue: score,
    provider,
    points,
  };
}

function buildStepsCard(days: DailyHealthData[]): HealthOverviewCard | null {
  const card = buildLineCard(days, {
    key: "steps",
    metricTypes: ["STEP_COUNT"],
    unit: "steps",
  });
  return card ? { ...card, chartKind: "bar" } : null;
}

export function buildHealthOverviewCards(days: DailyHealthData[]) {
  const cards = [
    buildSleepCard(days),
    buildLineCard(days, {
      key: "hrv",
      metricTypes: ["HRV_RMSSD_MS", "HRV_SDNN_MS"],
      unit: "ms",
    }),
    buildLineCard(days, {
      key: "restingHeartRate",
      metricTypes: ["RESTING_HEART_RATE_BPM"],
      unit: "bpm",
    }),
    buildRangeCard(days, {
      key: "stress",
      valueTypes: ["STRESS_LEVEL_AVG"],
      minType: "STRESS_LEVEL_AVG",
      maxType: "STRESS_LEVEL_MAX",
      unit: "",
    }),
    buildRangeCard(days, {
      key: "bodyBattery",
      valueTypes: ["BODY_BATTERY_LATEST", "BODY_BATTERY_MAX"],
      minType: "BODY_BATTERY_MIN",
      maxType: "BODY_BATTERY_MAX",
      unit: "",
    }),
    buildRangeCard(days, {
      key: "spo2",
      valueTypes: ["SPO2_AVG_PERCENT"],
      minType: "SPO2_MIN_PERCENT",
      maxType: "SPO2_AVG_PERCENT",
      unit: "%",
    }),
    buildStepsCard(days),
  ];
  return cards.filter((card): card is HealthOverviewCard => card != null);
}

export function formatHealthCardValue(
  card: HealthOverviewCard,
  locale: string,
  value = card.latestValue,
) {
  if (card.key === "sleep") {
    const totalMinutes = Math.round(value / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return locale.startsWith("zh")
      ? `${hours}小时${minutes}分`
      : `${hours}h ${minutes}m`;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: card.key === "spo2" ? 1 : 0,
  }).format(value);
}
