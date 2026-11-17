import { importingJobRepository } from '@/importing/spec/importing-job.fixture';
import { datasetRepairFingerprint } from '../activity-dataset-repair';
import { CanonicalActivityMaterializer } from '../canonical-activity.materializer';
import { ActivityAssociationService } from '../activity-association.service';
import { ActivityDatasetSelectorService } from '../activity-dataset-selector.service';
import { ActivityIngestService } from '@/api/activity/activity-ingest.service';
import { SensorFileQueryService } from '@/sensor/sensor-file-query.service';
import { SensorFileRepository } from '@/sensor/persistence/sensor-file.repository';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ImportBatchService } from '../import-batch.service';
import { ImportingJobService } from '../importing-job.service';
import { ImportItemWorkerService } from '../import-item.worker';
import { ExternalActivitySourceRouter } from '../external-activity-source-router.service';
import { RemoteActivityFileService } from '../remote-activity-file.service';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';

const url = process.env.COACH_FACT_TEST_DATABASE_URL;
const databaseTests = url ? describe : describe.skip;

databaseTests('Source revision handoff on PostgreSQL', () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? 'postgresql://invalid/unused',
  });
  const userId = `fact-test-${randomUUID()}`;
  const sportCode = `FACT_TEST_RUN_${randomUUID()}`;
  const jobs = new ImportingJobService(importingJobRepository(db as never));
  const batches = new ImportBatchService(
    db as never,
    {} as never,
    { t: (key: string) => key } as never,
    jobs,
    { users: () => db.t_user } as never,
    new ExternalActivitySourceRouter(db as never, jobs),
  );
  const connectionId = `fact-connection-${randomUUID()}`;
  const accountRef = `global:${userId}`;
  const sourceUid = (name: string) => `garmin:${userId}:${name}`;
  const createWorker = (extension: unknown) =>
    new ImportItemWorkerService(
      db as never,
      { get: () => undefined } as never,
      {} as never,
      {} as never,
      {} as never,
      extension as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      batches,
      {} as never,
      {} as never,
      undefined,
      jobs,
      {} as never,
      {} as never,
    );
  const createMaterializer = () =>
    new CanonicalActivityMaterializer(
      db as never,
      {} as never,
      {
        fromProvider: async () => null,
        resolve: async () => ({ code: sportCode }),
        get: async () => ({ code: sportCode, family: 'RUN', active: true }),
      } as never,
      {
        initializeFromAvailableSignals: async () => ({}),
        initializeFromCoordinateActivity: async () => ({}),
      } as never,
      new ActivityAssociationService(db as never),
      new ActivityDatasetSelectorService(),
      new SensorFileQueryService(new SensorFileRepository(db as never)),
      new ActivityIngestService(db as never),
      jobs,
    );
  const submit = (
    name: string,
    revision: string,
    skipCompletedUnchanged = false,
  ) =>
    batches.createExternalProviderImportBatch({
      userId,
      provider: 'garmin',
      sourceKind: 'GARMIN_PERSONAL_API',
      candidates: [
        {
          sourceUid: sourceUid(name),
          externalId: name,
          accountRef,
          objectType: 'third_party_activity',
          rawChecksum: revision,
          rawPayload: { revision },
          sourceRef: {
            externalId: name,
            personalAuthorization: {
              connectionId,
              fingerprint: 'fixture-grant',
              accountRef,
            },
          },
        },
      ],
      requestContext: { source: 'test' },
      reuseRunningBatch: true,
      skipCompletedUnchanged,
    });

  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      !target.pathname.startsWith('/coach_fact_test')
    )
      throw new Error('A dedicated local coach_fact_test database is required');
    await db.t_user.create({
      data: {
        id: userId,
        name: 'Fixture',
        email: `${userId}@fixtures.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await db.sportDefinition.create({
      data: { code: sportCode, family: 'RUN', displayName: 'Fixture run' },
    });
    await db.externalProviderConnection.create({
      data: {
        id: connectionId,
        userId,
        provider: 'garmin',
        externalAthleteId: userId,
        status: 'ACTIVE',
        credentialCiphertext: 'fixture-only',
        credentialFingerprint: 'fixture-grant',
        metadata: { connectionMode: 'personal_api', region: 'global' },
      },
    });
  });
  afterAll(async () => {
    await db.t_user.deleteMany({ where: { id: userId } });
    await db.sportDefinition.deleteMany({ where: { code: sportCode } });
    await db.$disconnect();
  });

  it('persists R2 while R1 is in flight and schedules its independent successor', async () => {
    const first = await submit('handoff', 'r1');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: item.sourceObjectId },
    });
    await db.importItemJob.update({
      where: { id: item.id },
      data: {
        status: 'NORMALIZING',
        sourceRevision: source.importRevision,
        lockToken: 'worker-r1',
      },
    });
    await submit('handoff', 'r2');
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).rawChecksum,
    ).toBe('r2');
    await jobs.finishRevisionedItem({
      id: item.id,
      lockToken: 'worker-r1',
      data: { status: 'DONE', lockToken: null, leaseExpiresAt: null },
    });
    const next = await db.importItemJob.findFirstOrThrow({
      where: { userId, sourceUid: sourceUid('handoff'), status: 'QUEUED' },
    });
    expect(next.status).toBe('QUEUED');
    expect(next.attempts).toBe(0);
    expect(next.lockToken).toBeNull();
  });

  it('concurrent retries create one active item and retain the latest desired revision', async () => {
    await Promise.all(
      Array.from({ length: 6 }, () => submit('concurrent', 'r1')),
    );
    expect(
      await db.importItemJob.count({
        where: { userId, sourceUid: sourceUid('concurrent') },
      }),
    ).toBe(1);
    await submit('concurrent', 'r2');
    await submit('concurrent', 'r3');
    const source = await db.importSourceObject.findFirstOrThrow({
      where: { userId, sourceUid: sourceUid('concurrent') },
    });
    expect(source.rawChecksum).toBe('r3');
    expect(source.importRevision).toBeTruthy();
    expect(
      await db.importItemJob.count({
        where: { userId, sourceUid: sourceUid('concurrent') },
      }),
    ).toBe(1);
  });

  it('rejects a late completion after its lease has been transferred', async () => {
    const first = await submit('lease', 'r1');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    await db.importItemJob.update({
      where: { id: item.id },
      data: { status: 'NORMALIZING', lockToken: 'new-worker' },
    });
    await expect(
      jobs.finishRevisionedItem({
        id: item.id,
        lockToken: 'old-worker',
        data: { status: 'DONE' },
      }),
    ).rejects.toThrow('IMPORT_ITEM_LEASE_LOST');
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: item.id } }))
        .lockToken,
    ).toBe('new-worker');
  });

  it.each(['complete', 'fail'])(
    'the real worker consumes R3 after R1 %s, coalescing R2',
    async (outcome) => {
      const first = await submit(`worker-${outcome}`, 'r1');
      const item = await db.importItemJob.findFirstOrThrow({
        where: { batchJobId: first.batch!.id },
      });
      await db.importItemJob.update({
        where: { id: item.id },
        data: { analysisRequired: false },
      });
      let release!: () => void;
      let signalStarted!: () => void;
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const consumed: Array<string | null> = [];
      const extension = {
        supportsPreprocess: () => true,
        preprocess: async () => {
          const source = await db.importSourceObject.findUniqueOrThrow({
            where: { id: item.sourceObjectId },
          });
          consumed.push(source.rawChecksum);
          if (consumed.length === 1) {
            signalStarted();
            await paused;
            if (outcome === 'fail') throw new Error('Old input failed');
          }
          return { finished: true };
        },
      };
      const worker = createWorker(extension);
      const control = worker as any;
      const claim = (await control.claimBatch(100)).find(
        (job: any) => job.id === item.id,
      );
      expect(claim).toBeTruthy();
      const processing = control.processJob(claim);
      await started;
      await submit(`worker-${outcome}`, 'r2');
      await submit(`worker-${outcome}`, 'r3');
      release();
      await processing;
      const successor = await db.importItemJob.findFirstOrThrow({
        where: {
          userId,
          sourceUid: sourceUid(`worker-${outcome}`),
          status: 'QUEUED',
        },
      });
      expect(successor.id).not.toBe(item.id);
      const next = (await control.claimBatch(100)).find(
        (job: any) => job.id === successor.id,
      );
      await control.processJob(next);
      expect(consumed).toEqual(['r1', 'r3']);
      expect(
        (
          await db.importItemJob.findUniqueOrThrow({
            where: { id: successor.id },
          })
        ).status,
      ).toBe('DONE');
      worker.onModuleDestroy();
    },
  );

  it.each(['finish-first', 'update-first', 'concurrent'])(
    'retains work when registration and completion race: %s',
    async (order) => {
      const name = `race-${order}`;
      const first = await submit(name, 'r1');
      const item = await db.importItemJob.findFirstOrThrow({
        where: { batchJobId: first.batch!.id },
      });
      const source = await db.importSourceObject.findUniqueOrThrow({
        where: { id: item.sourceObjectId },
      });
      await db.importItemJob.update({
        where: { id: item.id },
        data: {
          status: 'NORMALIZING',
          sourceRevision: source.importRevision,
          lockToken: 'race-worker',
        },
      });
      const finish = () =>
        jobs.finishRevisionedItem({
          id: item.id,
          lockToken: 'race-worker',
          data: { status: 'DONE', lockToken: null, leaseExpiresAt: null },
        });
      if (order === 'concurrent')
        await Promise.all([submit(name, 'r2'), finish()]);
      else if (order === 'finish-first') {
        await finish();
        await submit(name, 'r2');
      } else {
        await submit(name, 'r2');
        await finish();
      }
      expect(
        await db.importItemJob.count({
          where: { userId, sourceUid: sourceUid(name), status: 'QUEUED' },
        }),
      ).toBe(1);
      expect(
        (
          await db.importSourceObject.findUniqueOrThrow({
            where: { id: source.id },
          })
        ).rawChecksum,
      ).toBe('r2');
    },
  );

  it('rejects a late downloaded cache after a newer discovery has been accepted', async () => {
    const first = await submit('late-cache', 'r1');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: item.sourceObjectId },
    });
    let release!: () => void;
    let signalStarted!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const files = new RemoteActivityFileService(
      db as never,
      {
        uploadFile: async () => ({ fileKey: 'fixture-only-r1.fit' }),
      } as never,
      jobs,
    );
    const result = files.resolve({
      sourceObject: source,
      sourceRevision: source.importRevision!,
      fallbackFileName: 'fixture.fit',
      download: async () => {
        signalStarted();
        await paused;
        return { buffer: Buffer.from('r1'), fileName: 'r1.fit' };
      },
    });
    await started;
    await submit('late-cache', 'r2');
    release();
    await expect(result).rejects.toThrow('IMPORT_SOURCE_REVISION_CHANGED');
    const latest = await db.importSourceObject.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(latest.rawChecksum).toBe('r2');
    expect(latest.fileKey).toBeNull();
  });

  it('starts a fresh item when a new revision replaces a failed normalization', async () => {
    const first = await submit('failed-snapshot', 'r1');
    const old = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: old.sourceObjectId },
    });
    await db.importItemJob.update({
      where: { id: old.id },
      data: { status: 'FAILED', sourceRevision: source.importRevision },
    });
    const snapshot = await db.canonicalActivitySnapshot.create({
      data: {
        itemJobId: old.id,
        userId,
        sourceObjectId: source.id,
        schemaVersion: 'v1',
        payload: { revision: 'r1' },
        dedupeKey: 'failed-snapshot',
        sportType: 'RUN',
      },
    });
    await submit('failed-snapshot', 'r2');
    const successor = await db.importItemJob.findFirstOrThrow({
      where: { userId, sourceUid: source.sourceUid, status: 'QUEUED' },
    });
    expect(successor.id).not.toBe(old.id);
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: old.id } }))
        .status,
    ).toBe('SKIPPED');
    expect(
      (
        await db.canonicalActivitySnapshot.findUniqueOrThrow({
          where: { id: snapshot.id },
        })
      ).payload,
    ).toEqual({ revision: 'r1' });
  });

  it('preserves the original grant through the real fan-out and permits current child publication', async () => {
    const first = await submit('authorized-fanout', 'r1');
    const worker = createWorker({});
    const control = worker as any;
    const parent = (await control.claimBatch(100)).find(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    control.activeLeaseTokens.set(parent.id, parent.lockToken);
    control.revisionedItems.add(parent.id);
    await control.fanOutCanonicalPayloads({
      jobId: parent.id,
      batchJobId: first.batch!.id,
      userId,
      sourceObjectId: parent.sourceObjectId,
      payloads: [0, 1].map((index) => ({
        source: {
          kind: 'GARMIN_PERSONAL_API',
          sourceUid: `${sourceUid('authorized-fanout')}#${index}`,
        },
      })),
    });
    const children = (await control.claimBatch(100)).filter(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    expect(children).toHaveLength(2);
    for (const child of children) {
      await expect(
        jobs.withCurrentImport(
          { itemJobId: child.id, userId, lockToken: child.lockToken },
          async (tx) => {
            await tx.importItemJob.update({
              where: { id: child.id },
              data: { analysisRequired: false },
            });
            return 'published';
          },
        ),
      ).resolves.toBe('published');
      expect(child.sourceRevision).toBe(parent.sourceRevision);
    }
    worker.onModuleDestroy();
  });

  it('keeps fan-out inputs on their original revision and does not repeat an already consumed update', async () => {
    const first = await submit('fanout', 'r1');
    const parent = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: parent.sourceObjectId },
    });
    await db.importItemJob.update({
      where: { id: parent.id },
      data: { status: 'SKIPPED', sourceRevision: source.importRevision },
    });
    const children = await Promise.all(
      [0, 1].map((index) =>
        db.importItemJob.create({
          data: {
            batchJobId: first.batch!.id,
            userId,
            sourceObjectId: source.id,
            sourceKind: 'GARMIN_PERSONAL_API',
            sourceUid: `${source.sourceUid}#${index}`,
            sourceRevision: source.importRevision,
            position: index + 1,
            sourceRef: {
              kind: 'canonical_payload',
              payload: { revision: 'r1' },
            },
          },
        }),
      ),
    );
    await submit('fanout', 'r2');
    const worker = createWorker({});
    const claims = await (worker as any).claimBatch(100);
    expect(
      await db.importItemJob.count({ where: { sourceObjectId: source.id } }),
    ).toBe(3);
    for (const child of children) {
      const claim = claims.find((row: any) => row.id === child.id);
      expect(claim.sourceRevision).toBe(source.importRevision);
      await expect(
        jobs.withCurrentImport(
          { itemJobId: child.id, userId, lockToken: claim.lockToken },
          async () => 'published',
        ),
      ).rejects.toThrow('IMPORT_SOURCE_REVISION_CHANGED');
      await jobs.finishRevisionedItem({
        id: child.id,
        lockToken: claim.lockToken,
        data: { status: 'SKIPPED', lockToken: null, leaseExpiresAt: null },
      });
    }
    const successor = await db.importItemJob.findFirstOrThrow({
      where: {
        sourceObjectId: source.id,
        sourceUid: source.sourceUid,
        status: 'QUEUED',
      },
    });
    const nextClaim = (await (worker as any).claimBatch(100)).find(
      (job: any) => job.id === successor.id,
    );
    await jobs.finishRevisionedItem({
      id: successor.id,
      lockToken: nextClaim.lockToken,
      data: { status: 'DONE', lockToken: null, leaseExpiresAt: null },
    });
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).completedImportRevision,
    ).toBe(nextClaim.sourceRevision);
    const repeated = await submit('fanout', 'r2', true);
    expect(repeated.batch).toBeNull();
    expect(
      await db.importItemJob.count({ where: { sourceObjectId: source.id } }),
    ).toBe(4);
    expect(
      await db.importItemJob.count({
        where: { sourceObjectId: source.id, status: 'QUEUED' },
      }),
    ).toBe(0);
    worker.onModuleDestroy();
  });

  it('does not acknowledge a failed fan-out group when another child finishes successfully', async () => {
    const first = await submit('failed-fanout', 'r1');
    const parent = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    await db.importItemJob.update({
      where: { id: parent.id },
      data: { status: 'SKIPPED', lastErrorCode: 'spawned_child_items' },
    });
    await db.importItemJob.create({
      data: {
        batchJobId: parent.batchJobId,
        userId,
        sourceObjectId: parent.sourceObjectId,
        sourceKind: parent.sourceKind,
        sourceUid: `${parent.sourceUid}#0`,
        sourceRevision: parent.sourceRevision,
        position: 1,
        status: 'DEAD',
      },
    });
    const good = await db.importItemJob.create({
      data: {
        batchJobId: parent.batchJobId,
        userId,
        sourceObjectId: parent.sourceObjectId,
        sourceKind: parent.sourceKind,
        sourceUid: `${parent.sourceUid}#1`,
        sourceRevision: parent.sourceRevision,
        position: 2,
        status: 'NORMALIZING',
        lockToken: 'last-child',
      },
    });
    await jobs.finishRevisionedItem({
      id: good.id,
      lockToken: 'last-child',
      data: { status: 'DONE', lockToken: null, leaseExpiresAt: null },
    });
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: parent.sourceObjectId },
        })
      ).completedImportRevision,
    ).toBeNull();
    expect((await submit('failed-fanout', 'r1', true)).queuedCount).toBe(1);
  });

  it('replaces a committed R1 dataset after R2 arrives before the old LIGHT phase can publish', async () => {
    const first = await submit('committed-handoff', 'r1');
    const worker = createWorker({});
    const control = worker as any;
    const r1 = (await control.claimBatch(100)).find(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    control.activeLeaseTokens.set(r1.id, r1.lockToken);
    control.revisionedItems.add(r1.id);
    const materializer = createMaterializer();
    const payload = (revision: number) => ({
      source: {
        kind: 'GARMIN_PERSONAL_API',
        provider: 'garmin',
        sourceUid: sourceUid('committed-handoff'),
        accountRef,
        externalId: 'committed-handoff',
        sourceChecksum: String(revision).repeat(64),
      },
      identity: { dedupeKey: `fixture-dataset-${userId}` },
      summary: {
        name: `revision-${revision}`,
        sportType: 'RUN',
        startTime: '2026-11-18T01:00:00Z',
        endTime: '2026-11-18T02:00:00Z',
        distance: revision * 4000,
      },
      laps: [],
    });
    const materialize = (claim: any, revision: number) =>
      materializer.materialize({
        itemJobId: claim.id,
        itemLockToken: claim.lockToken,
        userId,
        sourceObjectId: claim.sourceObjectId,
        payload: payload(revision) as never,
      });
    const one = await materialize(r1, 1);
    expect(one.pendingCommit).not.toBeNull();
    await control.markStatus(r1.id, 'PARQUET_BUILDING');
    await materializer.commitStagedDataset({
      token: one.pendingCommit!,
      userId,
      sourceObjectId: r1.sourceObjectId,
      payload: payload(1) as never,
      stagedParquetFiles: [],
      itemJobId: r1.id,
      itemLockToken: r1.lockToken,
    });
    expect(
      (await db.activity.findUniqueOrThrow({ where: { id: one.activity.id } }))
        .processingStatus,
    ).toBe('ANALYZING');
    await submit('committed-handoff', 'r2');
    await expect(
      control.withCurrentDataset(
        { jobId: r1.id, userId },
        one.pendingCommit,
        async () => 'old-light',
      ),
    ).rejects.toThrow('IMPORT_SOURCE_REVISION_CHANGED');
    await jobs.finishRevisionedItem({
      id: r1.id,
      lockToken: r1.lockToken,
      data: { status: 'FAILED', lockToken: null, leaseExpiresAt: null },
    });
    const r2 = (await control.claimBatch(100)).find(
      (row: any) => row.sourceObjectId === r1.sourceObjectId,
    );
    control.activeLeaseTokens.set(r2.id, r2.lockToken);
    control.revisionedItems.add(r2.id);
    const two = await materialize(r2, 2);
    expect(two.activity.id).toBe(one.activity.id);
    expect(two.pendingCommit).not.toBeNull();
    await control.markStatus(r2.id, 'PARQUET_BUILDING');
    await materializer.commitStagedDataset({
      token: two.pendingCommit!,
      userId,
      sourceObjectId: r2.sourceObjectId,
      payload: payload(2) as never,
      stagedParquetFiles: [],
      itemJobId: r2.id,
      itemLockToken: r2.lockToken,
    });
    await control.withCurrentDataset(
      { jobId: r2.id, userId },
      two.pendingCommit,
      (tx: any) => control.completeActivityItem(r2.id, r2.batchJobId, tx),
    );
    expect(
      (await db.activity.findUniqueOrThrow({ where: { id: one.activity.id } }))
        .distance,
    ).toBe(8000);
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: r2.id } }))
        .status,
    ).toBe('DONE');
    await expect(
      control.withCurrentDataset(
        { jobId: r1.id, userId },
        one.pendingCommit,
        (tx: any) =>
          tx.activity.update({
            where: { id: one.activity.id },
            data: { distance: 4000 },
          }),
      ),
    ).rejects.toThrow('IMPORT_ITEM_LEASE_LOST');
    expect(
      (await db.activity.findUniqueOrThrow({ where: { id: one.activity.id } }))
        .distance,
    ).toBe(8000);
    worker.onModuleDestroy();
  });

  it.each(['fallback', 'repair'])(
    'finishes a local %s of an accepted dataset after the remote connection is disabled',
    async (mode) => {
      const name = `local-${mode}`;
      const first = await submit(name, 'r1');
      const worker = createWorker({});
      const control = worker as any;
      const materializer = createMaterializer();
      const firstClaim = (await control.claimBatch(100)).find(
        (row: any) => row.batchJobId === first.batch!.id,
      );
      control.activeLeaseTokens.set(firstClaim.id, firstClaim.lockToken);
      control.revisionedItems.add(firstClaim.id);
      const payload: any = {
        source: {
          kind: 'GARMIN_PERSONAL_API',
          provider: 'garmin',
          sourceUid: sourceUid(name),
          accountRef,
          externalId: name,
          sourceChecksum: (mode === 'repair' ? '5' : '4').repeat(64),
        },
        identity: { dedupeKey: `${userId}-${name}` },
        summary: {
          name,
          sportType: 'RUN',
          startTime: `2026-11-${mode === 'repair' ? '20' : '19'}T03:00:00Z`,
          endTime: `2026-11-${mode === 'repair' ? '20' : '19'}T04:00:00Z`,
          distance: 6000,
        },
        laps: [],
      };
      const initial = await materializer.materialize({
        itemJobId: firstClaim.id,
        itemLockToken: firstClaim.lockToken,
        userId,
        sourceObjectId: firstClaim.sourceObjectId,
        payload,
      });
      await control.markStatus(firstClaim.id, 'PARQUET_BUILDING');
      await materializer.commitStagedDataset({
        token: initial.pendingCommit!,
        userId,
        sourceObjectId: firstClaim.sourceObjectId,
        payload,
        stagedParquetFiles: [],
        itemJobId: firstClaim.id,
        itemLockToken: firstClaim.lockToken,
      });
      await jobs.finishRevisionedItem({
        id: firstClaim.id,
        lockToken: firstClaim.lockToken,
        data: { status: 'DONE', lockToken: null, leaseExpiresAt: null },
      });
      const activity = await db.activity.update({
        where: { id: initial.activity.id },
        data: { processingStatus: 'READY', readyAt: new Date() },
      });
      const primary = await db.activitySource.findFirstOrThrow({
        where: { activityId: activity.id, isPrimary: true, isActive: true },
      });
      let repair: any;
      if (mode === 'repair') {
        const migration = await db.activityDataMigration.create({
          data: {
            userId,
            runKey: `${userId}-repair`,
            version: 'fixture',
            sequence: 1,
            status: 'MIGRATING',
            backupEvidence: {},
            beforeManifest: {},
          },
        });
        repair = {
          migrationId: migration.id,
          activityId: activity.id,
          primarySourceId: primary.id,
          sourceChecksum: primary.sourceChecksum,
          expectedFingerprint: datasetRepairFingerprint(
            activity as never,
            primary as never,
            [],
          ),
        };
      }
      const batch = await db.importBatchJob.create({
        data: { userId, sourceKind: 'GARMIN_PERSONAL_API', totalCount: 1 },
      });
      const item = await db.importItemJob.create({
        data: {
          userId,
          batchJobId: batch.id,
          sourceObjectId: firstClaim.sourceObjectId,
          sourceKind: 'GARMIN_PERSONAL_API',
          sourceUid: sourceUid(name),
          sourceRevision: firstClaim.sourceRevision,
          position: 0,
          sourceRef: {
            kind: 'canonical_payload',
            payload,
            ...(repair
              ? { repair }
              : {
                  localReplay: {
                    activityId: activity.id,
                    canonicalSnapshotId: primary.canonicalSnapshotId,
                  },
                }),
          },
        },
      });
      await db.externalProviderConnection.update({
        where: { id: connectionId },
        data: { status: 'REVOKED' },
      });
      try {
        const claim = (await control.claimBatch(100)).find(
          (row: any) => row.id === item.id,
        );
        expect(claim.sourceRevision).toBe(firstClaim.sourceRevision);
        control.activeLeaseTokens.set(claim.id, claim.lockToken);
        control.revisionedItems.add(claim.id);
        const next = await materializer.materialize({
          itemJobId: claim.id,
          itemLockToken: claim.lockToken,
          userId,
          sourceObjectId: claim.sourceObjectId,
          payload,
          repair,
        });
        // Fallback replay is explicitly recovering the selected source, as in SourceLifecycle.
        if (!next.pendingCommit && mode === 'fallback') {
          await db.activity.update({
            where: { id: activity.id },
            data: { processingStatus: 'MATERIALIZED' },
          });
        }
        const replay = next.pendingCommit
          ? next
          : await materializer.materialize({
              itemJobId: claim.id,
              itemLockToken: claim.lockToken,
              userId,
              sourceObjectId: claim.sourceObjectId,
              payload,
              repair,
            });
        expect(replay.pendingCommit).not.toBeNull();
        await control.markStatus(claim.id, 'PARQUET_BUILDING');
        await materializer.commitStagedDataset({
          token: replay.pendingCommit!,
          userId,
          sourceObjectId: claim.sourceObjectId,
          payload,
          stagedParquetFiles: [],
          itemJobId: claim.id,
          itemLockToken: claim.lockToken,
        });
        await control.withCurrentDataset(
          { jobId: claim.id, userId },
          replay.pendingCommit,
          (tx: any) =>
            control.completeActivityItem(claim.id, claim.batchJobId, tx),
        );
        expect(
          (await db.importItemJob.findUniqueOrThrow({ where: { id: item.id } }))
            .status,
        ).toBe('DONE');
      } finally {
        await db.externalProviderConnection.update({
          where: { id: connectionId },
          data: { status: 'ACTIVE' },
        });
        worker.onModuleDestroy();
      }
    },
  );

  it('withdrawal cancels queued and leased inputs and prevents late publication', async () => {
    const first = await submit('withdrawn', 'r1');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: item.sourceObjectId },
    });
    await db.importItemJob.update({
      where: { id: item.id },
      data: {
        status: 'NORMALIZING',
        sourceRevision: source.importRevision,
        lockToken: 'withdraw-worker',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await new ActivitySourceLifecycleService(
      db as never,
      jobs,
    ).deactivateProviderData({
      userId,
      provider: 'garmin',
      externalIds: ['withdrawn'],
    });
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).importRevokedAt,
    ).not.toBeNull();
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('SKIPPED');
    await expect(
      jobs.withCurrentImport(
        { itemJobId: item.id, userId, lockToken: 'withdraw-worker' },
        async () => 'published',
      ),
    ).rejects.toThrow('IMPORT_ITEM_LEASE_LOST');
    const batch = await db.importBatchJob.findUniqueOrThrow({
      where: { id: first.batch!.id },
    });
    expect(batch.skippedCount).toBe(1);
    expect(batch.status).toBe('POST_PROCESSING');
    expect(
      await db.userPostProcessJob.count({ where: { batchJobId: batch.id } }),
    ).toBe(1);
  });

  it('keeps the immutable R1 revision when an expired lease is reclaimed after R2 arrives', async () => {
    const first = await submit('takeover', 'r1');
    const worker = createWorker({});
    const control = worker as any;
    const r1 = (await control.claimBatch(100)).find(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    await db.importItemJob.update({
      where: { id: r1.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    await submit('takeover', 'r2');
    const reclaimed = (await control.claimBatch(100)).find(
      (row: any) => row.id === r1.id,
    );
    expect(reclaimed.sourceRevision).toBe(r1.sourceRevision);
    await expect(
      jobs.withCurrentImport(
        { itemJobId: r1.id, userId, lockToken: reclaimed.lockToken },
        async () => 'published',
      ),
    ).rejects.toThrow('IMPORT_SOURCE_REVISION_CHANGED');
    await jobs.finishRevisionedItem({
      id: r1.id,
      lockToken: reclaimed.lockToken,
      data: { status: 'SKIPPED', lockToken: null, leaseExpiresAt: null },
    });
    expect(
      await db.importItemJob.count({
        where: { sourceObjectId: r1.sourceObjectId, status: 'QUEUED' },
      }),
    ).toBe(1);
    worker.onModuleDestroy();
  });

  it('does not label a legacy canonical payload as the latest source revision', async () => {
    const first = await submit('legacy-child', 'r2');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    await db.importItemJob.update({
      where: { id: item.id },
      data: {
        sourceRevision: null,
        sourceRef: { kind: 'canonical_payload', payload: { revision: 'r1' } },
      },
    });
    const worker = createWorker({});
    const claim = (await (worker as any).claimBatch(100)).find(
      (row: any) => row.id === item.id,
    );
    expect(claim.sourceRevision).toBe('legacy-unversioned-canonical');
    await expect(
      jobs.withCurrentImport(
        { itemJobId: item.id, userId, lockToken: claim.lockToken },
        async () => 'published',
      ),
    ).rejects.toThrow('IMPORT_SOURCE_REVISION_CHANGED');
    worker.onModuleDestroy();
  });

  it('blocks publication from a cached input after the grant changes and accepts a newly pinned input', async () => {
    const first = await submit('grant-change', 'r1');
    const worker = createWorker({});
    const item = (await (worker as any).claimBatch(100)).find(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    await db.externalProviderConnection.update({
      where: { id: connectionId },
      data: { credentialFingerprint: 'replacement' },
    });
    try {
      await expect(
        jobs.withCurrentImport(
          { itemJobId: item.id, userId, lockToken: item.lockToken },
          async () => 'published',
        ),
      ).rejects.toThrow('IMPORT_AUTHORIZATION_CHANGED');
    } finally {
      await db.externalProviderConnection.update({
        where: { id: connectionId },
        data: { credentialFingerprint: 'fixture-grant' },
      });
      worker.onModuleDestroy();
    }
  });

  it('runs terminal failure side effects in the same transaction and does not acknowledge failed input', async () => {
    const first = await submit('terminal-failure', 'r1');
    const observed: unknown[] = [];
    const worker = createWorker({
      supportsPreprocess: () => true,
      preprocess: async () => {
        throw new Error('fixture failure');
      },
      afterTerminalFailure: async (_args: unknown, tx: unknown) => {
        observed.push(tx);
      },
    });
    (worker as any).configService = {
      get: (key: string) =>
        key === 'importItemWorker.maxAttempts' ? 1 : undefined,
    };
    const item = (await (worker as any).claimBatch(100)).find(
      (row: any) => row.batchJobId === first.batch!.id,
    );
    await (worker as any).processJob(item);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeDefined();
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: item.id } }))
        .status,
    ).toBe('DEAD');
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: item.sourceObjectId },
        })
      ).completedImportRevision,
    ).toBeNull();
    expect(
      (
        await db.importBatchJob.findUniqueOrThrow({
          where: { id: first.batch!.id },
        })
      ).status,
    ).toBe('POST_PROCESSING');
    worker.onModuleDestroy();
  });

  it('withdrawal retries a stale Serializable snapshot and removes a concurrent publication', async () => {
    const first = await submit('withdraw-race', 'r1');
    const item = await db.importItemJob.findFirstOrThrow({
      where: { batchJobId: first.batch!.id },
    });
    const source = await db.importSourceObject.findUniqueOrThrow({
      where: { id: item.sourceObjectId },
    });
    await db.importItemJob.update({
      where: { id: item.id },
      data: {
        status: 'NORMALIZING',
        sourceRevision: source.importRevision,
        lockToken: 'publish-worker',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    let release!: () => void;
    let signalStarted!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const publishing = jobs.withCurrentImport(
      { itemJobId: item.id, userId, lockToken: 'publish-worker' },
      async (tx) => {
        signalStarted();
        await paused;
        return tx.thirdPartyActivity.create({
          data: {
            userId,
            provider: 'garmin',
            externalId: 'withdraw-race',
            state: 1,
            rawData: { importProjection: { sourceUid: source.sourceUid } },
          },
        });
      },
    );
    await started;
    let signalSnapshot!: () => void;
    const snapshotRead = new Promise<void>((resolve) => {
      signalSnapshot = resolve;
    });
    let snapshots = 0;
    const withdrawalDb = db.$extends({
      query: {
        thirdPartyActivity: {
          findMany: async ({ args, query }) => {
            const rows = await query(args);
            snapshots++;
            signalSnapshot();
            return rows;
          },
        },
      },
    });
    const withdrawalJobs = new ImportingJobService(
      importingJobRepository(withdrawalDb as never),
    );
    const withdrawing = new ActivitySourceLifecycleService(
      withdrawalDb as never,
      withdrawalJobs,
    ).deactivateProviderData({
      userId,
      provider: 'garmin',
      externalIds: ['withdraw-race'],
    });
    await snapshotRead;
    release();
    const [projected] = await Promise.all([publishing, withdrawing]);
    expect(snapshots).toBeGreaterThanOrEqual(2);
    expect(
      (
        await db.thirdPartyActivity.findUniqueOrThrow({
          where: { id: projected.id },
        })
      ).state,
    ).toBe(0);
    expect(
      (
        await db.importSourceObject.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).importRevokedAt,
    ).not.toBeNull();
  });
});
