import type uPlot from "uplot";
import type {
  PowerDurationCurveByRange,
  PowerDurationCurvePointsByRange,
} from "@/api/use-power";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import type { Time } from "@/components/DateSelector/types";

export const POWER_CHART_DURATION_LABELS = [
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "20m",
  "60m",
  "2h",
  "3h",
] as const;

const DURATION_SECONDS: Record<
  (typeof POWER_CHART_DURATION_LABELS)[number],
  number
> = {
  "5s": 5,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "20m": 1200,
  "60m": 3600,
  "2h": 7200,
  "3h": 10800,
};

const SCATTER_TOP_N = 6;

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

export type PowerChartRangeMeta = {
  color: string;
  key: `range${number}`;
  label: string;
};

export function buildPowerChartRangeMeta(args: {
  dateFormatter: Intl.DateTimeFormat;
  lineCurveData: PowerDurationCurveByRange[];
  locale: string;
  tDate: TranslateFn;
  times: Time[];
}) {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  const formatRangeLabel = (range: { start?: string; end?: string }) => {
    if (!range?.start && !range?.end) return "All time";

    const startText = range.start
      ? args.dateFormatter.format(new Date(range.start))
      : "";
    const endText = range.end ? args.dateFormatter.format(new Date(range.end)) : "";
    if (startText && endText) return `${startText} - ${endText}`;
    return startText || endText || "All time";
  };

  return args.lineCurveData.map((range, index) => ({
    key: `range${index}` as const,
    label: args.times[index]
      ? getTimeLabel(args.times[index], args.tDate, args.locale)
      : formatRangeLabel(range.timeRange),
    color: colors[index % colors.length],
  }));
}

export function buildPowerChartData(args: {
  lineCurveData: PowerDurationCurveByRange[];
  pointCurveData: PowerDurationCurvePointsByRange[];
}): uPlot.AlignedData {
  const xValues = POWER_CHART_DURATION_LABELS.map((_, index) => index);

  const lineSeries = args.lineCurveData.map((range) =>
    POWER_CHART_DURATION_LABELS.map((label) => {
      const value = range[label];
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }),
  );

  const durationIndexBySeconds = new Map<number, number>();
  for (let index = 0; index < POWER_CHART_DURATION_LABELS.length; index += 1) {
    const label = POWER_CHART_DURATION_LABELS[index];
    const seconds = DURATION_SECONDS[label];
    if (seconds != null) durationIndexBySeconds.set(seconds, index);
  }

  const scatterSeries: (number | null)[][] = [];
  for (const range of args.pointCurveData) {
    const seriesByRank: (number | null)[][] = Array.from(
      { length: SCATTER_TOP_N },
      () => Array(POWER_CHART_DURATION_LABELS.length).fill(null),
    );

    for (const durationGroup of range.points || []) {
      const xIndex = durationIndexBySeconds.get(durationGroup.durationSec);
      if (xIndex == null) continue;

      const activities = durationGroup.activities || [];
      for (
        let rank = 0;
        rank < Math.min(SCATTER_TOP_N, activities.length);
        rank += 1
      ) {
        const value = activities[rank]?.value;
        if (typeof value === "number" && Number.isFinite(value)) {
          seriesByRank[rank][xIndex] = value;
        }
      }
    }

    scatterSeries.push(...seriesByRank);
  }

  return [xValues, ...lineSeries, ...scatterSeries];
}

export function getPowerChartYRange(args: {
  cp?: number;
  ftp?: number;
  max: number;
  min: number;
}): [number, number] {
  let low = args.min;
  let high = args.max;

  if (typeof args.cp === "number" && Number.isFinite(args.cp)) {
    low = Math.min(low, args.cp);
    high = Math.max(high, args.cp);
  }
  if (typeof args.ftp === "number" && Number.isFinite(args.ftp)) {
    low = Math.min(low, args.ftp);
    high = Math.max(high, args.ftp);
  }

  const span = high - low;
  const padding = span > 0 ? span * 0.08 : 1;
  return [low - padding, high + padding];
}
