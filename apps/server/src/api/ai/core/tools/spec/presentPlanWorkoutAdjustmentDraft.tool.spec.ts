import { describe, expect, it, jest } from '@jest/globals';
import { presentPlanWorkoutAdjustmentDraftTool } from '../presentPlanWorkoutAdjustmentDraft.tool';

const draftInput = {
  planId: 'plan-1',
  workoutId: 'w-1',
  title: 'Make tomorrow easier',
  reason: 'Fatigue is high',
  before: {
    weekIndex: 2,
    dayIndex: 3,
    sessionIndex: 1,
    sportType: 'RUN',
    text: 'E 8km',
  },
  after: {
    weekIndex: 2,
    dayIndex: 3,
    sessionIndex: 1,
    sportType: 'RUN',
    name: 'Recovery jog',
    notes: 'keep it easy',
    text: 'E 5km',
  },
  changes: [{ field: 'text', before: 'E 8km', after: 'E 5km' }],
};

describe('presentPlanWorkoutAdjustmentDraftTool', () => {
  it('opens a conversation branch and stores a PLAN_WORKOUT_UPDATE decision', async () => {
    const openBranch = jest.fn(async () => ({ branch: { id: 'branch-new' } }));
    const squashBranch = jest.fn(async () => ({
      decision: { id: 'decision-1' },
      options: [],
    }));
    const ctx = {
      session: { user: { id: 'user-1' } },
      i18n: { t: (key: string) => key },
      coachBranching: { openBranch, squashBranch },
      planService: { getWorkoutDetail: async () => ({ workout: { ...draftInput.before, text: 'work 40m' } }) },
    } as never;

    const output = await presentPlanWorkoutAdjustmentDraftTool.execute(
      ctx,
      draftInput as never,
    );

    expect(openBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-1',
        openReason: 'conversation_adjustment',
      }),
    );
    expect(squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-new',
        decisionType: 'PLAN_WORKOUT_UPDATE',
        payload: expect.objectContaining({
          planId: 'plan-1',
          workoutId: 'w-1',
          dto: expect.objectContaining({ text: 'E 5km' }),
        }),
      }),
    );
    expect(output.decisionId).toBe('decision-1');
    expect(output.before.text).toBe('work 40m');
    expect(output.changes).toContainEqual(expect.objectContaining({ field: 'text', before: 'work 40m', after: 'E 5km' }));
  });

  it('reuses the current branch when one already exists', async () => {
    const openBranch = jest.fn();
    const squashBranch = jest.fn(async () => ({
      decision: { id: 'decision-2' },
      options: [],
    }));
    const ctx = {
      session: { user: { id: 'user-1' } },
      branchId: 'branch-open',
      i18n: { t: (key: string) => key },
      coachBranching: { openBranch, squashBranch },
      planService: { getWorkoutDetail: async () => ({ workout: draftInput.before }) },
    } as never;

    await presentPlanWorkoutAdjustmentDraftTool.execute(ctx, draftInput as never);
    expect(openBranch).not.toHaveBeenCalled();
    expect(squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-open' }),
    );
  });
});
