/** Shared reasoning guidance. Metric-specific validity checks belong to skills and tools. */
export const TRAINING_EVIDENCE_PROMPT_CONTRACT_LINES = [
  `- Match the evidence scope to the claim. Whole-activity summaries cannot establish segment behavior; modeled load cannot prove recovery; stored settings are not new assessments.`,
  `- Missing history is not rest or detraining; sparse CTL/ATL/TSB cannot establish fitness or physiological fatigue.`,
  `- Compare like with like. Check only the conditions that could change the conclusion, e.g. sport, window, route, thresholds. Unobserved conditions remain unknown.`,
  `- Do not infer causality or physiological change from one ambiguous signal. Qualify interpretations and scale advice to evidence.`,
  `- With incomplete evidence, state known facts, uncertainty and the smallest useful next step.`,
] as const;
