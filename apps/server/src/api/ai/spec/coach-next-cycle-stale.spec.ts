import { describe, expect, it, jest } from '@jest/globals';
import { CoachBranchingService } from '../coach-branching.service';

function setup(state = 'PROPOSED', eligible: string[] = []) {
  const decision = {
    id: 'decision',
    state,
    decisionType: 'PLAN_LIFECYCLE',
    payload: { action: 'open_next', planId: 'old' },
    createdAt: new Date(),
    context: { planId: 'old', status: 'FINALIZED', userId: 'owner' },
    branch: {},
    options: [],
  };
  const transaction = jest.fn();
  const appendEvent = jest.fn();
  const service = Object.create(
    CoachBranchingService.prototype,
  ) as CoachBranchingService;
  Object.assign(service, {
    requireDecisionOwner: jest.fn(async () => decision),
    prisma: {
      $transaction: transaction,
      coachDecision: { findMany: jest.fn(async () => [decision]) },
      coachEvent: { findFirst: jest.fn(async () => null) },
    },
    planQuery: { findNextCycleEligiblePlanIds: jest.fn(async () => eligible) },
    coachContext: { appendEvent },
  });
  return { service, transaction, appendEvent };
}
describe('stale next-cycle decisions', () => {
  it('filters stale home cards', async () => {
    const { service } = setup();
    expect(
      (await service.listPendingDecisions({ userId: 'owner' })).decisions,
    ).toEqual([]);
  });
  it('rejects stale confirmation without approving', async () => {
    const { service, transaction } = setup();
    await expect(
      service.approveDecision({ userId: 'owner', decisionId: 'decision' }),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rechecks already-approved decisions before applying', async () => {
    const { service, appendEvent, transaction } = setup('APPROVED');
    await expect(
      service.applyDecision({ userId: 'owner', decisionId: 'decision' }),
    ).rejects.toThrow();
    expect(appendEvent).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
