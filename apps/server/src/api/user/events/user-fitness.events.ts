import type { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  MetricSource,
  SportType,
  UserFitnessMetricType,
  ZoneType,
} from '@prisma/client';

/**
 * 用户阈值/体能指标变更后发出。Analyze listener 再决定是否入队复算。
 * Users 不得注入 ActivityRecomputeJobService。
 */
export const USER_FITNESS_INVALIDATED_EVENT = 'user.fitnessInvalidated';
export const USER_VO2_MAX_SETTINGS_CHANGED_EVENT = 'user.vo2MaxSettingsChanged';
export const USER_ZONE_SETTING_CHANGED_EVENT = 'user.zoneSettingChanged';

export class UserFitnessInvalidatedEvent {
  constructor(
    public readonly userId: string,
    public readonly metricType: UserFitnessMetricType,
    public readonly sportType: SportType | undefined,
    public readonly changedTimes: number[],
    public readonly source?: MetricSource,
  ) {}
}

export class UserVo2MaxSettingsChangedEvent {
  constructor(public readonly userId: string) {}
}

export class UserZoneSettingChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly sportType: SportType,
    public readonly zoneType: ZoneType,
    public readonly deleted: boolean,
  ) {}
}

export async function emitUserFitnessInvalidated(
  events: EventEmitter2 | undefined,
  event: UserFitnessInvalidatedEvent,
) {
  if (!events) return;
  await events.emitAsync(USER_FITNESS_INVALIDATED_EVENT, event);
}

export async function emitUserVo2MaxSettingsChanged(
  events: EventEmitter2 | undefined,
  event: UserVo2MaxSettingsChangedEvent,
) {
  if (!events) return;
  await events.emitAsync(USER_VO2_MAX_SETTINGS_CHANGED_EVENT, event);
}

export async function emitUserZoneSettingChanged(
  events: EventEmitter2 | undefined,
  event: UserZoneSettingChangedEvent,
) {
  if (!events) return;
  await events.emitAsync(USER_ZONE_SETTING_CHANGED_EVENT, event);
}
