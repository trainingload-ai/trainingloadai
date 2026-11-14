import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { ImportItemWorkerService } from '../import-item.worker';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';
import { ExternalActivitySourceRouter } from '../external-activity-source-router.service';
import { ExternalActivityMirrorService } from '../external-activity-mirror.service';
import { ImportSourceDataUnavailableError } from '../import-item-provider.port';

// Opt-in only: never inherit DATABASE_URL or load a developer's .env.
const databaseUrl = process.env.IMPORT_SOURCE_TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;

postgres('unavailable source transactions / PostgreSQL', () => {
  let prisma: PrismaClient;
  let router: ExternalActivitySourceRouter;
  let worker: {
    activeLeaseTokens: Map<string, string>;
    failClaimedItem: (job: unknown, error: unknown) => Promise<void>;
  };
  const job = { id: 'item', userId: 'owner', batchJobId: 'batch', sourceObjectId: 'source', sourceKind: 'FILE' };
  const error = new ImportSourceDataUnavailableError('SAMPLES_ABSENT', 'records', false);

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.startsWith('/strava_import_test_')) {
      throw new Error('An isolated loopback import test database is required');
    }
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const jobs = new ImportingJobService(new ImportingJobRepository(prisma as never));
    router = new ExternalActivitySourceRouter(prisma as never, jobs);
    const args: unknown[] = Array.from({ length: 19 }, () => ({}));
    args[0] = prisma;
    args[1] = { get: () => 3 };
    args[16] = jobs;
    args[17] = new ExternalActivityMirrorService(prisma as never, jobs);
    args[18] = router;
    worker = new ImportItemWorkerService(...args as ConstructorParameters<typeof ImportItemWorkerService>) as unknown as typeof worker;
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await prisma.t_user.deleteMany();
    await prisma.t_user.create({ data: { id: 'owner', name: 'Test athlete', email: 'owner@example.invalid', emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
    await prisma.importBatchJob.create({ data: { id: 'batch', userId: 'owner', sourceKind: 'FILE', totalCount: 1 } });
    await prisma.importSourceObject.create({ data: { id: 'source', userId: 'owner', sourceKind: 'FILE', provider: 'upload', sourceUid: 'source', metadata: { retained: true } } });
    await prisma.importItemJob.create({ data: { id: 'item', userId: 'owner', sourceKind: 'FILE', sourceUid: 'source', sourceObjectId: 'source', batchJobId: 'batch', status: 'NORMALIZING', lockToken: 'lease' } });
    worker.activeLeaseTokens.set('item', 'lease');
  });

  it('commits one skipped item and one retained source under concurrent completion', async () => {
    await Promise.all([worker.failClaimedItem(job, error), worker.failClaimedItem(job, error)]);
    expect(await prisma.importItemJob.findUnique({ where: { id: 'item' } })).toMatchObject({ status: 'SKIPPED', attempts: 1, analysisRequired: false });
    expect(await prisma.importSourceObject.findUnique({ where: { id: 'source' } })).toMatchObject({ resolutionStatus: 'BLOCKED', resolutionReason: 'UPSTREAM_DATA_UNAVAILABLE' });
    expect(await prisma.activity.count()).toBe(0);
  });

  it('rolls back item completion together with a failed source update', async () => {
    const original = router.keepUnavailableSource.bind(router);
    router.keepUnavailableSource = async (...args) => { await original(...args); throw new Error('forced source failure'); };
    try {
      await expect(worker.failClaimedItem(job, error)).rejects.toThrow('forced source failure');
      expect(await prisma.importItemJob.findUnique({ where: { id: 'item' } })).toMatchObject({ status: 'NORMALIZING', attempts: 0, lockToken: 'lease' });
      expect(await prisma.importSourceObject.findUnique({ where: { id: 'source' } })).toMatchObject({ resolutionStatus: 'IMPORTABLE', metadata: { retained: true } });
    } finally { router.keepUnavailableSource = original; }
  });

  it('rechecks the lease after waiting for a competing database writer', async () => {
    let signalLocked!: () => void;
    let releaseWriter!: () => void;
    const locked = new Promise<void>((done) => { signalLocked = done; });
    const released = new Promise<void>((done) => { releaseWriter = done; });
    const competitor = prisma.$transaction(async (tx) => {
      await tx.importItemJob.update({ where: { id: 'item' }, data: { lockToken: 'next-lease' } });
      signalLocked();
      await released;
    }, { timeout: 10_000 });
    await locked;
    const completion = worker.failClaimedItem(job, error);
    try {
      let waiting = false;
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline && !waiting) {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%t_import_item_job%') AS waiting`;
        waiting = rows[0].waiting;
        if (!waiting) await new Promise((done) => setTimeout(done, 20));
      }
      expect(waiting).toBe(true);
    } finally {
      releaseWriter();
      await competitor;
      await completion;
    }
    expect(await prisma.importItemJob.findUnique({ where: { id: 'item' } })).toMatchObject({ status: 'NORMALIZING', attempts: 0, lockToken: 'next-lease' });
    expect(await prisma.importSourceObject.findUnique({ where: { id: 'source' } })).toMatchObject({ resolutionStatus: 'IMPORTABLE' });
  }, 15_000);
});
