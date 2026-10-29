import type {
  ExplorationAxis,
  ExplorationPanel,
  ExplorationPoint,
  ExplorationSeries,
} from "./training-exploration";

/** Series assigned to the same axis share one scale. Bars have a zero baseline. */
export function explorationDomain(
  panel: ExplorationPanel,
  dimension: "x" | "y",
): [number, number] {
  const axis = panel[dimension];
  if (axis.domain) return axis.domain;
  const values = panel.series
    .filter((s) => dimension === "x" || (s.axisIndex ?? 0) === 0)
    .flatMap((s) =>
      s.points.flatMap((p) =>
        p[dimension] !== null && Number.isFinite(p[dimension])
          ? [p[dimension] as number]
          : [],
      ),
    );
  if (!values.length) return [0, 1];
  let min = Math.min(...values),
    max = Math.max(...values);
  if (axis.kind === "CATEGORY")
    return [-0.5, Math.max(0.5, (axis.categories?.length ?? 1) - 0.5)];
  if (axis.kind === "PROGRESS") return [0, 100];
  if (dimension === "x") {
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.02);
      return [min - pad, max + pad];
    }
    const pad = axis.kind === "NUMBER" ? (max - min || 1) * 0.04 : 0;
    return [min - pad, max > min ? max + pad : min + 1];
  }
  const span = max - min || Math.max(1, Math.abs(max) * 0.05);
  if (panel.view === "BAR" || axis.zeroBaseline) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  } else min -= span * 0.12;
  max += span * 0.12;
  return [min, max > min ? max : min + 1];
}
export function explorationTicks(
  domain: [number, number],
  count = 5,
  axis?: ExplorationAxis,
): number[] {
  const raw = (domain[1] - domain[0]) / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const step =
    axis?.kind === "ELAPSED_TIME" || axis?.unit === "s/km"
      ? ([
          1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400,
          43200, 86400,
        ].find((n) => n >= raw) ?? 86400)
      : ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw) ?? 10) *
        magnitude;
  const first = Math.ceil(domain[0] / step) * step;
  return Array.from(
    {
      length: Math.max(
        0,
        Math.min(20, Math.floor((domain[1] - first) / step + 1e-8) + 1),
      ),
    },
    (_, i) => Number((first + i * step).toPrecision(12)),
  );
}
export function formatExplorationValue(
  value: number | null,
  axis: ExplorationAxis,
  locale = "en",
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (axis.kind === "CATEGORY")
    return axis.categories?.[Math.round(value)] ?? String(value);
  if (axis.kind === "DATE")
    return new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(value);
  if (axis.kind === "ELAPSED_TIME" || axis.unit === "s/km") {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);
}
export function explorationDisplayUnit(axis: ExplorationAxis): string {
  return axis.kind === "ELAPSED_TIME"
    ? "mm:ss"
    : axis.unit === "s/km"
      ? "min/km"
      : (axis.unit ?? "");
}
/** Nulls split the path; neither renderer can connect across missing evidence. */
export function explorationSegments(
  points: ExplorationPoint[],
): ExplorationPoint[][] {
  const segments: ExplorationPoint[][] = [];
  let segment: ExplorationPoint[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export function explorationScale(
  domain: [number, number],
  start: number,
  end: number,
  reverse = false,
) {
  return (value: number) => {
    const fraction = (value - domain[0]) / (domain[1] - domain[0] || 1);
    return start + (reverse ? 1 - fraction : fraction) * (end - start);
  };
}
export function explorationGeometry(
  panel: ExplorationPanel,
  width: number,
  height = 240,
) {
  const axisDefinitions = [panel.y, ...(panel.extraY ?? [])];
  const bounds = {
    left: 58,
    right: width - (panel.extraY?.length ? 12 + panel.extraY.length * 56 : 12),
    top: panel.extraY?.length ? 26 : 12,
    bottom: height - 36,
  };
  const xd = explorationDomain(panel, "x");
  const x = explorationScale(xd, bounds.left, bounds.right, panel.x.reverse);
  const axes = axisDefinitions.map((axis, index) => {
    const domain = explorationDomain(
      {
        ...panel,
        y: axis,
        series: panel.series
          .filter((s) => (s.axisIndex ?? 0) === index)
          .map((s) => ({ ...s, axisIndex: 0 })),
      },
      "y",
    );
    return {
      axis,
      index,
      domain,
      scale: explorationScale(domain, bounds.bottom, bounds.top, axis.reverse),
      ticks: explorationTicks(domain, 5, axis),
      tickX:
        index === 0 ? bounds.left - 8 : bounds.right + 8 + (index - 1) * 56,
    };
  });
  const { domain: yd, scale: y } = axes[0];
  const measures = [...new Set(panel.series.map((s) => s.measure))];
  const categoryCount = panel.x.categories?.length ?? 1;
  const groupWidth = Math.min(
    64,
    ((bounds.right - bounds.left) / categoryCount) * 0.72,
  );
  const barWidth = groupWidth / Math.max(1, panel.series.length);
  return {
    bounds,
    x,
    y,
    xd,
    yd,
    axes,
    barWidth,
    groupWidth,
    xTicks:
      panel.x.kind === "CATEGORY"
        ? Array.from({ length: categoryCount }, (_, i) => i)
        : explorationTicks(xd, width < 450 ? 3 : 5, panel.x),
    yTicks: explorationTicks(yd, 5, panel.y),
    series: panel.series.map((s, index) => ({
      ...s,
      color: explorationColor(panel, index),
      dash: [undefined, "5 3", "2 3"][measures.indexOf(s.measure) % 3],
      paths: explorationSegments(s.points).map((segment) =>
        segment
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${x(p.x).toFixed(2)},${(axes[s.axisIndex ?? 0]?.scale ?? y)(p.y!).toFixed(2)}`,
          )
          .join(" "),
      ),
      points: s.points.map((point, pointIndex) => ({
        ...point,
        pointIndex,
        seriesIndex: index,
        px:
          panel.view === "BAR"
            ? x(point.x) - groupWidth / 2 + (index + 0.5) * barWidth
            : x(point.x),
        py:
          point.y === null
            ? null
            : (axes[s.axisIndex ?? 0]?.scale ?? y)(point.y),
        barX: x(point.x) - groupWidth / 2 + index * barWidth,
      })),
    })),
  };
}

/** A shared tooltip only includes a series at an observed bucket, without extrapolating tails or gaps. */
export function explorationReadout(
  panel: ExplorationPanel,
  selected: ExplorationPoint,
  seriesIndex: number,
) {
  return panel.series
    .map((series, index) => {
      if (panel.view === "SCATTER")
        return { series, point: index === seriesIndex ? selected : undefined };
      const exact = series.points.find(
        (p) =>
          p.x === selected.x ||
          (p.from != null &&
            p.to != null &&
            p.from <= selected.x &&
            selected.x <= p.to),
      );
      return { series, point: exact };
    })
    .filter((row) => panel.view !== "SCATTER" || row.point);
}
export function explorationColor(
  panel: ExplorationPanel,
  index: number,
): string {
  // Same activity keeps its color across panels. Single-signal colors match product charts.
  const palette = [
    "#0284c7",
    "#0d9488",
    "#e11d48",
    "#d97706",
    "#7c3aed",
    "#64748b",
  ];
  const activities = [
    ...new Set(panel.series.map((s) => s.activityHashId ?? s.id)),
  ];
  if (activities.length > 1)
    return palette[
      activities.indexOf(
        panel.series[index].activityHashId ?? panel.series[index].id,
      ) % palette.length
    ];
  const colors: Record<string, string> = {
    HEART_RATE: "#e11d48",
    POWER: "#dc2626",
    PACE: "#d97706",
    SPEED: "#d97706",
    CADENCE: "#0891b2",
    ELEVATION: "#78716c",
    GRADE: "#78716c",
    DURATION_MIN: "#0d9488",
    DISTANCE_KM: "#2563eb",
    LOAD: "#7c3aed",
  };
  return (
    colors[
      panel.series[index]?.measure ?? panel.measure ?? panel.y.measure ?? ""
    ] ?? palette[0]
  );
}
export function explorationSeriesAxis(
  panel: ExplorationPanel,
  series: ExplorationSeries,
) {
  return (
    (series.axisIndex ? panel.extraY?.[series.axisIndex - 1] : undefined) ??
    panel.y
  );
}
/** Overlay compatible panels, sharing units/direction and retaining independent scales otherwise. */
export function combineExplorationAxes(
  panels: ExplorationPanel[],
): ExplorationPanel[] {
  const groups = new Map<string, ExplorationPanel[]>();
  for (const p of panels) {
    const key = JSON.stringify([p.label, p.view, p.x]);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()].flatMap((group) => {
    if (
      group.length < 2 ||
      group.length > 3 ||
      group.some((p) => p.view !== "LINE" || p.extraY)
    )
      return group;
    const axes: ExplorationAxis[] = [];
    const series = group.flatMap((p) => {
      let axisIndex = axes.findIndex(
        (a) =>
          a.kind === p.y.kind &&
          !!a.reverse === !!p.y.reverse &&
          a.unit === p.y.unit &&
          JSON.stringify(a.domain) === JSON.stringify(p.y.domain),
      );
      if (axisIndex < 0) {
        axisIndex = axes.length;
        axes.push({ ...p.y });
      } else if (axes[axisIndex].measure !== p.y.measure)
        axes[axisIndex].measure = undefined;
      return p.series.map((s) => ({
        ...s,
        id: `${p.id}:${s.id}`,
        activityHashId: s.activityHashId ?? s.id,
        axisIndex,
        measure: s.measure ?? p.y.measure ?? p.measure,
      }));
    });
    return [
      {
        ...group[0],
        id: group.map((p) => p.id).join(":"),
        y: axes[0],
        extraY: axes.slice(1),
        series,
      },
    ];
  });
}
export function separateExplorationAxes(
  panels: ExplorationPanel[],
): ExplorationPanel[] {
  return panels.flatMap((p) => {
    if (!p.extraY) return [p];
    const measures = [...new Set(p.series.map((s) => s.measure))];
    return measures.map((measure) => {
      const series = p.series.filter((s) => s.measure === measure);
      return {
        ...p,
        id: `${p.id}:${measure}`,
        measure,
        extraY: undefined,
        y: { ...explorationSeriesAxis(p, series[0]), measure },
        series: series.map((s) => ({ ...s, axisIndex: undefined })),
      };
    });
  });
}
export function nearestExplorationPoint(
  geometry: ReturnType<typeof explorationGeometry>,
  px: number,
  py: number,
  scatter: boolean,
) {
  let best: (typeof geometry.series)[number]["points"][number] | undefined,
    distance = Infinity;
  for (const s of geometry.series)
    for (const p of s.points) {
      if (p.py === null) continue;
      const d =
        Math.abs(p.px - px) +
        (scatter ? Math.abs(p.py - py) : Math.abs(p.py - py) * 0.03);
      if (d < distance) {
        distance = d;
        best = p;
      }
    }
  return best;
}
