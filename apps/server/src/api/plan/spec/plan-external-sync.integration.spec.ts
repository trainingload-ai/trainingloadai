import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PlanExternalSyncService } from '../application/plan-external-sync.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';

/** Disposable PostgreSQL engine only; never reads .env or an application database. */
describe('Planned workout synchronization / PostgreSQL invariants', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let service: PlanExternalSyncService;
  let estimateWrites = false;
  const estimatedAt = new Date('2026-07-07T00:00:00Z');

  beforeAll(async () => {
    database = fork(
      resolve(__dirname, '../../ai/core/spec/coach-run-postgres.mjs'),
      [],
      {
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    const address = await new Promise<string>((done, reject) => {
      database.once('message', (value: { address: string }) =>
        done(value.address),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=1&sslmode=disable`,
    });
    await prisma.$connect();
    service = new PlanExternalSyncService(
      prisma as never,
      { buildWorkoutPlanSteps: () => [] } as never,
      {
        applyForWorkout: async (
          workoutId: string,
          { tx }: { tx: Prisma.TransactionClient },
        ) => {
          if (estimateWrites)
            await tx.planWorkout.update({
              where: { id: workoutId },
              data: {
                estimatedLoad: 50,
                estimatedLoadComputedAt: estimatedAt,
                updatedAt: estimatedAt,
              },
            });
        },
      } as never,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
      new PlanActivityLinkRepository(prisma as never),
      { assertMutable: () => undefined } as never,
      { getPreferredTimezone: async () => 'UTC' } as never,
    );
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });

  beforeEach(async () => {
    estimateWrites = false;
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('user'),('other')",
    );
  });

  const create = () =>
    service.createIndependentWorkout(
      {
        userId: 'user',
        scheduledDate: new Date('2026-07-06'),
        sportType: 'RUN',
        text: 'Run',
        blocks: [],
      },
      (row) => ({
        userId: 'user',
        provider: 'intervals_icu',
        planWorkoutId: row.id,
        externalEventId: '100',
      }),
    );

  it('commits one course and its mapping together', async () => {
    const row = await create();
    expect(await prisma.planWorkout.count()).toBe(1);
    expect(await prisma.planWorkoutExternalMapping.findFirst()).toMatchObject({
      planWorkoutId: row.id,
      externalEventId: '100',
    });
  });

  it.each(['create', 'update'])(
    'returns the transaction snapshot after %s and load estimation',
    async (operation) => {
      estimateWrites = true;
      let row = await create();
      if (operation === 'update')
        row = await service.updateImportedWorkout({
          userId: 'user',
          workoutId: row.id,
          preferredSessionIndex: 1,
          scheduledDate: new Date('2026-07-06'),
          targetPlanId: null,
          targetPlanStartDate: null,
          sportType: 'RUN',
          status: 'PLANNED',
          blocks: [],
          dayOffset: 0,
          expectedUpdatedAt: row.updatedAt,
        });
      const stored = await prisma.planWorkout.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(row.updatedAt).toEqual(stored.updatedAt);
      expect(row.updatedAt).toEqual(estimatedAt);
      expect(row.estimatedLoad).toBe(50);
      expect(row.revision).toBe(operation === 'update' ? 2 : 1);
    },
  );

  it('rolls back the course when mapping persistence fails', async () => {
    await expect(
      service.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          text: 'Run',
          blocks: [],
        },
        (row) => ({
          userId: 'missing-user',
          provider: 'intervals_icu',
          planWorkoutId: row.id,
          externalEventId: '100',
        }),
      ),
    ).rejects.toThrow();
    expect(await prisma.planWorkout.count()).toBe(0);
    expect(await prisma.planWorkoutExternalMapping.count()).toBe(0);
  });

  it('keeps the remote identity after deleting the unchanged local endpoint', async () => {
    const row = await create();
    await expect(
      service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: row.id,
        updatedAt: row.updatedAt,
        revision: row.revision,
      }),
    ).resolves.toBe('deleted');
    expect(await prisma.planWorkout.count()).toBe(0);
    expect(await prisma.planWorkoutExternalMapping.findFirst()).toMatchObject({
      planWorkoutId: null,
      externalEventId: '100',
    });
  });

  it('does not delete a course edited after the synchronization snapshot', async () => {
    const row = await create();
    await prisma.planWorkout.update({
      where: { id: row.id },
      data: { name: 'Keep this edit', revision: { increment: 1 } },
    });
    await expect(
      service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: row.id,
        updatedAt: row.updatedAt,
        revision: row.revision,
      }),
    ).resolves.toBe('changed');
    expect(
      await prisma.planWorkout.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ name: 'Keep this edit' });
  });

  it("does not delete another athlete's course", async () => {
    const row = await create();
    await expect(
      service.deleteSyncedWorkout({ userId: 'other', workoutId: row.id }),
    ).resolves.toBe('missing');
    expect(await prisma.planWorkout.count()).toBe(1);
  });

  it('retains completed training history', async () => {
    const row = await create();
    await prisma.planWorkout.update({
      where: { id: row.id },
      data: { status: 'DONE' },
    });
    await expect(
      service.deleteSyncedWorkout({ userId: 'user', workoutId: row.id }),
    ).resolves.toBe('protected');
    expect(await prisma.planWorkout.count()).toBe(1);
  });
});
