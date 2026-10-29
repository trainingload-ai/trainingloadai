import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/api/activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));

jest.mock('@/api/pace/pace.service', () => ({
  PaceService: class PaceService {},
}));

import { CoachToolsService } from '../coach-tools.service';

describe('CoachToolsService activity summaries', () => {
  it('exposes the authoritative feed load alongside legacy metrics', async () => {
    const getRecentActivitiesForAi = jest.fn(async () => [
      {
        id: 2415,
        hashId: 'activity-2415',
        sportType: 'RUN',
        startTime: new Date('2026-09-26T09:16:00.000Z'),
        timerTime: 3324,
        distance: 10_010,
        avgHeartRate: 162,
        avgPower: 285,
        aiLoad: 51.6,
        aiLoadSource: 'PACE',
        coggan: { bikeStress: 0 },
        trimp: { trimp100: 52 },
        vo2max: null,
      },
    ]);
    const service = new CoachToolsService(
      {
        getMapThumbnailUrlsForAi: jest.fn(async () => new Map()),
      } as never,
      { getRecentActivitiesForAi } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.recentActivities(
      {
        session: { user: { id: 'user-1' } },
        i18n: { t: (key: string) => key },
        userService: {
          getComposedUserProfile: jest.fn(async () => ({})),
        },
      } as never,
      { limit: 10 },
    );

    expect(result.items[0]).toMatchObject({
      hashId: 'activity-2415',
      load: 52,
      loadSource: 'PACE',
      tss: 0,
      trimp: 52,
    });
  });
});

describe('CoachToolsService zone range priorities', () => {
  function createService() {
    return new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function createCtx(overrides?: {
    paceZones?: unknown[];
    heartRateZones?: unknown[];
    powerZones?: unknown[];
    profile?: Record<string, unknown>;
    activities?: unknown[];
  }) {
    const zones = {
      pace: overrides?.paceZones ?? [],
      heartRate: overrides?.heartRateZones ?? [],
      power: overrides?.powerZones ?? [],
    };

    return {
      session: { user: { id: 'user-1' } },
      i18n: { t: jest.fn((key: string) => key) },
      prisma: {
        activity: {
          findMany: jest.fn(async () => overrides?.activities ?? []),
        },
      },
      activities: {
        findMany: jest.fn(async () => overrides?.activities ?? []),
      },
      userService: {
        getFitnessMetricPairs: jest.fn(async () => ({
          manual: {},
          estimated: {},
          automatic: {},
          effective: {},
          effectiveDetails: {},
        })),
        listAutoUpdateConfigs: jest.fn(async () => []),
        isAutoUpdateMetricSupported: jest.fn(() => true),
        getComposedUserProfile: jest.fn(async () => ({
          ftp: 250,
          cp: null,
          maxHeartRate: 190,
          lthr: 172,
          tp: 4,
          cs: null,
          vo2max: null,
          restingHeartRate: 48,
          ...overrides?.profile,
        })),
        getZoneSourceStatus: jest.fn(async () => ({
          heartRate: {
            configured: zones.heartRate.length > 0,
            source: zones.heartRate.length > 0 ? 'derived' : 'none',
            zoneCount: zones.heartRate.length,
          },
          pace: {
            configured: zones.pace.length > 0,
            source: zones.pace.length > 0 ? 'derived' : 'none',
            zoneCount: zones.pace.length,
          },
          power: {
            configured: zones.power.length > 0,
            source: zones.power.length > 0 ? 'derived' : 'none',
            zoneCount: zones.power.length,
          },
        })),
        getPaceZoneSettingResolved: jest.fn(async () => ({
          benchmark: 'TP',
          zones: zones.pace,
        })),
        getHeartRateZoneSetting: jest.fn(async () => ({
          benchmark: 'LTHR',
          zones: zones.heartRate,
        })),
        getPowerZoneSettingResolved: jest.fn(async () => ({
          benchmark: 'FTP',
          zones: zones.power,
        })),
      },
    } as never;
  }

  it('includes body measurements in the current athlete profile', async () => {
    const result = await createService().profileCurrent(
      createCtx({
        profile: {
          age: 36,
          gender: 'MALE',
          height: 178.4,
          weight: 70.2,
        },
      }),
      { sportType: 'RUN' },
    );

    expect(result.demographics).toEqual({ age: 36, gender: 'MALE' });
    expect(result.body).toEqual({ heightCm: 178.4, weightKg: 70.2 });
  });

  it('reports the AUTO FTP as effective when it is newer than the manual FTP', async () => {
    const result = await createService().metricCurrent(
      {
        session: { user: { id: 'user-1' } },
        i18n: { t: (key: string) => key },
        userService: {
          getComposedUserProfile: jest.fn(async () => ({ ftp: 71 })),
          getFitnessMetricPairs: jest.fn(async () => ({
            manual: { FTP: 120 },
            estimated: { FTP: 71 },
            automatic: { FTP: 71 },
            effective: { FTP: 71 },
            effectiveDetails: {
              FTP: {
                value: 71,
                source: 'AUTO',
                recordedAt: new Date('2026-08-02T00:00:00.000Z'),
              },
            },
          })),
          listAutoUpdateConfigs: jest.fn(async () => [
            { metric: 'FTP', enabled: true },
          ]),
          isAutoUpdateMetricSupported: jest.fn(() => true),
        },
      } as never,
      { sportType: 'CYCLING', metrics: ['ftp', 'eftp'] },
    );

    expect(result.selectionPolicy).toMatchObject({
      precedence: 'NEWEST_RECORDED_AT',
      tieBreaker: 'MANUAL',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        metric: 'ftp',
        manual: 120,
        estimated: 71,
        automatic: 71,
        effectiveCurrent: 71,
        effectiveSource: 'AUTO',
        effectiveRecordedAt: '2026-08-02',
        autoUpdateEnabled: true,
        estimatedOnly: false,
      }),
      expect.objectContaining({
        metric: 'eftp',
        estimated: 71,
        effectiveCurrent: 71,
        effectiveSource: 'ESTIMATED',
        estimatedOnly: true,
      }),
    ]);
  });

  it('uses the authoritative effective record in metric comparisons', async () => {
    const metric = (
      source: 'MANUAL' | 'ESTIMATED' | 'AUTO',
      value: number,
      date: string,
    ) => ({
      source,
      value,
      recordedAt: new Date(`${date}T00:00:00.000Z`),
    });
    const manual = metric('MANUAL', 120, '2026-08-01');
    const estimated = metric('ESTIMATED', 71, '2026-08-02');
    const automatic = metric('AUTO', 71, '2026-08-02');
    const getUserFitnessMetric = jest.fn(
      async (
        _userId: string,
        _type: string,
        _at: Date | undefined,
        _sport: string,
        source: 'MANUAL' | 'ESTIMATED' | 'AUTO',
      ) => ({ MANUAL: manual, ESTIMATED: estimated, AUTO: automatic })[source],
    );

    const result = await createService().metricCompare(
      {
        session: { user: { id: 'user-1' } },
        i18n: { t: (key: string) => key },
        userService: {
          isAutoUpdateMetricSupported: jest.fn(() => true),
          checkAutoUpdatePermission: jest.fn(async () => true),
          getUserFitnessMetric,
          getEffectiveUserFitnessMetric: jest.fn(async () => automatic),
        },
      } as never,
      { metric: 'ftp', sportType: 'CYCLING' },
    );

    expect(result).toMatchObject({
      manualCurrent: { value: 120, recordedAt: '2026-08-01' },
      estimatedCurrent: { value: 71, recordedAt: '2026-08-02' },
      automaticCurrent: { value: 71, recordedAt: '2026-08-02' },
      effectiveCurrent: 71,
      effectiveSource: 'AUTO',
      effectiveRecordedAt: '2026-08-02',
      autoUpdate: { supported: true, enabled: true },
    });
  });

  it('recommends power zones first for cycling when power zones exist', async () => {
    const result = await createService().zoneRangesProfile(
      createCtx({
        heartRateZones: [{ order: 2, min: 130, max: 145 }],
        powerZones: [{ order: 2, min: 56, max: 75 }],
      }),
      { sportType: 'CYCLING' },
    );

    expect(result.priority).toEqual(['power', 'heartRate', 'pace']);
    expect(result.availablePriority).toEqual(['power', 'heartRate']);
    expect(result.recommendedMetric).toBe('power');
  });

  it('recommends pace zones first for run workouts when pace zones exist', async () => {
    const result = await createService().zoneRangesProfile(
      createCtx({
        paceZones: [{ order: 2, min: 0.0029, max: 0.0033 }],
        powerZones: [{ order: 2, min: 56, max: 75 }],
      }),
      { sportType: 'RUN' },
    );

    expect(result.priority).toEqual(['pace', 'heartRate', 'power']);
    expect(result.availablePriority).toEqual(['pace', 'power']);
    expect(result.recommendedMetric).toBe('pace');
  });

  it('chooses cycling power zones when power zones and recent power data are usable', async () => {
    const result = await createService().workoutIntensityStrategy(
      createCtx({
        powerZones: [
          { order: 1, min: 0, max: 55 },
          { order: 2, min: 56, max: 75 },
          { order: 4, min: 91, max: 105 },
        ],
        heartRateZones: [{ order: 2, min: 130, max: 145 }],
        activities: [
          {
            startTime: new Date('2026-06-20'),
            avgPower: 180,
            distance: 30000,
            timerTime: 3600,
          },
          {
            startTime: new Date('2026-06-18'),
            avgPower: 190,
            distance: 28000,
            timerTime: 3300,
          },
          {
            startTime: new Date('2026-06-15'),
            avgPower: 175,
            distance: 25000,
            timerTime: 3000,
          },
          {
            startTime: new Date('2026-06-10'),
            avgPower: 160,
            distance: 22000,
            timerTime: 2800,
          },
        ],
      }),
      { sportType: 'CYCLING', workoutGoal: 'threshold', asOf: '2026-06-29' },
    );

    expect(result.recommendation.primaryMetric).toBe('power');
    expect(result.recommendation.expression).toBe('zone');
    expect(result.selectedZoneRanges).toMatchObject({
      metric: 'power',
      unit: 'watt',
      zones: [
        { order: 1, min: 0, max: 55 },
        { order: 2, min: 56, max: 75 },
        { order: 4, min: 91, max: 105 },
      ],
    });
    expect(
      result.candidates.find((item) => item.metric === 'power'),
    ).toMatchObject({
      hasZones: true,
      recentCoverage: { status: 'strong' },
      recommendationHint: 'prefer_zone',
    });
  });

  it('does not blindly choose cycling power when recent rides have heart rate but no power', async () => {
    const result = await createService().workoutIntensityStrategy(
      createCtx({
        powerZones: [
          { order: 1, min: 0, max: 55 },
          { order: 2, min: 56, max: 75 },
        ],
        heartRateZones: [
          { order: 1, min: 110, max: 129 },
          { order: 2, min: 130, max: 145 },
        ],
        activities: [
          {
            startTime: new Date('2026-06-20'),
            avgHeartRate: 138,
            distance: 30000,
            timerTime: 3600,
          },
          {
            startTime: new Date('2026-06-18'),
            avgHeartRate: 142,
            distance: 28000,
            timerTime: 3300,
          },
          {
            startTime: new Date('2026-06-15'),
            avgHeartRate: 135,
            distance: 25000,
            timerTime: 3000,
          },
          {
            startTime: new Date('2026-06-10'),
            avgHeartRate: 132,
            distance: 22000,
            timerTime: 2800,
          },
        ],
      }),
      { sportType: 'CYCLING', workoutGoal: 'endurance', asOf: '2026-06-29' },
    );

    expect(result.recommendation.primaryMetric).toBe('heartRate');
    expect(result.recommendation.expression).toBe('zone');
    expect(
      result.candidates.find((item) => item.metric === 'power'),
    ).toMatchObject({
      hasZones: true,
      recentCoverage: { status: 'none' },
      recommendationHint: 'fallback_only',
    });
  });

  it('chooses run pace zones when the athlete only has reliable pace data', async () => {
    const result = await createService().workoutIntensityStrategy(
      createCtx({
        paceZones: [
          { order: 1, min: 0.0024, max: 0.0028 },
          { order: 2, min: 0.0029, max: 0.0033 },
          { order: 4, min: 0.0038, max: 0.0041 },
        ],
        activities: [
          {
            startTime: new Date('2026-06-21'),
            distance: 10000,
            timerTime: 3300,
          },
          {
            startTime: new Date('2026-06-19'),
            distance: 8000,
            timerTime: 2700,
          },
          {
            startTime: new Date('2026-06-16'),
            distance: 7000,
            timerTime: 2400,
          },
        ],
      }),
      { sportType: 'RUN', workoutGoal: 'tempo', asOf: '2026-06-29' },
    );

    expect(result.recommendation.primaryMetric).toBe('pace');
    expect(result.recommendation.expression).toBe('zone');
    expect(result.recommendation.dslExamples.join('\n')).toContain('pace z');
  });

  it('suggests fixed targets only when zones are missing but threshold and recent data exist', async () => {
    const result = await createService().workoutIntensityStrategy(
      createCtx({
        powerZones: [],
        heartRateZones: [],
        paceZones: [],
        profile: { ftp: 260 },
        activities: [
          { startTime: new Date('2026-06-21'), avgPower: 190 },
          { startTime: new Date('2026-06-19'), avgPower: 200 },
          { startTime: new Date('2026-06-16'), avgPower: 185 },
        ],
      }),
      { sportType: 'CYCLING', workoutGoal: 'threshold', asOf: '2026-06-29' },
    );

    expect(result.recommendation.primaryMetric).toBe('power');
    expect(result.recommendation.expression).toBe('fixed');
    expect(result.selectedZoneRanges).toBeNull();
    expect(
      result.candidates.find((item) => item.metric === 'power'),
    ).toMatchObject({
      hasZones: false,
      hasFixedAnchor: true,
      fixedAnchorSource: 'profile.ftp',
      recommendationHint: 'prefer_fixed',
    });
  });

  it('falls back to duration-only when there is no reliable anchor', async () => {
    const result = await createService().workoutIntensityStrategy(
      createCtx({
        powerZones: [],
        heartRateZones: [],
        paceZones: [],
        profile: {
          ftp: null,
          cp: null,
          tp: null,
          cs: null,
          vo2max: null,
          lthr: null,
          maxHeartRate: null,
        },
        activities: [],
      }),
      { sportType: 'RUN', workoutGoal: 'endurance', asOf: '2026-06-29' },
    );

    expect(result.recommendation.primaryMetric).toBeNull();
    expect(result.recommendation.expression).toBe('duration_only');
    expect(result.recommendation.dslExamples).toEqual([
      'work 30m',
      'recovery 5m',
    ]);
  });
});

