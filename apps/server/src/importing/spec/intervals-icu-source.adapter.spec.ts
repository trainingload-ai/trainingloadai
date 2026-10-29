import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mapTrackSwapActivityToCanonicalPayload } from '../source-adapters/trackswap-canonical.mapper';

// `jest.mock` 会被提升；这里必须使用 var，避免工厂执行时命中 TDZ。
// eslint-disable-next-line no-var
var mockDecodeTrackFile: jest.MockedFunction<
  (...args: unknown[]) => Promise<unknown>
>;
// eslint-disable-next-line no-var
var mockMapTrackSwapActivityToCanonicalPayload: jest.MockedFunction<
  (...args: unknown[]) => unknown
>;

jest.mock('../trackswap-file', () => {
  mockDecodeTrackFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  return {
    decodeTrackFile: mockDecodeTrackFile,
  };
});

jest.mock('../source-adapters/trackswap-canonical.mapper', () => {
  mockMapTrackSwapActivityToCanonicalPayload =
    jest.fn<(...args: unknown[]) => unknown>();
  return {
    mapTrackSwapActivityToCanonicalPayload:
      mockMapTrackSwapActivityToCanonicalPayload,
  };
});

import { IntervalsIcuSourceAdapter } from '../source-adapters/intervals-icu-source.adapter';

describe('IntervalsIcuSourceAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function activityFile(
    originalname: string,
    buffer = Buffer.from('fit-data'),
  ) {
    return {
      originalname,
      buffer,
    };
  }

  it('parses supported activity files and maps every TrackSwap activity to canonical payloads', async () => {
    const adapter = new IntervalsIcuSourceAdapter();
    const buffer = Buffer.from('tcx-data');
    const activities = [
      { activityName: 'Intervals run', sport: 'running' },
      { activityName: 'Intervals cooldown', sport: 'running' },
    ];
    mockDecodeTrackFile.mockResolvedValueOnce({
      activity: { activities },
      detectedFormat: 'tcx',
      extensionMismatch: false,
    });
    mockMapTrackSwapActivityToCanonicalPayload
      .mockReturnValueOnce({ payload: 'one' })
      .mockReturnValueOnce({ payload: 'two' });

    await expect(
      adapter.normalize({
        kind: 'INTERVALS_ICU',
        sourceUid: 'intervals_icu:user-1:activity-1',
        activityFile: activityFile('Workout.TCX', buffer) as never,
        provider: 'intervals_icu' as never,
        accountRef: '0',
        externalId: 'activity-1',
        fileKey: 'activities/workout.tcx',
        rawStorageKey: 'raw/workout.tcx',
        metadata: { importId: 'import-1' },
      }),
    ).resolves.toEqual({
      sourceUid: 'intervals_icu:user-1:activity-1',
      sourceKind: 'INTERVALS_ICU',
      metadata: {
        importId: 'import-1',
        detectedFormat: 'tcx',
        extensionMismatch: false,
        originalFileName: 'Workout.TCX',
        parsedActivityCount: 2,
      },
      payloads: [{ payload: 'one' }, { payload: 'two' }],
    });

    expect(mockDecodeTrackFile).toHaveBeenCalledWith(buffer, {
      filename: 'Workout.TCX',
    });
    expect(mapTrackSwapActivityToCanonicalPayload).toHaveBeenNthCalledWith(1, {
      kind: 'INTERVALS_ICU',
      sourceUid: 'intervals_icu:user-1:activity-1',
      activity: activities[0],
      provider: 'intervals_icu',
      accountRef: '0',
      externalId: 'activity-1',
      fileName: 'Workout.TCX',
      fileKey: 'activities/workout.tcx',
      rawStorageKey: 'raw/workout.tcx',
      sourceChecksum: undefined,
      metadata: { importId: 'import-1' },
      activityIndex: 0,
      activityCount: 2,
    });
    expect(mapTrackSwapActivityToCanonicalPayload).toHaveBeenNthCalledWith(2, {
      kind: 'INTERVALS_ICU',
      sourceUid: 'intervals_icu:user-1:activity-1',
      activity: activities[1],
      provider: 'intervals_icu',
      accountRef: '0',
      externalId: 'activity-1',
      fileName: 'Workout.TCX',
      fileKey: 'activities/workout.tcx',
      rawStorageKey: 'raw/workout.tcx',
      sourceChecksum: undefined,
      metadata: { importId: 'import-1' },
      activityIndex: 1,
      activityCount: 2,
    });
  });

  it('defaults provider to intervals_icu when mapping parsed activities', async () => {
    const adapter = new IntervalsIcuSourceAdapter();
    mockDecodeTrackFile.mockResolvedValueOnce({
      activity: {
        activities: [{ activityName: 'Ride', sport: 'cycling' }],
      },
      detectedFormat: 'fit',
      extensionMismatch: false,
    });
    mockMapTrackSwapActivityToCanonicalPayload.mockReturnValueOnce({
      payload: 'ride',
    });

    await adapter.normalize({
      kind: 'INTERVALS_ICU',
      sourceUid: 'intervals_icu:user-1:activity-2',
      activityFile: activityFile('ride.fit') as never,
    });

    expect(mockDecodeTrackFile).toHaveBeenCalledWith(Buffer.from('fit-data'), {
      filename: 'ride.fit',
    });
    expect(mapTrackSwapActivityToCanonicalPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'intervals_icu',
        fileName: 'ride.fit',
      }),
    );
  });

  it('rejects a mismatched source kind before parsing', async () => {
    const adapter = new IntervalsIcuSourceAdapter();

    await expect(
      adapter.normalize({
        kind: 'COROS',
        sourceUid: 'wrong-kind',
        activityFile: activityFile('workout.fit') as never,
      } as never),
    ).rejects.toThrow('Intervals.icu 适配器不支持该来源类型：COROS');

    expect(mockDecodeTrackFile).not.toHaveBeenCalled();
  });

  it('rejects parsed files with no activities', async () => {
    const adapter = new IntervalsIcuSourceAdapter();
    mockDecodeTrackFile.mockResolvedValueOnce({
      activity: { activities: [] },
      detectedFormat: 'gpx',
      extensionMismatch: false,
    });

    await expect(
      adapter.normalize({
        kind: 'INTERVALS_ICU',
        sourceUid: 'empty-file',
        activityFile: activityFile('empty.gpx') as never,
      }),
    ).rejects.toThrow('Intervals.icu 活动文件中没有找到活动');
  });
});
