import { describe, expect, it, jest } from '@jest/globals';
import {
  MetricSource,
  SportType,
  UserFitnessMetricType,
  ZoneType,
} from '@prisma/client';
import {
  USER_FITNESS_INVALIDATED_EVENT,
  USER_ZONE_SETTING_CHANGED_EVENT,
  USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
  UserFitnessInvalidatedEvent,
  UserZoneSettingChangedEvent,
  UserVo2MaxSettingsChangedEvent,
  emitUserFitnessInvalidated,
  emitUserZoneSettingChanged,
  emitUserVo2MaxSettingsChanged,
} from '../events/user-fitness.events';

describe('emitUserFitnessInvalidated', () => {
  it('emits after the user metric write commits', async () => {
    const emitAsync = jest.fn(async () => []);
    const event = new UserFitnessInvalidatedEvent(
      'user-1',
      UserFitnessMetricType.LTHR,
      SportType.RUN,
      [Date.parse('2026-08-04T00:00:00.000Z')],
      MetricSource.MANUAL,
    );

    await emitUserFitnessInvalidated({ emitAsync } as never, event);

    expect(emitAsync).toHaveBeenCalledWith(
      USER_FITNESS_INVALIDATED_EVENT,
      event,
    );
  });

  it('emits after effective VO2 max settings change', async () => {
    const emitAsync = jest.fn(async () => []);
    const event = new UserVo2MaxSettingsChangedEvent('user-1');

    await emitUserVo2MaxSettingsChanged({ emitAsync } as never, event);

    expect(emitAsync).toHaveBeenCalledWith(
      USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
      event,
    );
  });

  it('emits the affected sport and zone system after a zone write commits', async () => {
    const emitAsync = jest.fn(async () => []);
    const event = new UserZoneSettingChangedEvent(
      'user-1',
      SportType.RUN,
      ZoneType.PACE,
      false,
    );

    await emitUserZoneSettingChanged({ emitAsync } as never, event);

    expect(emitAsync).toHaveBeenCalledWith(
      USER_ZONE_SETTING_CHANGED_EVENT,
      event,
    );
  });
});
