import { describe, expect, it, jest } from '@jest/globals';
import {
  ActivityTimelineRepairService,
  mergeActivityTimelineRepairFindings,
} from '../activity-timeline-repair.service';

describe('mergeActivityTimelineRepairFindings', () => {
  it('merges all reasons per user from the earliest causal instant', () => {
    const findings = mergeActivityTimelineRepairFindings([
      {
        user_id: 'user-1',
        effective_from: new Date('2026-02-01T00:00:00.000Z'),
        affected_activity_ids: [BigInt(2), BigInt(3)],
        reason: 'FALSE_ZERO_POWER_LOAD',
      },
      {
        user_id: 'user-1',
        effective_from: new Date('2026-01-01T00:00:00.000Z'),
        affected_activity_ids: [1, 2, 3],
        reason: 'LEGACY_OR_COMPRESSED_AUTO_TIMELINE',
      },
    ]);

    expect(findings).toEqual([
      {
        userId: 'user-1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        affectedActivities: 3,
        activityIds: [1, 2, 3],
        reasons: [
          'FALSE_ZERO_POWER_LOAD',
          'LEGACY_OR_COMPRESSED_AUTO_TIMELINE',
        ],
      },
    ]);
  });
});

describe('ActivityTimelineRepairService.enqueue', () => {
  function fixture(initial: Array<Record<string, any>> = []) {
    const rows = new Map(initial.map((row) => [row.dedupeKey, row]));
    const findUnique = jest.fn(async ({ where }: any) => {
      const row = rows.get(where.dedupeKey);
      return row ? { ...row } : null;
    });
    const create = jest.fn(async ({ data }: any) => {
      const row = { id: `job-${rows.size + 1}`, ...data };
      rows.set(data.dedupeKey, row);
      return row;
    });
    const update = jest.fn(async ({ where, data }: any) => {
      const current = [...rows.values()].find((row) => row.id === where.id)!;
      const row = { ...current, ...data };
      rows.set(row.dedupeKey, row);
      return row;
    });
    const service = new ActivityTimelineRepairService(
      {
        activityRecomputeJob: { findUnique, create, update },
      } as never,
      {} as never,
      {} as never,
    );
    return { service, rows, create, update };
  }

  const finding = {
    userId: 'user-1',
    effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
    affectedActivities: 73,
    activityIds: [1, 2, 3],
    reasons: ['SNAPSHOT_V4_OR_CAUSAL_INPUT_MISSING'],
  };

  it('is idempotent and updates the same pending repair job', async () => {
    const { service, rows } = fixture();
    await expect(service.enqueue([finding])).resolves.toMatchObject({
      created: 1,
      updated: 0,
    });
    await expect(service.enqueue([finding])).resolves.toMatchObject({
      created: 0,
      updated: 1,
    });
    expect(rows).toHaveProperty('size', 1);
  });

  it('creates a durable follow-up when the deduplicated job is running', async () => {
    const dedupeKey = 'activity-timeline-repair:v1:user-1';
    const { service, rows } = fixture([
      {
        id: 'job-running',
        dedupeKey,
        status: 'RUNNING',
        recomputeFrom: new Date('2025-01-01T00:00:00.000Z'),
        recomputeTo: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(service.enqueue([finding])).resolves.toMatchObject({
      created: 1,
      running: 1,
    });
    expect(rows.has(`${dedupeKey}:followup`)).toBe(true);
  });
});

describe('ActivityTimelineRepairService PMC scan', () => {
  it('batches a page and does not treat an unresolved activity load as zero', async () => {
    const firstActivityAt = new Date('2026-01-01T10:00:00.000Z');
    const secondActivityAt = new Date('2026-01-02T10:00:00.000Z');
    const pmcRows = [
      {
        id: 'pmc-1',
        userId: 'user-1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        dailyValue: 40,
      },
      {
        id: 'pmc-2',
        userId: 'user-1',
        date: new Date('2026-01-02T00:00:00.000Z'),
        dailyValue: 30,
      },
    ];
    const findActivities = jest.fn(async () => [
      {
        id: 1,
        userId: 'user-1',
        startTime: firstActivityAt,
        fitnessMetricsSnapshot: { pmcLocalDate: '2026-01-01' },
      },
      {
        id: 2,
        userId: 'user-1',
        startTime: secondActivityAt,
        fitnessMetricsSnapshot: { pmcLocalDate: '2026-01-02' },
      },
    ]);
    const batchGetActualLoad = jest.fn(
      async () =>
        new Map([
          [1, { actualLoad: 42 }],
          [2, { actualLoad: null }],
        ]),
    );
    const service = new ActivityTimelineRepairService(
      {
        activity: { findMany: findActivities },
      } as never,
      { batchGetActualLoad } as never,
      { findMany: jest.fn(async () => pmcRows) } as never,
    );

    const findings = await (
      service as unknown as {
        scanPmcMismatches(limit: number): Promise<unknown[]>;
      }
    ).scanPmcMismatches(100);

    expect(findActivities).toHaveBeenCalledTimes(1);
    expect(batchGetActualLoad).toHaveBeenCalledTimes(1);
    expect(findings).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        affected_activity_ids: [1],
        reason: 'PMC_FINAL_LOAD_MISMATCH',
      }),
    ]);
  });

  it('uses the snapshot civil date rather than the host timezone', async () => {
    const activityAt = new Date('2026-01-01T04:00:00.000Z');
    const pmcDate = new Date('2026-01-02T00:00:00.000Z');
    const service = new ActivityTimelineRepairService(
      {
        activity: {
          findMany: jest.fn(async () => [
            {
              id: 9,
              userId: 'user-1',
              startTime: activityAt,
              fitnessMetricsSnapshot: { pmcLocalDate: '2026-01-02' },
            },
          ]),
        },
      } as never,
      {
        batchGetActualLoad: jest.fn(
          async () => new Map([[9, { actualLoad: 25 }]]),
        ),
      } as never,
      {
        findMany: jest.fn(async () => [
          {
            id: 'pmc-local-day',
            userId: 'user-1',
            date: pmcDate,
            dailyValue: 25,
          },
        ]),
      } as never,
    );

    await expect(
      (
        service as unknown as {
          scanPmcMismatches(limit: number): Promise<unknown[]>;
        }
      ).scanPmcMismatches(100),
    ).resolves.toEqual([]);
  });
});