describe('CoachToolsService competition event mutations', () => {
  it('soft-deletes the exact version after Coach confirmation validation', async () => {
    const softDelete = jest.fn(async () => ({
      id: 'event-1',
      title: 'Target race',
      version: 4,
    }));
    const service = new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { softDelete } as never,
      {} as never,
    );
    const ctx = {
      session: { user: { id: 'user-1' } },
      currentToolCallId: 'tool-call-1',
    } as never;

    await expect(
      service.competitionEventMutate(ctx, {
        action: 'DELETE',
        eventId: 'event-1',
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({ id: 'event-1', version: 4 });
    expect(softDelete).toHaveBeenCalledWith({
      userId: 'user-1',
      eventId: 'event-1',
      expectedVersion: 3,
      actorType: 'AI_CONFIRMED',
      requestId: 'tool-call-1',
    });
  });
});

describe('CoachToolsService pmc.range', () => {
  it('reads the slice through PMCService.listRange', async () => {
    const listRange = jest.fn(async () => [
      {
        date: new Date('2026-08-01T00:00:00.000Z'),
        dailyValue: 50,
        ATL: 40,
        CTL: 45,
        TSB: 5,
      },
    ]);
    const service = new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.pmcRange(
      {
        session: { user: { id: 'user-1' } },
        i18n: { t: (key: string) => key },
        pmc: { listRange },
      } as never,
      { from: '2026-08-01', to: '2026-08-01' },
    );

    expect(listRange).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.any(Date),
      { orderBy: 'asc' },
    );
    expect(result.points).toEqual([
      {
        date: '2026-08-01',
        dailyValue: 50,
        ATL: 40,
        CTL: 45,
        TSB: 5,
      },
    ]);
  });
});

describe('CoachToolsService currentTime', () => {
  it('returns athlete-local today from preferred timezone, not the UTC calendar day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-26T07:30:00.000Z'));
    const service = new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    try {
      const result = await service.currentTime({
        session: { user: { id: 'user-1' } },
        userService: {
          getPreferredTimezone: jest.fn(async () => 'America/Los_Angeles'),
        },
      } as never);

      expect(result.athleteTimezone).toBe('America/Los_Angeles');
      expect(result.athleteLocalToday).toBe('2026-08-26');
      expect(result.userTimezone).toBe('America/Los_Angeles');
      expect(result.user?.date).toBe('2026-08-26');
      expect(result.server.date).toBe('2026-08-26');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps UTC+14 athlete-today on the local calendar date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-25T10:30:00.000Z'));
    const service = new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    try {
      const result = await service.currentTime({
        session: { user: { id: 'user-1' } },
        userService: {
          getPreferredTimezone: jest.fn(async () => 'Pacific/Kiritimati'),
        },
      } as never);

      expect(result.server.date).toBe('2026-08-25');
      expect(result.athleteLocalToday).toBe('2026-08-26');
      expect(result.user?.date).toBe('2026-08-26');
    } finally {
      jest.useRealTimers();
    }
  });
});
