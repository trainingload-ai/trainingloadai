import { describe, expect, it } from '@jest/globals';
import { parseDailyPlanReviewJudgment } from '../daily-plan-review-judgment';

describe('parseDailyPlanReviewJudgment v4', () => {
  it('defaults invalid output to a safe KEEP', () => {
    expect(parseDailyPlanReviewJudgment('not json')).toEqual({
      decision: 'KEEP',
      presentation: 'SILENT',
      action: null,
      targetWorkoutId: null,
      sourceWorkoutId: null,
      targetDate: null,
      rationale: '',
      confidence: null,
      evidenceCodes: [],
      adjustmentIntent: null,
    });
  });

  it('accepts a one-workout schedule adjustment', () => {
    expect(
      parseDailyPlanReviewJudgment(
        '```json\n{"decision":"ADJUST","action":"POSTPONE","targetWorkoutId":"w-1","rationale":"Give the late run time to settle.","confidence":0.8,"evidenceCodes":["extra_activity","SHORT_RECOVERY"],"adjustmentIntent":null}\n```',
      ),
    ).toEqual({
      decision: 'ADJUST',
      presentation: 'DECISION',
      action: 'POSTPONE',
      targetWorkoutId: 'w-1',
      sourceWorkoutId: null,
      targetDate: null,
      rationale: 'Give the late run time to settle.',
      confidence: 0.8,
      evidenceCodes: ['EXTRA_ACTIVITY', 'SHORT_RECOVERY'],
      adjustmentIntent: null,
    });
  });

  it('requires an intent for content adjustments and strips actions from KEEP', () => {
    expect(
      parseDailyPlanReviewJudgment(
        JSON.stringify({
          decision: 'ADJUST',
          action: 'REDUCE_VOLUME',
          targetWorkoutId: 'w-1',
        }),
      ).decision,
    ).toBe('KEEP');
    expect(
      parseDailyPlanReviewJudgment(
        JSON.stringify({
          decision: 'KEEP',
          action: 'SKIP',
          targetWorkoutId: 'w-1',
          confidence: 4,
        }),
      ),
    ).toMatchObject({
      decision: 'KEEP',
      action: null,
      targetWorkoutId: null,
      confidence: 1,
    });
  });

  it('rejects a schedule action carrying content adjustment intent', () => {
    expect(
      parseDailyPlanReviewJudgment(
        JSON.stringify({
          decision: 'ADJUST',
          action: 'POSTPONE',
          targetWorkoutId: 'w-1',
          rationale: 'Move it.',
          confidence: 0.7,
          evidenceCodes: ['SHORT_RECOVERY'],
          adjustmentIntent: {
            magnitude: 'SMALL',
            preserve: ['purpose'],
          },
        }),
      ),
    ).toMatchObject({
      decision: 'KEEP',
      action: null,
      targetWorkoutId: null,
      adjustmentIntent: null,
    });
  });

  it('keeps a meaningful non-mutation result visible as guidance', () => {
    expect(
      parseDailyPlanReviewJudgment(
        JSON.stringify({
          decision: 'KEEP',
          presentation: 'GUIDANCE',
          rationale: 'Resume with the next easy session.',
          evidenceCodes: ['MISSED_WORKOUT'],
        }),
      ),
    ).toMatchObject({
      decision: 'KEEP',
      presentation: 'GUIDANCE',
      action: null,
      rationale: 'Resume with the next easy session.',
    });
  });

  it('accepts one bounded supplemental session sourced from a missed workout', () => {
    expect(
      parseDailyPlanReviewJudgment(
        JSON.stringify({
          decision: 'ADJUST',
          action: 'ADD_SESSION',
          targetWorkoutId: null,
          sourceWorkoutId: 'missed-1',
          targetDate: '2026-09-12',
          rationale: 'Restore continuity with a short easy run.',
          adjustmentIntent: { magnitude: 'SMALL', preserve: ['easy aerobic'] },
        }),
      ),
    ).toMatchObject({
      decision: 'ADJUST',
      presentation: 'DECISION',
      action: 'ADD_SESSION',
      sourceWorkoutId: 'missed-1',
      targetDate: '2026-09-12',
    });
  });
});
