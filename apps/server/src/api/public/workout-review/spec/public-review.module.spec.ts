import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PublicReviewAdmissionService } from '../public-review-admission.service';
import { PublicReviewIdentityService } from '../public-review-identity.service';
import { PublicReviewModule } from '../public-review.module';
import { PostgresPublicReviewQuotaStore } from '../public-review-quota.store';
import { PublicReviewAiService } from '../public-review-result';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));
jest.mock('@/api/ai/ai.module', () => {
  const { Module } = jest.requireActual(
    '@nestjs/common',
  ) as typeof import('@nestjs/common');
  class AiModule {}
  Module({})(AiModule);
  return { AiModule };
});

describe('PublicReviewModule', () => {
  it('resolves every runtime dependency through the Nest container', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicReviewModule],
    })
      .overrideProvider(PostgresPublicReviewQuotaStore)
      .useValue({
        checkAdmission: jest.fn(),
        reserve: jest.fn(),
        settleSuccess: jest.fn(),
        settleFailure: jest.fn(),
        expireStaleReservations: jest.fn(),
      })
      .overrideProvider(PublicReviewAiService)
      .useValue({ generate: jest.fn() })
      .compile();

    expect(moduleRef.get(PublicReviewIdentityService)).toBeInstanceOf(
      PublicReviewIdentityService,
    );
    expect(moduleRef.get(PublicReviewAdmissionService)).toBeInstanceOf(
      PublicReviewAdmissionService,
    );

    await moduleRef.close();
  });
});
