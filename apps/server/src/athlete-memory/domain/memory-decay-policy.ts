import type { MemoryDecayProfile } from './memory-operation';

export const MEMORY_DECAY_POLICY_VERSION = 'decay-v1';

export type MemoryLifecycle =
  | 'CURRENT'
  | 'HISTORICAL'
  | 'STALE_UNRESOLVED'
  | 'NOT_YET_VALID'
  | 'ENDED';

export type DecayInput = {
  profile: MemoryDecayProfile;
  asOf: Date;
  relevanceAnchorAt: Date;
  validFrom?: Date | null;
  validUntil?: Date | null;
  reviewAfter?: Date | null;
  confidence: number;
  authorityWeight: number;
  active: boolean;
};

const HOUR = 60 * 60 * 1000;

function exponential(ageMs: number, halfLifeHours: number) {
  return Math.pow(0.5, Math.max(0, ageMs) / (halfLifeHours * HOUR));
}

export function memoryLifecycle(input: DecayInput): MemoryLifecycle {
  if (!input.active) return 'HISTORICAL';
  if (input.validFrom && input.asOf < input.validFrom) return 'NOT_YET_VALID';
  if (input.validUntil && input.asOf > input.validUntil) return 'ENDED';
  if (
    input.profile === 'UNTIL_RESOLVED' &&
    input.reviewAfter &&
    input.asOf > input.reviewAfter
  ) {
    return 'STALE_UNRESOLVED';
  }
  return 'CURRENT';
}

export function calculateDirectImpact(input: DecayInput): number {
  // Direct impact is a read-time ranking signal, never a deletion rule. A fact
  // can have zero current impact and remain available to historical search.
  const lifecycle = memoryLifecycle(input);
  if (
    lifecycle === 'HISTORICAL' ||
    lifecycle === 'NOT_YET_VALID' ||
    lifecycle === 'ENDED'
  ) {
    return 0;
  }
  const ageMs = Math.max(
    0,
    input.asOf.getTime() - input.relevanceAnchorAt.getTime(),
  );
  let temporal = 1;
  switch (input.profile) {
    case 'ACUTE_RECOVERY':
      // Versioned policy baseline: useful for roughly 1–3 days and negligible
      // after 20 days. Tune via shadow-mode evaluation, not model output.
      temporal = exponential(ageMs, 36);
      break;
    case 'TRANSIENT_CONTEXT':
      temporal = exponential(ageMs, 72);
      break;
    case 'UNTIL_RESOLVED':
      // Stale means “ask for an update”, not “assume recovered”.
      temporal = lifecycle === 'STALE_UNRESOLVED' ? 0.35 : 1;
      break;
    case 'UNTIL_DATE':
    case 'STABLE':
      temporal = 1;
      break;
    case 'EPISODIC':
      temporal = 0.15 * exponential(ageMs, 24 * 30);
      break;
  }
  return Math.max(
    0,
    Math.min(1, input.confidence * input.authorityWeight * temporal),
  );
}

export function canEnterAmbient(input: DecayInput): boolean {
  const lifecycle = memoryLifecycle(input);
  if (input.profile === 'EPISODIC') return false;
  if (input.profile === 'ACUTE_RECOVERY') {
    const ageHours =
      (input.asOf.getTime() - input.relevanceAnchorAt.getTime()) / HOUR;
    return ageHours <= 72 && calculateDirectImpact(input) >= 0.12;
  }
  if (input.profile === 'UNTIL_RESOLVED') {
    return lifecycle === 'CURRENT' || lifecycle === 'STALE_UNRESOLVED';
  }
  return lifecycle === 'CURRENT' && calculateDirectImpact(input) >= 0.12;
}
