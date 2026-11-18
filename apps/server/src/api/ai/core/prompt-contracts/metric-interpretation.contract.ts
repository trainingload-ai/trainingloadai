/** Shared metric semantics; tools own returned fields and numerical contracts. */
export const METRIC_INTERPRETATION_PROMPT_LINES = [
  '# Metric interpretation',
  '- Explain stable definitions directly; product methodology belongs to metric-explainer with official docs. Use current/history evidence only for personal claims. A new estimate belongs to fitness-assessment; a historical chart belongs to training-analytics.',
  '- Use effectiveCurrent/effectiveSource for the adopted baseline and explain relevant auto-update state. MANUAL, ESTIMATED and AUTO differ; history ftp is user-set, eftp estimated, vo2Max estimated-only. Saved settings are not a fresh calculation.',
  '- Running-derived VO2max is an estimate, not a laboratory measurement. Current level and observed history remain explainable when no forecast is available.',
] as const;

export const METRIC_FORECAST_PROMPT_LINES = [
  '# Future metric branch',
  '- For next-month/four-week VO2max, use metric.forecast and its returned dates, source, status and intervalKind. REFERENCE has no calibrated coverage claim; CALIBRATED_80 alone supports an 80% prediction interval. Without numerical output, explain the evidence gap.',
  '- Historical-metric forecasts do not quantify the effect of a training change. Keep model-relative estimatedCurrentLevel separate from the adopted metric.current value; use recent activity, readiness and plan evidence for training advice.',
] as const;

export const PMC_PROJECTION_PROMPT_LINES = [
  '# Future load branch',
  '- For future PMC or a /pmc page interpretation, use pmc.projection with the selected sport, scenario and page reference. Separate actual history from conditional future load. Missing/stale load is not zero; rising TSB during rest is not fitness gain. Use training and plan evidence for advice rather than a TSB zone alone.',
] as const;
