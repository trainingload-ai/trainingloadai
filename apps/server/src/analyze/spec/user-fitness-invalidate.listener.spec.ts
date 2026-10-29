import { describe, expect, it, jest } from '@jest/globals';
import { MetricSource, SportType, UserFitnessMetricType } from '@prisma/client';
import {
  USER_FITNESS_INVALIDATED_EVENT,
  USER_VO2_MAX_SETTINGS_CHANGED_EVENT,
} from '@/api/user/events/user-fitness.events';
import { UserFitnessInvalidateListener } from '../user-fitness-invalidate.listener';

describe('UserFitnessInvalidateListener', () => {
  it('enqueues a recompute job after a fitness metric change when the product flag is on', async () => {
    const scheduleFitnessMetricChangeRecompute = jest.fn(async () => ({
      scheduled: true,
    }));
    const listener = new UserFitnessInvalidateListener(
      {
        mapFitnessMetricTypeToRecomputeType: () => 'LTHR',
        scheduleFitnessMetricChangeRecompute,
      } as never,
      {
        fitnessMetricActivityRecomputeEnabled: true,
        isAutoUpdateMetricSupported: () => true,
      } as never,
      {} as never,
    );

    await listener.handle({
      userId: 'user-1',
      metricType: UserFitnessMetricType.LTHR,
      sportType: SportType.RUN,
      changedTimes: [Date.parse('2026-08-04T00:00:00.000Z')],
      source: MetricSource.MANUAL,
    });

    expect(scheduleFitnessMetricChangeRecompute).toHaveBeenCalledWith({
      userId: 'user-1',
      metricType: 'LTHR',
      originalType: UserFitnessMetricType.LTHR,
      sportType: SportType.RUN,
      changedTimes: [Date.parse('2026-08-04T00:00:00.000Z')],
    });
    expect(USER_FITNESS_INVALIDATED_EVENT).toBe('user.fitnessInvalidated');
  });

  it('does not enqueue when activity recompute is disabled', async () => {
    const scheduleFitnessMetricChangeRecompute = jest.fn(async () => ({
      scheduled: true,
    }));
    const listener = new UserFitnessInvalidateListener(
      {
        mapFitnessMetricTypeToRecomputeType: () => 'LTHR',
        scheduleFitnessMetricChangeRecompute,
      } as never,
      {
        fitnessMetricActivityRecomputeEnabled: false,
        isAutoUpdateMetricSupported: () => true,
      } as never,
      {} as never,
    );

    await listener.handle({
      userId: 'user-1',
      metricType: UserFitnessMetricType.LTHR,
      sportType: SportType.RUN,
      changedTimes: [1],
      source: MetricSource.MANUAL,
    });

    expect(scheduleFitnessMetricChangeRecompute).not.toHaveBeenCalled();
  });

  it('refreshes the canonical VO2 max immediately after its settings change', async () => {
    const updateGlobalMetrics = jest.fn(async () => undefined);
    const listener = new UserFitnessInvalidateListener(
      {} as never,
      { fitnessMetricActivityRecomputeEnabled: false } as never,
      { updateGlobalMetrics } as never,
    );

    await listener.handleVo2MaxSettingsChanged({ userId: 'user-1' });

    expect(updateGlobalMetrics).toHaveBeenCalledWith('user-1');
    expect(USER_VO2_MAX_SETTINGS_CHANGED_EVENT).toBe(
      'user.vo2MaxSettingsChanged',
    );
  });
});
