import { Module } from '@nestjs/common';

import { ActivityModule } from '@/api/activity/activity.module';
import { AiModule } from '@/api/ai/ai.module';
import { UsersModule } from '@/api/user/user.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReviewModule } from '@/review/review.module';
import { ActivityAiReviewWorkerService } from './workers/activity-ai-review.worker';
import { FitnessAssessmentWorker } from './workers/fitness-assessment.worker';
import { ReviewWorkerService } from './workers/review.worker';

/** AI consumers. Each worker must refuse to create timers when AI is disabled. */
@Module({
  imports: [
    PrismaModule,
    AiModule,
    UsersModule,
    UserQueryModule,
    NotificationDomainModule,
    ReviewModule,
    ActivityModule,
  ],
  providers: [
    FitnessAssessmentWorker,
    ReviewWorkerService,
    ActivityAiReviewWorkerService,
  ],
})
export class AiJobsModule {}
