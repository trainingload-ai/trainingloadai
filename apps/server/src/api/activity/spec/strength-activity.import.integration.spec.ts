import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { StrengthActivityService } from '@trainingloadai/server/api/activity/strength-activity.service';
import { createActivityInputReplayJob } from '@trainingloadai/server/analyze/activity-recompute-job.writer';
import { WorkoutPersistenceService } from '@/api/plan/workout-persistence.service';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { planStartFixture } from '@/api/plan/spec/plan-start.fixture';

describe('Public imported strength and replay writes / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let strength: StrengthActivityService;
  const userId = 'athlete';
  const startTime = new Date('2025-01-03T10:00:00.000Z');

  beforeAll(async () => {
    const fixture = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
      ? '../../plan/spec/plan-sync-native-postgres.mjs'
      : '../../ai/core/spec/coach-run-postgres.mjs';
    database = fork(resolve(__dirname, fixture), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const { address, connectionLimit = 1 } = await new Promise<{
      address: string;
      connectionLimit?: number;
    }>((done, reject) => {
      database.once('message', done);
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=${connectionLimit}&sslmode=disable`,
    });
    strength = new StrengthActivityService(
      prisma as never,
      new WorkoutPersistenceService(new PlanWorkoutRepository(prisma as never)),
      planStartFixture(prisma).query,
    );
    await prisma.$executeRaw`INSERT INTO t_user(id) VALUES (${userId})`;
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });

  function createActivity(db: Prisma.TransactionClient, hashId: string) {
    return db.activity.create({
      data: {
        hashId,
        userId,
        sportType: 'UNKNOWN',
        sportDefinitionCode: 'STRENGTH_TRAINING',
        status: 'FINISHED',
        state: 1,
        startTime,
        processingStatus: 'ANALYZING',
      },
    });
  }

  function exercises(name: string) {
    return {
      exercises: [
        {
          name,
          sets: [
            {
              setIndex: 0,
              setType: 'WORK' as const,
              completedReps: 5,
              load: {
                kind: 'ABSOLUTE' as const,
                value: 50,
                unit: 'KG' as const,
              },
              source: 'FIT' as const,
              completedAt: startTime.toISOString(),
            },
          ],
        },
      ],
    };
  }

  async function materialize(
    tx: Prisma.TransactionClient,
    activity: { id: number; hashId: string },
  ) {
    await tx.activitySource.create({
      data: {
        userId,
        activityId: activity.id,
        sourceKind: 'FILE',
        sourceUid: activity.hashId,
      },
    });
    const result = await strength.replaceImported(
      activity.hashId,
      userId,
      exercises('Back Squat'),
      tx,
    );
    await createActivityInputReplayJob(tx, {
      userId,
      effectiveFrom: startTime,
      includeActivityIds: [activity.id],
      triggerSource: 'strength-import-test',
      eventId: activity.hashId,
    });
    return result;
  }

  it('rolls source, strength replacement, review invalidation and replay back together', async () => {
    const activity = await createActivity(prisma, 'existing-strength');
    await strength.replaceImported(
      activity.hashId,
      userId,
      exercises('Original lift'),
    );
    const review = await prisma.activityAiReview.create({
      data: {
        activityId: activity.id,
        userId,
        evidenceHash: 'existing-review',
      },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        const result = await materialize(tx, activity);
        expect(result.exercises[0]).toMatchObject({ name: 'Back Squat' });
        expect(
          await tx.activityAiReview.count({ where: { id: review.id } }),
        ).toBe(0);
        throw new Error('synthetic rollback after replay registration');
      }),
    ).rejects.toThrow('synthetic rollback after replay registration');

    expect(
      (await strength.get(activity.hashId, userId)).exercises[0],
    ).toMatchObject({ name: 'Original lift' });
    expect(
      await prisma.activityAiReview.count({ where: { id: review.id } }),
    ).toBe(1);
    expect(
      await prisma.activitySource.count({ where: { activityId: activity.id } }),
    ).toBe(0);
    expect(
      await prisma.activityRecomputeJob.count({
        where: { dedupeKey: `activity-input:${userId}:${activity.hashId}` },
      }),
    ).toBe(0);
  });

  it('keeps prior exercises if the caller catches an invalid set and commits', async () => {
    const activity = await createActivity(prisma, 'invalid-strength');
    const previous = await strength.replaceImported(
      activity.hashId,
      userId,
      exercises('Original lift'),
    );
    const input = exercises('Invalid replacement');
    input.exercises[0].sets.push({
      ...input.exercises[0].sets[0],
      setIndex: 1,
      completedAt: 'invalid',
    });
    await prisma.$transaction(async (tx) => {
      await expect(
        strength.replaceImported(activity.hashId, userId, input, tx),
      ).rejects.toThrow('completedAt is invalid');
    });
    expect(await strength.get(activity.hashId, userId)).toEqual(previous);
  });

  it('reads an activity and its complete sets before the caller commits', async () => {
    const result = await prisma.$transaction(async (tx) => {
      const activity = await createActivity(tx, 'new-strength');
      const workout = await tx.planWorkout.create({
        data: {
          userId,
          dayOffset: 1,
          sportType: 'UNKNOWN',
          sportDefinitionCode: 'STRENGTH_TRAINING',
          structureKind: 'STRENGTH',
          text: '',
          strengthExercises: {
            create: {
              name: 'Back Squat',
              orderIndex: 0,
              setGroups: {
                create: {
                  orderIndex: 0,
                  setType: 'WORK',
                  setCount: 1,
                  prescriptionType: 'REPS',
                  repsMin: 5,
                  repsMax: 5,
                  loadType: 'ABSOLUTE',
                  loadValue: 50,
                  loadUnit: 'KG',
                },
              },
            },
          },
        },
        include: { strengthExercises: { include: { setGroups: true } } },
      });
      await tx.planWorkoutActivityLink.create({
        data: { activityId: activity.id, planWorkoutId: workout.id },
      });
      const response = await materialize(tx, activity);
      expect(response.planned?.workoutId).toBe(workout.id);
      expect(response.exercises[0].sets[0].plannedSetGroupId).toBe(
        workout.strengthExercises[0].setGroups[0].id,
      );
      return response;
    });
    expect(result.exercises).toMatchObject([
      {
        name: 'Back Squat',
        sets: [
          {
            completedReps: 5,
            load: { kind: 'ABSOLUTE', value: 50, unit: 'KG' },
          },
        ],
      },
    ]);
    expect(await strength.get(result.activityHashId, userId)).toEqual(result);
    const actualSet = result.exercises[0].sets[0];
    await prisma.activityStrengthSet.update({
      where: { id: actualSet.id },
      data: { plannedSetGroupId: null },
    });
    await strength.attachImportedPlanSetGroups(result.activityHashId, userId);
    await strength.attachImportedPlanSetGroups(result.activityHashId, userId);
    expect(await strength.get(result.activityHashId, userId)).toEqual(result);
    expect(
      await prisma.activitySource.count({
        where: { activityId: result.activityId },
      }),
    ).toBe(1);
    expect(
      await prisma.activityRecomputeJob.findUnique({
        where: {
          dedupeKey: `activity-input:${userId}:${result.activityHashId}`,
        },
      }),
    ).toMatchObject({
      status: 'SCHEDULED',
      triggerPayload: { includeActivityIds: [result.activityId] },
    });
  });
});
