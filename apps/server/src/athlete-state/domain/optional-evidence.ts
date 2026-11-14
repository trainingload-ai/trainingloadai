import type { AthleteStateAssessmentResult } from './athlete-state.contracts';

/** Passive coaching works from training records; wearable recovery data is optional. */
export const OPTIONAL_RECOVERY_EVIDENCE_KINDS = [
  'RECENT_SLEEP',
  'SLEEP_QUALITY',
  'SLEEP_DURATION',
  'HRV',
  'RESTING_HEART_RATE',
  'PHYSIOLOGY_BASELINE',
] as const;

export function isOptionalRecoveryEvidence(kind: string) {
  return /SLEEP|HRV|HEART_RATE_VARIABILITY|RESTING_HEART_RATE|PHYSIOLOGY_BASELINE/.test(
    kind.toUpperCase(),
  );
}

/** Legacy Case normalization only; Skill questions live in CoachRun interactions. */
export function normalizeAssessmentEvidenceRequests(
  result: AthleteStateAssessmentResult,
): AthleteStateAssessmentResult {
  const evidenceRequests = result.evidenceRequests.filter(
    (request) => !isOptionalRecoveryEvidence(request.kind),
  );
  return {
    ...result,
    evidenceRequests,
    decisionReadiness:
      result.decisionReadiness === 'NEEDS_USER_INPUT' &&
      evidenceRequests.length === 0
        ? 'INSUFFICIENT_BUT_SAFE'
        : result.decisionReadiness,
  };
}
