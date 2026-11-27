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
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '@/prisma/prisma.service';
import {
  CoachRunStore,
  CoachRunCancelledError,
  type CoachRunHandle,
} from '../../coach-run-store.service';
import { CoachMemoryExtractionEnqueuer } from '../../memory/coach-memory-extraction-enqueuer.service';
import { AthleteStateInquiryService } from '../../athlete-state/athlete-state-inquiry.service';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import { coachSnapshotChunks } from '../coach-run-projector';
import { uiSurfaceAssistantForToolResult } from '../tool-loop-agent.runtime';
import { COACH_RUN_ATTEMPT_LEASE_MS } from '../coach-turn-input';
import { presentCoachPlanDraftTool } from '../tools/presentCoachPlanDraft.tool';
import { planWorkoutAddMutationTool } from '../tools/mutationPlanWorkoutAdd.tool';
import { planWorkoutStatusMutationTool } from '../tools/mutationPlanWorkoutStatus.tool';
import { CoachActionService } from '../coach-action.service';
import { planStartFixture } from '@/api/plan/spec/plan-start.fixture';
import { PLAN_DRAFT_CHANGED_EVENT } from '@/api/plan/events/plan.events';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';
import { PlanLoadEstimatorService } from '@/api/plan/plan-load-estimator.service';
import type { AiToolContext } from '../tool.types';
import {
  buildHistoryMessages,
  sanitizeStoredCoachMessageForClient,
} from '../coach-history-messages';

const nativePostgres = Boolean(process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN);
const concurrent = nativePostgres ? it : it.skip;

