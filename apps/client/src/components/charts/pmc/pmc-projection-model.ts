import type {
  PmcProjectionPoint,
  PmcProjectionResult,
} from "@shared/pmc-projection";

export function projectionChartPoints(
  result: PmcProjectionResult,
): PmcProjectionPoint[] {
  return [...result.history, ...result.forecast];
}

/** Keep actual and future values in different series, joined at the observed current point. */
export function projectionChartSeries(
  result: PmcProjectionResult,
  metric: "ctl" | "atl" | "tsb" | "load",
) {
  const points = projectionChartPoints(result);
  return {
    x: points.map((p) => Date.parse(`${p.date}T00:00:00Z`) / 1000),
    actual: points.map((p) => (p.basis === "ACTUAL" ? p[metric] : null)),
    future: points.map((p) =>
      p.date === result.today || p.basis !== "ACTUAL" ? p[metric] : null,
    ),
  };
}
