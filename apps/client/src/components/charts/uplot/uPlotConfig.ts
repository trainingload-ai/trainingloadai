import uPlot from "uplot";
import { formatBySettings, formatter } from "@/lib/utils";

export const DEFAULT_AXIS_FONT =
  '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const DEFAULT_PADDING: [number, number, number, number] = [
  12, 6, 25, 12,
];

export const DEFAULT_CURSOR: uPlot.Cursor = {
  y: false,
  drag: { x: true, y: false, setScale: true },
};

export const DEFAULT_LEGEND: uPlot.Legend = { show: false };

export const resolveAxisColors = (
  cssVar: (value: string) => string,
): { axisStroke: string; gridStroke: string } => {
  const axisStrokeRaw = cssVar("var(--muted-foreground)") || "";
  const gridStrokeRaw = cssVar("var(--border)") || "";

  const axisStroke =
    axisStrokeRaw && !axisStrokeRaw.startsWith("var(")
      ? axisStrokeRaw
      : "#6b7280";

  const gridStroke =
    gridStrokeRaw && !gridStrokeRaw.startsWith("var(")
      ? gridStrokeRaw
      : "#e5e7eb";

  return { axisStroke, gridStroke };
};

export const createUplotOptions = (options: uPlot.Options): uPlot.Options => {
  return {
    ...options,
    padding: options?.padding || DEFAULT_PADDING,
    cursor: options?.cursor || DEFAULT_CURSOR,
    legend: options?.legend || DEFAULT_LEGEND,
  };
};

export const createScales = (
  rangePadding: number = 0,
  clampMinToZero: boolean = true,
): uPlot.Scales => ({
  x: { time: false },
  y: {
    auto: true,
    range: rangePadding
      ? (_u: uPlot, min: number, max: number) => {
          let newMin = min - rangePadding;
          const newMax = max + rangePadding;
          if (clampMinToZero && min >= 0 && newMin < 0) {
            newMin = 0;
          }
          return [newMin, newMax];
        }
      : undefined,
  } as unknown as uPlot.Scale,
});

export const createAxes = ({
  axisStroke,
  gridStroke,
  chartXaxis,
  formatXValue,
  tickCount = 6,
  systemUnit = "metric",
}: {
  axisStroke: string;
  gridStroke: string;
  chartXaxis?: "distance" | "time" | string;
  formatXValue?: (v: number) => string;
  tickCount?: number;
  systemUnit?: "metric" | "imperial";
}): uPlot.Axis[] => [
  {
    stroke: axisStroke,
    grid: { show: false },
    font: DEFAULT_AXIS_FONT,
    size: 20,
    values: (_u, vals) =>
      vals.map((v, i) => {
        let formattedValue = "";
        if (formatXValue) {
          formattedValue = formatXValue(v);
        } else if (chartXaxis === "distance") {
          formattedValue = formatBySettings(v, "distance", { systemUnit });
        } else {
          formattedValue = formatter("elTimeS", Number(v));
        }

        // Shift the first tick label to the right by adding spaces
        if (i === 0) {
          return "   " + formattedValue;
        }
        return formattedValue;
      }),
  },
  {
    stroke: axisStroke,
    grid: {
      show: true,
      stroke: gridStroke,
      width: 1,
      dash: [3, 3],
    },
    ticks: { show: false },
    font: DEFAULT_AXIS_FONT,
    size: 6,
    values: () => [],
    splits: (u: uPlot) => {
      const min = u.scales.y?.min ?? 0;
      const max = u.scales.y?.max ?? 1;
      const range = max - min;
      const step = range / (tickCount - 1);
      const splits = [];
      for (let i = 0; i < tickCount; i++) {
        splits.push(min + i * step);
      }
      return splits;
    },
  },
];
