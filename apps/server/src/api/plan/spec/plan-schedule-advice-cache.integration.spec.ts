import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { addCalendarDays } from '@shared/plan-calendar';
import { CoachReviewContextService } from '@/review/coach-review-context.service';
import { ReviewDigestContextService } from '@/review/review-digest-context.service';
import {
  planStartFixture,
  raceWithPlanWriteCheckpoint,
} from './plan-start.fixture';
import { PlanExecutionContextService } from '../plan-execution-context.service';
import { CalendarAdjustmentSyncWorker } from '../application/calendar-adjustment-sync.worker';
import { PLAN_WORKOUTS_CHANGED_EVENT } from '../events/plan.events';
import { PlanLinkMatcherService } from '../application/plan-link-matcher.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import { UserQueryService } from '../../user/user-query.service';
import { UserIdentityRepository } from '../../user/persistence/user-identity.repository';
import { AiPlanExecutionAdviceService } from '../../ai/ai-plan-execution-advice.service';
import { CoachStateContextService } from '../../ai/coach-state-context.service';
import { TrainingDataCoverageQueryService } from '../../ai/core/training-data-coverage-query.service';
import { TodaySuggestionConstraintProjector } from '../../ai/today-suggestion/today-suggestion-constraint.projector';
import { TodaySuggestionOrchestratorService } from '../../ai/today-suggestion/today-suggestion-orchestrator.service';
import { TodaySuggestionDeliveryPolicy } from '../../ai/today-suggestion/today-suggestion-delivery-policy';
import { createAiFallbackI18n } from '../../ai/spec/ai-fallback-i18n.test-util';
import { TodaySuggestionEngagementService } from '../../ai/today-suggestion/today-suggestion-engagement.service';
import { TodaySuggestionGenerationService } from '../../ai/today-suggestion/today-suggestion-generation.service';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from '../../ai/today-suggestion/today-suggestion.types';
import { uncontendedGeneration } from '../../ai/today-suggestion/testing/generation.fixture';

