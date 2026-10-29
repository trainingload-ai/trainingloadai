import { $Enums } from '@prisma/client';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserService } from '@/api/user/user.service';
import { parseAiReviewModeFeatures } from '@/api/ai/review-mode-features.util';
import {
  PLAN_COMPLETED_EVENT,
  type PlanCompletedEvent,
} from '@/api/plan/events/plan.events';
import { NotificationDomainService } from './notification-domain.service';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';

@Injectable()
export class PlanCompletedListener {
  private readonly logger = new Logger(PlanCompletedListener.name);

  constructor(
    private readonly notifications: NotificationDomainService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    users: UserQueryService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
  ) {
    this.users = users;
  }

  private readonly users: UserQueryService;

  @OnEvent(PLAN_COMPLETED_EVENT)
  async handle(event: PlanCompletedEvent) {
    try {
      await this.ensureCompletedPlanReviewNotification(event);
    } catch (error) {
      this.logger.error(
        `[plan.completed] failed to publish review notification userId=${event.userId} planId=${event.planId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async ensureCompletedPlanReviewNotification(event: PlanCompletedEvent) {
    const settings = await this.users.settings().findMany({
      where: {
        userId: event.userId,
        category: {
          in: [$Enums.SettingCategory.AI_REVIEW_MODE],
        },
      },
      select: { category: true, value: true },
    });
    const settingByCategory = new Map(
      settings.map((setting) => [String(setting.category), setting.value]),
    );
    const access = await this.featureAccess.evaluate(event.userId, [
      'ai.planAdvice',
    ]);
    if (!access.features['ai.planAdvice'].allowed) {
      return;
    }
    if (
      !parseAiReviewModeFeatures(settingByCategory.get('AI_REVIEW_MODE'))
        .planReview
    ) {
      return;
    }

    const lang = await this.userService.getPreferredLocale(event.userId);
    await this.notifications.ensureNotification({
      userId: event.userId,
      kind: 'REVIEW_DIGEST',
      dedupeKey: `plan-review:${event.planId}`,
      title: this.i18n.t('common.notification.reviewDigest.titlePlanReady', {
        lang,
        args: { planTitle: event.planTitle },
      }),
      bodyMarkdown: this.i18n.t(
        'common.notification.reviewDigest.bodyPlanReady',
        {
          lang,
          args: {
            planTitle: event.planTitle,
            completionRate: event.completionRate,
            complianceRate:
              event.complianceRate == null ? '—' : `${event.complianceRate}%`,
            doneCount: event.doneCount,
            workoutCount: event.workoutCount,
            skippedCount: event.skippedCount,
            movedCount: event.movedCount,
          },
        },
      ),
      data: {
        type: 'PLAN',
        planId: event.planId,
        planTitle: event.planTitle,
        periodStart: event.periodStart?.toISOString() ?? null,
        periodEnd: event.periodEnd?.toISOString() ?? null,
        completionRate: event.completionRate,
        complianceRate: event.complianceRate,
        doneCount: event.doneCount,
        workoutCount: event.workoutCount,
        skippedCount: event.skippedCount,
        movedCount: event.movedCount,
        progressLabel: event.progressLabel,
      },
    });
  }
}
