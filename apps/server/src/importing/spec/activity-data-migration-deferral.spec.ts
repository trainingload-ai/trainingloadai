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
      findUniqueOrThrow: jest.fn(async ({ where }) => {
        const target = [row, failed].find((item) => item.id === where.id);
        if (!target) throw new Error(`missing migration ${where.id}`);
        return target;
      }),
      update: jest.fn(async ({ where, data }) => {
        const target = [row, failed].find((item) => item.id === where.id);
        if (!target) throw new Error(`unexpected migration ${where.id}`);
        Object.assign(target, data);
        return target;
      }),
    },
    activityAnalysisLease: { findFirst: jest.fn(async () => state.lease) },
    activityRecomputeJob: { findUnique: jest.fn(async () => state.replay) },
    storageObjectRetention: { createMany: jest.fn() },
    sportDefinition: { findMany: jest.fn(async () => []) },
    providerSportMapping: { findMany: jest.fn(async () => []) },
  };
  const items = {
    findFirst: jest.fn(async () => state.item),
    updateMany: jest.fn(async () => ({ count: 0 })),
  };
  const post = {
    findFirst: jest.fn(async () => state.post),
    updateMany: jest.fn(async () => ({ count: 0 })),
  };
  const batches = { updateMany: jest.fn(async () => ({ count: 0 })) };
  const service = new ActivityDataMigrationService(
    { $transaction: async (fn: any) => fn(tx) } as never,
    {} as never,
    {
      itemJobs: () => items,
      batchJobs: () => batches,
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
    batches,
    service,
    start: (deferral?: any) => (service as any).start('current-run', deferral),
  };
}
const decision = {
  migrationIds: ['failed'],
  reason: 'Repair failed sources after the full pass',
};

describe('one active migration barrier', () => {
  it('queries FAILED together with MIGRATING and VERIFYING', async () => {
    const h = harness();
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.tx.activityDataMigration.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 'current' },
        status: { in: ['MIGRATING', 'VERIFYING', 'FAILED'] },
      },
      select: { id: true },
    });
  });

  it('keeps failed runs blocking by default', async () => {
    const h = harness();
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
    expect(h.row.status).not.toBe('VERIFIED');
  });

  it('does not start another user while FAILED remains, even when that row is named', async () => {
    const h = harness();
    const original = structuredClone(h.failed);
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.failed).toEqual(original);
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
    expect(h.items.findFirst).not.toHaveBeenCalled();
    expect(h.row.status).toBe('MIGRATING');
    expect(h.row.beforeManifest.deferredFailureAudits).toBeUndefined();
  });

  it('does not initialize the next user or record a deferral audit while FAILED remains', async () => {
    const h = harness();
    h.row.status = 'PENDING';
    h.row.beforeManifest = null;
    const manifest = jest
      .spyOn(h.service as any, 'manifest')
      .mockResolvedValue({
        protectedHash: 'new-baseline',
        primaryHash: 'new-primary',
        files: [],
      });
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(manifest).not.toHaveBeenCalled();
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
    expect(h.row.status).toBe('PENDING');
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
    'still blocks while a failed user has an unsettled %s',
    async (kind) => {
      const h = harness();
      h.failed.importBatchIds = ['batch'];
      h.failed.recomputeJobId = 'replay';
      h.state.replay = { status: 'COMPLETED' };
      h.state[kind] =
        kind === 'replay' ? { status: 'RUNNING' } : { id: 'busy' };
      await expect(h.start(decision)).rejects.toThrow(
        'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
      );
      expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
      expect(h.items.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects before inspecting automatically retrying FAILED child jobs', async () => {
    const h = harness();
    h.failed.importBatchIds = ['batch'];
    h.state.item = { status: 'FAILED' };
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.items.findFirst).not.toHaveBeenCalled();
  });

  it('blocks while any other barrier row still exists', async () => {
    const h = harness();
    h.state.others.push({ ...h.failed, id: 'unreviewed' });
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
  });

  it('does not append a deferral audit when the same FAILED barrier is retried', async () => {
    const h = harness();
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    h.failed.rawCursor = 'changed';
    await expect(h.start(decision)).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.row.beforeManifest.deferredFailureAudits).toBeUndefined();
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
  });

  it('lets the failed user retry, then lets the next user start only after that barrier is cleared', async () => {
    const h = harness();
    h.row.status = 'PENDING';
    h.row.beforeManifest = null;
    jest.spyOn(h.service as any, 'manifest').mockResolvedValue({
      protectedHash: 'new-baseline',
      primaryHash: 'new-primary',
      files: [],
      activityIds: [],
      activityCount: 0,
    });
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.row.status).toBe('PENDING');

    const retried = await h.service.retry('failed');
    expect(retried.status).toBe('MIGRATING');
    expect(h.failed.errorCode).toBeNull();
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.row.status).toBe('PENDING');

    h.failed.status = 'VERIFIED';
    h.state.others = [];
    const started = await h.start();
    expect(started.status).toBe('MIGRATING');
    expect(started.phase).toBe('RAW_SCAN');
    expect(h.row.status).not.toBe('VERIFIED');
  });

  it('maps a one_active unique violation to the barrier error without marking the user verified', async () => {
    const h = harness();
    h.state.others = [];
    h.row.status = 'PENDING';
    h.row.beforeManifest = null;
    jest.spyOn(h.service as any, 'manifest').mockResolvedValue({
      protectedHash: 'p',
      primaryHash: 'h',
      files: [],
      activityIds: [],
      activityCount: 0,
    });
    h.tx.activityDataMigration.update.mockImplementationOnce(async () => {
      const error = new Error(
        'Unique constraint failed on activity_data_migration_one_active',
      );
      (error as any).code = 'P2002';
      (error as any).meta = { target: 'activity_data_migration_one_active' };
      throw error;
    });
    await expect(h.start()).rejects.toThrow(
      'ACTIVITY_MIGRATION_ANOTHER_RUN_ACTIVE',
    );
    expect(h.row.status).toBe('PENDING');
  });
});
