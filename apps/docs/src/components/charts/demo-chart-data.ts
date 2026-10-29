import dayjs from "dayjs";

export type DemoChartPoint = {
  time: string;
  current: number | null;
  previous?: number | null;
};

function buildComparisonSeries(
  currentSeed: number,
  previousSeed: number,
  days = 30,
): DemoChartPoint[] {
  const start = dayjs("2024-05-01");
  return Array.from({ length: days }, (_, index) => {
    const wave =
      Math.sin((index + currentSeed) / 3.8) * 22 +
      Math.cos((index + currentSeed) / 6.2) * 8;
    const previousWave =
      Math.sin((index + previousSeed) / 4.1) * 18 +
      Math.cos((index + previousSeed) / 7.4) * 6;
    const trend = index * 0.65;
    const previousTrend = index * 0.42;

    return {
      time: start.add(index, "day").format("YYYY-MM-DD"),
      current: Math.max(0, Math.round(58 + wave + trend)),
      previous: Math.max(0, Math.round(52 + previousWave + previousTrend)),
    };
  });
}

export const DEMO_CHART_SERIES = {
  weekPressure: buildComparisonSeries(1.4, 4.2),
  ctl: buildComparisonSeries(2.8, 0.6),
  atl: buildComparisonSeries(5.1, 2.3),
  tsb: buildComparisonSeries(3.5, 6.8),
} as const;

export const DEMO_WEEK_PRESSURE_WEEK: DemoChartPoint[] =
  DEMO_CHART_SERIES.weekPressure.slice(-7);

export const DEMO_WEEK_PRESSURE_SINGLE: DemoChartPoint[] = [
  { time: "2024-05-28", current: 64 },
  { time: "2024-05-29", current: 86 },
  { time: "2024-05-30", current: 71 },
  { time: "2024-05-31", current: 136 },
  { time: "2024-06-01", current: 112 },
  { time: "2024-06-02", current: 168 },
  { time: "2024-06-03", current: 151 },
  { time: "2024-06-04", current: 197 },
];
