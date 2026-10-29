import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MetricSource } from '@prisma/client';
import {
  USER_FITNESS_INVALIDATED_EVENT,
  USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
  type UserFitnessInvalidatedEvent,
  type UserVo2MaxSettingsChangedEvent,
} from '@/api/user/events/user-fitness.events';
import { ActivityRecomputeJobService } from './activity-recompute-job.service';
import { UserService } from '@/api/user/user.service';
import { AnalyzeFitnessOrchestratorService } from './analyze-fitness-orchestrator.service';

@Injectable()
export class UserFitnessInvalidateListener {
  private readonly logger = new Logger(UserFitnessInvalidateListener.name);

  constructor(
    private readonly jobs: ActivityRecomputeJobService,
    private readonly users: UserService,
    private readonly fitness: AnalyzeFitnessOrchestratorService,
  ) {}

  @OnEvent(USER_VO2_MAX_SETTINGS_CHANGED_EVENT)
  async handleVo2MaxSettingsChanged(event: UserVo2MaxSettingsChangedEvent) {
    await this.fitness.updateGlobalMetrics(event.userId);
  }

  // emitAsync callers must observe enqueue failures so durable outboxes can retry.
  @OnEvent(USER_FITNESS_INVALIDATED_EVENT, { suppressErrors: false })
  async handle(event: UserFitnessInvalidatedEvent) {
    if (!this.users.fitnessMetricActivityRecomputeEnabled) {
      return;
    }
    const shouldTrigger =
      !event.source ||
      event.source === MetricSource.MANUAL ||
      (event.source === MetricSource.AUTO &&
        this.users.isAutoUpdateMetricSupported(event.metricType));
    if (!shouldTrigger) {
      this.logger.debug(
        `[增量复算] 指标来源不触发，跳过：用户ID=${event.userId}, 类型=${event.metricType}, 来源=${event.source}`,
      );
      return;
    }
    const metricType = this.jobs.mapFitnessMetricTypeToRecomputeType(
      event.metricType,
    );
    if (!metricType) {
      this.logger.debug(
        `[增量复算] 指标不支持复算类型，跳过：用户ID=${event.userId}, 类型=${event.metricType}`,
      );
      return;
    }
    if (event.changedTimes.length === 0) return;
    const result = await this.jobs.scheduleFitnessMetricChangeRecompute({
      userId: event.userId,
      metricType,
      originalType: event.metricType,
      sportType: event.sportType,
      changedTimes: event.changedTimes,
    });
    if (!result.scheduled) {
      this.logger.log(
        `[增量复算] 未创建夜间任务：用户ID=${event.userId}, 类型=${metricType}, 原因=${result.reason}`,
      );
    }
  }
}
