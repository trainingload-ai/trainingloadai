export type DailyHealthMetric = {
  type: string;
  value: number;
  unit: string | null;
  provider: string | null;
};

export type DailyHealthData = {
  date: string;
  timezone: string | null;
  metrics: DailyHealthMetric[];
};

export type HealthOverviewResponse = {
  startDate: string;
  endDate: string;
  days: DailyHealthData[];
};

export type HealthIntradayMetricKey =
  | "sleep"
  | "hrv"
  | "restingHeartRate"
  | "stress"
  | "bodyBattery";

export type HealthIntradayPoint = {
  time: string;
  endTime?: string;
  value: number;
  stage?: string;
  provider?: string;
  summaryOnly?: boolean;
};

export type HealthIntradayResponse = {
  key: HealthIntradayMetricKey;
  hrvType?: HealthHrvType;
  granularity: "intraday";
  currentDate: string;
  previousDate: string;
  current: HealthIntradayPoint[];
  previous: HealthIntradayPoint[];
};

const DAY_MS = 86_400_000;
const MAX_LATEST_AGE_DAYS = 3;

export type HealthChartKind = "sleep" | "line" | "range" | "bar";
export type HealthCardKey =
  | "sleep"
  | "hrv"
  | "restingHeartRate"
  | "stress"
  | "bodyBattery"
  | "spo2"
  | "steps";

export type HealthSleepValueKind = "timeAsleep" | "timeInBed";

export type HealthChartPoint = {
  date: string;
  value?: number;
  sleepValueKind?: HealthSleepValueKind;
  min?: number;
  max?: number;
  range?: [number, number];
  core?: number;
  deep?: number;
  rem?: number;
  awake?: number;
  unclassifiedSleep?: number;
  provider?: string | null;
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
  sleepValueKind?: HealthSleepValueKind;
  provider: string | null;
  points: HealthChartPoint[];
  hrvType?: HealthHrvType;
};

export const HEALTH_HRV_TYPES = ["HRV_RMSSD_MS", "HRV_SDNN_MS"] as const;
export type HealthHrvType = (typeof HEALTH_HRV_TYPES)[number];

const HEALTH_PROVIDER_NAMES: Record<string, string> = {
  APPLE_HEALTH: "Apple Health",
  GARMIN: "Garmin",
  COROS: "COROS",
  INTERVALS_ICU: "Intervals.icu",
  HEALTH_CONNECT: "Health Connect",
};

export function formatHealthProviderLabel(provider: string | null | undefined) {
  return provider ? (HEALTH_PROVIDER_NAMES[provider] ?? provider) : undefined;
}

export function formatHealthHrvLabel(
  card: Pick<HealthOverviewCard, "hrvType" | "provider">,
) {
  if (!card.hrvType) return undefined;
  const method = card.hrvType === "HRV_RMSSD_MS" ? "RMSSD" : "SDNN";
  const source = formatHealthProviderLabel(card.provider);
  return source ? `${method} · ${source}` : method;
}

export function getRecentHealthDate(latestDate: string, referenceDate: string) {
  const age = Date.parse(referenceDate) - Date.parse(latestDate);
  return age >= 0 && age <= MAX_LATEST_AGE_DAYS * DAY_MS
    ? latestDate
    : undefined;
}

export function formatHealthDate(
  value: string,
  locale: string,
  includeYear = false,
) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

function buildHrvCard(days: DailyHealthData[]): HealthOverviewCard | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    for (const hrvType of HEALTH_HRV_TYPES) {
      const latest = day.metrics.find(
        (metric) => metric.type === hrvType && Number.isFinite(metric.value),
      );
      if (!latest) continue;

      const points = days.map(({ date, metrics }) => ({
        date,
        value: metrics.find(
          (metric) =>
            metric.type === hrvType &&
            metric.provider === latest.provider &&
            Number.isFinite(metric.value),
        )?.value,
      }));
      return {
        key: "hrv",
        chartKind: "line",
        latestUnit: "ms",
        hrvType,
        provider: latest.provider,
        points,
        latestDate: day.date,
        latestValue: latest.value,
      };
    }
  }
  return null;
}

