import type { AthleteStateAssessmentResult } from '@/athlete-state/domain/athlete-state.contracts';
import { toolSchemaValidator } from '../core/tool-input-validation';

/** Coaching judgments, not diagnoses or population-based medical thresholds. */
export const ATHLETE_STATE_DEFINITIONS = {
  STABLE:
    'Sufficient current, comparable evidence supports ordinary training tolerance, without a material unresolved concern. Missing optional wearable data alone does not prevent this state. Absence of records does not establish it.',
  STRAINED:
    'Current evidence supports increased training demand or strain, but does not establish persistent difficulty recovering. A rising modeled load alone is context, not proof of physiological fatigue.',
  UNDER_RECOVERED:
    'Current evidence supports difficulty recovering over time, corroborated by comparable performance, current athlete feedback or other relevant observations. Recent hard training or one unusual wearable value alone is insufficient.',
  HIGH_CONCERN:
    'Specific, credible current evidence establishes a concern with demonstrated severity or persistence that warrants coaching escalation. Attribute it to observed facts. Vague discomfort, stopping one session for an unspecified reason, missing details, declined clarification or a hypothetical worst case alone does not establish this state; preserve UNKNOWN when severity or persistence is unestablished. Do not diagnose.',
  UNKNOWN:
    'Available evidence is absent, stale or materially conflicting, so a defensible current state cannot be established. State the specific limitation. Missing optional recovery measures alone is insufficient when training evidence supports a judgment.',
} as const;

export type AthleteStateSkillResult = Omit<
  AthleteStateAssessmentResult,
  | 'decisionReadiness'
  | 'dimensions'
  | 'hypotheses'
  | 'safetyFlags'
  | 'evidenceRequests'
> & {
  decisionReadiness:
    | 'SUFFICIENT'
    | 'WAITING_FOR_SYNC'
    | 'INSUFFICIENT_BUT_SAFE';
  dimensions: Array<{
    name: string;
    status: 'SUPPORTS' | 'CONTRADICTS' | 'UNCERTAIN';
    summary: string;
    evidence: string[];
  }>;
  hypotheses: Array<{ label: string; support: string[]; against: string[] }>;
  safetyFlags: Array<{ code: string; reason: string; evidence: string[] }>;
};

const text = { type: 'string', minLength: 1, maxLength: 320 } as const;
const facts = {
  type: 'array',
  maxItems: 6,
  description:
    'Concise attributed facts with source and relevant date/window; never invent a tool result.',
  items: text,
} as const;

/** Shared by model tool schemas and the server write boundary; no silent coercion. */
export const ATHLETE_STATE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'state',
    'confidence',
    'decisionReadiness',
    'dimensions',
    'hypotheses',
    'safetyFlags',
    'limitations',
  ],
  properties: {
    state: { type: 'string', enum: Object.keys(ATHLETE_STATE_DEFINITIONS) },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'Confidence in the supported state, reflecting coverage, freshness, comparability and consistency; not a medical probability.',
    },
    decisionReadiness: {
      type: 'string',
      enum: ['SUFFICIENT', 'WAITING_FOR_SYNC', 'INSUFFICIENT_BUT_SAFE'],
      description:
        'SUFFICIENT: enough evidence for the judgment. WAITING_FOR_SYNC: a confirmed outstanding sync prevents judgment. INSUFFICIENT_BUT_SAFE: finish with explicit uncertainty. Necessary questions use ask_user_question and Coach awaiting_input, not this result.',
    },
    dimensions: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'status', 'summary', 'evidence'],
        properties: {
          name: { ...text, maxLength: 60 },
          status: {
            type: 'string',
            enum: ['SUPPORTS', 'CONTRADICTS', 'UNCERTAIN'],
            description:
              'How this evidence dimension relates to the selected state.',
          },
          summary: text,
          evidence: { ...facts, minItems: 1 },
        },
      },
    },
    hypotheses: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'support', 'against'],
        properties: { label: text, support: facts, against: facts },
      },
    },
    safetyFlags: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'reason', 'evidence'],
        properties: {
          code: { ...text, maxLength: 80 },
          reason: text,
          evidence: { ...facts, minItems: 1 },
        },
      },
    },
    limitations: { type: 'array', maxItems: 6, items: text },
  },
  allOf: [
    {
      if: { properties: { state: { const: 'UNKNOWN' } } },
      then: {
        properties: {
          confidence: { maximum: 0.49 },
          limitations: { minItems: 1 },
          decisionReadiness: {
            enum: ['WAITING_FOR_SYNC', 'INSUFFICIENT_BUT_SAFE'],
          },
        },
      },
    },
    {
      if: { properties: { state: { const: 'HIGH_CONCERN' } } },
      then: { properties: { safetyFlags: { minItems: 1 } } },
    },
  ],
} as const;

export const parseAthleteStateSkillResult =
  toolSchemaValidator<AthleteStateSkillResult>(ATHLETE_STATE_RESULT_SCHEMA);

/** Availability/configuration reads alone cannot justify a positive state. */
export const ATHLETE_STATE_FACT_TOOLS = new Set([
  'training.weekSummary',
  'training.readiness',
  'training.baseline',
  'pmc.range',
  'activity.recent',
  'activity.search',
  'activity.series',
  'health.summary',
  'metric.current',
  'metric.history',
  'memory.search',
]);
