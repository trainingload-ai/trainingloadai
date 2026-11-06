jest.mock('../unknown-activity-sport-repair', () => ({
  applyUnknownActivitySportRepairs: async () => ({ repaired: 0 }),
}));
import { ActivityDataMigrationService } from '../activity-data-migration.service';

function harness() {
  const row: any = {
    id: 'current',
    runKey: 'current-run',
    userId: 'current-user',
    status: 'MIGRATING',
    phase: 'RAW_SCAN',
    beforeManifest: {
      protectedHash: 'original',
      primaryHash: 'original-primary',
    },
  };
  const failed: any = {
    id: 'failed',
    runKey: 'previous-run',
    userId: 'previous-user',
    status: 'FAILED',
    phase: 'RAW_SCAN',
    errorCode: 'RAW_DECODE_FAILED',
    rawCursor: 'last-good',
    importBatchIds: [],
    recomputeJobId: null,
    beforeManifest: {
      protectedHash: 'previous',
      primaryHash: 'previous-primary',
    },
  };
  const state: any = {
    others: [failed],
    lease: null,
    item: null,
    post: null,
    replay: null,
  };
  const tx: any = {
    $queryRaw: jest.fn(async () => []),
    activityDataMigration: {
      findFirst: jest.fn(async () => row),
      findMany: jest.fn(async () => state.others),
      update: jest.fn(async ({ where, data }) => {
        expect(where.id).toBe(row.id);
        Object.assign(row, data);
        return row;
      }),
    },
    activityAnalysisLease: { findFirst: jest.fn(async () => state.lease) },
    activityRecomputeJob: { findUnique: jest.fn(async () => state.replay) },
    storageObjectRetention: { createMany: jest.fn() },
  };
  const items = { findFirst: jest.fn(async () => state.item) };
  const post = { findFirst: jest.fn(async () => state.post) };
  const service = new ActivityDataMigrationService(
    { $transaction: async (fn: any) => fn(tx) } as never,
    {} as never,
    {
      itemJobs: () => items,
      postProcessJobs: () => post,
      sourceObjects: () => ({ findMany: async () => [] }),
    } as never,
    {} as never,
    {} as never,
  );
  return {
    row,
    failed,
    state,
    tx,
    items,
    post,
    service,
    start: (deferral?: any) => (service as any).start('current-run', deferral),
  };
}
const decision = {
  migrationIds: ['failed'],
  reason: 'Repair failed sources after the full pass',
};

describe('explicit per-run migration deferral', () => {
  it('preserves the deferral audit while initializing the current protection baseline', async () => {
    const h = harness();
    h.row.status = 'PENDING';
    h.row.beforeManifest = null;
    jest.spyOn(h.service as any, 'manifest').mockResolvedValue({
      protectedHash: 'new-baseline',
      primaryHash: 'new-primary',
      files: [],
    });
    const result = await h.start(decision);
    expect(result.beforeManifest).toMatchObject({
      protectedHash: 'new-baseline',
      primaryHash: 'new-primary',
      sportRepairs: { repaired: 0 },
      deferredFailureAudits: [{ decision: { reason: decision.reason } }],
    });
  });

  it('keeps failed runs blocking by default', async () => {
    const h = harness();
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
  });

  it('continues another user while preserving the complete failure and checkpoint', async () => {
    const h = harness(),
      original = structuredClone(h.failed);
    const result = await h.start(decision);
    expect(h.failed).toEqual(original);
    expect(result.status).toBe('MIGRATING');
    expect(result.beforeManifest).toMatchObject({
      protectedHash: 'original',
      primaryHash: 'original-primary',
      deferredFailureAudits: [
        {
          decision: {
            reason: decision.reason,
            migrations: [
              {
                id: 'failed',
                phase: 'RAW_SCAN',
                errorCode: 'RAW_DECODE_FAILED',
                checkpointFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
              },
            ],
          },
        },
      ],
    });
    expect(h.tx.storageObjectRetention.createMany).not.toHaveBeenCalled();
  });

  it.each(['MIGRATING', 'VERIFYING'])(
    'never defers an active %s run',
    async (status) => {
      const h = harness();
      h.failed.status = status;
      await expect(h.start(decision)).rejects.toThrow(
        'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
      );
      expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
    },
  );

  it('never starts the same user through a second run', async () => {
    const h = harness();
    h.failed.userId = h.row.userId;
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
  });

  it('requires an explicit retry of the failed current run', async () => {
    const h = harness();
    h.row.status = 'FAILED';
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_PREVIOUS_USER_FAILED',
    );
  });

  it.each([
    { migrationIds: [], reason: 'reason' },
    { migrationIds: ['failed', 'failed'], reason: 'reason' },
    { migrationIds: ['failed'], reason: ' ' },
    { migrationIds: ['failed'], reason: 'x'.repeat(501) },
    { migrationIds: ['bad id'], reason: 'reason' },
    { migrationIds: ['missing'], reason: 'reason' },
  ])('rejects invalid or stale deferral arguments %j', async (value) => {
    const h = harness();
    await expect(h.start(value)).rejects.toThrow();
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
  });

  it.each(['lease', 'item', 'post', 'replay'])(
    'refuses an unsettled %s',
    async (kind) => {
      const h = harness();
      h.failed.importBatchIds = ['batch'];
      h.failed.recomputeJobId = 'replay';
      h.state.replay = { status: 'COMPLETED' };
      h.state[kind] =
        kind === 'replay' ? { status: 'RUNNING' } : { id: 'busy' };
      await expect(h.start(decision)).rejects.toThrow(
        'ACTIVITY_MIGRATION_DEFERRED_USER_BUSY',
      );
      expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
    },
  );

  it('treats automatically retrying FAILED child jobs as unsettled', async () => {
    const h = harness();
    h.failed.importBatchIds = ['batch'];
    h.state.item = { status: 'FAILED' };
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_DEFERRED_USER_BUSY',
    );
    expect(h.items.findFirst.mock.calls[0][0].where.status.notIn).not.toContain(
      'FAILED',
    );
  });

  it('requires every unrelated failure to be explicitly named', async () => {
    const h = harness();
    h.state.others.push({ ...h.failed, id: 'unreviewed' });
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
  });

  it('deduplicates identical decisions and audits changed checkpoints', async () => {
    const h = harness();
    await h.start(decision);
    await h.start(decision);
    expect(h.row.beforeManifest.deferredFailureAudits).toHaveLength(1);
    h.failed.rawCursor = 'changed';
    await h.start(decision);
    expect(h.row.beforeManifest.deferredFailureAudits).toHaveLength(2);
    const audits = h.row.beforeManifest.deferredFailureAudits;
    expect(audits[0].decision.migrations[0].checkpointFingerprint).not.toBe(
      audits[1].decision.migrations[0].checkpointFingerprint,
    );
  });
});
