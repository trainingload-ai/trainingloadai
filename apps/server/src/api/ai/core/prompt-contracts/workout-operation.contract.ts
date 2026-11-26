/**
 * Reusable coaching guidance for operations on one or more planned workouts.
 *
 * This deliberately describes a decision process rather than a fixed tool
 * sequence. The model chooses evidence based on the user's requested outcome,
 * the operation's training impact, and facts already available in context.
 */
export const PRESCRIPTION_REPLACEMENT_PROMPT_CONTRACT_LINES = [
  `# Prescription replacement contract`,
  `- Assess requested expressions against workout purpose, ability, configured zones, recent training, recovery and device compatibility; offer a concrete alternative when unsafe or unsupported.`,
  `- Target priority: matching executable pace/HR/power zones first; evidence-backed fixed target for race pace, field tests, treadmill protocols or missing zones; otherwise RPE/talk-test (auxiliary when a measured target exists). Never invent precision.`,
  `- Support assessment categories with tool evidence before calling \`plan.proposal_preview\` (mark missing evidence conservatively; inspect \`integration.status\` when device delivery matters). Device delivery is separate from plan application.`,
  `- In \`plan.proposal_preview\`: remaining-plan rewrites cover every mutable workout once (APPLY/PRESERVE); whole-plan replacements (SUPERSEDE) supply \`effectiveFrom\` and a complete successor draft; remaining-date rules use \`SCHEDULE\` + \`PLAN_SCHEDULE\` with full paginated source and related calendar. Pass the returned \`previewId\` payload unchanged into \`coach_decision_draft\`.`,
  `- Start saved DRAFTs via \`plan-start\` (\`START\` preview + \`PLAN_START\` decision, including zero-change starts). Plan proposals never change FTP/LTHR/CSS, fitness metrics or zones.`,
] as const;

export const WORKOUT_OPERATION_PROMPT_CONTRACT_LINES = [
  `# Workout operation decision guide`,
  `Choose evidence according to training impact; this is not a fixed tool sequence.`,
  `- Preserve the athlete's requested outcome, discretion and settled constraints unless a material conflict or safety issue appears. Reuse settled evidence and ask only for material personal facts unavailable to tools.`,
  `- Low-impact edits need less investigation than high-load tests or coupled schedule conflicts; check nearby key sessions, load, readiness, thresholds, equipment or calendar only when they can change the proposal.`,
  ...PRESCRIPTION_REPLACEMENT_PROMPT_CONTRACT_LINES,
  `- Produce one coherent proposal containing the complete local change set. Encode full Workouts in cards; use prose for rationale, tradeoffs or gaps without repeating prescriptions.`,
  `- For a standalone workout outside a plan, use \`present_independent_workout_draft\` (draft only until athlete confirms).`,
] as const;
