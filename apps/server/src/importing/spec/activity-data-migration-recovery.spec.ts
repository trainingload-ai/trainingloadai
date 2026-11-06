import { ActivityDataMigrationService } from '../activity-data-migration.service';

function harness() {
  const recovery = {
    activityIds: [1],
    itemIds: ['item-1'],
    state: 'QUEUED',
    jobId: 'recovery-job',
  };
  const row = {
    id: 'migration-1',
    userId: 'user-1',
    status: 'MIGRATING',
    phase: 'WAIT_IMPORT',
    importBatchIds: ['batch-1'],
    beforeManifest: {},
    recomputeJobId: 'recovery-job',
  };
  const item = {
    id: 'item-1',
    sourceRef: { repair: { migrationId: row.id, activityId: 1 } },
  };
  const state = {
    lease: false,
    writer: false,
    cancelled: false,
    stalled: true,
    ready: true,
    jobStatus: 'COMPLETED',
    batchStatus: 'RUNNING',
    items: [item],
  };
  const itemJobs = {
    findMany: jest.fn(async () => state.items),
    findFirst: jest.fn(async () =>
      state.writer ? { id: 'active-writer' } : null,
    ),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const batchJobs = {
    findMany: jest.fn(async () => [
      { id: 'batch-1', status: state.batchStatus, postProcessJobs: [] },
    ]),
    findFirst: jest.fn(async () =>
      state.cancelled ? { id: 'batch-1' } : null,
    ),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    activityAnalysisLease: {
      findFirst: jest.fn(async () =>
        state.lease ? { userId: row.userId } : null,
      ),
    },
    activity: {
      findMany: jest.fn(async (args) =>
        args.select.processingStatus
          ? [{ id: 1, processingStatus: state.ready ? 'READY' : 'ANALYZING' }]
          : args.where.processingStatus
            ? state.stalled
              ? [{ id: 1 }]
              : []
            : [
                { id: 1, startTime: new Date('2025-01-01') },
                { id: 2, startTime: new Date('2025-01-02') },
              ],
      ),
    },
    activityDataMigration: {
      update: jest.fn(async (args) => ({ ...row, ...args.data })),
    },
    activityRecomputeJob: {
      upsert: jest.fn(async () => ({ id: 'recovery-job' })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn) => fn(tx)),
    activityRecomputeJob: {
      findUniqueOrThrow: jest.fn(async () => ({
        status: state.jobStatus,
        lastErrorCode: 'REPLAY_FAILURE',
      })),
    },
  };
  const users = { fitnessMetrics: () => ({ findFirst: async () => null }) };
  const jobs = { itemJobs: () => itemJobs, batchJobs: () => batchJobs };
  const service = new ActivityDataMigrationService(
    prisma as never,
    {} as never,
    jobs as never,
    users as never,
    {} as never,
  );
  jest.spyOn(service as any, 'start').mockResolvedValue(row);
  jest.spyOn(service, 'status').mockResolvedValue([]);
  return { service, row, state, recovery, tx, itemJobs, batchJobs };
}

describe('per-user stalled analysis recovery', () => {
  it('queues a causal replay of current facts before retrying a blocked raw repair', async () => {
    const h = harness();
    expect(await h.service.advance('run')).toMatchObject({
      waiting: 'ANALYSIS_RECOVERY',
    });
    expect(h.tx.activityRecomputeJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metricType: 'DATA_REPAIR',
          reason: 'PER_USER_STALLED_ANALYSIS_RECOVERY',
          priority: 10,
          triggerPayload: expect.objectContaining({
            migrationId: h.row.id,
            analysisRecovery: true,
            includeActivityIds: [1, 2],
          }),
        }),
      }),
    );
    expect(h.tx.activityDataMigration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: 'WAIT_ANALYSIS_RECOVERY',
          beforeManifest: { analysisRecovery: h.recovery },
        }),
      }),
    );
    expect(h.itemJobs.updateMany).not.toHaveBeenCalled();
  });

  it.each(['lease', 'writer'] as const)(
    'waits while another %s is active',
    async (field) => {
      const h = harness();
      h.state[field] = true;
      expect(await h.service.advance('run')).toMatchObject({
        waiting: 'IMPORT',
      });
      expect(h.tx.activityRecomputeJob.upsert).not.toHaveBeenCalled();
    },
  );

  it('only considers failed repair items belonging to this migration', async () => {
    const h = harness();
    h.state.items[0].sourceRef.repair.migrationId = 'another-migration';
    expect(await h.service.advance('run')).toMatchObject({ waiting: 'IMPORT' });
    expect(h.tx.activityRecomputeJob.upsert).not.toHaveBeenCalled();
  });

  it('does not run recovery for a ready activity or repeat an earlier recovery', async () => {
    const h = harness();
    h.state.stalled = false;
    expect(await h.service.advance('run')).toMatchObject({ waiting: 'IMPORT' });
    h.state.stalled = true;
    h.row.beforeManifest = {
      analysisRecovery: { ...h.recovery, state: 'COMPLETED' },
    };
    expect(await h.service.advance('run')).toMatchObject({ waiting: 'IMPORT' });
    expect(h.tx.activityRecomputeJob.upsert).not.toHaveBeenCalled();
  });

  it('respects batch cancellation', async () => {
    const h = harness();
    h.state.batchStatus = 'CANCELLED';
    await expect(h.service.advance('run')).rejects.toThrow(
      'ACTIVITY_MIGRATION_IMPORT_FAILED',
    );
    expect(h.tx.activityRecomputeJob.upsert).not.toHaveBeenCalled();
  });

  it('waits for replay completion without requeuing the import item', async () => {
    const h = harness();
    h.row.phase = 'WAIT_ANALYSIS_RECOVERY';
    h.row.beforeManifest = { analysisRecovery: h.recovery };
    h.state.jobStatus = 'RUNNING';
    expect(await h.service.advance('run')).toMatchObject({
      waiting: 'ANALYSIS_RECOVERY',
    });
    expect(h.itemJobs.updateMany).not.toHaveBeenCalled();
  });

  it('requeues only the recorded blocked items after the real replay made them ready', async () => {
    const h = harness();
    h.row.phase = 'WAIT_ANALYSIS_RECOVERY';
    h.row.beforeManifest = { analysisRecovery: h.recovery };
    await h.service.advance('run');
    expect(h.itemJobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['item-1'] },
          userId: h.row.userId,
          status: { in: ['FAILED', 'DEAD'] },
        }),
        data: expect.objectContaining({ status: 'QUEUED', attempts: 0 }),
      }),
    );
    expect(h.tx.activityDataMigration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: 'WAIT_IMPORT',
          recomputeJobId: null,
          beforeManifest: {
            analysisRecovery: { ...h.recovery, state: 'COMPLETED' },
          },
        }),
      }),
    );
  });

  it.each(['incomplete', 'dead', 'cancelled'])(
    'stops on %s recovery without requeuing',
    async (failure) => {
      const h = harness();
      h.row.phase = 'WAIT_ANALYSIS_RECOVERY';
      h.row.beforeManifest = { analysisRecovery: h.recovery };
      if (failure === 'incomplete') h.state.ready = false;
      if (failure === 'dead') h.state.jobStatus = 'DEAD';
      if (failure === 'cancelled') h.state.cancelled = true;
      await expect(h.service.advance('run')).rejects.toThrow();
      expect(h.itemJobs.updateMany).not.toHaveBeenCalled();
      expect(h.tx.activityDataMigration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    },
  );

  it('rejects a checkpoint referring to a different replay job', async () => {
    const h = harness();
    h.row.phase = 'WAIT_ANALYSIS_RECOVERY';
    h.row.beforeManifest = {
      analysisRecovery: { ...h.recovery, jobId: 'another-job' },
    };
    await expect(h.service.advance('run')).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANALYSIS_RECOVERY_INVALID',
    );
    expect(h.itemJobs.updateMany).not.toHaveBeenCalled();
  });
});
