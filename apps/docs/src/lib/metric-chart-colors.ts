/** Mirrors apps/client/src/lib/chart-data-utils.ts metric color rules. */
const METRIC_COLOR_RULES = {
  load: { color: "#7c3aed", comparisonColor: "#c4b5fd" },
  fitness: { color: "#0284c7", comparisonColor: "#7dd3fc" },
  recovery: { color: "#64748b", comparisonColor: "#cbd5e1" },
  cardio: { color: "#e11d48", comparisonColor: "#fda4af" },
} as const;

const METRIC_COLOR_GROUPS: Record<string, keyof typeof METRIC_COLOR_RULES> = {
  weekPressure: "load",
  atl: "load",
  ctl: "fitness",
  tsb: "recovery",
  vo2Max: "cardio",
};

export function getMetricChartColor(metric: string) {
  const group = METRIC_COLOR_GROUPS[metric] ?? "recovery";
  return METRIC_COLOR_RULES[group].color;
}

export function getMetricChartComparisonColor(metric: string) {
  const group = METRIC_COLOR_GROUPS[metric] ?? "recovery";
  return METRIC_COLOR_RULES[group].comparisonColor;
}
