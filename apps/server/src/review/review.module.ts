import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/api/user/user.module';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { ReviewCronService } from './review-cron.service';
import { ReviewDigestService } from './review-digest.service';
import { CoachDailyReviewRuntimeService } from './coach-daily-review-runtime.service';
import { CoachPeriodReviewRuntimeService } from './coach-period-review-runtime.service';
import { CoachCycleReviewRuntimeService } from './coach-cycle-review-runtime.service';
import { PlanModule } from '@/api/plan/plan.module';
import { AiModule } from '@/api/ai/ai.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { ReviewDigestQueryModule } from './review-digest-query.module';
import { ReviewDigestRepository } from './persistence/review-digest.repository';
import { CoachReviewContextService } from './coach-review-context.service';
import { WorkoutModule } from '@/api/workout/workout.module';
import { PMCModule } from '@/training-load/pmc.module';
import { CoachReviewAdjustmentService } from './coach-review-adjustment.service';
import { ReviewDigestContextService } from './review-digest-context.service';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { ReviewModelCallGuard } from './review-model-call-guard';
import { AthleteStateDecisionService } from './athlete-state-decision.service';
import { AthleteStateMemoryDecisionInvalidationService } from './athlete-state-memory-decision-invalidation.service';

/**
 * 复盘模块：活动摘要 Digest + Coach Runtime（计划执行思考）。
 *
 * 两套产物共享同一套计划执行事实，但职责不要混：
 * - Digest：日/周/月用户可见训练复盘 + 通知，只解释事实与下一阶段关注点。
 * - Runtime（新）：复盘时刻替教练想一轮。思考写入 CoachEvent(REVIEW_*)，
 *   要改计划时再开 CoachDecision，用户确认后才落地 PlanWorkout。
 *
 * Runtime 文件分工：
 * - coach-daily-review-runtime.service.ts   日复盘：昨天漏练 → 是否推迟明天
 * - coach-period-review-runtime.service.ts  周/月复盘：窗口内未完成或疲劳 → 是否推迟下一练
 * - coach-cycle-review-runtime.service.ts   计划完成后：是否开启下一计划（监听 plan.finalized）
 *
 * 后台模型调用统一经过 review-model-call-guard.ts：单次调用硬超时；同一小时内
 * 连续 3 次失败（异常/超时/无 usage）即停止本轮，剩余任务由 worker 顺延到下一个整点。
 *
 * 不要让 PlanModule 静态 import 本模块。
 */
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    NotificationDomainModule,
    PlanModule,
    AiModule,
    LoadReadoutModule,
    WorkoutModule,
    PMCModule,
    ReviewDigestQueryModule,
    AiDataConsentModule,
    // ScheduleModule.forRoot() 只由 Managed/Self-host 组合入口初始化。
    ScheduleModule,
  ],
  providers: [
    ReviewCronService,
    ReviewDigestRepository,
    ReviewDigestContextService,
    ReviewDigestService,
    CoachDailyReviewRuntimeService,
    CoachPeriodReviewRuntimeService,
    CoachCycleReviewRuntimeService,
    CoachReviewContextService,
    CoachReviewAdjustmentService,
    ReviewModelCallGuard,
    AthleteStateDecisionService,
    AthleteStateMemoryDecisionInvalidationService,
  ],
  exports: [
    ReviewDigestService,
    CoachDailyReviewRuntimeService,
    CoachPeriodReviewRuntimeService,
    CoachCycleReviewRuntimeService,
    // 进程内单例：worker 与各复盘模型调用共享同一个“连续失败”计数。
    ReviewModelCallGuard,
  ],
})
export class ReviewModule {}
