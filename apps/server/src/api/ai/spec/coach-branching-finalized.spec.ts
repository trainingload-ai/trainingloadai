import { describe, expect, it } from '@jest/globals';
import {
  canApplyCoachDecisionOnContext,
  canOpenCoachBranch,
  isOpenNextLifecyclePayload,
} from '../coach-branching-finalized';

describe('coach branching finalized cycle rules', () => {
  it('allows opening a branch on FINALIZED only for cycle review', () => {
    expect(canOpenCoachBranch({ status: 'ACTIVE' })).toBe(true);
    expect(canOpenCoachBranch({ status: 'FINALIZED' })).toBe(false);
    expect(
      canOpenCoachBranch({ status: 'FINALIZED', allowFinalized: true }),
    ).toBe(true);
    expect(
      canOpenCoachBranch({ status: 'ARCHIVED', allowFinalized: true }),
    ).toBe(false);
  });

  it('only treats PLAN_LIFECYCLE open_next as the cycle close action', () => {
    expect(
      isOpenNextLifecyclePayload('PLAN_LIFECYCLE', { action: 'open_next' }),
    ).toBe(true);
    expect(
      isOpenNextLifecyclePayload('PLAN_LIFECYCLE', { action: 'complete' }),
    ).toBe(false);
    expect(
      isOpenNextLifecyclePayload('PLAN_WORKOUT_POSTPONE', {
        action: 'open_next',
      }),
    ).toBe(false);
  });

  it('lets FINALIZED contexts apply only the open-next decision', () => {
    expect(
      canApplyCoachDecisionOnContext({
        contextStatus: 'FINALIZED',
        decisionType: 'PLAN_LIFECYCLE',
        payload: { action: 'open_next' },
      }),
    ).toBe(true);
    expect(
      canApplyCoachDecisionOnContext({
        contextStatus: 'FINALIZED',
        decisionType: 'PLAN_WORKOUT_POSTPONE',
        payload: { workoutId: 'w-1' },
      }),
    ).toBe(false);
    expect(
      canApplyCoachDecisionOnContext({
        contextStatus: 'ACTIVE',
        decisionType: 'PLAN_WORKOUT_POSTPONE',
        payload: { workoutId: 'w-1' },
      }),
    ).toBe(true);
  });
});
