import { describe, expect, it } from '@jest/globals';
import type { AthleteStateAssessmentResult } from '@/athlete-state/domain/athlete-state.contracts';
import { shouldModelFollowupOutcome } from './coach-assessment-orchestrator.service';

function result(
  decisionReadiness: AthleteStateAssessmentResult['decisionReadiness'],
  evidenceRequests: AthleteStateAssessmentResult['evidenceRequests'] = [],
): AthleteStateAssessmentResult {
  return {
    state: 'UNDER_RECOVERED',
    confidence: 0.7,
    decisionReadiness,
    dimensions: [],
    hypotheses: [],
    evidenceRequests,
    safetyFlags: [],
    limitations: [],
  };
}

const sleepRequest = {
  kind: 'RECENT_SLEEP',
  reason: 'Sleep context may change the recommendation.',
  decisionImpact: 'Distinguishes an isolated disruption from ongoing strain.',
  question: {
    id: 'sleep_context',
    header: 'Sleep',
    question: 'Why was sleep shorter than usual?',
    options: [
      { value: 'travel', label: 'Travel', description: 'Travel disrupted it.' },
      { value: 'stress', label: 'Stress', description: 'Stress disrupted it.' },
    ],
  },
};

describe('shouldModelFollowupOutcome', () => {
  it('keeps the first distinct evidence request as a question', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('NEEDS_USER_INPUT', [sleepRequest]),
        questionCount: 1,
        previousEvidenceKinds: ['ILLNESS_SYMPTOM_CHECK'],
      }),
    ).toBe(false);
  });

  it('models a conservative outcome after the two-question budget is spent', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('NEEDS_USER_INPUT', [sleepRequest]),
        questionCount: 2,
        previousEvidenceKinds: ['ILLNESS_SYMPTOM_CHECK', 'RECENT_SLEEP'],
      }),
    ).toBe(true);
  });

  it('does not model an outcome while a material source is syncing', () => {
    expect(
      shouldModelFollowupOutcome({
        result: result('WAITING_FOR_SYNC'),
        questionCount: 2,
        previousEvidenceKinds: [],
      }),
    ).toBe(false);
  });
});
