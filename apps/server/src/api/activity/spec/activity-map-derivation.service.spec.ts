import { describe, expect, it, jest } from '@jest/globals';
import { ActivityMapDerivationService } from '../activity-map-derivation.service';

describe('ActivityMapDerivationService', () => {
  it('serves the ordered polyline cache without reading Parquet again', async () => {
    const prisma = {
      activity: {
        findFirst: jest.fn(async () => ({ id: 7, userId: 'user-1' })),
      },
      $queryRaw: jest.fn(async () => [
        { polyline: 'encoded-a' },
        { polyline: 'encoded-b' },
      ]),
      activityPolyline: { findFirst: jest.fn() },
    };
    const sensorData = { getActivitiesLocationData: jest.fn() };
    const thumbJobs = { enqueueForActivity: jest.fn(async () => undefined) };
    const service = new ActivityMapDerivationService(
      prisma as never,
      sensorData as never,
      thumbJobs as never,
      { t: jest.fn((key: string) => key) } as never,
    );

    await expect(service.getActivityLayerByHash('hash-7')).resolves.toEqual({
      maps: [
        { hashId: 'hash-7', polyline: 'encoded-a' },
        { hashId: 'hash-7', polyline: 'encoded-b' },
      ],
    });
    expect(sensorData.getActivitiesLocationData).not.toHaveBeenCalled();
    expect(thumbJobs.enqueueForActivity).toHaveBeenCalledWith({
      activityId: 7,
      userId: 'user-1',
      hashId: 'hash-7',
      polylines: ['encoded-a', 'encoded-b'],
    });
  });

  it('keeps Demo map reads scoped to the owner and side-effect free', async () => {
    const findFirst = jest.fn(async () => ({ id: 7, userId: 'demo-owner' }));
    const prisma = {
      activity: { findFirst },
      $queryRaw: jest.fn(async () => [{ polyline: 'encoded-demo' }]),
      activityPolyline: { findFirst: jest.fn() },
    };
    const sensorData = { getActivitiesLocationData: jest.fn() };
    const thumbJobs = { enqueueForActivity: jest.fn(async () => undefined) };
    const service = new ActivityMapDerivationService(
      prisma as never,
      sensorData as never,
      thumbJobs as never,
      { t: jest.fn((key: string) => key) } as never,
    );

    await expect(
      service.getActivityLayerByHash('hash-7', 100, {
        userId: 'demo-owner',
        readOnly: true,
      }),
    ).resolves.toEqual({
      maps: [{ hashId: 'hash-7', polyline: 'encoded-demo' }],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              hashId: 'hash-7',
              userId: 'demo-owner',
            }),
          ]),
        }),
      }),
    );
    expect(sensorData.getActivitiesLocationData).not.toHaveBeenCalled();
    expect(thumbJobs.enqueueForActivity).not.toHaveBeenCalled();
  });

  it('does not fail the post-import path when thumbnail scheduling fails', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [{ polyline: 'encoded-route' }]),
      activityPolyline: { findFirst: jest.fn() },
    };
    const sensorData = { getActivitiesLocationData: jest.fn() };
    const thumbJobs = {
      enqueueForActivity: jest.fn(async () => {
        throw new Error('map renderer unavailable');
      }),
    };
    const service = new ActivityMapDerivationService(
      prisma as never,
      sensorData as never,
      thumbJobs as never,
      { t: jest.fn((key: string) => key) } as never,
    );

    await expect(
      service.scheduleAfterSensorImport({
        id: 7,
        userId: 'user-1',
        hashId: 'hash-7',
      }),
    ).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(thumbJobs.enqueueForActivity).toHaveBeenCalledTimes(1);
  });
});
