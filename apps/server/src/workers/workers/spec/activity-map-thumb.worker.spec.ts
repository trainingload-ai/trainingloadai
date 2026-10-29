import { describe, expect, it, jest } from '@jest/globals';
import {
  ActivityMapThumbWorkerService,
  buildPolylineCandidates,
} from '../activity-map-thumb.worker';
import { resolveActivityMapThumbProvider } from '@/maps/activity-map-thumbnail-provider';

type MapThumbInternals = {
  markSuccess(
    job: { id: string; activityId: number; lockToken: string },
    payload: {
      r2Key: string;
      r2Url: string;
      darkR2Key: string;
      darkR2Url: string;
    },
  ): Promise<boolean>;
};

describe('activity map thumbnail polyline candidates', () => {
  it('does not start the Mapbox worker when the maps capability is disabled', () => {
    const interval = jest.spyOn(global, 'setInterval');
    const worker = new ActivityMapThumbWorkerService(
      {} as never,
      {
        get: jest.fn((key: string) => {
          if (key === 'activityMapThumbWorker.enabled') return true;
          if (key === 'activityMapThumbWorker.provider') return 'mapbox';
          return undefined;
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        snapshot: () => ({
          capabilities: {
            maps: { state: 'disabled', provider: 'none' },
          },
        }),
      } as never,
    );

    worker.onModuleInit();

    expect(interval).not.toHaveBeenCalled();
    interval.mockRestore();
  });

  it('defaults self-host thumbnails to the local renderer', () => {
    expect(
      resolveActivityMapThumbProvider({ SELF_HOST_MODE: 'core-local' }),
    ).toBe('local');
    expect(resolveActivityMapThumbProvider({})).toBe('mapbox');
    expect(
      resolveActivityMapThumbProvider(
        { SELF_HOST_MODE: 'core-local' },
        'mapbox',
      ),
    ).toBe('mapbox');
  });

  it('keeps every route segment separate at every sampling level', async () => {
    const mapboxPolyline = await import('@mapbox/polyline');
    const first = mapboxPolyline.encode([
      [31.2304, 121.4737],
      [31.231, 121.4744],
      [31.232, 121.4751],
    ]);
    const second = mapboxPolyline.encode([
      [31.24, 121.48],
      [31.241, 121.481],
      [31.242, 121.482],
    ]);

    const candidates = await buildPolylineCandidates([first, second]);

    expect(candidates[0]).toEqual([first, second]);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.every((candidate) => candidate.length === 2)).toBe(true);
  });

  it('fence 提交失败时回收已经上传但未挂载的两个对象', async () => {
    const prisma = { $executeRaw: jest.fn(async () => 0) };
    const enqueueObjects = jest.fn(async () => undefined);
    const worker = new ActivityMapThumbWorkerService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueueObjects } as never,
    );

    await expect(
      (worker as unknown as MapThumbInternals).markSuccess(
        {
          id: 'job-1',
          activityId: 42,
          lockToken: 'stale-token',
        },
        {
          r2Key: 'maps/light.webp',
          r2Url: 'https://example/light.webp',
          darkR2Key: 'maps/dark.webp',
          darkR2Url: 'https://example/dark.webp',
        },
      ),
    ).resolves.toBe(false);
    expect(enqueueObjects).toHaveBeenCalledWith(
      [
        {
          activityId: 42,
          objectKey: 'maps/light.webp',
          bucket: 'public',
        },
        {
          activityId: 42,
          objectKey: 'maps/dark.webp',
          bucket: 'public',
        },
      ],
      'activity_map_thumbnail_fence_rejected',
    );
  });
});
