import { ATHLETE_STATE_DEFINITIONS } from '../../athlete-state/athlete-state-result.contract';
import type { CoachSkillDef } from '../skill.types';

export const ATHLETE_STATE_SKILL = 'athlete-state';
export const ATHLETE_STATE_TASK = 'ATHLETE_STATE_UPDATE';
export const ATHLETE_STATE_ANSWER_TOOL = 'athlete_state.answer';
export const ATHLETE_STATE_TOOLS = [
  'training.data_coverage',
  'integration.status',
  'time.current',
  'training.weekSummary',
  'training.readiness',
  'health.summary',
  'training.baseline',
  'pmc.range',
  'activity.search',
  'activity.series',
  'metric.current',
  'metric.history',
  'profile.current',
  'memory.search',
  'plan.active',
  'plan.execution_context',
  'competition.impact.resolve',
  'ask_user_question',
  ATHLETE_STATE_ANSWER_TOOL,
] as const;

export const athleteStateSkill: CoachSkillDef = {
  name: ATHLETE_STATE_SKILL,
  catalogVisible: false,
  description: 'Maintain an evidence-backed current athlete state.',
  whenToUse:
    'Server-owned state maintenance or the reply to its persisted question.',
  suggestedTools: [...ATHLETE_STATE_TOOLS],
  prompt: [
    'Maintain an evidence-backed current athlete state in this conversation. Prior turns give continuity, not proof that old facts remain current. Do not modify plans or produce a plan-adjustment outcome.',
    'Evidence acquisition: Inspect training.data_coverage before concluding; coverage establishes availability, not tolerance or recovery. For a known state, read actual relevant facts beyond coverage/configuration—use health.summary for selected daily recovery facts (not a computed baseline) and read plan, competition, metrics or memory in this same loop when material. Stop reading once extra facts would not materially change the judgment.',
    'Evidence rigor: Never diagnose disease or injury. Never use one metric alone to claim overtraining, nor claim strain or recovery failure from modeled load alone. Keep recorded facts, modeled load and coaching judgment distinct (preserve date, sport, source, comparability and uncertainty; webhook timestamp is not observation time; estimated FTP is not formal FTP; rMSSD and SDNN differ). Resolve conflicts by freshness, adoption and comparability—repeated summaries of one session are not independent corroboration; if no current adopted version is clear, use UNKNOWN rather than choosing by repetition or severity.',
    'Optional data & passive default: Sleep, HRV and resting HR are optional enrichment; their absence alone is neither abnormal nor grounds for UNKNOWN, reduced training, device requests or questions. Default to completing the assessment with explicit limitations (or UNKNOWN / WAITING_FOR_SYNC when appropriate; WAITING_FOR_SYNC requires evidence of an actual outstanding sync). Uncertainty is not severity—never elevate state because clarification is unavailable or declined.',
    'Questions (rare): Call ask_user_question only when a concrete current concern cannot be responsibly assessed without a specific athlete fact that would materially change the judgment and tools/limitations cannot resolve it. Ask at most one focused question (end the turn without submitting a final assessment until answered); reuse an existing unanswered question on the same concern, and never repeat a declined question.',
    ...Object.entries(ATHLETE_STATE_DEFINITIONS).map(
      ([state, definition]) => `${state}: ${definition}`,
    ),
    'Submission: Call athlete_state.answer with state (STABLE|STRAINED|UNDER_RECOVERED|HIGH_CONCERN|UNKNOWN), confidence (0..1 reflecting evidence quality/freshness/consistency, not medical probability), decisionReadiness (SUFFICIENT|WAITING_FOR_SYNC|INSUFFICIENT_BUT_SAFE), dimensions, hypotheses, safetyFlags (attributed observations/limitations only—no treatment advice, prescriptions or hypotheticals), and limitations. Attribute supporting/contradictory facts to sources and windows; omit legacy evidenceRequests. HIGH_CONCERN is conservative coaching escalation, never a medical diagnosis. Give a concise explanation after submission when replying to an athlete.',
  ].join('\n'),
};
