import uPlot from "uplot";
import { DEFAULT_AXIS_FONT, createAxes } from "./uPlotConfig";

export const createInnerYAxisLabelsPlugin = ({
  axisStroke,
  formatValue,
  tickCount = 6,
  scale = "y",
  align = "left",
  font = DEFAULT_AXIS_FONT,
}: {
  axisStroke: string;
  formatValue: (v: number) => string;
  tickCount?: number;
  scale?: string;
  align?: "left" | "right";
  font?: string;
}): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      if (!u.bbox) return;
      const ctx = u.ctx;
      const bbox = u.bbox;
      const yScale = u.scales[scale];
      if (!yScale) return;

      ctx.save();
      ctx.fillStyle = axisStroke;
      const pxRatio =
        (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      const t = ctx?.getTransform?.();
      const scaleX = t?.a ?? 1;
      const baseSize =
        Number((font.match(/^(\d+)px/)?.[1] as string) ?? "12") || 12;
      const finalSize =
        scaleX === 1 && pxRatio > 1 ? Math.round(baseSize * pxRatio) : baseSize;
      const finalFont = font.replace(/^\d+px/, `${finalSize}px`);
      ctx.font = finalFont;
      ctx.textAlign = align;

      const yMin = yScale.min ?? 0;
      const yMax = yScale.max ?? 1;
      const ySpan = Math.max(1e-6, yMax - yMin);
      const step = ySpan / (tickCount - 1);

      const xPos =
        align === "left" ? bbox.left + 4 : bbox.left + bbox.width - 4;

      for (let i = 0; i < tickCount; i++) {
        const v = yMin + i * step;
        const py = u.valToPos(v, scale, true);
        if (py < bbox.top || py > bbox.top + bbox.height) continue;

        const label = formatValue(v);

        if (i === tickCount - 1) {
          ctx.textBaseline = "top";
          ctx.fillText(label, xPos, py + 4);
        } else {
          ctx.textBaseline = "bottom";
          ctx.fillText(label, xPos, py - 4);
        }
      }
      ctx.restore();
    },
  },
});

/** 在绘图区绘制一条轻量虚线平均值，并在右侧直接标注数值。 */
export const createAverageLinePlugin = ({
  value,
  color,
  label,
  scale = "y",
}: {
  value: number;
  color: string;
  label: string;
  scale?: string;
}): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      if (!u.bbox || !Number.isFinite(value)) return;
      const yScale = u.scales[scale];
      if (
        yScale?.min === undefined ||
        yScale.max === undefined ||
        value < yScale.min ||
        value > yScale.max
      ) {
        return;
      }

      const ctx = u.ctx;
      const y = u.valToPos(value, scale, true);
      const { left, top, width, height } = u.bbox;
      if (y < top || y > top + height) return;

      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font =
        '11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, left + width - 4, Math.max(top + 12, y - 3));
      ctx.restore();
    },
  },
});

export const createInnerYAxisTickDesign = ({
  axisStroke,
  gridStroke,
  formatXValue,
  formatYValue,
  tickCount = 6,
  yAlign = "left",
  font = DEFAULT_AXIS_FONT,
  fontSizePx = 12,
  chartXaxis,
  systemUnit,
}: {
  axisStroke: string;
  gridStroke: string;
  formatXValue: (v: number) => string;
  formatYValue: (v: number) => string;
  tickCount?: number;
  yAlign?: "left" | "right";
  font?: string;
  fontSizePx?: number;
  chartXaxis?: "distance" | "time" | string;
  systemUnit?: "metric" | "imperial";
}): { axes: uPlot.Axis[]; plugins: uPlot.Plugin[] } => {
  const axes = createAxes({
    axisStroke,
    gridStroke,
    chartXaxis,
    formatXValue,
    tickCount,
    systemUnit,
  });

  const resolvedFont = font.replace(/^\d+px/, `${fontSizePx}px`);

  const plugins = [
    createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: formatYValue,
      tickCount,
      align: yAlign,
      font: resolvedFont,
    }),
  ];

  return { axes, plugins };
};

export const createMinMaxPointsPlugin = ({
  seriesIdx,
  pointColor,
  pointRadius = 3,
  scale = "y",
}: {
  seriesIdx: number;
  pointColor: string;
  pointRadius?: number;
  scale?: string;
}): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      if (!u.bbox) return;
      const ctx = u.ctx;
      const series = u.series[seriesIdx];
      const data = u.data[seriesIdx] as number[];
      if (!series || !data || data.length === 0) return;

      let min = Infinity;
      let max = -Infinity;
      let minIdx = -1;
      let maxIdx = -1;

      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v !== null && v !== undefined) {
          if (v < min) {
            min = v;
            minIdx = i;
          }
          if (v > max) {
            max = v;
            maxIdx = i;
          }
        }
      }

      if (minIdx === -1 || maxIdx === -1) return;

      const drawPoint = (idx: number, val: number) => {
        const cx = u.valToPos(u.data[0][idx], "x", true);
        const cy = u.valToPos(val, scale, true);

        ctx.beginPath();
        ctx.arc(cx, cy, pointRadius, 0, 2 * Math.PI);
        ctx.fillStyle = pointColor;
        ctx.fill();
        ctx.strokeStyle = "#fff"; // Ensure visibility on dark background or overlapping lines
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
      };

      drawPoint(minIdx, min);
      drawPoint(maxIdx, max);
    },
  },
});
