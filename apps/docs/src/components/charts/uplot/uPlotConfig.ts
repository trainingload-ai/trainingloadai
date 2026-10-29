import type uPlot from "uplot";

export const DEFAULT_AXIS_FONT =
  '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const DEFAULT_PADDING: [number, number, number, number] = [
  12, 6, 25, 12,
];

export const DEFAULT_CURSOR: uPlot.Cursor = {
  y: false,
  drag: { x: false, y: false },
};

export const DEFAULT_LEGEND: uPlot.Legend = { show: false };

export const createAxes = ({
  axisStroke,
  gridStroke,
  formatXValue,
  tickCount = 4,
}: {
  axisStroke: string;
  gridStroke: string;
  formatXValue: (v: number) => string;
  tickCount?: number;
}): uPlot.Axis[] => [
  {
    stroke: axisStroke,
    grid: { show: false },
    font: DEFAULT_AXIS_FONT,
    size: 20,
    values: (_u, vals) =>
      vals.map((v, i) => (i === 0 ? `   ${formatXValue(v)}` : formatXValue(v))),
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
