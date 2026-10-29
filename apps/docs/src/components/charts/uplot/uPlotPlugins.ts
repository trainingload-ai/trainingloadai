import type uPlot from "uplot";
import { DEFAULT_AXIS_FONT, createAxes } from "./uPlotConfig";

export const createInnerYAxisLabelsPlugin = ({
  axisStroke,
  formatValue,
  tickCount = 4,
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

export const createInnerYAxisTickDesign = ({
  axisStroke,
  gridStroke,
  formatXValue,
  formatYValue,
  tickCount = 4,
  yAlign = "left",
  font = DEFAULT_AXIS_FONT,
  fontSizePx = 12,
}: {
  axisStroke: string;
  gridStroke: string;
  formatXValue: (v: number) => string;
  formatYValue: (v: number) => string;
  tickCount?: number;
  yAlign?: "left" | "right";
  font?: string;
  fontSizePx?: number;
}): { axes: uPlot.Axis[]; plugins: uPlot.Plugin[] } => {
  const axes = createAxes({
    axisStroke,
    gridStroke,
    formatXValue,
    tickCount,
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
