import { describe, expect, it } from '@jest/globals';
import {
  ATHLETE_STATE_ASSESSMENT_SYSTEM,
  enforceCoachAssessmentOutcomeSafety,
  parseAthleteStateAssessment,
  parseCoachAssessmentOutcome,
} from './athlete-state.prompt';

function assessment(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    state: 'UNDER_RECOVERED',
    confidence: 0.8,
    decisionReadiness: 'NEEDS_USER_INPUT',
    dimensions: [],
    hypotheses: [],
    evidenceRequests: [
      {
        kind: 'RECENT_SLEEP',
        reason: 'Sleep could change the action.',
        decisionImpact: 'A poor answer would support reducing intensity.',
        question: {
          id: 'sleep',
          header: 'Sleep',
          question: 'How was last night compared with usual?',
          options: [
            { value: 'worse', label: 'Worse', description: 'Below usual.' },
            { value: 'usual', label: 'Usual', description: 'About usual.' },
          ],
        },
      },
    ],
    safetyFlags: [],
    limitations: [],
    ...overrides,
  });
}

describe('Athlete State prompt parsers', () => {
  it('forbids diagnosis and single-metric overtraining conclusions', () => {
    expect(ATHLETE_STATE_ASSESSMENT_SYSTEM).toContain(
      'Never diagnose disease or injury',
    );
    expect(ATHLETE_STATE_ASSESSMENT_SYSTEM).toContain(
      'Never use one metric alone to claim overtraining',
    );
  });

  it('accepts one strict JSON object and rejects markdown or unknown enums', () => {
    expect(parseAthleteStateAssessment(assessment()).ok).toBe(true);
    expect(
      parseAthleteStateAssessment(`\`\`\`json\n${assessment()}\n\`\`\``).ok,
    ).toBe(false);
    expect(
      parseAthleteStateAssessment(assessment({ state: 'OVERTRAINED' })).ok,
    ).toBe(false);
  });

  it('does not let UNKNOWN carry high confidence or irrelevant questions', () => {
    const parsed = parseAthleteStateAssessment(
      assessment({
        state: 'UNKNOWN',
        confidence: 0.95,
        decisionReadiness: 'SUFFICIENT',
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.confidence).toBe(0.49);
    expect(parsed.data.evidenceRequests).toEqual([]);
  });

  it('bounds nested model output and rejects duplicate question options', () => {
    const duplicateOptions = parseAthleteStateAssessment(
      assessment({
        dimensions: [
          {
            name: 'recovery',
            evidence: Array.from(
              { length: 20 },
              (_, index) => `evidence-${index}-${'x'.repeat(600)}`,
            ),
          },
        ],
        evidenceRequests: [
          {
            kind: 'RECENT_SLEEP',
            reason: 'Sleep could change the action.',
            decisionImpact: 'The answer changes whether training is reduced.',
            question: {
              id: 'sleep',
              header: 'Sleep',
              question: 'How was last night?',
              options: [
                {
                  value: 'worse',
                  label: 'Worse',
                  description: 'Below usual.',
                },
                {
                  value: 'worse',
                  label: 'Still worse',
                  description: 'Duplicate value.',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(duplicateOptions.ok).toBe(true);
    if (!duplicateOptions.ok) return;
    expect(
      duplicateOptions.data.dimensions[0]?.evidence as unknown[],
    ).toHaveLength(8);
    expect(duplicateOptions.data.evidenceRequests).toEqual([]);
  });

  it('rejects increasing actions and clamps malformed numeric ranges', () => {
    const invalid = parseCoachAssessmentOutcome(
      JSON.stringify({
        action: 'INCREASE_VOLUME',
        title: 'Add more',
        observation: 'Observation',
        reason: 'Reason',
        guidance: 'Guidance',
        requiresPlanDecision: true,
        confidence: 1,
      }),
    );
    expect(invalid.ok).toBe(false);

    const parsed = parseCoachAssessmentOutcome(
      JSON.stringify({
        action: 'REDUCE_VOLUME',
        title: 'Reduce today',
        observation: 'Recovery is below usual.',
        reason: 'Multiple sources agree.',
        guidance: 'Keep the adjustment conservative.',
        requiresPlanDecision: true,
        followUpHours: 999,
        confidence: 5,
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.followUpHours).toBeNull();
    expect(parsed.data.confidence).toBe(1);
  });

  it('enforces no mutation without a plan or for HIGH_CONCERN', () => {
    const value = {
      action: 'RECOVERY' as const,
      title: 'Recover',
      observation: 'Conservative handling is warranted.',
      reason: 'Safety signal.',
      guidance: 'Stop and seek appropriate help if symptoms persist.',
      requiresPlanDecision: true,
      followUpHours: 12,
      confidence: 0.8,
    };
    expect(
      enforceCoachAssessmentOutcomeSafety(value, {
        hasActivePlan: true,
        state: 'HIGH_CONCERN',
      }).requiresPlanDecision,
    ).toBe(false);
    expect(
      enforceCoachAssessmentOutcomeSafety(value, {
        hasActivePlan: false,
        state: 'UNDER_RECOVERED',
      }).requiresPlanDecision,
    ).toBe(false);
    expect(
      enforceCoachAssessmentOutcomeSafety(
        { ...value, requiresPlanDecision: false },
        { hasActivePlan: true, state: 'UNDER_RECOVERED' },
      ).requiresPlanDecision,
    ).toBe(true);
    expect(
      enforceCoachAssessmentOutcomeSafety(
        { ...value, action: 'KEEP', requiresPlanDecision: true },
        { hasActivePlan: true, state: 'UNDER_RECOVERED' },
      ).requiresPlanDecision,
    ).toBe(false);
  });
});
