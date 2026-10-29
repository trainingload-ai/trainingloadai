import type uPlot from "uplot";

export const DEMO_UPLOT_CURSOR: uPlot.Cursor = {
  show: true,
  x: true,
  y: false,
  drag: { x: false, y: false },
  points: {
    show: true,
    size: 7,
    width: 1.5,
    stroke: (u, seriesIdx) => String(u.series[seriesIdx]?.stroke ?? "#ffffff"),
    fill: (u, seriesIdx) => String(u.series[seriesIdx]?.stroke ?? "#0ea5e9"),
  },
};

export type DemoTooltipRow = {
  label: string;
  value: string;
  color?: string;
};

export function renderDemoTooltipHtml(title: string, rows: DemoTooltipRow[]) {
  const rowHtml = rows
    .map((row) => {
      const swatch = row.color
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${row.color};flex-shrink:0"></span>`
        : "";
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span style="display:flex;align-items:center;gap:8px;color:var(--muted-foreground,#737373)">${swatch}<span>${row.label}</span></span>
        <span style="font-weight:500;font-variant-numeric:tabular-nums">${row.value}</span>
      </div>`;
    })
    .join("");

  return `<div style="font-weight:500;margin-bottom:4px">${title}</div><div style="display:grid;gap:6px">${rowHtml}</div>`;
}
