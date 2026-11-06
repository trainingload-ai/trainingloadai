import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MetricSource } from '@prisma/client';
import {
  USER_FITNESS_CONTEXT_CHANGED_EVENT,
  USER_FITNESS_INVALIDATED_EVENT,
  USER_ZONE_SETTING_CHANGED_EVENT,
  type UserFitnessContextChangedEvent,
  type UserFitnessInvalidatedEvent,
  type UserZoneSettingChangedEvent,
} from '@/api/user/events/user-fitness.events';
import { ActivityRecomputeJobService } from './activity-recompute-job.service';
import { UserService } from '@/api/user/user.service';

@Injectable()
export class UserFitnessInvalidateListener {
  private readonly logger = new Logger(UserFitnessInvalidateListener.name);

  constructor(
    private readonly jobs: ActivityRecomputeJobService,
    private readonly users: UserService,
  ) {}

  // VO2 source/correction settings are versioned analysis configuration.
  // They apply to activities from the change time forward and deliberately do
  // not reinterpret old activities or append a wall-clock "final" VO2 value.

  @OnEvent(USER_ZONE_SETTING_CHANGED_EVENT, { suppressErrors: false })
  async handleZoneSettingChanged(event: UserZoneSettingChangedEvent) {
    await this.jobs.scheduleContextChangeRecompute({
      userId: event.userId,
      contextType: `ZONE_${event.zoneType}` as
        | 'ZONE_HEART_RATE'
        | 'ZONE_POWER'
        | 'ZONE_PACE',
      sportType: event.sportType,
      changedTimes: [event.changedAt.getTime()],
      triggerPayload: {
        zoneType: event.zoneType,
        deleted: event.deleted,
      },
    });
  }

  @OnEvent(USER_FITNESS_CONTEXT_CHANGED_EVENT, { suppressErrors: false })
  async handleFitnessContextChanged(event: UserFitnessContextChangedEvent) {
    if (event.changedTimes.length === 0) return;
    await this.jobs.scheduleContextChangeRecompute({
      userId: event.userId,
      contextType: 'PROFILE',
      changedTimes: event.changedTimes,
      triggerPayload: {
        contextType: event.contextType,
        bodyMetricTypes: event.bodyMetricTypes,
      },
    });
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
