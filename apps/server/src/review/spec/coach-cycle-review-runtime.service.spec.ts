import { describe, expect, it, jest } from '@jest/globals';
import { CoachCycleReviewRuntimeService } from '../coach-cycle-review-runtime.service';
import { featureAccessSnapshot } from '@/access/feature-access.types';

function createService(args?: {
  summary?: { id: string; markdown: string; progressLabel: string } | null;
  pending?: Array<{ id: string }>;
  accessAllowed?: boolean;
  successorExists?: boolean;
}) {
  const prisma = {
    coachSummary: {
      findUnique: jest.fn(
        async () =>
          args?.summary ?? {
            id: 'sum-1',
            markdown: '- completionRate: 80%',
            progressLabel: 'STABLE',
            planId: 'plan-1',
            contextId: 'ctx-1',
          },
      ),
    },
    coachContext: {
      findFirst: jest.fn(async () => ({
        id: 'ctx-1',
        planId: 'plan-1',
        status: 'FINALIZED',
      })),
    },
    coachDecision: {
      findFirst: jest.fn(async () => args?.pending?.[0] ?? null),
    },
    plan: {
      findUnique: jest.fn(async () => ({ id: 'plan-1', title: 'Base' })),
    },
  };
  const branching = {
    openBranch: jest.fn(async () => ({ branch: { id: 'branch-cycle' } })),
    squashBranch: jest.fn(async () => ({
      decision: { id: 'decision-cycle' },
      options: [],
    })),
  };
  const userService = {
    getPreferredLocale: jest.fn(async () => 'zh'),
  };
  const featureAccess = {
    evaluate: jest.fn(async () => {
      const allowed = args?.accessAllowed ?? true;
      return featureAccessSnapshot({
        allowed,
        reason: allowed ? 'GRANTED' : 'PLAN_REQUIRED',
      });
    }),
  };
  const service = new CoachCycleReviewRuntimeService(
    prisma as never,
    branching as never,
    userService as never,
    featureAccess as never,
    { t: jest.fn((key: string) => String(key)) } as never,
    {
      findContextByPlan: jest.fn(async () => prisma.coachContext.findFirst()),
      findPlanTitle: jest.fn(async () => prisma.plan.findUnique()),
      findNextCycleEligiblePlanIds: jest.fn(async () =>
        args?.successorExists ? [] : ['plan-1'],
      ),
    } as never,
  );
  return { service, branching, prisma };
}

describe('CoachCycleReviewRuntimeService', () => {
  it('does not propose another plan when a successor exists', async () => {
    const { service, branching } = createService({ successorExists: true });
    expect(
      await service.runAfterFinalize({
        userId: 'user-1',
        planId: 'plan-1',
        planStatus: 'COMPLETED',
      }),
    ).toEqual({ skipped: true, reason: 'successor_exists' });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });
  it('skips cancelled plans', async () => {
    const { service, branching } = createService();
    const result = await service.runAfterFinalize({
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'CANCELLED',
    });
    expect(result).toEqual({ skipped: true, reason: 'not_completed' });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });

  it('does not duplicate an open next-plan decision', async () => {
    const { service, branching } = createService({
      pending: [{ id: 'already' }],
    });
    const result = await service.runAfterFinalize({
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'COMPLETED',
    });
    expect(result).toEqual({ skipped: true, reason: 'duplicate' });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });

  it('proposes opening the next plan after a completed cycle', async () => {
    const { service, branching } = createService();
    const result = await service.runAfterFinalize({
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'COMPLETED',
    });
    expect(result).toEqual({
      skipped: false,
      reason: 'propose',
      decisionId: 'decision-cycle',
    });
    expect(branching.openBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-1',
        openReason: 'runtime_cycle_review',
        allowFinalized: true,
      }),
    );
    expect(branching.squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionType: 'PLAN_LIFECYCLE',
        payload: expect.objectContaining({
          planId: 'plan-1',
          action: 'open_next',
          summaryId: 'sum-1',
        }),
        options: [
          expect.objectContaining({
            optionKey: 'apply',
            title: 'common.coachRuntime.optionStartNextPlan',
            isSelected: true,
          }),
          expect.objectContaining({
            optionKey: 'keep',
            title: 'common.coachRuntime.optionNotNow',
            isSelected: false,
          }),
        ],
      }),
    );
  });

  it('skips extra judgment when the feature policy denies access', async () => {
    const { service, branching } = createService({ accessAllowed: false });
    const result = await service.runAfterFinalize({
      userId: 'user-1',
      planId: 'plan-1',
      planStatus: 'COMPLETED',
    });
    expect(result).toEqual({ skipped: true, reason: 'not_allowed' });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });
});
