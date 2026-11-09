import { describe, expect, it, jest } from '@jest/globals';
import { PersonalSyncService } from '../personal-sync.service';
import {
  garminSummaryMode,
  mapGarminHeartRateZones,
  normalizeGarminDailySummary,
} from '../personal-garmin-wellness';
import { garminHealthProjection } from '../personal-health.mapper';

describe('personal sync trigger helpers', () => {
  it('routes summary endpoints by trigger', () => {
    expect(garminSummaryMode('first_connect')).toBe('range');
    expect(garminSummaryMode('manual')).toBe('range');
    expect(garminSummaryMode('focus')).toBe('daily');
    expect(garminSummaryMode('dawn')).toBe('daily');
  });

  it('normalizes flat usersummary/daily into V2 nested summary rows', () => {
    const day = '2026-11-01';
    const normalized = normalizeGarminDailySummary(
      {
        calendarDate: day,
        totalSteps: 1500,
        restingHeartRate: 48,
        activeKilocalories: 220,
        bodyBatteryChargedValue: 70,
      },
      day,
    );
    const mapped = garminHealthProjection({
      day,
      timezone: 'Asia/Shanghai',
      accountId: '1',
      connectionId: 'c',
      summary: normalized,
    });
    const values = Object.fromEntries(
      mapped.candidates.map((c) => [c.metricType, c.value]),
    );
    expect(values).toMatchObject({
      STEP_COUNT: 1500,
      RESTING_HEART_RATE_BPM: 48,
      ACTIVE_ENERGY_KCAL: 220,
      BODY_BATTERY_CHARGED: 70,
    });
  });

  it('projects weight/all measurement arrays in kilograms', () => {
    const day = '2026-11-01';
    const mapped = garminHealthProjection({
      day,
      timezone: 'UTC',
      accountId: '1',
      connectionId: 'c',
      weight: [
        { calendarDate: day, weight: 71.2, timestampGMT: `${day}T07:00:00.000Z` },
        { calendarDate: day, weight: 71.8, timestampGMT: `${day}T18:00:00.000Z` },
      ],
    });
    expect(mapped.candidates).toEqual([
      expect.objectContaining({ metricType: 'BODY_MASS_KG', value: 71.8 }),
    ]);
  });

  it('maps Garmin heartRateZones floors into custom absolute zones', () => {
    const mapped = mapGarminHeartRateZones([
      {
        sport: 'RUNNING',
        zone1Floor: 100,
        zone2Floor: 120,
        zone3Floor: 140,
        zone4Floor: 160,
        zone5Floor: 175,
        maxHeartRateUsed: 190,
      },
    ]);
    expect(mapped[0]).toMatchObject({
      sportType: 'RUN',
      zones: [
        { order: 1, min: 100, max: 120 },
        { order: 2, min: 120, max: 140 },
        { order: 3, min: 140, max: 160 },
        { order: 4, min: 160, max: 175 },
        { order: 5, min: 175, max: 190 },
      ],
    });
  });
});

describe('personal sync enqueueFocus / dawn', () => {
  function harness(connectionOverrides: Record<string, unknown> = {}) {
    const connection = {
      id: 'c',
      userId: 'owner',
      provider: 'garmin',
      externalAthleteId: '123',
      credentialFingerprint: 'v1',
      syncActivities: true,
      syncWellness: true,
      syncScheduledActivities: true,
      lastSyncCompletedAt: null,
      lastSyncStartedAt: null,
      metadata: {
        connectionMode: 'personal_api',
        region: 'global',
        settings: {
          timezone: 'Asia/Shanghai',
          activities: true,
          wellness: true,
          automatic: true,
          allowWrites: false,
        },
      },
      ...connectionOverrides,
    };
    const jobs: any[] = [];
    const prisma: any = {
      personalProviderJob: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        upsert: jest.fn<any>().mockImplementation(async ({ create }: any) => {
          const job = { id: 'job', status: 'QUEUED', ...create };
          jobs.push(job);
          return job;
        }),
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const job = { id: 'job', status: 'QUEUED', ...data };
          jobs.push(job);
          return job;
        }),
      },
      externalProviderConnection: {
        findMany: jest.fn<any>().mockResolvedValue([connection]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new PersonalSyncService(
      prisma,
      {
        require: async () => connection,
        resolveAccountTimezone: async () => 'Asia/Shanghai',
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, jobs, prisma, connection };
  }

  it('skips focus sync within one hour of the last success', async () => {
    const h = harness({
      lastSyncCompletedAt: new Date(),
    });
    const result = await h.service.enqueueFocus('owner', 'garmin');
    expect(result).toMatchObject({ status: 'SKIPPED', reason: 'throttled' });
    expect(h.jobs).toHaveLength(0);
  });

  it('queues a yesterday+today focus window when eligible', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-01T10:00:00+08:00'));
    const h = harness({
      lastSyncCompletedAt: new Date(Date.now() - 2 * 3600_000),
    });
    const result = await h.service.enqueueFocus('owner', 'garmin');
    expect(result.status).toBe('QUEUED');
    expect(h.jobs[0].payload).toMatchObject({
      startDate: '2026-10-31',
      endDate: '2026-11-01',
      trigger: 'focus',
    });
    jest.useRealTimers();
  });

  it('queues dawn sync only at/after local 03:00 and not again the same local day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-01T02:30:00+08:00'));
    const early = harness();
    await early.service.schedule();
    expect(early.jobs).toHaveLength(0);

    jest.setSystemTime(new Date('2026-11-01T03:05:00+08:00'));
    const dawn = harness();
    await dawn.service.schedule();
    expect(dawn.jobs[0].payload).toMatchObject({
      trigger: 'dawn',
      startDate: '2026-10-31',
      endDate: '2026-11-01',
    });

    const again = harness({
      lastSyncCompletedAt: new Date('2026-11-01T03:10:00+08:00'),
    });
    await again.service.schedule();
    expect(again.jobs).toHaveLength(0);
    jest.useRealTimers();
  });
});
