import { describe, expect, it, jest } from '@jest/globals';
import { coachDecisionApplyTool } from '../tools/coachDecisionApply.tool';
import { coachDecisionDraftTool } from '../tools/coachDecisionDraft.tool';
import { presentPlanWorkoutAdjustmentDraftTool } from '../tools/presentPlanWorkoutAdjustmentDraft.tool';

describe('Athlete State Coach tool safety', () => {
  const context = {
    athleteStateSafetyMode: 'HIGH_CONCERN' as const,
    session: { user: { id: 'athlete-1' } },
    branchId: 'branch-1',
    coachBranching: { canUseDecisionTools: jest.fn(async () => true) },
  };

  it.each([
    coachDecisionDraftTool,
    coachDecisionApplyTool,
    presentPlanWorkoutAdjustmentDraftTool,
  ])('disables %s in HIGH_CONCERN safety mode', async (tool) => {
    await expect(tool.isEnabled?.(context as never)).resolves.toBe(false);
  });
});
