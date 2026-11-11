import { normalizeAssessmentEvidenceRequests } from './optional-evidence';
import type { AthleteStateAssessmentResult } from './athlete-state.contracts';

function result(kinds: string[]): AthleteStateAssessmentResult {
  return {
    state: 'UNKNOWN',
    confidence: 0.4,
    decisionReadiness: 'NEEDS_USER_INPUT',
    dimensions: [],
    hypotheses: [],
    safetyFlags: [],
    limitations: [],
    evidenceRequests: kinds.map((kind) => ({
      kind,
      reason: 'Context',
      decisionImpact: 'Impact',
      question: { id: kind, header: kind, question: kind, options: [] },
    })),
  };
}

describe('optional recovery evidence', () => {
  it.each(['RECENT_SLEEP', 'SLEEP_CONTEXT', 'HRV', 'PHYSIOLOGY_BASELINE'])(
    'does not require a response for %s',
    (kind) => {
      expect(normalizeAssessmentEvidenceRequests(result([kind]))).toMatchObject(
        {
          state: 'UNKNOWN',
          decisionReadiness: 'INSUFFICIENT_BUT_SAFE',
          evidenceRequests: [],
        },
      );
    },
  );

  it('keeps a concrete symptom question without adding optional recovery questions', () => {
    const normalized = normalizeAssessmentEvidenceRequests(
      result(['RECENT_SLEEP', 'PAIN_LOCATION']),
    );
    expect(normalized.decisionReadiness).toBe('NEEDS_USER_INPUT');
    expect(normalized.evidenceRequests.map((request) => request.kind)).toEqual([
      'PAIN_LOCATION',
    ]);
  });
});
