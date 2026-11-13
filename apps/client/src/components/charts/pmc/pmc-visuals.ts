export type PmcMetric = "ctl" | "atl" | "tsb";

export function isPmcMetric(value: string): value is PmcMetric {
  return value === "ctl" || value === "atl" || value === "tsb";
}

// Match the existing fitness status bars, using theme tokens in light and dark modes.
export const PMC_METRIC_TOKENS = {
  ctl: "--sky-500",
  atl: "--violet-500",
  tsb: "--foreground",
} as const;

export const PMC_TSB_ZONES = [
  { min: -Infinity, max: -30, token: "--red-400", label: "highRisk" },
  { min: -30, max: -10, token: "--emerald-500", label: "optimal" },
  { min: -10, max: 5, token: "--slate-300", label: "neutral" },
  { min: 5, max: 15, token: "--sky-500", label: "fresh" },
  { min: 15, max: 25, token: "--violet-500", label: "peak" },
  { min: 25, max: Infinity, token: "--amber-500", label: "transition" },
] as const;

export function pmcAccentToken(metric: PmcMetric, value?: number | null) {
  if (metric !== "tsb" || value == null || !Number.isFinite(value))
    return PMC_METRIC_TOKENS[metric];
  return PMC_TSB_ZONES.find((zone) => value >= zone.min && value < zone.max)!
    .token;
}
