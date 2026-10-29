import { describe, expect, it, jest } from '@jest/globals';
import { PublicReviewIdentityService } from '../public-review-identity.service';
import { PublicReviewAdmissionService } from '../public-review-admission.service';
import { PublicReviewWorkflowService } from '../public-review-workflow.service';
import { PublicReviewQuotaError } from '../public-review-quota.service';

const gpx = Buffer.from(
  '<gpx version="1.1" creator="private-device"><trk><name>Home route</name><type>running</type><trkseg>' +
    '<trkpt lat="31.2304" lon="121.4737"><ele>10</ele><time>2026-08-10T00:00:00Z</time></trkpt>' +
    '<trkpt lat="31.2305" lon="121.4738"><ele>15</ele><time>2026-08-10T00:00:10Z</time></trkpt>' +
    '</trkseg></trk></gpx>',
);

describe('PublicReviewWorkflowService', () => {
  it('performs admission then prepares an ephemeral privacy-safe review', async () => {
    const quota = {
      checkAdmission: jest.fn(async () => ({
        status: 'eligible' as const,
        sharedBudget: {
          rollingWindowWeightedTokenBudget: 1_000_000,
          remainingWeightedTokens: 900_000,
          available: true,
          nextRecoveryAt: '2026-08-11T00:00:00.000Z',
          rollingWindowHours: 24,
        },
        visitorQuota: {
          rollingWindowReviewLimit: 1,
          usedReviews: 0,
          remainingReviews: 1,
          available: true,
          nextRecoveryAt: undefined,
          rollingWindowHours: 24,
        },
      })),
      reserve: jest.fn(async () => ({ reservationId: 'reservation-1' })),
      settle: jest.fn(async () => undefined),
    };
    const service = new PublicReviewWorkflowService(
      new PublicReviewIdentityService('identity-secret-for-workflow-test'),
      new PublicReviewAdmissionService('admission-secret-for-workflow-test'),
      quota as never,
      {} as never,
    );
    const now = new Date('2026-08-10T08:00:00Z');
    const admission = await service.createAdmission({ ip: '203.0.113.7', now });
    expect(admission.body.status).toBe('eligible');
    expect(admission.body.sharedBudget.remainingWeightedTokens).toBe(900_000);
    expect(admission.body.visitorQuota.remainingReviews).toBe(1);
    const cookie = admission.setCookie!.split(';', 1)[0];

    const prepared = await service.prepareReview({
      file: {
        buffer: gpx,
        originalname: 'secret-home.gpx',
      } as Express.Multer.File,
      form: { language: 'zh-hant', consent: 'true', perceivedEffort: '6' },
      admissionToken:
        admission.body.status === 'eligible'
          ? admission.body.admissionToken
          : '',
      cookieHeader: cookie,
      ip: '203.0.113.7',
      now,
    });

    expect(prepared.reservationId).toBe('reservation-1');
    expect(prepared.evidence.language).toBe('zh-hant');
    expect(prepared.visualization.route3d).toHaveLength(2);
    expect(JSON.stringify(prepared)).not.toContain('31.2304');
    expect(JSON.stringify(prepared)).not.toContain('121.4737');
    expect(JSON.stringify(prepared)).not.toContain('secret-home.gpx');
    expect(quota.reserve).toHaveBeenCalledTimes(1);
  });

  it('rejects an admission token replayed from a different IP binding', async () => {
    const quota = {
      checkAdmission: jest.fn(async () => ({ status: 'eligible' as const })),
      reserve: jest.fn(),
      settle: jest.fn(),
    };
    const service = new PublicReviewWorkflowService(
      new PublicReviewIdentityService('identity-secret-for-workflow-test'),
      new PublicReviewAdmissionService('admission-secret-for-workflow-test'),
      quota as never,
      {} as never,
    );
    const now = new Date('2026-08-10T08:00:00Z');
    const admission = await service.createAdmission({ ip: '203.0.113.7', now });

    await expect(
      service.prepareReview({
        file: { buffer: gpx, originalname: 'run.gpx' } as Express.Multer.File,
        form: { language: 'en', consent: 'true' },
        admissionToken:
          admission.body.status === 'eligible'
            ? admission.body.admissionToken
            : '',
        cookieHeader: admission.setCookie!.split(';', 1)[0],
        ip: '203.0.113.8',
        now,
      }),
    ).rejects.toMatchObject({ response: { code: 'ADMISSION_INVALID' } });
  });

  it('returns the exact quota blocker instead of reporting every limit as a visitor limit', async () => {
    const quota = {
      checkAdmission: jest.fn(async () => ({
        status: 'limit_reached' as const,
        code: 'NETWORK_LIMIT_REACHED' as const,
        nextRecoveryAt: '2026-08-11T00:00:00.000Z',
        sharedBudget: {
          rollingWindowWeightedTokenBudget: 1_000_000,
          remainingWeightedTokens: 900_000,
          available: true,
          nextRecoveryAt: '2026-08-11T00:00:00.000Z',
          rollingWindowHours: 24,
        },
        visitorQuota: {
          rollingWindowReviewLimit: 3,
          usedReviews: 2,
          remainingReviews: 1,
          available: true,
          nextRecoveryAt: '2026-08-11T00:00:00.000Z',
          rollingWindowHours: 24,
        },
      })),
      reserve: jest.fn(),
      settle: jest.fn(),
    };
    const service = new PublicReviewWorkflowService(
      new PublicReviewIdentityService('identity-secret-for-workflow-test'),
      new PublicReviewAdmissionService('admission-secret-for-workflow-test'),
      quota as never,
      {} as never,
    );

    const admission = await service.createAdmission({
      ip: '203.0.113.7',
      now: new Date('2026-08-10T08:00:00Z'),
    });

    expect(admission.body).toMatchObject({
      status: 'limit_reached',
      limitCode: 'NETWORK_LIMIT_REACHED',
      visitorQuota: { remainingReviews: 1 },
    });
  });

  it('preserves a rolling recovery time when the upload loses the quota race', async () => {
    const recoveryAt = '2026-08-11T10:00:00.000Z';
    const quota = {
      checkAdmission: jest.fn(async () => ({ status: 'eligible' as const })),
      reserve: jest.fn(async () => {
        throw new PublicReviewQuotaError(
          'DUPLICATE_ACTIVITY_REVIEW',
          recoveryAt,
        );
      }),
      settle: jest.fn(),
    };
    const service = new PublicReviewWorkflowService(
      new PublicReviewIdentityService('identity-secret-for-workflow-test'),
      new PublicReviewAdmissionService('admission-secret-for-workflow-test'),
      quota as never,
      {} as never,
    );
    const now = new Date('2026-08-10T08:00:00Z');
    const admission = await service.createAdmission({
      ip: '203.0.113.7',
      now,
    });

    await expect(
      service.prepareReview({
        file: { buffer: gpx, originalname: 'run.gpx' } as Express.Multer.File,
        form: { language: 'en', consent: 'true' },
        admissionToken:
          admission.body.status === 'eligible'
            ? admission.body.admissionToken
            : '',
        cookieHeader: admission.setCookie!.split(';', 1)[0],
        ip: '203.0.113.7',
        now,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'DUPLICATE_ACTIVITY_REVIEW',
        nextRecoveryAt: recoveryAt,
      },
    });
  });
});