/** A disposable real PostgreSQL engine. NEVER loads .env or connects to application databases. */
describe('Coach run transactions / PostgreSQL constraints', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let store: CoachRunStore;
  const queries: string[] = [];
  beforeAll(async () => {
    const fixture = nativePostgres
      ? '../../../plan/spec/plan-sync-native-postgres.mjs'
      : 'coach-run-postgres.mjs';
    database = fork(resolve(__dirname, fixture), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const address = await new Promise<string>((resolveAddress, reject) => {
      database.once('message', (value: { address: string }) =>
        resolveAddress(value.address),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    const testClient = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=${nativePostgres ? 6 : 1}&sslmode=disable`,
      log: [{ level: 'query', emit: 'event' }],
    });
    testClient.$on('query', (event) => queries.push(event.query));
    prisma = testClient;
    await prisma.$connect();
    store = new CoachRunStore(prisma as PrismaService);
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
    // A constraint violation can close PGlite Socket's current protocol connection;
    // reconnect between cases while keeping the same in-memory database.
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.aiCoachSession.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('athlete'),('intruder')",
    );
  });

  const startArgs = () => ({
    userId: 'athlete',
    sid: 'session',
    branchId: null,
    lang: 'zh',
    prompt: '训练建议',
    message: { content: [{ type: 'text' as const, text: '训练建议' }] },
    operationId: randomUUID(),
    command: { kind: 'start' as const, requestId: randomUUID() },
  });

  async function mutationSetup(userId = 'athlete') {
    const request = { ...startArgs(), userId };
    const handle = (await store.begin(request)).handle!;
    const plan = await prisma.plan.create({
      data: { userId: handle.userId, title: 'Athlete draft', status: 'DRAFT', periodWeeks: 2 },
    });
    const events = new EventEmitter2();
    const changed = jest.fn();
    events.on(PLAN_DRAFT_CHANGED_EVENT, changed);
    const fixture = planStartFixture(prisma);
    Object.assign(fixture.write, { events });
    const abort = new AbortController();
    const ctx: AiToolContext = {
      prisma: prisma as PrismaService,
      session: { user: { id: handle.userId } },
      sid: handle.sessionId,
      mutationRun: {
        runId: handle.projector.run.runId,
        attemptId: handle.projector.run.attemptId,
      },
      signal: abort.signal,
      activeSkillName: 'plan-followup',
      planService: fixture.service,
      coachActions: new CoachActionService(prisma as PrismaService, {} as never),
    } as AiToolContext;
    let activityQueue: Promise<unknown> = Promise.resolve();
    ctx.onActivity = (activity) => {
      const next = activityQueue.then(async () => {
        if (activity.status === 'queued' || activity.status === 'running')
          abort.signal.throwIfAborted();
        if (activity.mutation && activity.status === 'running')
          await store.checkpointMutationStart(handle, activity);
        else
          handle.projector.consume({ type: 'activity', activity });
      });
      activityQueue = next.catch(() => undefined);
      return next;
    };
    const tool = () => createAiSdkCoachTools({ tools: [planWorkoutAddMutationTool], ctx }).mutation_plan_workout_add;
    return {
      request, handle, plan, ctx, tool, changed, fixture, abort,
      input: { planId: plan.id, weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 25m' },
    };
  }

  concurrent('returns one durable receipt from simultaneous deliveries of the same mutation call', async () => {
    const { tool, input, plan, changed } = await mutationSetup();
    const options = { toolCallId: 'add-request-1', messages: [] };
    // Two SDK entry points have separate in-memory queues and share only PostgreSQL.
    const [first, repeated] = await Promise.all([
      tool().execute!(input, options),
      tool().execute!({ ...input }, options),
    ]);
    expect(first).toMatchObject({ ok: true, kind: 'mutation_applied', payload: { planId: plan.id } });
    expect(repeated).toEqual(first);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await prisma.coachAction.count()).toBe(1);
    expect(await prisma.planWorkout.count()).toBe(1);

    await expect(tool().execute!({ ...input, text: 'work 30m' }, options)).resolves.toMatchObject({
      code: 'COACH_MUTATION_INVOCATION_MISMATCH',
    });
    expect(await prisma.coachAction.count()).toBe(1);
  });

  it('rolls back a failed mutation, replays a committed receipt and rejects a late new write', async () => {
    const { request, handle, tool, input, changed, fixture, abort } = await mutationSetup();
    const original = fixture.service.updatePlan.bind(fixture.service);
    const interrupt = jest.spyOn(fixture.service, 'updatePlan').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('mutation interrupted before commit');
    });
    const options = { toolCallId: 'add-request-1', messages: [] };
    try {
      await expect(tool().execute!(input, options)).resolves.toMatchObject({
        error: 'mutation interrupted before commit',
      });
    } finally {
      interrupt.mockRestore();
    }
    expect(await prisma.coachAction.count()).toBe(0);
    expect(await prisma.planWorkout.count()).toBe(0);
    expect(changed).not.toHaveBeenCalled();

    const receipt = await tool().execute!(input, options);
    expect(receipt).toMatchObject({ ok: true, kind: 'mutation_applied' });
    await prisma.coachRunAttempt.update({
      where: { id: handle.projector.run.attemptId },
      data: { cancelRequestedAt: new Date() },
    });
    abort.abort(new Error('request cancelled'));
    await expect(tool().execute!(input, options)).resolves.toEqual(receipt);
    await expect(tool().execute!({ ...input, dayIndex: 2 }, {
      toolCallId: 'late-call', messages: [],
    })).rejects.toThrow('request cancelled');
    const replay = (await new CoachRunStore(prisma as PrismaService).begin(request)).replay!;
    const chunks = coachSnapshotChunks(replay.id, replay.message);
    expect(chunks.filter((chunk) => chunk.type === 'data-coach-tool')).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ name: 'MutationApplied', input: receipt }) }),
    ]);
    expect(chunks.filter((chunk) => chunk.type === 'data-coach-activity')).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed', toolCallId: options.toolCallId }) }),
    ]);
    await expect(store.begin({ ...request, userId: 'intruder' })).resolves.not.toHaveProperty('replay');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await prisma.coachAction.count()).toBe(1);
    expect(await prisma.planWorkout.count()).toBe(1);
  });

  it('separates provider call IDs across tools, turns and athletes while retaining legacy actions', async () => {
    const first = await mutationSetup();
    const call = { toolCallId: 'provider-call-1', messages: [] };
    const addReceipt = await first.tool().execute!(first.input, call);
    expect(addReceipt).toMatchObject({ ok: true });

    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId: first.plan.id } });
    const statusTool = createAiSdkCoachTools({
      tools: [planWorkoutStatusMutationTool], ctx: first.ctx,
    }).mutation_plan_workout_status;
    const statusReceipt = await statusTool.execute!({
      planId: first.plan.id, workoutId: workout.id, status: 'SKIPPED',
    }, call);
    expect(statusReceipt).toMatchObject({ ok: true });
    for (const [name, output] of [
      ['mutation_plan_workout_add', addReceipt],
      ['mutation_plan_workout_status', statusReceipt],
    ] as const)
      first.handle.projector.consume(uiSurfaceAssistantForToolResult({
        id: call.toolCallId, name, input: {}, output, ok: true,
      })!);
    await store.checkpointStreamProgress(first.handle);
    const projected = first.handle.projector.message.parts;
    expect(projected.filter((part) => part.type === 'data-coach-tool')).toHaveLength(2);
    expect([...first.handle.projector.activities.values()]
      .filter(({ kind }) => kind === 'tool')
      .map(({ status }) => status)).toEqual(['completed', 'completed']);
    const replay = (await store.begin(first.request)).replay!;
    expect(coachSnapshotChunks(replay.id, replay.message).filter((chunk) => chunk.type === 'data-coach-tool')).toHaveLength(2);

    const next = await mutationSetup();
    expect(next.handle.sessionId).toBe(first.handle.sessionId);
    await expect(next.tool().execute!(next.input, call)).resolves.toMatchObject({ ok: true });

    const other = await mutationSetup('intruder');
    expect(other.handle.sessionId).toBe(first.handle.sessionId);
    await expect(other.tool().execute!(other.input, call)).resolves.toMatchObject({ ok: true });

    const legacy = createAiSdkCoachTools({
      tools: [planWorkoutAddMutationTool], ctx: { ...first.ctx, mutationRun: undefined, onActivity: undefined },
    }).mutation_plan_workout_add;
    await expect(legacy.execute!({ ...first.input, dayIndex: 2 }, call)).resolves.toMatchObject({ ok: true });
    const actions = await prisma.coachAction.findMany();
    expect(actions).toHaveLength(5);
    expect(new Set(actions.map(({ invocationKey }) => invocationKey)).size).toBe(5);
    expect(actions.filter(({ invocationKey }) => invocationKey === null)).toHaveLength(1);
    expect(await prisma.planWorkout.count()).toBe(4);
  });

  it('rejects an incomplete runtime identity before recording activity or writing', async () => {
    const { tool, input, handle } = await mutationSetup();
    await expect(tool().execute!(input, { toolCallId: ' ', messages: [] })).resolves.toMatchObject({
      code: 'COACH_MUTATION_INVOCATION_INVALID',
    });
    expect(handle.projector.activities.size).toBe(0);
    expect(await prisma.coachAction.count()).toBe(0);
    expect(await prisma.planWorkout.count()).toBe(0);
  });

  concurrent('rechecks the database lease after waiting for an unchanged attempt row', async () => {
    const { ctx, input, handle } = await mutationSetup();
    const id = handle.projector.run.attemptId;
    // Omit the SDK checkpoint to test the transaction's own admission guarantee.
    // A different connection holds the row without changing it.
    await prisma.$executeRaw`
      UPDATE t_coach_run_attempt
      SET heartbeat_at = (clock_timestamp() AT TIME ZONE 'UTC')
        - ${COACH_RUN_ATTEMPT_LEASE_MS - 750}::integer * interval '1 millisecond'
      WHERE id = ${id}
    `;
    let notifyLocked!: () => void;
    const locked = new Promise<void>((resolveLocked) => { notifyLocked = resolveLocked; });
    const lock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM t_coach_run_attempt WHERE id = ${id} FOR UPDATE`;
      notifyLocked();
      await tx.$queryRaw`SELECT 1 AS waited FROM pg_sleep(1)`;
    });
    await locked;
    try {
      await expect(planWorkoutAddMutationTool.execute({ ...ctx, currentToolCallId: 'waiting' }, input as never))
        .rejects.toMatchObject({
          response: expect.objectContaining({ code: 'COACH_MUTATION_INACTIVE_ATTEMPT' }),
        });
    } finally {
      await lock;
    }
    expect(await prisma.coachAction.count()).toBe(0);
    expect(await prisma.planWorkout.count()).toBe(0);
  });

  it('retains every rejected plan candidate privately and returns scoped feedback to the tool caller', async () => {
    const handle = (await store.begin(startArgs())).handle!;
    const workoutService = new WorkoutService({} as never);
    const workoutDefinitions = new WorkoutDefinitionService(new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(workoutService), new StrengthWorkoutCodec(), new FreeformWorkoutCodec(),
    ));
    const planLoadEstimator = new PlanLoadEstimatorService(
      {} as never, { getComposedUserProfile: async () => ({}) } as never,
      workoutService, {} as never, {} as never,
    );
    const tool = createAiSdkCoachTools({ tools: [presentCoachPlanDraftTool], ctx: {
      session: { user: { id: 'athlete' } }, signal: new AbortController().signal,
      workoutDefinitions, planLoadEstimator, activeSkillName: 'plan-builder',
      planSuitability: { latest: {
        status: 'READY', skillName: 'plan-builder', assessmentId: 'audit-assessment',
        constraints: { periodWeeks: 3, maxDailyMinutes: 90, maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'], strengthPreference: 'EXCLUDE' },
      } },
      onPlanValidationRejected: (event) => store.recordPlanValidationRejection(handle, event),
    } as AiToolContext }).present_coach_plan_draft;
    const candidate = {
      title: 'Test plan', periodWeeks: 3, qualityContract: {
        weekPhases: ['BUILD', 'RECOVERY', 'BUILD'], maxDailyMinutes: 90, maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'],
      },
      workouts: [
        { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 60m', notes: 'Run easily.', plannedSessionRpe: 4 },
        { weekIndex: 2, dayIndex: 1, sportType: 'RUN', text: 'work 40m', notes: 'Run a hard effort.', plannedSessionRpe: 7 },
        { weekIndex: 3, dayIndex: 1, sportType: 'RUN', text: 'work 60m', notes: 'Run steadily.', plannedSessionRpe: 5 },
      ],
    };
    for (const toolCallId of ['first-rejection', 'second-rejection']) {
      const response = await tool.execute!(candidate, { toolCallId, messages: [] });
      expect(response).toMatchObject({
        code: 'PLAN_QUALITY_INVALID',
        error: expect.stringMatching(/W2.*RECOVERY_NOT_REDUCED/),
      });
      expect(response).not.toHaveProperty('diagnostics');
    }
    const rows = await prisma.coachPlanValidationRejection.findMany({
      where: { attemptId: handle.projector.run.attemptId }, orderBy: { toolCallId: 'asc' },
    });
    expect(rows.map(({ toolCallId }) => toolCallId)).toEqual(['first-rejection', 'second-rejection']);
    expect(rows[0].payload).toMatchObject({ candidate, feedback: [expect.objectContaining({
      target: { scope: 'WEEK', weekIndex: 2 },
      weeks: [
        expect.objectContaining({ weekIndex: 1, phase: 'BUILD', totalEstimatedLoad: 40 }),
        expect.objectContaining({ weekIndex: 2, phase: 'RECOVERY', totalEstimatedLoad: 46.7 }),
        expect.objectContaining({ weekIndex: 3, phase: 'BUILD', totalEstimatedLoad: 50 }),
      ],
    })], diagnostics: {
      valid: false,
      workoutLoadEstimates: expect.arrayContaining([
        expect.objectContaining({ weekIndex: 2, dayIndex: 1, sessionIndex: 1, estimatedLoad: 46.7, source: 'SESSION_RPE' }),
      ]),
    } });
    await prisma.aiCoachSession.deleteMany();
    expect(await prisma.coachPlanValidationRejection.count()).toBe(0);
  });
  const question = {
    questions: [
      {
        id: 'goal',
        header: '目标',
        question: '本次目标？',
        options: [
          { value: 'race', label: '比赛', description: '准备比赛' },
          { value: 'health', label: '健康', description: '保持健康' },
        ],
      },
    ],
  };

  it('rolls back the user message when extraction job creation fails in the same transaction', async () => {
    const transactionalStore = new CoachRunStore(
      prisma as PrismaService,
      {
        enqueueEligibleMessage: async ({
          tx,
          userId,
          sessionId,
          sourceMessageId,
        }) => {
          await tx.aiCoachMemoryExtractionJob.create({
            data: {
              userId,
              sessionId,
              sourceMessageId,
              policyVersion: 'test-transaction',
            },
          });
          throw new Error('forced enqueue failure');
        },
      } as never,
    );
    await expect(transactionalStore.begin(startArgs())).rejects.toThrow(
      'forced enqueue failure',
    );
    expect(await prisma.aiCoachMessage.count()).toBe(0);
    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
  });

  it.each(['ROLLING', 'FIXED'])(
    'keeps a %s creation brief answerable when memory extraction runs during the turn',
    async (planningMode) => {
      const memory = new CoachMemoryExtractionEnqueuer(
        { isEnabled: async () => true } as never,
        { isGranted: async () => true } as never,
      );
      const scope = { topic: 'coach-context:2026-11-20', revision: 'initial' };
      const scopedStore = new CoachRunStore(prisma as PrismaService, memory, undefined, {
        current: async () => [{
          ...scope,
          revision: (await prisma.aiCoachMemoryExtractionJob.count())
            ? 'brief-promoted-to-memory'
            : scope.revision,
        }],
      });
      const args = startArgs();
      const { handle } = await scopedStore.begin({
        ...args,
        message: {
          content: [
            ...args.message.content,
            {
              type: 'tool_result',
              tool_use_id: 'client:ai_plan_seed',
              content: { kind: 'ai_plan_seed', payload: { planningMode } },
            },
          ],
        },
      });
      await scopedStore.bindFactScope(args.userId, handle!.projector.run.runId, scope);
      handle!.projector.consume({
        type: 'assistant',
        message: { content: [{
          type: 'tool_use',
          id: 'question-call',
          name: 'AskUserQuestion',
          input: question,
        }] },
      });
      handle!.projector.finish('awaiting_input');
      await scopedStore.checkpoint(handle!, 'awaiting_input');

      expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
      expect(await prisma.coachRun.findUniqueOrThrow({
        where: { id: handle!.projector.run.runId },
      })).toMatchObject({
        status: 'awaiting_input',
        pendingInteraction: expect.objectContaining({ status: 'pending' }),
      });
      expect((await scopedStore.begin(answerArgs(handle!))).handle).toBeDefined();
    },
  );

  it.each([
    { name: 'keeps ordinary clarification', answerable: true },
    { name: 'keeps an already visible clarification', alreadyVisible: true, answerable: true },
    { name: 'rejects a clarification after consent withdrawal', disabled: true, answerable: false },
    { name: 'rejects a clarification after training data changes', trainingChanged: true, answerable: false },
    { name: 'rejects a clarification when another chat publishes memory', otherChat: true, answerable: false },
    {
      name: 'rejects a stale case-bound question',
      metadata: { source: 'athlete_state_assessment', assessmentCaseId: 'case', assessmentQuestionId: 'question' },
      answerable: false,
    },
  ])('$name when facts change during the turn', async ({
    metadata = { branchId: null }, disabled, trainingChanged, otherChat, alreadyVisible, answerable,
  }) => {
    const memory = new CoachMemoryExtractionEnqueuer(
      { isEnabled: async () => true } as never,
      { isGranted: async () => true } as never,
    );
    const args = startArgs();
    const scope = { topic: 'coach-context:2026-11-20', revision: 'initial' };
    const scopedStore = new CoachRunStore(prisma as PrismaService, memory, undefined, {
      current: async (_userId, _timezone, excludedSource) => {
        const publishedMemory = await prisma.aiCoachMemoryExtractionJob.count({
          where: {
            userId: args.userId,
            status: 'SUCCEEDED',
            ...(excludedSource ? { sourceMessageId: { not: excludedSource } } : {}),
          },
        });
        const revision = disabled ? 'disabled'
          : trainingChanged ? 'training-data-changed'
            : publishedMemory ? 'memory-changed' : scope.revision;
        return [{ ...scope, revision }];
      },
    });
    const prompt = '8 周后我想跑完 10 公里，每周三次，帮我排个计划。';
    const { handle } = await scopedStore.begin({
      ...args,
      prompt,
      message: { content: [{ type: 'text', text: prompt }] },
    });
    const { runId } = handle!.projector.run;
    await scopedStore.bindFactScope(args.userId, runId, {
      ...scope,
      ...(!('assessmentCaseId' in metadata)
        ? { excludeMemorySourceMessageId: handle!.inputMessageId }
        : {}),
    });
    if (otherChat) {
      await scopedStore.begin({ ...startArgs(), sid: 'other-session' });
    }
    handle!.projector.consume({
      type: 'assistant',
      message: { content: [{
        type: 'tool_use',
        id: 'question-call',
        name: 'AskUserQuestion',
        input: { ...question, metadata },
      }] },
    });

    handle!.projector.finish('awaiting_input');
    if (alreadyVisible) await scopedStore.checkpoint(handle!, 'awaiting_input');
    const extracted = await prisma.aiCoachMemoryExtractionJob.updateMany({
      where: { userId: args.userId, status: 'PENDING' },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });
    expect(extracted.count).toBe(otherChat ? 2 : 1);
    if (!answerable) {
      await expect(scopedStore.checkpoint(handle!, 'awaiting_input'))
        .rejects.toThrow('facts_changed');
      expect(await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } }))
        .toMatchObject({ status: 'cancelled', pendingInteraction: null });
      return;
    }
    if (alreadyVisible) await scopedStore.reconcileCurrentFacts(args.userId);
    else await scopedStore.checkpoint(handle!, 'awaiting_input');
    expect(await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } }))
      .toMatchObject({
        status: 'awaiting_input',
        pendingInteraction: expect.objectContaining({ status: 'pending' }),
      });
    expect((await scopedStore.begin(answerArgs(handle!))).handle).toBeDefined();
  });

  it.each(['keep', 'withdraw consent'])(
    'reconciles a published plan clarification on current facts: %s',
    async (outcome) => {
      const topic = 'coach-context:2026-11-20';
      let revision = 'first';
      const scopedStore = new CoachRunStore(
        prisma as PrismaService,
        undefined,
        undefined,
        { current: async () => [{ topic, revision }] },
      );
      const args = startArgs();
      const { handle } = await scopedStore.begin(args);
      const runId = handle!.projector.run.runId;
      await scopedStore.bindFactScope(args.userId, runId, { topic, revision });
      handle!.projector.consume({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: { ...question, metadata: { skill: 'plan-builder' } },
          }],
        },
      });
      revision = 'background-memory-changed';
      handle!.projector.finish('awaiting_input');
      await scopedStore.checkpoint(handle!, 'awaiting_input');

      revision = outcome === 'keep' ? 'new-workout' : 'disabled';
      await scopedStore.reconcileCurrentFacts(args.userId);
      const run = await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } });
      if (outcome === 'keep') {
        expect(run.status).toBe('awaiting_input');
        expect((await scopedStore.begin(answerArgs(handle!))).handle).toBeDefined();
      } else {
        expect(run.status).toBe('cancelled');
        expect(run.pendingInteraction).toBeNull();
      }
    },
  );

  it('atomically finalizes the run and attempt when bound question facts change', async () => {
    const topic = 'coach-context:2026-11-20';
    const scopedStore = new CoachRunStore(prisma as PrismaService, undefined, undefined, {
      current: async () => [{ topic, revision: 'new' }],
    });
    const args = startArgs();
    const { handle } = await scopedStore.begin(args);
    const { runId, attemptId } = handle!.projector.run;
    await scopedStore.bindFactScope(args.userId, runId, { topic, revision: 'old' });

    handle!.projector.finish('awaiting_input');
    await expect(scopedStore.checkpoint(handle!, 'awaiting_input')).rejects.toThrow('facts_changed');

    expect(await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: 'cancelled', activeAttemptId: null, pendingInteraction: null,
    });
    expect(await prisma.coachRunAttempt.findUniqueOrThrow({ where: { id: attemptId } })).toMatchObject({
      status: 'cancelled', cancelRequestedAt: null, endedAt: expect.any(Date),
    });
  });

  it('reuses one state session and resumes its owned pending question through the normal Coach runtime', async () => {
    const args = {
      userId: 'athlete',
      taskKind: 'ATHLETE_STATE_UPDATE',
      lang: 'en',
      instructions: 'Refresh state.',
      dedupeKey: 'version:1',
      inputHash: 'v1',
      operationId: randomUUID(),
    };
    const { handle } = await store.beginBackground(args);
    handle!.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: { ...question, metadata: { skill: 'athlete-state' } },
          },
        ],
      },
    });
    handle!.projector.finish('awaiting_input');
    await store.checkpoint(handle!, 'awaiting_input');
    const answer = { ...answerArgs(handle!), sid: handle!.sessionId };
    expect(
      await store.isAthleteStateContinuation(
        'athlete',
        handle!.sessionId,
        answer.command,
      ),
    ).toBe(true);
    expect(
      await store.isAthleteStateContinuation(
        'intruder',
        handle!.sessionId,
        answer.command,
      ),
    ).toBe(false);
    expect(
      await store.isAthleteStateContinuation(
        'athlete',
        'foreign-session',
        answer.command,
      ),
    ).toBe(false);
    expect(
      await store.isAthleteStateContinuation('athlete', handle!.sessionId, {
        kind: 'start',
        requestId: 'new',
      }),
    ).toBe(false);
    const inquiries = new AthleteStateInquiryService(prisma as never);
    const inquiry = await inquiries.pending('athlete');
    expect(inquiry).toMatchObject({
      caseId: handle!.projector.run.runId,
      expiresAt: null,
    });
    expect(await inquiries.pending('intruder')).toBeNull();
    expect(await inquiries.open('athlete', inquiry!.caseId)).toMatchObject({
      sessionId: handle!.sessionId,
    });
    await expect(
      inquiries.assertBound(
        'athlete',
        inquiry!.caseId,
        'foreign-session',
        null,
      ),
    ).rejects.toThrow();
    const resumed = await store.begin(answer);
    expect(resumed.handle!.projector.run.runId).toBe(
      handle!.projector.run.runId,
    );
    expect(resumed.handle!.projector.run.attemptId).not.toBe(
      handle!.projector.run.attemptId,
    );
    resumed.handle!.projector.finish('completed');
    await store.checkpoint(resumed.handle!, 'completed');
    expect(await inquiries.pending('athlete')).toBeNull();
    const next = await store.beginBackground({
      ...args,
      dedupeKey: 'version:2',
      inputHash: 'v2',
      operationId: randomUUID(),
    });
    expect(next.handle!.sessionId).toBe(handle!.sessionId);
    expect(next.handle!.projector.run.runId).not.toBe(
      handle!.projector.run.runId,
    );
    expect(await prisma.coachAssessmentCase.count()).toBe(0);
  });
  it('persists a hidden background run and replays its structured result without a second attempt', async () => {
    const args = {
      userId: 'athlete',
      taskKind: 'ATHLETE_CHECK_IN',
      lang: 'zh',
      instructions: 'Inspect authoritative facts and submit one result.',
      dedupeKey: 'today:2026-10-26:facts-v1',
      inputHash: 'input-hash-v1',
      operationId: randomUUID(),
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: '2026-10-26',
    };
    const started = await store.beginBackground(args);
    expect(started.replay).toBeUndefined();
    const handle = started.handle!;
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'tool:coverage',
        kind: 'tool',
        labelKey: 'tool',
        toolName: 'training.data_coverage',
        toolCallId: 'coverage',
        status: 'completed',
      },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed', undefined, {
      resultType: 'ATHLETE_CHECK_IN',
      resultRef: {
        resultType: 'ATHLETE_CHECK_IN',
        result: { summary: '今天保持轻松。', tags: ['轻松'] },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
      },
    });

    const run = await prisma.coachRun.findUniqueOrThrow({
      where: { id: handle.projector.run.runId },
      include: { session: true, attempts: true },
    });
    expect(run).toMatchObject({
      taskKind: 'ATHLETE_CHECK_IN',
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: '2026-10-26',
      dedupeKey: 'today:2026-10-26:facts-v1',
      inputHash: 'input-hash-v1',
      resultType: 'ATHLETE_CHECK_IN',
      status: 'completed',
      activeAttemptId: null,
      session: { type: 'BACKGROUND' },
    });
    expect(run.attempts).toHaveLength(1);
    expect(
      await prisma.aiCoachMessage.findMany({
        where: { userId: 'athlete', sessionId: handle.sessionId },
        orderBy: { sequence: 'asc' },
        select: { role: true },
      }),
    ).toEqual([{ role: 'SYSTEM' }, { role: 'ASSISTANT' }]);

    const replayed = await store.beginBackground({
      ...args,
      operationId: randomUUID(),
    });
    expect(replayed.handle).toBeUndefined();
    expect(replayed.replay).toMatchObject({
      runId: run.id,
      operationId: args.operationId,
      result: {
        resultType: 'ATHLETE_CHECK_IN',
        result: { summary: '今天保持轻松。' },
      },
    });
    expect(
      await prisma.coachRunAttempt.count({ where: { runId: run.id } }),
    ).toBe(1);
  });
  function presentQuestion(handle: CoachRunHandle) {
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
  }

  async function ask() {
    const { handle } = await store.begin(startArgs());
    presentQuestion(handle);
    handle.projector.finish('awaiting_input');
    await store.checkpoint(handle, 'awaiting_input');
    return handle;
  }
  function answerArgs(handle: CoachRunHandle) {
    const pending = handle.projector.pendingInteraction;
    return {
      ...startArgs(),
      prompt: '选择比赛',
      message: {
        content: [
          { type: 'text' as const, text: '选择比赛' },
          {
            type: 'tool_result' as const,
            tool_use_id: 'question-call',
            content: {
              kind: 'coach_question_reply',
              repliesToAssistantMessageId: pending.questionMessageId,
              questionToolUseId: pending.questionToolCallId,
              answers: { goal: 'race' },
              notes: {},
            },
          },
        ],
      },
      command: {
        kind: 'answer' as const,
        requestId: randomUUID(),
        runId: pending.runId,
        interactionId: pending.interactionId,
        submissionId: randomUUID(),
      },
    };
  }

  it.each(['completed', 'cancelled', 'interrupted', 'failed'] as const)(
    'persists public summaries in a %s process-only message without raw reasoning',
    async (status) => {
      const { handle } = await store.begin(startArgs());
      const summary = {
        source: 'assistant_public_summary' as const,
        text: '先核对训练负荷，再确定恢复安排。',
      };
      handle.projector.consume({
        type: 'activity',
        activity: {
          key: 'model:1:1',
          kind: 'analysis',
          labelKey: 'analysis',
          status: 'completed',
          publicSummary: summary,
        },
      });
      handle.projector.consume({
        type: 'stream_event',
        event: { type: 'reasoning_delta', text: 'private raw reasoning' },
      });
      await store.checkpoint(handle);
      handle.projector.finish(status);
      await store.checkpoint(handle, status);
      const rows = await prisma.aiCoachMessage.findMany({
        where: { sessionId: handle.sessionId },
      });
      const stored = rows.find((row) => row.role === 'ASSISTANT');
      expect(stored).toBeDefined();
      expect(stored.content).toBe('');
      const restored = sanitizeStoredCoachMessageForClient(stored.message);
      expect(restored).toMatchObject({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'data-coach-activity',
            data: expect.objectContaining({ publicSummary: summary }),
          }),
          expect.objectContaining({
            type: 'data-coach-run',
            data: expect.objectContaining({ status }),
          }),
        ]),
      });
      expect(JSON.stringify(stored.message)).not.toContain(
        'private raw reasoning',
      );
    },
  );

  it('persists hidden failed attempts for audit while restoring only the public outcome', async () => {
    const { handle } = await store.begin(startArgs());
    for (const key of ['invalid-1', 'invalid-2']) {
      handle.projector.consume({
        type: 'activity',
        activity: {
          key,
          kind: 'tool',
          labelKey: 'tool',
          toolName: 'present_training_visualization',
          toolCallId: key,
          status: 'failed',
          failure: { stage: 'validate_input', code: 'INVALID_INPUT' },
        },
      });
      await store.checkpoint(handle);
    }
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'valid-3',
        kind: 'tool',
        labelKey: 'tool',
        toolName: 'present_training_visualization',
        toolCallId: 'valid-3',
        status: 'completed',
      },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed');
    const row = await prisma.aiCoachMessage.findUniqueOrThrow({
      where: { id: handle.projector.message.id },
    });
    expect(row.message).toMatchObject({
      activityAudit: expect.arrayContaining([
        expect.objectContaining({
          key: 'invalid-1',
          status: 'failed',
          failure: { stage: 'validate_input', code: 'INVALID_INPUT' },
        }),
        expect.objectContaining({ key: 'invalid-2', status: 'failed' }),
      ]),
    });
    const restored = sanitizeStoredCoachMessageForClient(row.message);
    expect(JSON.stringify(restored)).not.toContain('activityAudit');
    expect(JSON.stringify(restored)).not.toContain('INVALID_INPUT');
    expect(restored).toMatchObject(
      JSON.parse(JSON.stringify(handle.projector.message)),
    );
  });

  it('persists a real tool → question → answer → new attempt → restored history', async () => {
    const { handle } = await store.begin(startArgs());
    const tool = createAiSdkCoachTools({
      tools: [
        {
          name: 'training.test',
          description: 'test',
          parameters: { type: 'object' },
          cost: 'low',
          kind: 'read',
          execute: async () => ({ ok: true }),
        },
      ],
      ctx: {
        signal: new AbortController().signal,
        session: { user: { id: 'athlete' } },
        onActivity: async (activity) => {
          handle.projector.consume({ type: 'activity', activity });
          await store.checkpoint(handle);
        },
      } as unknown as AiToolContext,
    });
    await tool.training_test.execute(
      {},
      { toolCallId: 'real-call', messages: [] },
    );
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
    handle.projector.finish('awaiting_input');
    await store.checkpoint(handle, 'awaiting_input');
    const next = (await store.begin(answerArgs(handle))).handle;
    expect(next.projector.run.runId).toBe(handle.projector.run.runId);
    expect(next.projector.run.attemptId).not.toBe(
      handle.projector.run.attemptId,
    );
    next.projector.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: '已制定建议', placement: 'answer' },
    });
    next.projector.finish('completed');
    await store.checkpoint(next, 'completed');
    const rows = await prisma.aiCoachMessage.findMany({
      orderBy: { sequence: 'asc' },
    });
    expect(rows.map((row) => row.role)).toEqual([
      'USER',
      'ASSISTANT',
      'USER',
      'ASSISTANT',
    ]);
    expect(rows[1].message).toMatchObject({
      version: 2,
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-activity',
          data: expect.objectContaining({
            toolCallId: 'real-call',
            status: 'completed',
          }),
        }),
      ]),
    });
    expect(rows[3].message).toEqual(
      JSON.parse(JSON.stringify(next.projector.envelope().message)),
    );
    expect(rows[3].message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-interaction',
          data: expect.objectContaining({ status: 'resolved' }),
        }),
      ]),
    });
  });

  it('replays repeated and concurrent submissions without creating an operation twice', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    const [a, b] = await Promise.all([store.begin(args), store.begin(args)]);
    expect(Number(Boolean(a.handle)) + Number(Boolean(b.handle))).toBe(1);
    expect(await prisma.coachRunAttempt.count()).toBe(2);
    const replay = await store.begin({
      ...args,
      operationId: randomUUID(),
      command: { ...args.command, requestId: randomUUID() },
    });
    expect(replay.replay.id).toBe((a.handle ?? b.handle).projector.message.id);
    expect(await prisma.aiCoachMessage.count()).toBe(4);
  });

  it('rejects foreign, stale, altered and mismatched-branch answers', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    await expect(store.begin({ ...args, userId: 'intruder' })).rejects.toThrow(
      'not found',
    );
    await expect(store.begin({ ...args, branchId: 'other' })).rejects.toThrow(
      'branch',
    );
    await expect(
      store.begin({
        ...args,
        command: { ...args.command, interactionId: 'obsolete' },
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'question_stale' },
    });
    await store.begin(args);
    await expect(
      store.begin({ ...args, message: { content: [] } }),
    ).rejects.toThrow('already used');
    await expect(store.begin(answerArgs(handle))).rejects.toThrow('pending');
  });

  it('keeps multi-round receipts and bridges old UIMessage answer requests', async () => {
    const first = await ask();
    const args = answerArgs(first);
    const command = await store.legacyAnswerCommand(
      'athlete',
      'session',
      args.message,
      args.operationId,
    );
    expect(command).toMatchObject({
      kind: 'answer',
      runId: first.projector.run.runId,
    });
    expect(
      await store.legacyAnswerCommand(
        'intruder',
        'session',
        args.message,
        args.operationId,
      ),
    ).toBeNull();
    const second = (await store.begin({ ...args, command })).handle;
    second.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
    second.projector.finish('awaiting_input');
    await store.checkpoint(second, 'awaiting_input');
    const third = (await store.begin(answerArgs(second))).handle;
    third.projector.finish('completed');
    await store.checkpoint(third, 'completed');
    const receiptRows = await prisma.aiCoachMessage.findMany({
      where: { role: 'ASSISTANT' },
      orderBy: { sequence: 'asc' },
    });
    expect(receiptRows).toHaveLength(3);
    expect(receiptRows[1].message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-interaction',
          data: expect.objectContaining({
            questionMessageId: first.projector.message.id,
            status: 'resolved',
          }),
        }),
      ]),
    });
    expect((await store.begin({ ...args, command })).replay.id).toBe(
      second.projector.message.id,
    );
  });

  it('requires answer commands for durable questions and validates free text / options', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    await expect(
      store.begin({ ...args, command: startArgs().command }),
    ).rejects.toThrow('answer command');
    const input = args.message.content[1] as {
      content: {
        answers: Record<string, string>;
        notes: Record<string, string>;
      };
    };
    input.content.answers.goal = 'invented';
    await expect(store.begin(args)).rejects.toThrow('selection');
    input.content.answers = {};
    input.content.notes = { goal: '我想先恢复体能' };
    expect((await store.begin(args)).handle).toBeDefined();
  });

  it('retains old attempts on safe retry and refuses stale retry targets', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.finish('interrupted');
    await store.checkpoint(handle, 'interrupted');
    const args = {
      ...startArgs(),
      command: {
        kind: 'retry' as const,
        runId: handle.projector.run.runId,
        attemptId: handle.projector.run.attemptId,
        requestId: randomUUID(),
      },
    };
    const next = (await store.begin(args)).handle;
    next.projector.finish('failed');
    await store.checkpoint(next, 'failed');
    expect(await prisma.aiCoachMessage.count()).toBe(3);
    await expect(
      store.begin({
        ...args,
        operationId: randomUUID(),
        command: { ...args.command, requestId: randomUUID() },
      }),
    ).rejects.toThrow('safely retried');
    expect(await prisma.coachRunAttempt.count()).toBe(2);
  });

  it('reconciles a legacy cancelled run and its still-running attempt to the same terminal state', async () => {
    const handle = (await store.begin(startArgs())).handle!;
    const { runId, attemptId, messageId } = handle.projector.run;
    const endedAt = new Date();
    await store.cancel('athlete', runId, attemptId);
    await prisma.coachRun.update({
      where: { id: runId },
      data: { status: 'cancelled', endedAt, activeAttemptId: null },
    });
    await prisma.coachRunAttempt.update({
      where: { id: attemptId },
      data: { heartbeatAt: new Date(Date.now() - 180_000) },
    });

    await store.recoverStale('athlete', handle.sessionId);
    await store.recoverStale('athlete', handle.sessionId);

    expect(await prisma.coachRunAttempt.findUniqueOrThrow({ where: { id: attemptId } }))
      .toMatchObject({ status: 'cancelled', completionReason: 'cancelled', endedAt, revision: 1 });
    expect(await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } }))
      .toMatchObject({ status: 'cancelled', activeAttemptId: null, endedAt });
    expect((await prisma.aiCoachMessage.findUniqueOrThrow({ where: { id: messageId } })).message)
      .toMatchObject({ parts: expect.arrayContaining([expect.objectContaining({
        type: 'data-coach-run',
        data: expect.objectContaining({ status: 'cancelled', endedAt: endedAt.toISOString() }),
      })]) });
    expect(await store.recoverStaleOperation('athlete', handle.operationId)).toBe(true);
  });

  it('preserves a requested cancellation when the producer stops before checkpointing', async () => {
    const handle = (await store.begin(startArgs())).handle!;
    const { runId, attemptId } = handle.projector.run;
    await store.cancel('athlete', runId, attemptId);
    await prisma.coachRunAttempt.update({
      where: { id: attemptId },
      data: { heartbeatAt: new Date(Date.now() - 180_000) },
    });
    expect(await store.recoverStaleOperation('athlete', handle.operationId)).toBe(true);
    const run = await prisma.coachRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ status: 'cancelled', activeAttemptId: null, pendingInteraction: null });
    expect(await prisma.coachRunAttempt.findUniqueOrThrow({ where: { id: attemptId } }))
      .toMatchObject({ status: 'cancelled', completionReason: 'cancelled', endedAt: run.endedAt });
  });

  it('arbitrates cancel vs completion in the terminal transaction', async () => {
    const { handle } = await store.begin(startArgs());
    const { runId, attemptId } = handle.projector.run;
    await expect(store.cancel('intruder', runId, attemptId)).rejects.toThrow(
      'not found',
    );
    await store.cancel('athlete', runId, attemptId);
    handle.projector.finish('completed');
    await expect(store.checkpoint(handle, 'completed')).rejects.toBeInstanceOf(
      CoachRunCancelledError,
    );
    handle.projector.finish('cancelled');
    await store.checkpoint(handle, 'cancelled');
    expect(await store.cancel('athlete', runId, attemptId)).toMatchObject({
      accepted: false,
    });
    expect(
      await prisma.coachRun.findUnique({ where: { id: runId } }),
    ).toMatchObject({ status: 'cancelled', activeAttemptId: null });
  });

  it.each(['cancelled', 'expired'] as const)(
    'fences a write tool before it starts when the attempt is %s',
    async (condition) => {
      const { handle } = await store.begin(startArgs());
      const { runId, attemptId } = handle.projector.run;
      if (condition === 'cancelled') {
        await store.cancel('athlete', runId, attemptId);
      } else {
        await prisma.coachRunAttempt.update({
          where: { id: attemptId },
          data: { heartbeatAt: new Date(Date.now() - 120_000) },
        });
        await expect(store.checkpointStreamProgress(handle)).rejects.toThrow(
          'Coach execution ownership changed',
        );
      }

      await expect(store.heartbeat(handle)).resolves.toBe(
        condition === 'cancelled' ? 'user_cancelled' : 'ownership_lost',
      );
      await expect(store.checkpointMutationStart(handle, {
          key: 'tool:write',
          kind: 'tool',
          status: 'running',
          labelKey: 'tool',
          toolCallId: 'write',
          mutation: true,
      })).rejects.toThrow(
        condition === 'cancelled' ? 'user_cancelled' : 'Coach execution ownership changed',
      );
      expect(await prisma.coachRunAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { mutationStarted: true, unresolvedTools: true },
      })).toEqual({ mutationStarted: false, unresolvedTools: [] });
      expect(handle.projector.activities.size).toBe(0);
      if (condition === 'expired') {
        handle.projector.finish('interrupted');
        await expect(store.checkpointStreamTerminal(handle, 'interrupted')).rejects.toThrow(
          'Coach execution ownership changed',
        );
      }
    },
  );

  it('keeps the live projection unchanged when saving a write-tool start rolls back', async () => {
    const { handle } = await store.begin(startArgs());
    const projector = handle.projector;
    projector.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: 'rejected by test constraint' },
    });
    await prisma.$executeRaw`
      ALTER TABLE t_ai_coach_message ADD CONSTRAINT test_rejected_checkpoint
      CHECK (content <> 'rejected by test constraint')
    `;
    try {
      await expect(store.checkpointMutationStart(handle, {
        key: 'tool:rolled-back-write',
        kind: 'tool',
        status: 'running',
        labelKey: 'tool',
        toolCallId: 'rolled-back-write',
        mutation: true,
      })).rejects.toThrow('test_rejected_checkpoint');
      expect(handle.projector).toBe(projector);
      expect(projector.activities.size).toBe(0);
      expect(projector.mutationStarted).toBe(false);
      expect(projector.unresolvedTools.size).toBe(0);
      expect(await prisma.coachRunAttempt.findUniqueOrThrow({
        where: { id: projector.run.attemptId },
        select: { mutationStarted: true, unresolvedTools: true },
      })).toEqual({ mutationStarted: false, unresolvedTools: [] });
    } finally {
      await prisma.$executeRaw`
        ALTER TABLE t_ai_coach_message DROP CONSTRAINT test_rejected_checkpoint
      `;
    }
  });

  it('uses a single attempt update for a heartbeat and one attempt and message update for progress', async () => {
    const { handle } = await store.begin(startArgs());
    queries.length = 0;
    await expect(store.heartbeat(handle)).resolves.toBeNull();
    expect(queries.filter((query) => /t_coach_run_attempt/i.test(query))).toHaveLength(1);

    queries.length = 0;
    await store.checkpointStreamProgress(handle);
    expect(queries.filter((query) => /\bUPDATE\b/i.test(query))).toHaveLength(2);
  });

  it('rejects stale actions after a question is cancelled and finalizes the new text turn', async () => {
    const { handle: old } = await store.begin(startArgs());
    presentQuestion(old);
    const lateAnswer = answerArgs(old);
    const { runId, attemptId } = old.projector.run;
    await store.cancel('athlete', runId, attemptId);
    old.projector.finish('cancelled');
    await store.checkpoint(old, 'cancelled');

    for (const retry of [startArgs(), startArgs()]) {
      await expect(
        store.begin({
          ...retry,
          command: { ...retry.command, kind: 'retry', runId, attemptId },
        }),
      ).rejects.toThrow('Coach attempt cannot be safely retried');
    }
    await expect(store.begin(lateAnswer)).rejects.toMatchObject({
      status: 409,
      response: { code: 'question_stale' },
    });
    expect(await prisma.coachRunAttempt.count()).toBe(1);

    const prompt = 'Yes, please.';
    const { handle: next } = await store.begin({
      ...startArgs(),
      prompt,
      message: { content: [{ type: 'text', text: prompt }] },
    });
    const nextRun = next.projector.run;
    expect(nextRun.runId).not.toBe(runId);
    expect(next.sessionId).toBe(old.sessionId);
    presentQuestion(next);
    await store.checkpoint(next);
    await store.cancel('athlete', nextRun.runId, nextRun.attemptId);
    next.projector.finish('awaiting_input');
    await expect(store.checkpoint(next, 'awaiting_input')).rejects.toThrow(
      'user_cancelled',
    );
    next.projector.finish('cancelled');
    await store.checkpoint(next, 'cancelled');

    expect(
      await prisma.coachRun.findUniqueOrThrow({
        where: { id: nextRun.runId },
        include: { attempts: true },
      }),
    ).toMatchObject({
      status: 'cancelled',
      activeAttemptId: null,
      pendingInteraction: null,
      attempts: [
        {
          id: nextRun.attemptId,
          status: 'cancelled',
          endedAt: expect.any(Date),
          mutationStarted: false,
        },
      ],
    });
    const inputs = await prisma.aiCoachMessage.findMany({
      where: { userId: old.userId, sessionId: old.sessionId, role: 'USER' },
      orderBy: { sequence: 'asc' },
      select: { content: true },
    });
    expect(inputs).toEqual([{ content: '训练建议' }, { content: prompt }]);
  });

  it('recovers only the expired attempt attached to the blocking operation', async () => {
    const expired = startArgs();
    const { handle } = await store.begin(expired);
    const unrelated = startArgs();
    const { handle: otherHandle } = await store.begin({
      ...unrelated,
      sid: 'other-session',
    });
    await expect(store.recoverStaleOperation('athlete', expired.operationId))
      .resolves.toBe(false);

    await prisma.coachRunAttempt.updateMany({
      where: { id: { in: [handle.projector.run.attemptId, otherHandle.projector.run.attemptId] } },
      data: { heartbeatAt: new Date(Date.now() - 120_000) },
    });
    await expect(store.recoverStaleOperation('intruder', expired.operationId))
      .resolves.toBe(false);
    await expect(store.recoverStaleOperation('athlete', expired.operationId))
      .resolves.toBe(true);
    // The accounting operation can still need release after a history read
    // (or another request) has already recovered the attempt.
    await expect(store.recoverStaleOperation('athlete', expired.operationId))
      .resolves.toBe(true);
    expect(await prisma.coachRun.findUnique({
      where: { id: handle.projector.run.runId },
    })).toMatchObject({ status: 'interrupted', activeAttemptId: null });
    expect(await prisma.coachRun.findUnique({
      where: { id: otherHandle.projector.run.runId },
    })).toMatchObject({ status: 'running' });
  });

  it('reconciles a late write without reviving or making it blindly retryable', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'tool:write',
        kind: 'tool',
        labelKey: 'tool',
        status: 'running',
        toolCallId: 'write',
        mutation: true,
      },
    });
    await store.checkpoint(handle);
    await prisma.coachRunAttempt.update({
      where: { id: handle.projector.run.attemptId },
      data: { heartbeatAt: new Date(Date.now() - 120_000) },
    });
    await store.recoverStale('athlete', 'session');
    await store.recordLateOutcome(handle, {
      key: 'tool:write',
      kind: 'tool',
      labelKey: 'tool',
      toolCallId: 'write',
      mutation: true,
      status: 'completed',
    });
    expect(
      await prisma.coachRunAttempt.findUnique({
        where: { id: handle.projector.run.attemptId },
      }),
    ).toMatchObject({ status: 'interrupted', unresolvedTools: [] });
    const row = await prisma.aiCoachMessage.findUnique({
      where: { id: handle.projector.message.id },
    });
    expect(row.message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-activity',
          data: expect.objectContaining({
            status: 'completed',
            summary: 'late_outcome',
          }),
        }),
      ]),
    });
    await expect(
      store.begin({
        ...startArgs(),
        command: {
          kind: 'retry',
          runId: handle.projector.run.runId,
          attemptId: handle.projector.run.attemptId,
          requestId: randomUUID(),
        },
      }),
    ).rejects.toThrow('safely retried');
  });

  it('enforces one running attempt and request / operation identities in PostgreSQL', async () => {
    const args = startArgs();
    const { handle } = await store.begin(args);
    await expect(
      store.begin({ ...args, command: startArgs().command }),
    ).rejects.toThrow();
    // Constraint failures can close PGlite Socket's protocol connection.
    await prisma.$disconnect();
    await prisma.$connect();
    const source = await prisma.coachRunAttempt.findUnique({
      where: { id: handle.projector.run.attemptId },
    });
    const message = await prisma.aiCoachMessage.create({
      data: {
        id: 'another-message',
        userId: 'athlete',
        sessionId: 'session',
        role: 'ASSISTANT',
        content: '',
        sequence: 10,
      },
    });
    await expect(
      prisma.coachRunAttempt.create({
        data: {
          ...source,
          id: randomUUID(),
          requestId: randomUUID(),
          operationId: randomUUID(),
          messageId: message.id,
          unresolvedTools: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.$disconnect();
    await prisma.$connect();
    await expect(
      prisma.coachRun.update({
        where: { id: handle.projector.run.runId },
        data: { status: 'invented' },
      }),
    ).rejects.toThrow('t_coach_run_status_check');
  });

  it('keeps provider tool order private and outside the visible message sequence', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'lookup', name: 'profile.zones', input: {} },
        ],
      },
    });
    handle.projector.consume({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'lookup',
            content: { secretMetric: 123 },
          },
        ],
      },
    });
    handle.projector.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: '完成' },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed');
    const row = await prisma.aiCoachMessage.findUnique({
      where: { id: handle.projector.message.id },
    });
    expect(
      JSON.stringify(sanitizeStoredCoachMessageForClient(row.message)),
    ).not.toContain('secretMetric');
    const replay = buildHistoryMessages({
      provider: null,
      rows: [row],
      thinking: false,
      currentUserMessage: { content: [{ type: 'text', text: '继续' }] },
    });
    expect(replay.map((item) => item.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(await prisma.aiCoachMessage.count()).toBe(2);
  });
});
