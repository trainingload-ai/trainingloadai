/**
 * Contracts for producing one executable Workout artifact. Plan generation and
 * single-workout generation may both consume these rules, but neither owns the
 * other's scheduling or persistence workflow.
 */
export const WORKOUT_DSL_CONTRACT_LINES = [
  `- Route DSL by \`structureKind\`: \`ENDURANCE\` uses warmup/work/recovery/repeat step DSL; \`STRENGTH\` uses static exercise/set DSL. Never mix grammars in one workout. Put human coaching prose in \`notes\`, never in \`text\`.`,
  `- Endurance DSL uses canonical lowercase keywords: \`warmup 10m\`, \`work 30m\` (or \`30min\`), \`recovery 3m\`, \`cooldown 10m\`, and multiline repeat blocks \`repeat 4 {\\n  work 30s\\n  recovery 1m\\n}\` (never inline comma repeats). Group identical work/recovery pairs in one repeat; if the last rep omits recovery, repeat the pairs and end with one \`work\` step outside the block. Pace syntax: \`pace 4:43-4:56\` (default 1000m) or \`pace 1:45-1:55 100m\` (no \`/km\`).`,
  `- Swimming: \`50m\` means 50 minutes; use \`50meters\` or \`50yd\` for distance and multiline \`repeat\` blocks (never \`4x50m\`). For effort-only swims under a time cap, use timed steps (e.g. \`work 45s\` / \`recovery 20s\`) so full duration can be verified.`,
  `- Targets (at most one per step; never combine \`power ... cadence ...\` on one line): HR ranges \`hr A-B\` / \`hr A-Bbpm\`, single \`hr A\`, or bounds \`hr <Abpm\` / \`hr <=Abpm\` (never \`hr A B\`); zone refs \`hr z2\`, \`power z3\`, \`pace z2\` only when tool results prove configured zones; fixed/open duration bounds \`work 25m hr <150bpm\`, \`power <250W\`, \`power >220W\`, \`cadence <95rpm\`, \`cadence >85rpm\`. Duration-threshold steps like \`work power<250W\` must be targetless.`,
  `- Use multiline \`repeat until <condition> { ... }\` (time, distance, calories, HR, power, or cadence; e.g. \`repeat until 30m {\n  work 4m\n  recovery 2m\n}\`) only when repeating until a total condition; never nest repeats, and prefer fixed \`repeat N\` when round count is known.`,
  `- Strength DSL example: \`duration 45m\\nsession rpe 6\\nexercise "Back Squat" {\\n  work 3x5 open rpe 7 rest 3m\\n}\`. Supported sets: fixed (\`3x5\`), ranges (\`3x8-12\`), numeric AMRAP (\`3x8+\`, never \`3xAMRAP\`), and timed (\`3x45s\`). Loads: \`open\`, \`bodyweight\`, absolute weight, or \`%1RM\` (never invent kg/lb or %1RM without tool-backed history/1RM). No scripts, if/else, or progression rules in \`text\`.`,
  `- For \`STRENGTH\`, set \`sportType: "UNKNOWN"\` and \`sportDefinitionCode: "STRENGTH_TRAINING"\`. Keep per-set RPE/RIR distinct from whole-session \`session rpe\`. Respect equipment and pain limits (never diagnose/rehab) and avoid heavy lower-body strength adjacent to key endurance sessions.`,
];

export const WORKOUT_INTENSITY_ANCHOR_CONTRACT_LINES = [
  `- Call \`workout.intensity_strategy\` for the relevant sport and purpose before writing pace/HR/power lines when available. Treat its recommendation and \`decisionRubric\` as decision support for choosing zone vs fixed vs duration-only and pace vs HR vs power.`,
  `- Anchor priority: (1) matching executable zones from tool results (\`pace z2\`, \`power z4\`, \`hr z2\`) — dynamic and export-safe, never replaced with fixed numbers merely because numbers were requested unless justified by race pace, field test, or fixed treadmill protocol; (2) conservative fixed targets derived from concrete tool-backed thresholds/bests (state in \`notes\` that they are estimates); (3) duration-only DSL with clear RPE/talk-test cues in \`notes\`.`,
  `- Reuse \`workout.intensity_strategy.selectedZoneRanges\` instead of re-calling \`profile.zone_ranges\` solely for zone-token DSL. Fetch \`profile.current\`, \`bests.summary\`, or \`metric.current\` only when fixed anchors still need concrete values.`,
  `- Never invent zone availability, zone count, labels, or indices, and never write bare free-text "Z2" in DSL. Without executable zones or bests, keep DSL duration-only, do not imply the app enforces personal Z2/Z4, and note that personalization improves after syncing activities or setting zones in the app (在 App 中设置区间后才会个人化).`,
];
