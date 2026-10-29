import { Module } from '@nestjs/common';
import { PublicReviewController } from './public-review.controller';
import { PublicReviewIdentityService } from './public-review-identity.service';
import { PublicReviewAdmissionService } from './public-review-admission.service';
import { PostgresPublicReviewQuotaStore } from './public-review-quota.store';
import {
  PublicReviewQuotaService,
  readPublicReviewQuotaLimits,
} from './public-review-quota.service';
import { PublicReviewAiService } from './public-review-result';
import { PublicReviewWorkflowService } from './public-review-workflow.service';
import { PublicReviewReservationReaper } from './public-review-reservation-reaper';
import { AiModule } from '@/api/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [PublicReviewController],
  providers: [
    {
      provide: PublicReviewIdentityService,
      useFactory: () => new PublicReviewIdentityService(),
    },
    {
      provide: PublicReviewAdmissionService,
      useFactory: () => new PublicReviewAdmissionService(),
    },
    PostgresPublicReviewQuotaStore,
    {
      provide: PublicReviewQuotaService,
      inject: [PostgresPublicReviewQuotaStore],
      useFactory: (store: PostgresPublicReviewQuotaStore) =>
        new PublicReviewQuotaService(store, readPublicReviewQuotaLimits()),
    },
    PublicReviewAiService,
    PublicReviewWorkflowService,
    PublicReviewReservationReaper,
  ],
})
export class PublicReviewModule {}