describe('Committed schedule advice caches / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let f: ReturnType<typeof planStartFixture>;
  beforeAll(async () => {
    database = fork(
      resolve(
        __dirname,
        process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
          ? 'plan-sync-native-postgres.mjs'
          : '../../ai/core/spec/coach-run-postgres.mjs',
      ),
      [],
      { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    const server = await new Promise<{
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
      datasourceUrl: `postgresql://postgres:postgres@${server.address}/postgres?connection_limit=${server.connectionLimit ?? 1}&sslmode=disable`,
    });
    await prisma.$connect();
    f = planStartFixture(prisma);
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('user'),('other')",
    );
  });

  async function active(
    workoutOffsets = [0],
    periodWeeks = 1,
    rideIndices: number[] = [],
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const created = await f.service.createPlan('user', {
      title: 'Cache fixture',
      periodWeeks,
      workouts: workoutOffsets.map((offset, index) => {
        const ride = rideIndices.includes(index);
        return {
          weekIndex: Math.floor(offset / 7) + 1,
          dayIndex: (offset % 7) + 1,
          sessionIndex: ride ? 2 : 1,
          name: ride ? `Endurance ride ${index + 1}` : `Easy run ${index + 1}`,
          sportType: ride ? 'CYCLING' : 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            ...(ride
              ? {
                  source: 'STRUCTURE' as const,
                  structure: {
                    kind: 'FREEFORM' as const,
                    version: 1 as const,
                    text: 'Ride 30m',
                    durationSeconds: 1800,
                  },
                }
              : { source: 'TEXT' as const, text: 'Run 30m' }),
          },
        };
      }),
    });
    const planId = created.plan!.id;
    await prisma.$transaction((tx) =>
      f.service.activatePlan('user', planId, today, undefined, {
        tx,
        validatedStartPreview: true,
      }),
    );
    const detail = await f.service.getPlanDetail('user', planId);
    const workout = await prisma.planWorkout.findUniqueOrThrow({
      where: { id: detail.plan!.workouts[0].id },
    });
    const execution = new PlanExecutionContextService(
      prisma as never,
      {
        getStoredSliceAsOf: async () => ({ latest: null, daily: [] }),
      } as never,
      undefined as never,
      f.users,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
      new CoachContextRepository(prisma as never),
      new ActivityReadService(prisma as never),
      new UserQueryService(new UserIdentityRepository(prisma as never)),
    );
    const move = async () => {
      const context = await f.context.ensureContext({ userId: 'user', planId });
      const thread = await prisma.coachThread.create({
        data: { contextId: context.id },
      });
      const branch = await prisma.coachBranch.create({
        data: {
          threadId: thread.id,
          contextId: context.id,
          baseEventSeq: context.headEventSeq,
        },
      });
      const session = await prisma.aiCoachSession.create({
        data: { userId: 'user', id: 'cache-schedule-chat' },
      });
      const user = await prisma.aiCoachMessage.create({
        data: {
          userId: 'user',
          sessionId: session.id,
          role: 'USER',
          content: 'Move today to tomorrow',
          sequence: 1,
        },
      });
      const assistant = await prisma.aiCoachMessage.create({
        data: {
          userId: 'user',
          sessionId: session.id,
          role: 'ASSISTANT',
          content: '',
          sequence: 2,
        },
      });
      await prisma.coachRun.create({
        data: {
          id: 'cache-run',
          userId: 'user',
          sessionId: session.id,
          branchId: branch.id,
          originMessageId: user.id,
          status: 'running',
          activeAttemptId: 'cache-attempt',
          attempts: {
            create: {
              id: 'cache-attempt',
              userId: 'user',
              requestId: 'cache-request',
              requestHash: 'hash',
              inputMessageId: user.id,
              messageId: assistant.id,
              trigger: 'start',
              operationId: 'cache-op',
              ownerId: 'fixture',
            },
          },
        },
      });
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      const preview = await f.proposals.createPreview(
        'user',
        {
          mode: 'SCHEDULE',
          planId,
          range: { from: today, to: end.toISOString().slice(0, 10) },
          rationale: 'Coordinate the remaining schedule',
          evidenceRefs: [],
          changes: [
            {
              sourceWorkoutId: workout.id,
              expectedRevision: workout.revision,
              workout: {
                weekIndex: 1,
                dayIndex: 2,
                sportType: 'RUN',
                definition: {
                  kind: 'FREEFORM',
                  version: 1,
                  source: 'TEXT',
                  text: 'Run 30m',
                },
              },
            },
          ],
          additions: [],
          deletions: [],
          preserveUnmentioned: true,
        },
        { sid: session.id, branchId: branch.id, userMessageId: user.id },
      );
      // Coach authorization is covered by its dedicated full-chain scenarios; this fixture enters the plan apply interface with an approved decision.
      const decision = await prisma.coachDecision.create({
        data: {
          branchId: branch.id,
          contextId: context.id,
          decisionType: 'PLAN_SCHEDULE',
          state: 'APPROVED',
          payload: preview.decisionPayload,
        },
      });
      return prisma.$transaction(
        async (tx) => {
          await f.proposals.claimDecision({
            previewId: preview.previewId,
            decisionId: decision.id,
            userId: 'user',
            sourcePlanId: planId,
            tx,
          });
          return f.apply.apply({
            userId: 'user',
            decisionId: decision.id,
            branchId: branch.id,
            contextPlanId: planId,
            previewId: preview.previewId,
            tx,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    };
    return { planId, today, execution, move };
  }
  it('stops returning cached execution advice after an actual SCHEDULE commit', async () => {
    const d = await active();
    const upstream = {
      generateTrainingAdviceSnippet: jest.fn(async () => ({
        summary: 'Review the current training schedule.',
        tags: [],
        provider: 'fixture',
        model: 'fixture',
      })),
    };
    const advice = new AiPlanExecutionAdviceService(
      upstream as never,
      prisma as never,
      d.execution,
      createAiFallbackI18n(),
      {
        evaluate: async () => ({
          features: { 'ai.planAdvice': { allowed: true } },
        }),
      } as never,
    );
    const input = {
      userId: 'user',
      locale: 'en' as const,
      body: { planId: d.planId, anchorDate: d.today },
    };
    const first = await advice.generatePlanExecutionAdvice(input);
    expect(first.source).toBe('generated');
    expect((await advice.generatePlanExecutionAdvice(input)).source).toBe(
      'cache',
    );
    expect(await d.move()).toMatchObject({
      mode: 'SCHEDULE',
      readbackVerified: true,
    });
    const after = await advice.generatePlanExecutionAdvice(input);
    expect(after.source).toBe('generated');
    expect(after.factHash).not.toBe(first.factHash);
    expect(upstream.generateTrainingAdviceSnippet).toHaveBeenCalledTimes(2);
    expect((await advice.generatePlanExecutionAdvice(input)).source).toBe(
      'cache',
    );
  });
  it('rebuilds the home judgment through its real projector after an actual SCHEDULE commit', async () => {
    const priorSecret = process.env.SELF_HOST_AUTH_SECRET;
    process.env.SELF_HOST_AUTH_SECRET =
      'isolated-fixture-secret-with-thirty-two-characters';
    try {
      const d = await active();
      const activityAt = new Date().toISOString();
      const engagement = new TodaySuggestionEngagementService(
        prisma as never,
        { cancelFutureTrainingReminderById: jest.fn() } as never,
      );
      const projector = new TodaySuggestionConstraintProjector(
        d.execution,
        {
          build: async () => ({
            decisions: [],
            athleteState: null,
            decisionReadStatus: 'AVAILABLE',
            recentReviews: [],
          }),
        } as never,
        { pendingInquiry: async () => null } as never,
        {
          activityEvidence: async () => ({
            activities: {
              latestReadyAt: activityAt,
              readyCount: 10,
              processing: [],
            },
          }),
          recentActivityFacts: async () => [
            { hashId: 'fixture-activity', startTime: activityAt },
          ],
        } as never,
        {} as never,
        {
          snapshot: () => ({
            capabilities: { ai: { state: 'enabled', provider: 'test' } },
          }),
        } as never,
        {
          evaluate: async () => ({
            features: { 'ai.todaySuggestion': { allowed: true } },
          }),
        } as never,
        engagement,
        new PlanWorkoutRepository(prisma as never),
      );
      const agent = {
        run: jest.fn(async () => {
          throw new Error('isolated upstream unavailable');
        }),
      };
      const home = new TodaySuggestionOrchestratorService(
        prisma as never,
        projector,
        agent as never,
        {} as never,
        new TodaySuggestionDeliveryPolicy(createAiFallbackI18n()),
        engagement,
        uncontendedGeneration(prisma as never),
      );
      const args = { userId: 'user', locale: 'en', allowAi: true };
      const before = await projector.project(args);
      expect(before.todayWorkouts).toHaveLength(1);
      const first = await home.get(args);
      const cached = await home.get(args);
      expect(cached.suggestionId).toBe(first.suggestionId);
      expect(agent.run).toHaveBeenCalledTimes(1);
      expect(await d.move()).toMatchObject({
        mode: 'SCHEDULE',
        readbackVerified: true,
      });
      const afterProjection = await projector.project(args);
      expect(afterProjection.factHash).not.toBe(before.factHash);
      expect(afterProjection.todayWorkouts).toHaveLength(0);
      expect(afterProjection.tomorrowWorkouts).toHaveLength(1);
      const after = await home.get(args);
      expect(after.suggestionId).not.toBe(first.suggestionId);
      expect(agent.run).toHaveBeenCalledTimes(2);
      expect((await home.get(args)).suggestionId).toBe(after.suggestionId);
    } finally {
      if (priorSecret === undefined) delete process.env.SELF_HOST_AUTH_SECRET;
      else process.env.SELF_HOST_AUTH_SECRET = priorSecret;
    }
  });

  const nativeIt = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
    ? it
    : it.skip;

  nativeIt(
    'keeps activity matching, in-flight home advice and reviews consistent through competing cross-month confirmations',
    async () => {
      const userId = 'user';
      const lang = 'en';
      const timezone = 'UTC';
      const { planId, today, execution } = await active(
        [0, 0, ...Array.from({ length: 12 }, (_, index) => index + 1)],
        8,
        [1, 2],
      );
      const readSchedule = async () =>
        (await f.service.getPlanDetail(userId, planId)).plan!.workouts!;
      const original = await readSchedule();
      const [first, ride, incomingRide] = original;
      const last = original.at(-1)!;
      const anchor = new Date(`${today}T00:00:00Z`);
      const nextMonth = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1),
      )
        .toISOString()
        .slice(0, 10);
      const weekStart = addCalendarDays(today, -((anchor.getUTCDay() + 6) % 7));
      const moves = original.map((workout, index) => ({
        kind: 'UPDATE' as const,
        workoutId: workout.id,
        expectedRevision: workout.revision,
        targetDate:
          workout.id === incomingRide.id
            ? today
            : addCalendarDays(nextMonth, index + 7),
      }));
      const id = randomUUID();
      const draft = await f.starts.saveCalendarAdjustment(userId, planId, id, {
        versionId: id,
        edits: moves,
      });

      const activity = await prisma.activity.create({
        data: {
          userId,
          hashId: 'batch-aligned-ride',
          activityName: 'Morning ride',
          sportType: 'CYCLING',
          state: 1,
          status: 'FINISHED',
          processingStatus: 'READY',
          startTime: anchor,
          timezone,
          timerTime: 1800,
          distance: 7000,
        },
      });
      const activities = new ActivityReadService(prisma as never);
      const workouts = new PlanWorkoutRepository(prisma as never);
      const matcher = new PlanLinkMatcherService(
        prisma as never,
        f.users,
        new PlanRepository(prisma as never),
        workouts,
        new PlanActivityLinkRepository(prisma as never),
        activities,
        undefined as never,
      );
      const events = new EventEmitter2();
      events.on(PLAN_WORKOUTS_CHANGED_EVENT, (event) =>
        matcher.onWorkoutsChanged(event),
      );
      const sync = new CalendarAdjustmentSyncWorker(prisma as never, events);
      const review = new CoachReviewContextService(
        f.query,
        activities,
        {
          batchGetActualLoad: async () =>
            new Map([[activity.id, { actualLoad: 30 }]]),
        } as never,
        {
          getStoredSliceAsOf: async () => ({ latest: null, daily: [] }),
          listRange: async () => [],
        } as never,
        { getComposedUserProfile: async () => ({}) } as never,
        f.codecs,
      );
      const digests = new ReviewDigestContextService(execution, review);
      const periods = [
        { type: 'DAILY', start: today, end: addCalendarDays(today, 1) },
        {
          type: 'WEEKLY',
          start: weekStart,
          end: addCalendarDays(weekStart, 7),
        },
        { type: 'MONTHLY', start: `${today.slice(0, 7)}-01`, end: nextMonth },
      ] as const;
      const readReviews = () =>
        Promise.all(
          periods.map(
            async ({ type, start, end }) =>
              (
                await digests.build({
                  userId,
                  lang,
                  timezone,
                  type,
                  periodStart: new Date(start),
                  periodEnd: new Date(end),
                })
              )?.reviewWindow,
          ),
        );
      const beforeSync = await readReviews();
      expect(beforeSync[0]).toMatchObject({
        planned: 2,
        done: 0,
        extraActivities: 1,
      });
      const engagement = new TodaySuggestionEngagementService(
        prisma as never,
        {} as never,
      );
      const projector = new TodaySuggestionConstraintProjector(
        execution,
        new CoachStateContextService(prisma as never),
        { pendingInquiry: async () => null } as never,
        new TrainingDataCoverageQueryService(
          activities,
          undefined as never,
          undefined as never,
        ),
        {} as never,
        {
          snapshot: () => ({
            capabilities: { ai: { state: 'enabled', provider: 'fixture' } },
          }),
        } as never,
        {
          evaluate: async () => ({
            features: { 'ai.todaySuggestion': { allowed: true } },
          }),
        } as never,
        engagement,
        workouts,
      );
      let didStart!: () => void;
      let releaseModel!: () => void;
      const modelStarted = new Promise<void>((resolve) => {
        didStart = resolve;
      });
      const modelInFlight = new Promise<void>((resolve) => {
        releaseModel = resolve;
      });
      const modelSlices: TodaySuggestionConstraintProjection['todayWorkouts'][] =
        [];
      const agent = {
        run: async ({
          projection,
        }: {
          projection: TodaySuggestionConstraintProjection;
        }) => {
          modelSlices.push(projection.todayWorkouts);
          const beforeMove = projection.todayWorkouts.some(
            ({ id }) => id === first.id,
          );
          if (beforeMove) {
            didStart();
            await modelInFlight;
          }
          const draft: TodaySuggestionDraft = {
            headline: beforeMove
              ? 'The run is still on today’s schedule'
              : 'Keep the rest of today easy',
            summary: beforeMove
              ? 'Keep today’s planned run easy.'
              : 'The ride is complete. Take the rest of the day easy.',
            recommendation: { kind: 'RECOVER' },
            confidence: 'MEDIUM',
            evidenceCodes: [],
            preferredIntent: null,
            secondaryIntents: [],
            tags: [],
          };
          return {
            draft,
            runId: randomUUID(),
            provider: 'fixture',
            model: 'fixture',
          };
        },
      };
      const home = new TodaySuggestionOrchestratorService(
        prisma as never,
        projector,
        agent as never,
        {} as never,
        new TodaySuggestionDeliveryPolicy(createAiFallbackI18n()),
        engagement,
        new TodaySuggestionGenerationService(prisma as never),
      );
      const adviceArgs = { userId, locale: lang, timezone, allowAi: true };
      const adviceRequest = home.get(adviceArgs);
      try {
        await Promise.race([
          modelStarted,
          adviceRequest.then(() => {
            throw new Error('Advice finished before confirmation');
          }),
        ]);
        let duringSync: typeof beforeSync | undefined;
        const markDone = workouts.markDoneIfApplicable.bind(workouts);
        const oldConfirmations = await raceWithPlanWriteCheckpoint(
          prisma,
          (hold) => {
            jest
              .spyOn(workouts, 'markDoneIfApplicable')
              .mockImplementationOnce(async (...args) => {
                const done = await markDone(...args);
                if (done) await hold();
                return done;
              });
            return matcher.tryAutoLinkForActivity(activity.id);
          },
          () =>
            Promise.allSettled([
              f.starts.confirmCalendarAdjustment(
                userId,
                planId,
                id,
                draft.versionId,
              ),
              f.starts.confirmCalendarAdjustment(
                userId,
                planId,
                id,
                draft.versionId,
              ),
            ]),
          {
            blockedWriters: 2,
            whileBlocked: async () => {
              duringSync = await readReviews();
            },
          },
        );
        expect(duringSync).toEqual(beforeSync);
        expect(oldConfirmations).toMatchObject({
          status: 'fulfilled',
          value: [
            {
              status: 'rejected',
              reason: {
                message: 'The calendar adjustment needs to be refreshed',
              },
            },
            {
              status: 'rejected',
              reason: {
                message: 'The calendar adjustment needs to be refreshed',
              },
            },
          ],
        });
        await expect(
          f.starts.getCalendarAdjustment(userId, planId, id),
        ).resolves.toMatchObject({
          state: 'INVALIDATED',
          conflicts: [{ key: ride.id, reason: 'WORKOUT_STATUS' }],
          receipt: null,
        });
        const afterSync = await readSchedule();
        expect(
          afterSync.map(({ id, scheduledDate }) => [id, scheduledDate]),
        ).toEqual(original.map(({ id, scheduledDate }) => [id, scheduledDate]));
        expect(afterSync.find(({ id }) => id === ride.id)).toMatchObject({
          status: 'DONE',
        });
        const beforeConfirm = await readReviews();
        expect(beforeConfirm[0]).toMatchObject({
          planned: 2,
          done: 1,
          extraActivities: 0,
        });

        const selected = moves.filter(
          ({ workoutId }) => workoutId !== ride.id && workoutId !== last.id,
        );
        const recovered = await f.starts.rebaseCalendarAdjustment(
          userId,
          planId,
          id,
          {
            baseVersionId: draft.versionId,
            versionId: randomUUID(),
            operationKeys: selected.map(({ workoutId }) => workoutId),
          },
        );
        expect(recovered.state).toBe('READY');
        await expect(readReviews()).resolves.toEqual(beforeConfirm);

        const confirm = () =>
          f.starts.confirmCalendarAdjustment(
            userId,
            planId,
            id,
            recovered.versionId,
          );
        const [firstReceipt, secondReceipt] = await Promise.all([
          confirm(),
          confirm(),
        ]);
        expect(firstReceipt).toMatchObject({
          readbackVerified: true,
          changedWorkoutCount: 12,
        });
        expect(secondReceipt).toEqual(firstReceipt);
        await sync.dispatch(recovered.versionId, userId, planId);
        await matcher.rescanPendingMatches();
        await expect(matcher.listMatchingReviews(userId)).resolves.toEqual([]);

        const after = new Map(
          (await readSchedule()).map((workout) => [workout.id, workout]),
        );
        for (const { workoutId, targetDate, expectedRevision } of selected) {
          expect(after.get(workoutId)).toMatchObject({
            scheduledDate: targetDate,
            revision: expectedRevision + 1,
          });
        }
        expect(after.get(ride.id)).toEqual(
          afterSync.find(({ id }) => id === ride.id),
        );
        expect(after.get(last.id)).toEqual(last);
        const afterConfirm = await readReviews();
        for (const [index, { start, end }] of periods.entries()) {
          const planned = [
            ride,
            { ...incomingRide, scheduledDate: today },
            last,
          ].filter(
            ({ scheduledDate }) =>
              scheduledDate! >= start && scheduledDate! < end,
          ).length;
          expect(afterConfirm[index]).toMatchObject({
            planned,
            done: 1,
            extraActivities: 0,
          });
        }
      } finally {
        releaseModel();
        await adviceRequest.catch(() => undefined);
      }
      expect(
        modelSlices.map((slice) => slice.map(({ id, status }) => [id, status])),
      ).toEqual([
        [
          [first.id, 'PLANNED'],
          [ride.id, 'PLANNED'],
        ],
        [
          [ride.id, 'DONE'],
          [incomingRide.id, 'PLANNED'],
        ],
      ]);
      const result = await adviceRequest;
      expect(result).toMatchObject({
        headline: 'Keep the rest of today easy',
        delivery: { state: 'GENERATED' },
      });
      await expect(home.get(adviceArgs)).resolves.toMatchObject({
        suggestionId: result.suggestionId,
        headline: result.headline,
        delivery: { state: 'CACHED' },
      });
    },
    30_000,
  );
});
