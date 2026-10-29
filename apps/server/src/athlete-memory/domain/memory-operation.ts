export const MEMORY_KINDS = [
  'OBSERVATION',
  'PREFERENCE',
  'GOAL',
  'CONSTRAINT',
  'EVENT',
  'PROFILE',
] as const;

export const MEMORY_DECAY_PROFILES = [
  'ACUTE_RECOVERY',
  'TRANSIENT_CONTEXT',
  'UNTIL_RESOLVED',
  'UNTIL_DATE',
  'STABLE',
  'EPISODIC',
] as const;

export const MEMORY_TIME_PRECISIONS = [
  'EXACT',
  'DAY',
  'APPROXIMATE',
  'UNKNOWN',
] as const;

export const MEMORY_EPISTEMIC_STATUSES = [
  'USER_ASSERTED',
  'USER_CONFIRMED',
  'MODEL_INFERRED',
  'SYSTEM_DERIVED',
] as const;

export const MEMORY_OPERATIONS = [
  'CREATE',
  'REFINE',
  'CORROBORATE',
  'SUPERSEDE',
  'RESOLVE',
  'RETRACT',
  'NEEDS_LOOKUP',
  'IGNORE',
] as const;

export const MEMORY_CATEGORIES = [
  'sleep_quality',
  'sleep_duration',
  'fatigue',
  'recovery',
  'pain',
  'illness',
  'stress',
  'mood',
  'schedule_constraint',
  'travel',
  'equipment_constraint',
  'training_preference',
  'communication_preference',
  'goal',
  'race_goal',
  'nutrition',
  'hydration',
  'subjective_effort',
  'general_context',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryDecayProfile = (typeof MEMORY_DECAY_PROFILES)[number];
export type MemoryTimePrecision = (typeof MEMORY_TIME_PRECISIONS)[number];
export type MemoryEpistemicStatus = (typeof MEMORY_EPISTEMIC_STATUSES)[number];
export type MemoryOperationName = (typeof MEMORY_OPERATIONS)[number];
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryFactCandidate = {
  kind: MemoryKind;
  category: MemoryCategory;
  claim: string;
  value?: unknown;
  // event* describes when the real-world fact happened. assertedAt belongs to
  // Evidence and is intentionally not part of the model-authored candidate.
  eventStart?: string;
  eventEnd?: string;
  timeText?: string;
  timePrecision: MemoryTimePrecision;
  epistemicStatus: MemoryEpistemicStatus;
  confidence: number;
  decayProfile: MemoryDecayProfile;
  validFrom?: string;
  validUntil?: string;
  reviewAfter?: string;
};

export type MemoryOperation =
  | ({
      operation: 'CREATE';
      reasonCode: string;
    } & MemoryFactCandidate)
  | {
      operation: 'REFINE' | 'CORROBORATE' | 'SUPERSEDE' | 'RESOLVE' | 'RETRACT';
      targetFactId: string;
      replacement?: MemoryFactCandidate;
      reasonCode: string;
    }
  | {
      operation: 'NEEDS_LOOKUP';
      lookup: {
        query: string;
        categories?: MemoryCategory[];
        eventFrom?: string;
        eventTo?: string;
      };
    }
  | { operation: 'IGNORE'; reasonCode: string };

export const MEMORY_IGNORE_REASONS = [
  'NO_FUTURE_VALUE',
  'HYPOTHETICAL',
  'NEGATED',
  'THIRD_PARTY_ONLY',
  'ASSISTANT_CONTENT_ONLY',
  'DUPLICATE',
  'AMBIGUOUS_WITHOUT_SAFE_INTERPRETATION',
  'DISALLOWED_SENSITIVE_CONTENT',
] as const;

export const MEMORY_POLICY_VERSION = 'athlete-memory-v1';
