import { Prisma } from '@prisma/client';
import { ActivityDataMigrationService } from '../activity-data-migration.service';

function harness() {
  const row: any = {
    id: 'migration-1',
    userId: 'user-1',
    status: 'FAILED',
    phase: 'WAIT_VERIFY_REPLAY',
    errorCode: 'ACTIVITY_MIGRATION_IDEMPOTENCE_FAILED',
    recomputeJobId: 'verification-1',
    rawCursor: 'source-last',
    importBatchIds: ['batch-1'],
    verification: { ok: true, resultFingerprint: 'old-result' },
    beforeManifest: {
      protectedHash: 'protected',
      primaryHash: 'primary',
      rawFileIntegrityAudits: [{ sourceObjectId: 'source-1' }],
      sportRepairs: { repaired: 2 },
    },
  };
  const state = { leased: false, jobStatus: 'COMPLETED' };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    activityDataMigration: {
      findUniqueOrThrow: jest.fn(async () => row),
      update: jest.fn(async ({ data }) => ({ ...row, ...data })),
    },
    activityAnalysisLease: {
      findFirst: jest.fn(async () => (state.leased ? { id: 'lease' } : null)),
    },
    activityRecomputeJob: {
      findUnique: jest.fn(async () => ({ status: state.jobStatus })),
      update: jest.fn(),
    },
  };
  const mutateImports = jest.fn();
  const jobs = {
    itemJobs: () => ({ updateMany: mutateImports }),
    batchJobs: () => ({ updateMany: mutateImports }),
    postProcessJobs: () => ({ updateMany: mutateImports }),
  };
  const service = new ActivityDataMigrationService(
    { $transaction: async (fn: any) => fn(tx) } as never,
    {} as never,
    jobs as never,
    {} as never,
    {} as never,
  );
  const manifest = jest.spyOn(service as any, 'manifest').mockResolvedValue({
    protectedHash: 'protected',
    primaryHash: 'primary',
  });
  return { service, row, state, tx, manifest, mutateImports };
}

describe('retry of a failed completed verification replay', () => {
  it.each([
    'ACTIVITY_MIGRATION_IDEMPOTENCE_FAILED',
    'ACTIVITY_MIGRATION_RESULTS_CHANGED',
  ])('requires a fresh full replay and verification after %s', async (code) => {
    const h = harness();
    h.row.errorCode = code;
    const original = structuredClone(h.row);
    const result = await h.service.retry(h.row.id);
    expect(result).toMatchObject({
      status: 'MIGRATING',
      phase: 'WAIT_IMPORT',
      recomputeJobId: null,
      verification: Prisma.DbNull,
      errorCode: null,
      rawCursor: original.rawCursor,
      importBatchIds: original.importBatchIds,
    });
    expect(result.beforeManifest).toMatchObject(original.beforeManifest);
    expect(result.beforeManifest.generation).toEqual(expect.any(String));
    expect(result.beforeManifest.verificationRetryHistory).toEqual([
      expect.objectContaining({
        recomputeJobId: 'verification-1',
        generation: 'initial',
        errorCode: code,
        verification: original.verification,
      }),
    ]);
    expect(h.tx.activityRecomputeJob.update).not.toHaveBeenCalled();
    expect(h.mutateImports).not.toHaveBeenCalled();
    expect(h.row).toEqual(original);
  });

  it.each(['protectedHash', 'primaryHash'])(
    'rejects changed %s without writes',
    async (field) => {
      const h = harness();
      h.manifest.mockResolvedValue({
        protectedHash: 'protected',
        primaryHash: 'primary',
        [field]: 'changed',
      });
      await expect(h.service.retry(h.row.id)).rejects.toThrow(
        'ACTIVITY_MIGRATION_PROTECTED_DATA_CHANGED',
      );
      expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
      expect(h.mutateImports).not.toHaveBeenCalled();
    },
  );

  it.each(['RUNNING', 'DEAD', 'SCHEDULED'])(
    'rejects an unsettled %s verification job',
    async (status) => {
      const h = harness();
      h.state.jobStatus = status;
      await expect(h.service.retry(h.row.id)).rejects.toThrow(
        'ACTIVITY_MIGRATION_USER_ANALYSIS_BUSY',
      );
      expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
      expect(h.mutateImports).not.toHaveBeenCalled();
    },
  );

  it('waits for a live analysis lease to finish', async () => {
    const h = harness();
    h.state.leased = true;
    await expect(h.service.retry(h.row.id)).rejects.toThrow(
      'ACTIVITY_MIGRATION_USER_ANALYSIS_BUSY',
    );
    expect(h.tx.activityDataMigration.update).not.toHaveBeenCalled();
  });

  it('retains every prior failed verification when retrying another generation', async () => {
    const h = harness();
    h.row.beforeManifest.generation = 'generation-2';
    h.row.beforeManifest.verificationRetryHistory = [{ at: 'earlier' }];
    const result = await h.service.retry(h.row.id);
    expect(result.beforeManifest.verificationRetryHistory).toEqual([
      { at: 'earlier' },
      expect.objectContaining({ generation: 'generation-2' }),
    ]);
    expect(result.beforeManifest.generation).not.toBe('generation-2');
  });
});
