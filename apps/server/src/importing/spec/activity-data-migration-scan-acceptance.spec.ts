import { ActivityDataMigrationService } from '../activity-data-migration.service';

function migration(phase: string) {
  const row: any = {
    id: 'migration-1',
    userId: 'user-1',
    status: phase === 'WAIT_VERIFY_REPLAY' ? 'VERIFYING' : 'MIGRATING',
    phase,
    rawCursor: null,
    beforeManifest: { protectedHash: 'keep' },
    verification: { resultFingerprint: 'fp' },
    recomputeJobId: 'job-1',
  };
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: jest.fn(async () => [{ revision: 1n }]),
    activityDataMigration: {
      findUniqueOrThrow: jest.fn(async () => row),
      update: jest.fn(async ({ data }) => {
        updates.push(data);
        Object.assign(row, data);
        return row;
      }),
    },
    activitySource: { findMany: jest.fn(async () => []) },
  };
  const prisma = {
    ...tx,
    activityRecomputeJob: {
      findUniqueOrThrow: jest.fn(async () => ({
        status: 'COMPLETED',
        replayCheckpoint: {
          pageStats: {
            page: {
              highFrequencyReads: 0,
              fingerprintHits: 1,
              processedActivities: 1,
            },
          },
        },
      })),
    },
    $transaction: async (fn: (transaction: typeof tx) => unknown) => fn(tx),
  };
  const repair = {
    scan: jest.fn(),
    enqueue: jest.fn(async () => undefined),
    listEligibleSourceIds: jest.fn(async () => ['source-1', 'source-2']),
  };
  const service = new ActivityDataMigrationService(
    prisma as never,
    repair as never,
    { sourceObjects: () => ({}) } as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service as any, 'start').mockResolvedValue(row);
  jest.spyOn(service, 'verify').mockResolvedValue({
    ok: true,
    activityCount: 1,
    revision: '1',
    resultFingerprint: 'fp',
  } as never);
  jest.spyOn(service, 'status').mockResolvedValue([] as never);
  return { service, row, repair, updates, tx };
}

describe('historical migration scan acceptance', () => {
  it('does not leave RAW_SCAN when the cursor page is shorter than the eligible sources', async () => {
    const h = migration('RAW_SCAN');
    h.repair.scan.mockResolvedValue({
      failures: [],
      alreadyQueued: 0,
      candidates: [],
      integrityAudits: [],
      lastScannedId: 'source-1',
      hasMore: false,
      sourceOutcomes: [
        { sourceObjectId: 'source-1', disposition: 'NO_RECOVERABLE_DATA' },
      ],
    });
    await expect(h.service.advance('run')).rejects.toThrow(
      'ACTIVITY_MIGRATION_RAW_SCAN_INCOMPLETE',
    );
    expect(h.row.status).toBe('FAILED');
    expect(h.row.phase).toBe('RAW_SCAN');
    expect(h.updates.some((update) => update.status === 'VERIFIED')).toBe(
      false,
    );
  });

  it('rejects an otherwise finished replay when the scan ledger is incomplete', async () => {
    const h = migration('WAIT_VERIFY_REPLAY');
    h.row.beforeManifest = {
      rawScanExhausted: true,
      rawSourceOutcomes: [
        { sourceObjectId: 'source-1', disposition: 'NO_RECOVERABLE_DATA' },
      ],
    };
    await expect(h.service.advance('run')).rejects.toThrow(
      'ACTIVITY_MIGRATION_RAW_SCAN_INCOMPLETE',
    );
    expect(h.row.status).toBe('FAILED');
    expect(h.row.errorCode).toBe('ACTIVITY_MIGRATION_RAW_SCAN_INCOMPLETE');
    expect(h.updates.some((update) => update.status === 'VERIFIED')).toBe(
      false,
    );
  });

  it('rejects VERIFIED when a recoverable repair was not materialized', async () => {
    const h = migration('WAIT_VERIFY_REPLAY');
    h.repair.listEligibleSourceIds.mockResolvedValue(['source-1']);
    h.row.beforeManifest = {
      rawScanExhausted: true,
      rawSourceOutcomes: [
        {
          sourceObjectId: 'source-1',
          disposition: 'REPAIR_REQUIRED',
          activities: [
            {
              activityId: 7,
              sourceUid: 'source-1#0',
              primarySourceId: 'primary-1',
              recordCount: 4,
              strengthSetCount: 0,
            },
          ],
        },
      ],
    };
    h.tx.activitySource.findMany.mockResolvedValue([
      {
        id: 'primary-1',
        activityId: 7,
        metadata: { materializationVersion: 1 },
        activity: {
          parquetFiles: [{ type: 'record', pointCount: 4 }],
          strengthExercises: [],
        },
      },
    ]);
    await expect(h.service.advance('run')).rejects.toThrow(
      'ACTIVITY_MIGRATION_REPAIR_NOT_MATERIALIZED',
    );
    expect(h.updates.some((update) => update.status === 'VERIFIED')).toBe(
      false,
    );
  });

  it('marks VERIFIED only after the full scan and materialized repair are both proven', async () => {
    const h = migration('WAIT_VERIFY_REPLAY');
    h.repair.listEligibleSourceIds.mockResolvedValue(['source-1', 'source-2']);
    h.row.beforeManifest = {
      rawScanExhausted: true,
      rawSourceOutcomes: [
        {
          sourceObjectId: 'source-1',
          disposition: 'REPAIR_REQUIRED',
          activities: [
            {
              activityId: 7,
              sourceUid: 'source-1#0',
              primarySourceId: 'primary-1',
              recordCount: 4,
              strengthSetCount: 1,
            },
          ],
        },
        {
          sourceObjectId: 'source-2',
          disposition: 'UNRECOVERABLE',
          code: 'RAW_FILE_UNAVAILABLE',
        },
      ],
    };
    h.tx.activitySource.findMany.mockResolvedValue([
      {
        id: 'primary-1',
        activityId: 7,
        metadata: { materializationVersion: 2 },
        activity: {
          parquetFiles: [{ type: 'record', pointCount: 4 }],
          strengthExercises: [{ _count: { sets: 1 } }],
        },
      },
    ]);
    await h.service.advance('run');
    expect(h.row.status).toBe('VERIFIED');
    expect(h.row.verifiedAt).toEqual(expect.any(Date));
  });
});
