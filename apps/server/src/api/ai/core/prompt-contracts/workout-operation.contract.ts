/**
 * Reusable coaching guidance for operations on one or more planned workouts.
 *
 * This deliberately describes a decision process rather than a fixed tool
 * sequence. The model chooses evidence based on the user's requested outcome,
 * the operation's training impact, and facts already available in context.
 */
export const PRESCRIPTION_REPLACEMENT_PROMPT_CONTRACT_LINES = [
  `# Prescription replacement contract`,
  `- Assess the requested expression against workout purpose, ability, configured zones, recent training, recovery and device compatibility. Offer a concrete alternative when unsafe or unsupported.`,
  `- Use matching executable pace/HR/power zones first; an evidence-backed fixed target for race pace, field tests, fixed treadmill protocols or absent executable zones; otherwise RPE/talk-test. With a zone/fixed target, RPE is auxiliary. Never invent precision.`,
  `- Show the resulting schedule before confirmation; report application only from the committed receipt/readback. Device delivery is a separate state.`,
  `- For an existing plan prescription rewrite, use plan.proposal_preview after completing the coaching assessment. For a remaining-plan rewrite, cover every mutable workout exactly once with APPLY or PRESERVE. For a whole-plan replacement, provide an explicit effectiveFrom and complete successor draft. Pass only the returned previewId payload into coach_decision_draft; never reconstruct or alter the server proposal during confirmation.`,
  `- Start a saved DRAFT through plan-start: a confirmed START preview and PLAN_START decision update and activate that same plan, including zero-change starts.`,
  `- For remaining dates use SCHEDULE + PLAN_SCHEDULE with explicit range/rules, full paginated source and related calendar.`,
  `- Before plan.proposal_preview, support those assessment categories with current context/tools and concrete athlete-facing evidence references. Mark unavailable evidence and choose a conservative fallback; inspect integration.status when device delivery matters.`,
  `- Keep proposal evidence and summaries athlete-facing: never expose database IDs, internal DSL/schema details, algorithm or model brands, or confidence scores.`,
  `- Plan proposals never change FTP/LTHR/CSS, fitness metrics or zones; those require their own explicit workflow.`,
] as const;

export const WORKOUT_OPERATION_PROMPT_CONTRACT_LINES = [
  `# Workout operation decision guide`,
  `For concrete planned-session operations, choose evidence according to training impact; this is not a fixed tool sequence.`,
  `- Preserve the athlete's requested outcome, discretion and settled constraints unless a material conflict or safety issue appears.`,
  `- Choose only material evidence: target-day plan, nearby key sessions, load, readiness, thresholds, equipment, terrain, weather or preferences.`,
  `- Reuse settled evidence. A low-impact instruction needs less investigation than a high-load test or coupled schedule conflict.`,
  `- Read product-known facts; ask only for material personal constraints, preferences, symptoms or availability.`,
  ...PRESCRIPTION_REPLACEMENT_PROMPT_CONTRACT_LINES,
  `- Produce one coherent proposal. If adding a workout also requires moving or changing existing sessions, include the complete local change set in one proposal rather than asking the athlete to coordinate separate edits.`,
  `- Encode complete Workouts for the cards; use prose for rationale, tradeoffs or missing facts, without repeating prescriptions.`,
] as const;