function buildSleepCard(days: DailyHealthData[]): HealthOverviewCard | null {
  const points: HealthChartPoint[] = days.map((day) => {
    const metrics = dayMap(day);
    const asleep = finiteValue(metrics, "SLEEP_ASLEEP_SECONDS");
    const inBed = finiteValue(metrics, "SLEEP_IN_BED_SECONDS");
    const core = finiteValue(metrics, "SLEEP_CORE_SECONDS");
    const deep = finiteValue(metrics, "SLEEP_DEEP_SECONDS");
    const rem = finiteValue(metrics, "SLEEP_REM_SECONDS");
    const completeStages =
      core &&
      deep &&
      rem &&
      core.provider === deep.provider &&
      core.provider === rem.provider;
    const total =
      asleep ??
      (completeStages
        ? {
            value: core.value + deep.value + rem.value,
            provider: core.provider,
          }
        : undefined);
    if (!total) {
      return inBed
        ? {
            date: day.date,
            value: inBed.value,
            provider: inBed.provider,
            sleepValueKind: "timeInBed",
          }
        : { date: day.date };
    }
    const stageFromSource = (metric: ReturnType<typeof finiteValue>) =>
      metric && metric.provider === total.provider ? metric.value : undefined;
    const knownCore = stageFromSource(core);
    const knownDeep = stageFromSource(deep);
    const knownRem = stageFromSource(rem);
    const classifiedSeconds =
      (knownCore ?? 0) + (knownDeep ?? 0) + (knownRem ?? 0);
    const stagesFitTotal = classifiedSeconds <= total.value;
    return {
      date: day.date,
      value: total.value,
      provider: total.provider,
      sleepValueKind: "timeAsleep",
      core: stagesFitTotal ? knownCore : undefined,
      deep: stagesFitTotal ? knownDeep : undefined,
      rem: stagesFitTotal ? knownRem : undefined,
      awake: stageFromSource(finiteValue(metrics, "SLEEP_AWAKE_SECONDS")),
      unclassifiedSleep: stagesFitTotal
        ? total.value - classifiedSeconds
        : total.value,
    };
  });
  const latest = latestPoint(points);
  if (!latest) return null;
  const latestDay = days.find((day) => day.date === latest.date);
  const score = latestDay
    ? finiteValue(dayMap(latestDay), "SLEEP_SCORE")
    : undefined;
  return {
    key: "sleep",
    chartKind: "sleep",
    latestDate: latest.date,
    latestValue: latest.value!,
    latestUnit: "s",
    sleepValueKind: latest.sleepValueKind,
    secondaryValue:
      score && score.provider === latest.provider ? score.value : undefined,
    provider: latest.provider ?? null,
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
    buildHrvCard(days),
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

function average(values: Array<number | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length > 0
    ? finite.reduce((total, value) => total + value, 0) / finite.length
    : undefined;
}

export function getComparableHealthIntraday(
  card: HealthOverviewCard,
  intraday: HealthIntradayResponse | undefined,
  date: string,
) {
  if (intraday?.key !== card.key || intraday.currentDate !== date) return;
  if (card.key === "hrv") {
    if (!card.hrvType || intraday.hrvType !== card.hrvType || !card.provider)
      return;
    return {
      ...intraday,
      current: intraday.current.filter(
        (point) => point.provider === card.provider,
      ),
      previous: intraday.previous.filter(
        (point) => point.provider === card.provider,
      ),
    };
  }
  if (card.key === "sleep") {
    const day = card.points.find((point) => point.date === date);
    if (day?.sleepValueKind !== "timeAsleep" || !day.provider) return;
    const current = intraday.current.filter(
      (point) =>
        point.provider === day.provider &&
        !point.summaryOnly &&
        point.stage?.toLowerCase() !== "in_bed" &&
        point.endTime &&
        Date.parse(point.endTime) > Date.parse(point.time),
    );
    // Old servers did not distinguish a generic summary from a sleep segment.
    if (
      !current.some(
        (point) =>
          point.summaryOnly === false ||
          (point.stage && point.stage.toLowerCase() !== "sleep"),
      )
    )
      return;
    return { ...intraday, current, previous: [] };
  }
  return intraday;
}

export function getSleepTimelineRow(stage?: string) {
  switch (stage?.toLowerCase()) {
    case "awake":
      return 0;
    case "rem":
      return 1;
    case "core":
    case "light":
      return 2;
    case "deep":
      return 3;
    default:
      return 4;
  }
}

export function buildHealthPeriod(
  card: HealthOverviewCard,
  rangeDays: "latest" | "3" | "7",
  intraday?: HealthIntradayResponse,
  referenceDate = card.latestDate,
) {
  const recentDate = getRecentHealthDate(card.latestDate, referenceDate);
  if (rangeDays !== "7" && !recentDate) {
    return {
      currentPoints: [],
      previousPoints: [],
      baselinePoints: [],
      currentAggregate: undefined,
      previousAggregate: undefined,
      sleepValueKind: undefined,
    };
  }
  if (rangeDays === "latest") {
    const previousDate = new Date(card.latestDate);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const current = card.points.find((point) => point.date === card.latestDate);
    const previous = card.points.find(
      (point) => point.date === previousDate.toISOString().slice(0, 10),
    );
    const comparablePrevious =
      card.key !== "sleep" ||
      (previous?.sleepValueKind === current?.sleepValueKind &&
        previous?.provider === current?.provider)
        ? previous
        : undefined;
    // Daily sleep and HRV summaries have their own measurement windows.
    // The intraday view provides detail within a source, not a replacement aggregate.
    const useIntraday = card.key !== "sleep" && card.key !== "hrv";
    return {
      currentPoints: current ? [current] : [],
      previousPoints: comparablePrevious ? [comparablePrevious] : [],
      baselinePoints: [],
      currentAggregate:
        (useIntraday
          ? average(intraday?.current.map((point) => point.value) ?? [])
          : undefined) ?? current?.value,
      previousAggregate:
        (useIntraday
          ? average(intraday?.previous.map((point) => point.value) ?? [])
          : undefined) ?? comparablePrevious?.value,
      sleepValueKind: current?.sleepValueKind,
    };
  }
  const count = Number(rangeDays);
  const endDate = rangeDays === "3" ? card.latestDate : referenceDate;
  const endIndex =
    card.points.findIndex((point) => point.date === endDate) + 1 ||
    card.points.length;
  const currentStart = Math.max(0, endIndex - count);
  const current = card.points.slice(currentStart, endIndex);
  const previous = card.points.slice(
    Math.max(0, endIndex - count * 2),
    currentStart,
  );
  const latestSleep = card.key === "sleep" ? latestPoint(current) : undefined;
  const comparable = (points: HealthChartPoint[]) =>
    card.key === "sleep"
      ? points.map((point) =>
          latestSleep &&
          point.sleepValueKind === latestSleep.sleepValueKind &&
          point.provider === latestSleep.provider
            ? point
            : { date: point.date, value: undefined },
        )
      : points;
  const currentPoints = comparable(current);
  const previousPoints = comparable(previous);
  return {
    currentPoints,
    previousPoints,
    baselinePoints: card.points.slice(
      Math.max(0, currentStart - 21),
      currentStart,
    ),
    currentAggregate: average(currentPoints.map((point) => point.value)),
    previousAggregate: average(previousPoints.map((point) => point.value)),
    sleepValueKind: latestSleep?.sleepValueKind,
  };
}
