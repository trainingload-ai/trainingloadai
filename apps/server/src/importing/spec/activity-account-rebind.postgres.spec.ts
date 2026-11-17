import { ActivitySourceLifecycleService } from '../../sync/activity-source-lifecycle.service';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ThirdPartyActivityProjectorService } from '../third-party-activity-projector.service';
import { ActivityAssociationService } from '../activity-association.service';
import { CanonicalActivityMaterializer } from '../canonical-activity.materializer';
import { ActivityDatasetSelectorService } from '../activity-dataset-selector.service';
import { ActivityIngestService } from '../../api/activity/activity-ingest.service';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';
import { SensorFileQueryService } from '../../sensor/sensor-file-query.service';
import { SensorFileRepository } from '../../sensor/persistence/sensor-file.repository';
import { ThirdPartyActivityExportService } from '../../sync/third-party-activity-export.service';
import { IntervalsIcuService } from '../../api/intervals-icu/intervals-icu.service';
import type { CanonicalActivityPayload } from '../canonical-activity.types';

// Defaults to PostgreSQL-compatible PGlite in CI; the dedicated URL runs real PostgreSQL.
describe('account rebinding / database ownership and concurrency', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let projector: ThirdPartyActivityProjectorService;
  let materializer: CanonicalActivityMaterializer;
  let service: IntervalsIcuService;
  beforeAll(async () => {
    database = fork(resolve(__dirname, 'account-rebind-database.mjs'), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const url = await new Promise<string>((done, fail) => {
      database.once('message', (message: { url: string }) => done(message.url));
      database.once('error', fail);
      database.once('exit', (code) =>
        fail(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({ datasourceUrl: url });
    await prisma.$connect();
    projector = new ThirdPartyActivityProjectorService(
      prisma as never,
      new ImportingJobService(new ImportingJobRepository(prisma as never)),
    );
    materializer = new CanonicalActivityMaterializer(
      prisma as never,
      {} as never,
      {
        fromProvider: async () => null,
        resolve: async () => ({ code: 'ROAD_RUNNING' }),
        get: async () => ({ code: 'ROAD_RUNNING', family: 'RUN' }),
      } as never,
      { initializeFromCoordinateActivity: async () => undefined } as never,
      new ActivityAssociationService(prisma as never),
      new ActivityDatasetSelectorService(),
      new SensorFileQueryService(new SensorFileRepository(prisma as never)),
      new ActivityIngestService(prisma as never),
      new ImportingJobService(new ImportingJobRepository(prisma as never)),
    );
    service = new IntervalsIcuService(
      prisma as never,
      {
        getProfile: async () => ({ athlete: { id: 'remote-athlete' } }),
      } as never,
      {
        encrypt: () => 'test-cipher',
        fingerprint: () => 'test-fingerprint',
        last4: () => 'test',
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { model: () => prisma.externalProviderConnection } as never,
    );
  }, 60_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });
  beforeEach(async () => {
    await prisma.t_user.deleteMany();
    for (const id of ['old', 'new'])
      await prisma.t_user.create({
        data: {
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
  });
  const bind = (userId: string) =>
    service.connect(userId, { apiKey: 'test-key', syncActivities: false });
  async function importActivity(userId: string) {
    const sourceUid = `intervals:${userId}:remote-activity#0`;
    const batch = await prisma.importBatchJob.create({
      data: { userId, sourceKind: 'INTERVALS_ICU', totalCount: 1 },
    });
    const source = await prisma.importSourceObject.upsert({
      where: {
        import_source_object_identity_unique: {
          userId,
          sourceKind: 'INTERVALS_ICU',
          sourceUid,
        },
      },
      create: {
        userId,
        sourceKind: 'INTERVALS_ICU',
        sourceUid,
        externalId: 'remote-activity',
      },
      update: {},
    });
    const item = await prisma.importItemJob.create({
      data: {
        userId,
        batchJobId: batch.id,
        sourceObjectId: source.id,
        sourceKind: 'INTERVALS_ICU',
        sourceUid,
      },
    });
    const payload = {
      source: {
        kind: 'INTERVALS_ICU',
        provider: 'intervals_icu',
        sourceUid,
        externalId: 'remote-activity',
        accountRef: 'remote-athlete',
      },
      identity: { dedupeKey: 'same-activity', datasetChecksum: 'a'.repeat(64) },
      summary: {
        name: 'Test run',
        sportType: 'RUN',
        startTime: '2026-11-01T00:00:00Z',
        timezone: 'UTC',
      },
      records: [],
      laps: [],
      lengths: [],
      metadata: {},
    } as CanonicalActivityPayload;
    const projected = await projector.project({
      userId,
      sourceObjectId: source.id,
      batchJobId: batch.id,
      payload,
    });
    const result = await materializer.materialize({
      userId,
      itemJobId: item.id,
      batchJobId: batch.id,
      sourceObjectId: source.id,
      payload,
      thirdPartyActivityId: projected!.id,
    });
    return { ...result, projectionId: projected!.id, payload, source, batch };
  }
  it('retains the old account and independently imports the same activity after disconnect and rebind', async () => {
    await bind('old');
    const old = await importActivity('old');
    const before = await prisma.activity.findUnique({
      where: { id: old.activity.id },
    });
    await service.disconnect('old');
    await bind('new');
    const next = await importActivity('new');
    expect(next.activity.id).not.toBe(old.activity.id);
    expect(next.projectionId).not.toBe(old.projectionId);
    expect(
      await prisma.activity.findUnique({ where: { id: old.activity.id } }),
    ).toEqual(before);
    expect(await prisma.activity.count()).toBe(2);
    const repeat = await importActivity('new');
    expect(repeat.activity.id).toBe(next.activity.id);
    expect(await prisma.activity.count()).toBe(2);
    expect(await prisma.thirdPartyActivity.count()).toBe(2);
    await expect(bind('old')).rejects.toThrow(
      'intervals_icu_account_already_connected',
    );
  });
  (process.env.ACTIVITY_REBIND_TEST_POSTGRES_URL ? it : it.skip)(
    'allows exactly one winner when two users bind concurrently',
    async () => {
      const results = await Promise.allSettled([bind('old'), bind('new')]);
      if (!results.some((r) => r.status === 'fulfilled'))
        throw new Error(
          results
            .map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok'))
            .join(' | '),
        );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await prisma.externalProviderConnection.count({
          where: { status: 'ACTIVE', externalAthleteId: 'remote-athlete' },
        }),
      ).toBe(1);
      const rejected = results.find(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason.message).toContain(
        'intervals_icu_account_already_connected',
      );
    },
  );
  it('isolates concurrent imports and export mappings for the same remote activity', async () => {
    const [old, next] = await Promise.all([
      importActivity('old'),
      importActivity('new'),
    ]);
    const before = await prisma.thirdPartyActivity.findUnique({
      where: { id: old.projectionId },
    });
    const exporter = new ThirdPartyActivityExportService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await exporter.recordExportMapping({
      activity: next.activity,
      provider: 'intervals_icu',
      externalId: 'remote-activity#0',
      externalUserId: 'remote-athlete',
      response: {},
      exportFile: { fileName: 'test.fit', source: 'generated_fit' },
      exportedBy: 'test',
    });
    expect(
      await prisma.thirdPartyActivity.findUnique({
        where: { id: old.projectionId },
      }),
    ).toEqual(before);
    expect(
      await prisma.activityThirdPartyMapping.findUnique({
        where: { thirdPartyActivityId: next.projectionId },
      }),
    ).toMatchObject({
      activityId: next.activity.id,
      syncDirection: 'BIDIRECTIONAL',
    });
    const lifecycle = new ActivitySourceLifecycleService(
      prisma as never,
      new ImportingJobService(new ImportingJobRepository(prisma as never)),
    );
    await lifecycle.deactivateProviderData({
      userId: 'new',
      provider: 'intervals_icu',
      externalIds: ['remote-activity'],
    });
    expect(
      await prisma.thirdPartyActivity.findUnique({
        where: { id: old.projectionId },
      }),
    ).toEqual(before);
    expect(
      await prisma.thirdPartyActivity.findUnique({
        where: { id: next.projectionId },
      }),
    ).toMatchObject({ state: 0 });
    expect(
      await prisma.activity.findUnique({ where: { id: old.activity.id } }),
    ).toMatchObject({ state: 1 });
    expect(
      await prisma.activity.findUnique({ where: { id: next.activity.id } }),
    ).toMatchObject({ state: 0 });

    await expect(
      projector.project({
        userId: 'new',
        sourceObjectId: next.source.id,
        batchJobId: next.batch.id,
        payload: next.payload,
        preferredThirdPartyActivityId: old.projectionId,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_IDENTITY_CONFLICT' });
  });
});
