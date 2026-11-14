import { describe, expect, it, jest } from '@jest/globals';
import { ImportItemWorkerService } from '../import-item.worker';
import { ImportSourceDataUnavailableError } from '../import-item-provider.port';
import { IntervalsIcuApiError } from '../../integrations/intervals-icu/intervals-icu.client';
import { registerExternalActivityOriginRoutingExtension } from '../external-activity-origin-routing.port';

const job = {
  id: 'item',
  userId: 'owner',
  sourceObjectId: 'source',
  batchJobId: 'batch',
  sourceKind: 'FILE',
};

function setup(attempts = 0, claimed = true) {
  const items = {
    findFirst: jest.fn(async () => ({ attempts })),
    updateMany: jest.fn(async () => ({ count: claimed ? 1 : 0 })),
    update: jest.fn(async () => ({})),
    findUnique: jest.fn(async () => ({
      attempts: attempts + 1,
      activityId: 42,
    })),
  };
  const tx = { importItemJob: items };
  const activityUpdate = jest.fn(async () => ({ count: 0 }));
  const prisma = {
    $transaction: jest.fn(async (work: (client: unknown) => unknown) =>
      work(tx),
    ),
    activity: { updateMany: activityUpdate },
  };
  const router = {
    keepUnavailableSource: jest.fn(async () => undefined),
    routePersistedIntervalsDiscovery: jest.fn(async () => ({
      kind: 'KEEP_BLOCKED_SOURCE',
    })),
  };
  const mirrors = { markOriginImportFailed: jest.fn(async () => undefined) };
  const args: unknown[] = Array.from({ length: 19 }, () => ({}));
  args[0] = prisma;
  args[1] = { get: () => 3 };
  args[16] = { itemJobs: () => items };
  args[17] = mirrors;
  args[18] = router;
  const service = new ImportItemWorkerService(
    ...(args as ConstructorParameters<typeof ImportItemWorkerService>),
  );
  const worker = service as unknown as {
    activeLeaseTokens: Map<string, string>;
    failClaimedItem: (item: unknown, error: unknown) => Promise<void>;
  };
  worker.activeLeaseTokens.set(job.id, 'lease');
  return { worker, items, tx, prisma, router, mirrors, activityUpdate };
}

describe('unavailable import source completion', () => {
  it('retains the source and completes without touching existing activity data', async () => {
    const h = setup();
    const error = new ImportSourceDataUnavailableError(
      'SAMPLES_ABSENT',
      'records',
      false,
    );
    await h.worker.failClaimedItem(job, error);
    expect(h.items.updateMany).toHaveBeenCalledWith({
      where: { id: 'item', userId: 'owner', lockToken: 'lease' },
      data: expect.objectContaining({
        status: 'SKIPPED',
        outcome: 'UPSTREAM_DATA_UNAVAILABLE',
        analysisRequired: false,
        lastErrorCode: 'SAMPLES_ABSENT',
      }),
    });
    expect(h.router.keepUnavailableSource).toHaveBeenCalledWith(
      { userId: 'owner', sourceObjectId: 'source', error },
      h.tx,
    );
    expect(h.mirrors.markOriginImportFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'UPSTREAM_DATA_UNAVAILABLE' }),
      h.tx,
    );
    expect(h.activityUpdate).not.toHaveBeenCalled();
  });

  it('does not route or change a source when the item lease has been replaced', async () => {
    const h = setup(0, false);
    await h.worker.failClaimedItem(
      job,
      new ImportSourceDataUnavailableError('SAMPLES_ABSENT', 'records', false),
    );
    expect(h.router.keepUnavailableSource).not.toHaveBeenCalled();
    expect(h.mirrors.markOriginImportFailed).not.toHaveBeenCalled();
  });

  it('keeps unknown availability failures on the existing bounded retry path', async () => {
    const h = setup();
    await h.worker.failClaimedItem(
      job,
      new ImportSourceDataUnavailableError(
        'SAMPLES_UNAVAILABLE',
        'records',
        true,
        404,
      ),
    );
    expect(h.items.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'SAMPLES_UNAVAILABLE',
        }),
      }),
    );
    expect(h.router.keepUnavailableSource).not.toHaveBeenCalled();
    expect(h.activityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42, processingStatus: { not: 'READY' } },
      }),
    );
  });

  it('retains a mirror when an unknown availability failure exhausts automatic retries', async () => {
    const h = setup(2);
    await h.worker.failClaimedItem(
      job,
      new ImportSourceDataUnavailableError(
        'SAMPLES_UNAVAILABLE',
        'records',
        true,
        404,
      ),
    );
    expect(h.router.keepUnavailableSource).toHaveBeenCalledTimes(1);
    expect(h.items.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SKIPPED' }),
      }),
    );
  });

  it('uses the same lease-fenced completion for the existing origin-routing case', async () => {
    const unregister = registerExternalActivityOriginRoutingExtension({
      route: async () => null,
      matchesUnavailableOriginError: () => true,
    });
    try {
      const h = setup();
      await h.worker.failClaimedItem(
        { ...job, sourceKind: 'INTERVALS_ICU' },
        new IntervalsIcuApiError(422, 'unavailable', 'source restriction'),
      );
      expect(h.router.routePersistedIntervalsDiscovery).toHaveBeenCalledWith(
        expect.objectContaining({ confirmedOriginUnavailable: true }),
        h.tx,
      );
      expect(h.items.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SKIPPED',
            lastErrorCode: 'INTERVALS_ICU_ORIGIN_DATA_UNAVAILABLE',
          }),
        }),
      );
    } finally {
      unregister();
    }
  });
});
