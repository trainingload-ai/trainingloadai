import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { planStartFixture } from './plan-start.fixture';
import { PlanExecutionContextService } from '../plan-execution-context.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import { UserQueryService } from '../../user/user-query.service';
import { UserIdentityRepository } from '../../user/persistence/user-identity.repository';
import { AiPlanExecutionAdviceService } from '../../ai/ai-plan-execution-advice.service';
import { createAiFallbackI18n } from '../../ai/spec/ai-fallback-i18n.test-util';
import { TodaySuggestionConstraintProjector } from '../../ai/today-suggestion/today-suggestion-constraint.projector';
import { TodaySuggestionOrchestratorService } from '../../ai/today-suggestion/today-suggestion-orchestrator.service';
import { TodaySuggestionDeliveryPolicy } from '../../ai/today-suggestion/today-suggestion-delivery-policy';
import { TodaySuggestionEngagementService } from '../../ai/today-suggestion/today-suggestion-engagement.service';
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

  async function active() {
    const today = new Date().toISOString().slice(0, 10);
    const created = await f.service.createPlan('user', {
      title: 'Cache fixture',
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 1,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 30m',
          },
        },
      ],
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
        new TodaySuggestionDeliveryPolicy(),
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
});
