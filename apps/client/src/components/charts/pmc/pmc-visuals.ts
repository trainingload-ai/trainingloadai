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
  { min: -Infinity, max: -30, token: "--red-400" },
  { min: -30, max: -10, token: "--emerald-500" },
  { min: -10, max: 5, token: "--slate-300" },
  { min: 5, max: 15, token: "--sky-500" },
  { min: 15, max: 25, token: "--violet-500" },
  { min: 25, max: Infinity, token: "--amber-500" },
] as const;

export function pmcAccentToken(metric: PmcMetric, value?: number | null) {
  if (metric !== "tsb" || value == null || !Number.isFinite(value))
    return PMC_METRIC_TOKENS[metric];
  return PMC_TSB_ZONES.find((zone) => value >= zone.min && value < zone.max)!
    .token;
}
