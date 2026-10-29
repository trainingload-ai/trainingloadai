import { describe, expect, it, jest } from '@jest/globals';
import { PlanQueryService } from '../application/plan-query.service';

const completed = {
  id: 'old',
  status: 'COMPLETED',
  completedAt: new Date('2026-10-09'),
  activatedAt: new Date('2026-09-02'),
};
function setup(others: object[] = []) {
  const findMany = jest.fn(async () => [completed, ...others]);
  const service = new PlanQueryService(
    {} as never,
    { findMany } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, findMany };
}

describe('next cycle recommendation eligibility', () => {
  it('allows a completed cycle without a successor and scopes ownership', async () => {
    const { service, findMany } = setup();
    expect(
      await service.findNextCycleEligiblePlanIds('owner', ['old', 'not-owned']),
    ).toEqual(['old']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner', status: { not: 'DRAFT' } },
      }),
    );
  });
  it.each(['ACTIVE', 'SCHEDULED', 'PAUSED'])(
    'hides recommendations when another plan is %s',
    async (status) => {
      const { service } = setup([
        {
          id: 'new',
          status,
          activatedAt: new Date('2026-10-08'),
          completedAt: null,
        },
      ]);
      expect(
        await service.findNextCycleEligiblePlanIds('owner', ['old']),
      ).toEqual([]);
    },
  );
  it.each(['COMPLETED', 'CANCELLED', 'SUPERSEDED'])(
    'does not resurrect suggestions after the successor becomes %s',
    async (status) => {
      const { service } = setup([
        {
          id: 'new',
          status,
          activatedAt: new Date('2026-10-10'),
          completedAt: null,
        },
      ]);
      expect(
        await service.findNextCycleEligiblePlanIds('owner', ['old']),
      ).toEqual([]);
    },
  );
  it('does not treat an older finished plan as a successor', async () => {
    const { service } = setup([
      {
        id: 'older',
        status: 'COMPLETED',
        activatedAt: new Date('2026-01-01'),
        completedAt: new Date('2026-02-01'),
      },
    ]);
    expect(
      await service.findNextCycleEligiblePlanIds('owner', ['old']),
    ).toEqual(['old']);
  });
  it('does not query when there are no cycle suggestions', async () => {
    const { service, findMany } = setup();
    expect(await service.findNextCycleEligiblePlanIds('owner', [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
