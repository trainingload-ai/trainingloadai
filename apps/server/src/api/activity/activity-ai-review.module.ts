import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/api/user/user.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { AiUsageModule } from '@/api/ai/ai-usage.module';
import { PMCModule } from '@/training-load/pmc.module';
import { ActivityAiReviewService } from './activity-ai-review.service';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { LoadReadoutModule } from './load-readout.module';

/**
 * 活动 AI 复盘能力模块。
 *
 * 复盘查询同时被 Activity API 和第三方平台同步使用，独立成无反向业务依赖的
 * 小模块，避免集成模块为一个查询能力依赖整个 ActivityModule。
 */
@Module({
  imports: [
    PrismaModule,
    AiUsageModule,
    UsersModule,
    UserQueryModule,
    PMCModule,
    AiDataConsentModule,
    LoadReadoutModule,
  ],
  providers: [ActivityAiReviewService],
  exports: [ActivityAiReviewService],
})
export class ActivityAiReviewModule {}
