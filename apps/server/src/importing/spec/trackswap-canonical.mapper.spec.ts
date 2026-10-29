import { describe, expect, it } from '@jest/globals';
import { createHash } from 'crypto';
import {
  buildCanonicalDedupeKey,
  extractTrackSwapSubSport,
  mapCanonicalPayloadToTrackSwapActivity,
  mapTrackSwapActivityToCanonicalPayload,
  mapTrackSwapSportType,
  normalizeTrackSwapLapRecords,
} from '../source-adapters/trackswap-canonical.mapper';

describe('mapTrackSwapSportType', () => {
  it.each([
    ['running', 'RUN'],
    ['TRAIL_RUNNING', 'RUN'],
    ['walk', 'RUN'],
    ['indoor_bike', 'CYCLING'],
    ['MTB', 'CYCLING'],
    ['swimming', 'SWIM'],
    ['stretching', 'STRETCHING'],
    ['curling', 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ])('maps %s to %s', (input, expected) => {
    expect(mapTrackSwapSportType(input as never)).toBe(expected);
  });
});

describe('buildCanonicalDedupeKey', () => {
  it('is source independent for the same workout core fields', () => {
    const common = {
      sportType: 'RUN' as never,
      startTime: '2026-08-05T10:00:00.000Z',
      distance: 10000,
      elapsedTime: 3600,
    };
    expect(
      buildCanonicalDedupeKey({ sourceUid: 'manual:file-1', ...common }),
    ).toBe(
      buildCanonicalDedupeKey({ sourceUid: 'garmin:activity-1', ...common }),
    );
  });
});

describe('extractTrackSwapSubSport', () => {
  it('extracts numeric subSport aliases and ignores invalid values', () => {
    expect(extractTrackSwapSubSport({ subSport: '6' } as never)).toBe(6);
    expect(extractTrackSwapSubSport({ sub_sport: 17.9 } as never)).toBe(17);
    expect(extractTrackSwapSubSport({ subSport: -1 } as never)).toBeUndefined();
    expect(
      extractTrackSwapSubSport({ subSport: 'bad' } as never),
    ).toBeUndefined();
  });
});

describe('normalizeTrackSwapLapRecords', () => {
  it('cuts a decoder backfill tail at the first timestamp regression', () => {
    const records = normalizeTrackSwapLapRecords(
      [
        { timestamp: '2026-07-25T12:42:59.000Z', distance: 148.51 },
        { timestamp: '2026-07-25T13:44:00.000Z', distance: 10814.17 },
        // Production activity 1914 appended this end-distance record after
        // the chronological stream while its timestamp jumped back 54 min.
        { timestamp: '2026-07-25T12:43:00.000Z', distance: 10814.17 },
        { timestamp: '2026-07-25T13:47:00.000Z', distance: 10980 },
      ] as never,
      0,
    );

    expect(records.map((record) => record.distance)).toEqual([
      148.51, 10814.17,
    ]);
  });
});

describe('buildCanonicalDedupeKey', () => {
  it('is stable for the same canonical identity fields and changes when a field changes', () => {
    const base = {
      sourceUid: 'garmin:activity-1',
      sportType: 'RUN' as never,
      startTime: '2026-06-29T00:00:00.000Z',
      distance: 5000,
      elapsedTime: 1800,
    };

    expect(buildCanonicalDedupeKey(base)).toBe(
      buildCanonicalDedupeKey({ ...base }),
    );
    expect(buildCanonicalDedupeKey(base)).not.toBe(
      buildCanonicalDedupeKey({ ...base, elapsedTime: 1810 }),
    );
  });
});

describe('mapTrackSwapActivityToCanonicalPayload', () => {
  const activity = {
    sport: 'running',
    sub_sport: '6',
    activityName: 'Morning intervals',
    description: 'Track session',
    timestamp: '2026-06-29T00:00:00.000Z',
    startTime: '2026-06-29T00:05:00.000Z',
    endTime: '2026-06-29T00:40:00.000Z',
    timezone: 'Asia/Shanghai',
    totalDistance: 5000,
    totalElapsedTime: 2100,
    totalTimerTime: 2000,
    totalAscent: 20,
    totalDescent: 18,
    enhancedAscent: 21,
    enhancedDescent: 19,
    avgHeartRate: 145,
    maxHeartRate: 178,
    avgPower: 240,
    maxPower: 360,
    enhancedAvgSpeed: 3.2,
    enhancedMaxSpeed: 5.4,
    avgCadence: 82,
    maxCadence: 94,
    totalCalories: 330,
    startPositionLat: 31.2304,
    startPositionLong: 121.4737,
    endPositionLat: 31.231,
    endPositionLong: 121.474,
    laps: [
      {
        index: 2,
        sport: 'RUN',
        startTime: '2026-06-29T00:05:00.000Z',
        endTime: '2026-06-29T00:20:00.000Z',
        totalElapsedTime: 900,
        totalTimerTime: 880,
        totalDistance: 2400,
        totalCycles: 781,
        avgHeartRate: 140,
        enhancedAvgSpeed: 3,
        avgStanceTime: 252,
        avgStepLength: 1012,
        avgVerticalOscillation: 82,
        avgVerticalRatio: 8.1,
        records: [
          {
            index: 10,
            timestamp: '2026-06-29T00:06:00.000Z',
            positionLat: 31.2305,
            positionLong: 121.4738,
            distance: 200,
            speed: 3.1,
            heartRate: 138,
            power: 220,
            cadence: 80,
            totalCycles: 24,
            stepLength: 1010,
            stanceTime: 251,
            stanceTimePercent: 73.5,
            stanceTimeBalance: 50.2,
            verticalOscillation: 81,
            verticalRatio: 8,
            description: 123,
          },
        ],
        lengths: [
          {
            index: 1,
            startTime: '2026-06-29T00:05:00.000Z',
            totalElapsedTime: 30,
            totalTimerTime: 28,
            totalDistance: 50,
            totalStrokes: 12,
            swimStroke: 'FREESTYLE',
            messageIndex: 7,
          },
        ],
      },
    ],
  };

  it('derives a distinct dataset checksum for each activity in one container', () => {
    const containerChecksum = 'a'.repeat(64);
    const first = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'upload-1',
      activity: activity as never,
      sourceChecksum: containerChecksum,
      activityIndex: 0,
      activityCount: 2,
    });
    const second = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'upload-1',
      activity: { ...activity, startTime: '2026-06-29T01:05:00.000Z' } as never,
      sourceChecksum: containerChecksum,
      activityIndex: 1,
      activityCount: 2,
    });

    expect(first.source.sourceChecksum).toBe(
      createHash('sha256').update(`${containerChecksum}#0`).digest('hex'),
    );
    expect(second.source.sourceChecksum).toBe(
      createHash('sha256').update(`${containerChecksum}#1`).digest('hex'),
    );
    expect(first.source.sourceChecksum).not.toBe(second.source.sourceChecksum);
    expect(first.metadata).toMatchObject({ containerChecksum });
  });

  it('keeps the raw checksum for a single-activity container', () => {
    const containerChecksum = 'b'.repeat(64);
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'upload-2',
      activity: activity as never,
      sourceChecksum: containerChecksum,
      activityIndex: 0,
      activityCount: 1,
    });

    expect(payload.source.sourceChecksum).toBe(containerChecksum);
  });

  it('maps summary, source metadata, laps, records, and lengths into canonical payload', () => {
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'GARMIN' as never,
      provider: 'garmin' as never,
      sourceUid: 'activity-1',
      activity: activity as never,
      accountRef: 'acct-1',
      externalId: 'ext-1',
      fileName: 'run.fit',
      fileKey: 'files/run.fit',
      rawStorageKey: 'raw/run.fit',
      sourceVersion: 'v42',
      activityIndex: 1,
      metadata: { importId: 'batch-1' },
    });

    expect(payload.source).toMatchObject({
      kind: 'GARMIN',
      provider: 'garmin',
      sourceUid: 'activity-1#1',
      accountRef: 'acct-1',
      externalId: 'ext-1',
      fileName: 'run.fit',
      fileKey: 'files/run.fit',
      rawStorageKey: 'raw/run.fit',
    });
    expect(payload.identity).toMatchObject({
      sourceUid: 'activity-1#1',
      sourceVersion: 'v42',
      dedupeKey: buildCanonicalDedupeKey({
        sourceUid: 'activity-1#1',
        sportType: 'RUN' as never,
        startTime: '2026-06-29T00:05:00.000Z',
        distance: 5000,
        elapsedTime: 2100,
      }),
    });
    expect(payload.summary).toMatchObject({
      name: 'Morning intervals',
      description: 'Track session',
      sportType: 'RUN',
      subSport: 6,
      timezone: 'Asia/Shanghai',
      distance: 5000,
      elapsedTime: 2100,
      timerTime: 2000,
      avgHeartRate: 145,
      avgPower: 240,
      avgSpeed: 3.2,
      maxSpeed: 5.4,
      startLat: 31.2304,
      startLng: 121.4737,
    });
    expect(payload.laps).toEqual([
      expect.objectContaining({
        index: 2,
        sportType: 'RUN',
        elapsedTime: 900,
        timerTime: 880,
        distance: 2400,
        avgSpeed: 3,
        cycles: 781,
        avgGroundContactTime: 252,
        avgStrideLength: 1012,
        avgVerticalOscillation: 82,
        avgVerticalRatio: 8.1,
      }),
    ]);
    expect(payload.records).toEqual([
      expect.objectContaining({
        index: 10,
        lapIndex: 2,
        description: '123',
        heartRate: 138,
        power: 220,
        totalCycles: 24,
        stepLength: 1010,
        stanceTime: 251,
        stanceTimePercent: 73.5,
        stanceTimeBalance: 50.2,
        verticalOscillation: 81,
        verticalRatio: 8,
      }),
    ]);
    expect(payload.lengths).toEqual([
      expect.objectContaining({
        index: 1,
        totalDistance: 50,
        totalStrokes: 12,
        swimStroke: 'FREESTYLE',
        messageIndex: 7,
      }),
    ]);
    expect(payload.metadata).toMatchObject({
      importId: 'batch-1',
      trackswapSport: 'running',
      trackswapSubSport: 6,
      lapCount: 1,
      recordCount: 1,
      lengthCount: 1,
    });
  });

  it('infers coordinates and timezone from track records when the activity summary omits them', () => {
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'mobile-recording-fit',
      activity: {
        ...activity,
        timezone: undefined,
        startPositionLat: undefined,
        startPositionLong: undefined,
        endPositionLat: undefined,
        endPositionLong: undefined,
        laps: [
          {
            index: 1,
            records: [
              {
                timestamp: '2026-09-24T07:54:02.000Z',
                positionLat: 39.9,
                positionLong: 116.13,
              },
              {
                timestamp: '2026-09-24T08:07:57.000Z',
                positionLat: 39.91,
                positionLong: 116.14,
              },
            ],
          },
        ],
      } as never,
    });

    expect(payload.summary).toMatchObject({
      timezone: 'Asia/Shanghai',
      startLat: 39.9,
      startLng: 116.13,
      endLat: 39.91,
      endLng: 116.14,
    });
  });

  it('round-trips canonical payload back to a trackswap-like activity', () => {
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'file-1',
      activity: activity as never,
    });

    const restored = mapCanonicalPayloadToTrackSwapActivity(payload);

    expect(restored).toMatchObject({
      sport: 'RUN',
      subSport: 6,
      activityName: 'Morning intervals',
      description: 'Track session',
      startTime: '2026-06-29T00:05:00.000Z',
      totalDistance: 5000,
      avgHeartRate: 145,
      avgPower: 240,
      avgSpeed: 3.2,
    });
    expect(restored.laps).toHaveLength(1);
    expect(restored.laps[0]).toMatchObject({
      index: 2,
      sport: 'RUN',
      totalDistance: 2400,
      totalCycles: 781,
      avgStanceTime: 252,
      avgStepLength: 1012,
      avgVerticalOscillation: 82,
      avgVerticalRatio: 8.1,
      records: [
        expect.objectContaining({
          index: 10,
          heartRate: 138,
          power: 220,
          totalCycles: 24,
          stepLength: 1010,
          stanceTime: 251,
          stanceTimePercent: 73.5,
          stanceTimeBalance: 50.2,
          verticalOscillation: 81,
          verticalRatio: 8,
        }),
      ],
      lengths: [
        expect.objectContaining({
          index: 1,
          totalDistance: 50,
        }),
      ],
    });
  });

  it('preserves distinct lap indexes on records for route segmentation', () => {
    const payload = mapTrackSwapActivityToCanonicalPayload({
      kind: 'FILE' as never,
      sourceUid: 'mobile-fit-1',
      activity: {
        ...activity,
        laps: [
          {
            index: 1,
            startTime: '2026-06-29T00:05:00.000Z',
            endTime: '2026-06-29T00:20:00.000Z',
            records: [
              {
                index: 1,
                timestamp: '2026-06-29T00:05:30.000Z',
                positionLat: 31.2304,
                positionLong: 121.4737,
              },
            ],
          },
          {
            index: 2,
            startTime: '2026-06-29T00:20:00.000Z',
            endTime: '2026-06-29T00:35:00.000Z',
            records: [
              {
                index: 2,
                timestamp: '2026-06-29T00:20:30.000Z',
                positionLat: 31.231,
                positionLong: 121.474,
              },
            ],
          },
        ],
      } as never,
    });

    expect(payload.laps.map((lap) => lap.index)).toEqual([1, 2]);
    expect(payload.records.map((record) => record.lapIndex)).toEqual([1, 2]);
  });
});
