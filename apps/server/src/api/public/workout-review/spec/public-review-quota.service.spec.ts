import { describe, expect, it, jest } from '@jest/globals';
import {
  PublicReviewQuotaError,
  PublicReviewQuotaService,
  readPublicReviewQuotaLimits,
  type PublicReviewQuotaLimits,
  type PublicReviewQuotaScope,
  type PublicReviewQuotaSnapshot,
  type PublicReviewQuotaStore,
} from '../public-review-quota.service';

const limits: PublicReviewQuotaLimits = {
  visitorSuccesses: 1,
  activitySuccesses: 1,
  ipSuccesses: 3,
  ipModelStarts: 6,
  globalWeightedTokens: 1_000_000,
  maxReservationWeightedTokens: 8_000,
  reservationLeaseSeconds: 360,
};

describe('PublicReviewQuotaService', () => {
  it('keeps the default reservation lease beyond the maximum upstream timeout', () => {
    const previousLease =
      process.env.PUBLIC_AI_REVIEW_RESERVATION_LEASE_SECONDS;
    const previousReservation =
      process.env.PUBLIC_AI_REVIEW_MAX_RESERVATION_WEIGHTED_TOKENS;
    delete process.env.PUBLIC_AI_REVIEW_RESERVATION_LEASE_SECONDS;
    delete process.env.PUBLIC_AI_REVIEW_MAX_RESERVATION_WEIGHTED_TOKENS;

    const configured = readPublicReviewQuotaLimits();

    expect(configured.reservationLeaseSeconds).toBeGreaterThan(300);
    expect(configured.maxReservationWeightedTokens).toBe(24_000);
    if (previousLease === undefined)
      delete process.env.PUBLIC_AI_REVIEW_RESERVATION_LEASE_SECONDS;
    else process.env.PUBLIC_AI_REVIEW_RESERVATION_LEASE_SECONDS = previousLease;
    if (previousReservation === undefined)
      delete process.env.PUBLIC_AI_REVIEW_MAX_RESERVATION_WEIGHTED_TOKENS;
    else
      process.env.PUBLIC_AI_REVIEW_MAX_RESERVATION_WEIGHTED_TOKENS =
        previousReservation;
  });

  it('checks visitor, IP and global as independent admission subjects', async () => {
    const store: PublicReviewQuotaStore = {
      snapshots: jest.fn(async (subjects) => {
        expect(subjects).toEqual([
          { scope: 'VISITOR', subjectHash: 'visitor' },
          { scope: 'IP', subjectHash: 'ip' },
          { scope: 'GLOBAL', subjectHash: 'GLOBAL' },
        ]);
        return new Map();
      }),
      reserve: jest.fn(async () => ({ reservationId: 'unused' })),
      settle: jest.fn(async () => undefined),
    };
    const service = new PublicReviewQuotaService(store, limits);

    await expect(
      service.checkAdmission({ visitorHash: 'visitor', ipHash: 'ip' }),
    ).resolves.toMatchObject({
      status: 'eligible',
      sharedBudget: {
        rollingWindowWeightedTokenBudget: 1_000_000,
        remainingWeightedTokens: 1_000_000,
        available: true,
      },
      visitorQuota: {
        rollingWindowReviewLimit: 1,
        usedReviews: 0,
        remainingReviews: 1,
        available: true,
      },
    });
  });

  it.each([
    {
      scope: 'VISITOR',
      values: { successes: 1 },
      code: 'VISITOR_LIMIT_REACHED',
    },
    { scope: 'IP', values: { modelStarts: 6 }, code: 'NETWORK_LIMIT_REACHED' },
    {
      scope: 'GLOBAL',
      values: { usedWt: 992_001, reservedWt: 0 },
      code: 'ROLLING_BUDGET_EXHAUSTED',
    },
  ] as const)(
    'denies exhausted $scope quota',
    async ({ scope, values, code }) => {
      const store: PublicReviewQuotaStore = {
        snapshots: jest.fn(
          async () =>
            new Map<PublicReviewQuotaScope, PublicReviewQuotaSnapshot>([
              [
                scope,
                {
                  attempts: 0,
                  modelStarts: 0,
                  successes: 0,
                  failures: 0,
                  reservedWt: 0,
                  usedWt: 0,
                  ...values,
                },
              ],
            ]),
        ),
        reserve: jest.fn(async () => ({ reservationId: 'unused' })),
        settle: jest.fn(async () => undefined),
      };
      const service = new PublicReviewQuotaService(store, limits);

      await expect(
        service.checkAdmission({ visitorHash: 'visitor', ipHash: 'ip' }),
      ).resolves.toMatchObject({ status: 'limit_reached', code });
    },
  );

  it('reports rolling visitor opportunities and the next recovery', async () => {
    const store: PublicReviewQuotaStore = {
      snapshots: jest.fn(
        async () =>
          new Map<PublicReviewQuotaScope, PublicReviewQuotaSnapshot>([
            [
              'VISITOR',
              {
                attempts: 1,
                modelStarts: 1,
                successes: 1,
                failures: 0,
                reservedWt: 0,
                usedWt: 1_200,
                nextSuccessRecoveryAt: '2026-08-11T09:00:00.000Z',
              },
            ],
          ]),
      ),
      reserve: jest.fn(async () => ({ reservationId: 'unused' })),
      settle: jest.fn(async () => undefined),
    };
    const service = new PublicReviewQuotaService(store, limits);

    await expect(
      service.checkAdmission({ visitorHash: 'visitor', ipHash: 'ip' }),
    ).resolves.toMatchObject({
      status: 'limit_reached',
      code: 'VISITOR_LIMIT_REACHED',
      visitorQuota: {
        rollingWindowReviewLimit: 1,
        usedReviews: 1,
        remainingReviews: 0,
        available: false,
        nextRecoveryAt: '2026-08-11T09:00:00.000Z',
        rollingWindowHours: 24,
      },
    });
  });

  it('reserves visitor, IP, activity and global independently in one store call', async () => {
    const reserve = jest.fn(async () => ({ reservationId: 'reservation-1' }));
    const store: PublicReviewQuotaStore = {
      snapshots: jest.fn(async () => new Map()),
      reserve,
      settle: jest.fn(async () => undefined),
    };
    const service = new PublicReviewQuotaService(store, limits);

    await service.reserve({
      admissionNonce: 'nonce-1',
      visitorHash: 'visitor-hash',
      ipHash: 'ip-hash',
      activityHash: 'activity-hash',
    });

    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        subjects: [
          { scope: 'VISITOR', subjectHash: 'visitor-hash' },
          { scope: 'IP', subjectHash: 'ip-hash' },
          { scope: 'ACTIVITY', subjectHash: 'activity-hash' },
          { scope: 'GLOBAL', subjectHash: 'GLOBAL' },
        ],
      }),
      limits,
    );
  });

  it('preserves store quota errors for replay and concurrency failures', async () => {
    const store: PublicReviewQuotaStore = {
      snapshots: jest.fn(async () => new Map()),
      reserve: jest.fn(async () => {
        throw new PublicReviewQuotaError('ADMISSION_INVALID');
      }),
      settle: jest.fn(async () => undefined),
    };
    const service = new PublicReviewQuotaService(store, limits);

    await expect(
      service.reserve({
        admissionNonce: 'replayed',
        visitorHash: 'visitor',
        ipHash: 'ip',
        activityHash: 'activity',
      }),
    ).rejects.toMatchObject({ code: 'ADMISSION_INVALID' });
  });
});
