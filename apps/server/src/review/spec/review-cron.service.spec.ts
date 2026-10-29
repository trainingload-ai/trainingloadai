import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ReviewCronService } from '../review-cron.service';
import { featureAccessSnapshot } from '@/access/feature-access.types';

type Candidate = {
  user_id: string;
  period_start: Date;
  period_end: Date;
  entitlement_at: Date;
};

function createHarness(
  candidates: Candidate[],
  evaluate: ReturnType<typeof jest.fn>,
) {
  const queryRawUnsafe = jest.fn(async (_sql: string) => candidates);
  const createMany = jest.fn(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
  const service = new ReviewCronService(
    {
      $queryRawUnsafe: queryRawUnsafe,
      reviewJob: { createMany },
    } as never,
    { evaluate } as never,
  );
  (
    service as unknown as { logger: Record<string, ReturnType<typeof jest.fn>> }
  ).logger = {
    debug: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
  };
  return { service, queryRawUnsafe, createMany };
}

const entitlementAt = new Date('2026-09-15T05:00:00.000Z');
const periodEnd = new Date('2026-09-15T00:00:00.000Z');

function candidate(userId: string): Candidate {
  return {
    user_id: userId,
    period_start: new Date('2026-09-14T00:00:00.000Z'),
    period_end: periodEnd,
    entitlement_at: entitlementAt,
  };
}

const originalCronEnabled = process.env.REVIEW_CRON_ENABLED;
const originalCronDebug = process.env.REVIEW_CRON_DEBUG;

beforeAll(() => {
  process.env.REVIEW_CRON_ENABLED = 'true';
  process.env.REVIEW_CRON_DEBUG = 'false';
});

afterAll(() => {
  if (originalCronEnabled === undefined) delete process.env.REVIEW_CRON_ENABLED;
  else process.env.REVIEW_CRON_ENABLED = originalCronEnabled;
  if (originalCronDebug === undefined) delete process.env.REVIEW_CRON_DEBUG;
  else process.env.REVIEW_CRON_DEBUG = originalCronDebug;
});

describe('ReviewCronService authoritative feature filtering', () => {
  it('does not scan candidates when AI is disabled', async () => {
    const evaluate = jest.fn();
    const harness = createHarness([], evaluate);
    Object.defineProperty(harness.service, 'capabilities', {
      value: { isEnabled: jest.fn(() => false) },
    });

    await harness.service.tickDaily();

    expect(harness.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('does not use cached AI_PLAN as an exclusive candidate gate', async () => {
    const evaluate = jest.fn(async (userId: string) => {
      const allowed = userId === 'gift-member-with-stale-free-cache';
      return featureAccessSnapshot({
        allowed,
        reason: allowed ? 'GRANTED' : 'PLAN_REQUIRED',
      });
    });
    const harness = createHarness(
      [
        candidate('gift-member-with-stale-free-cache'),
        candidate('expired-member-with-stale-plus-cache'),
      ],
      evaluate,
    );

    await harness.service.tickDaily();

    const candidateSql = String(harness.queryRawUnsafe.mock.calls[0]?.[0]);
    expect(candidateSql).not.toContain('AI_PLAN');
    expect(candidateSql).not.toContain('t_membership_duration_account');
    expect(evaluate.mock.calls).toEqual([
      [
        'gift-member-with-stale-free-cache',
        ['ai.periodReview'],
        entitlementAt,
      ],
      [
        'expired-member-with-stale-plus-cache',
        ['ai.periodReview'],
        entitlementAt,
      ],
    ]);
    expect(harness.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'gift-member-with-stale-free-cache',
          type: 'DAILY',
          periodStart: new Date('2026-09-14T00:00:00.000Z'),
          periodEnd,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('fails closed per user and continues resolving the remaining candidates', async () => {
    const evaluate = jest
      .fn(async () =>
        featureAccessSnapshot({ allowed: false, reason: 'PLAN_REQUIRED' }),
      )
      .mockRejectedValueOnce(new Error('resolver unavailable'))
      .mockResolvedValueOnce(
        featureAccessSnapshot({ allowed: true, reason: 'GRANTED' }),
      );
    const harness = createHarness(
      [candidate('resolver-failure'), candidate('active-member')],
      evaluate,
    );

    await expect(harness.service.tickDaily()).resolves.toBeUndefined();

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(harness.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'active-member',
          type: 'DAILY',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('does not write an empty batch when no candidate is an active member', async () => {
    const evaluate = jest.fn(async () =>
      featureAccessSnapshot({ allowed: false, reason: 'PLAN_REQUIRED' }),
    );
    const harness = createHarness([candidate('free-user')], evaluate);

    await harness.service.tickDaily();

    expect(evaluate).toHaveBeenCalledWith(
      'free-user',
      ['ai.periodReview'],
      entitlementAt,
    );
    expect(harness.createMany).not.toHaveBeenCalled();
  });
});
