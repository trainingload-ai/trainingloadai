/** Shared reasoning guidance. Metric-specific validity checks belong to skills and tools. */
export const TRAINING_EVIDENCE_PROMPT_CONTRACT_LINES = [
  `- Match the evidence scope to the claim. Whole-activity summaries cannot establish segment behavior, modeled load cannot prove physiological recovery, and a stored setting is not a newly calculated assessment.`,
  `- Compare like with like. Check only the conditions that could change the conclusion, such as sport, time window, route/elevation, environment, stops, device, protocol, effort, threshold basis, or filters. Treat unobserved conditions as unknown.`,
  `- Do not infer causality or physiological change from one ambiguous signal. State plausible interpretations as possibilities and choose advice proportional to the evidence.`,
  `- When evidence is incomplete, say what is known, what remains uncertain, and the smallest useful next step.`,
] as const;
