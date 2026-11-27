import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityAiReviewService } from '@/api/activity/activity-ai-review.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { CoachReviewContextService } from '@/review/coach-review-context.service';
import { ReviewDigestContextService } from '@/review/review-digest-context.service';
import { CalendarAdjustmentSyncWorker } from '../application/calendar-adjustment-sync.worker';
import { PlanExecutionContextService } from '../application/plan-execution-context.service';
import { PlanLinkMatcherService } from '../application/plan-link-matcher.service';
import { PlanSummaryService } from '../application/plan-summary.service';
import { PLAN_WORKOUTS_CHANGED_EVENT } from '../events/plan.events';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import {
  planStartFixture,
  raceWithPlanWriteCheckpoint,
  raceWithUncommittedPlanWrite,
} from './plan-start.fixture';
import { addCalendarDays } from '@shared/plan-calendar';
import type { PlanQualityContract } from '@shared/plan-quality';
import { planByIdTool } from '../../ai/core/tools/planById.tool';
import { planActiveTool } from '../../ai/core/tools/planActive.tool';
import { presentIndependentWorkoutDraftTool } from '../../ai/core/tools/presentIndependentWorkoutDraft.tool';
import { AiService } from '../../ai/ai.service';
import { CoachBranchingService } from '../../ai/coach-branching.service';
import { CoachStateContextService } from '../../ai/coach-state-context.service';
import { CoachRunStore } from '../../ai/coach-run-store.service';
import type {
  CoachQueryYield,
  CoachUserMessageBody,
} from '../../ai/core/coach-query-yield';

describe('remaining schedule / PostgreSQL', () => {
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

  const nativeIt = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN ? it : it.skip;

  function matcher(links = new PlanActivityLinkRepository(prisma as never)) {
    return new PlanLinkMatcherService(
      prisma as never, f.users, new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never), links, new ActivityReadService(prisma as never),
      undefined as never,
    );
  }

  nativeIt('preserves an activity-completed workout when skip is submitted while the activity is being linked', async () => {
    const { planId } = await running(1);
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const activity = await prisma.activity.create({
      data: {
        userId: 'user', hashId: 'calendar-linked-run', sportType: 'RUN',
        state: 1, processingStatus: 'READY', startTime: workout.scheduledDate,
      },
    });
    const skip = await raceWithUncommittedPlanWrite(
      prisma,
      (tx) => f.write.replaceActivityPlanLinkByHash(
        'user', activity.hashId, { workoutId: workout.id }, undefined, undefined, { tx },
      ),
      () => f.service.updateWorkoutStatus('user', planId, workout.id, 'SKIPPED'),
    );
    expect(skip).toMatchObject({
      status: 'rejected', reason: { message: 'Only planned workouts can be changed' },
    });
    await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: workout.id } }))
      .resolves.toMatchObject({ status: 'DONE', skippedAt: null });
    await expect(prisma.planWorkoutActivityLink.findFirst({
      where: { planWorkoutId: workout.id, activityId: activity.id, unlinkedAt: null },
    })).resolves.toMatchObject({ autoMarkedWorkoutDone: true });
  });

  nativeIt('does not delete a draft that becomes active during the delete request', async () => {
    const draft = await f.service.createPlan('user', {
      title: 'New plan', periodWeeks: 1,
      workouts: [{
        weekIndex: 1, dayIndex: 1, sportType: 'RUN',
        definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 20m' },
      }],
    });
    const planId = draft.plan!.id;
    const deletion = await raceWithUncommittedPlanWrite(
      prisma,
      (tx) => f.write.activatePlan(
        'user', planId, '2099-11-22', undefined, { tx, validatedStartPreview: true },
      ),
      () => f.service.deletePlan('user', planId),
    );
    expect(deletion).toMatchObject({
      status: 'rejected', reason: { message: 'This plan cannot be deleted' },
    });
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: planId } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });
  });

  nativeIt('commits simultaneous confirmations of one calendar adjustment only once', async () => {
    const { planId } = await running(1);
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const id = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{
        kind: 'UPDATE', workoutId: workout.id, expectedRevision: workout.revision,
        targetDate: '2099-11-24',
      }],
    });
    const [first, second] = await Promise.all([
      f.starts.confirmCalendarAdjustment('user', planId, id, id),
      f.starts.confirmCalendarAdjustment('user', planId, id, id),
    ]);
    expect(first).toMatchObject({ versionId: id, readbackVerified: true, changedWorkoutCount: 1 });
    expect(second).toEqual(first);
    await expect(prisma.planWorkout.findMany({ where: { planId } }))
      .resolves.toEqual([
        expect.objectContaining({
          id: workout.id, revision: workout.revision + 1, scheduledDate: new Date('2099-11-24'),
        }),
      ]);
  });

  nativeIt('accepts only one concurrent edit based on the same calendar adjustment version', async () => {
    const { planId } = await running(1);
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const id = randomUUID();
    const edit = { kind: 'UPDATE' as const, workoutId: workout.id, expectedRevision: workout.revision };
    await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id, edits: [{ ...edit, targetDate: '2099-11-24' }],
    });
    const versions = ['2099-11-25', '2099-11-26'].map((targetDate) => ({
      baseVersionId: id, versionId: randomUUID(), edits: [{ ...edit, targetDate }],
    }));
    const outcomes = await Promise.allSettled(versions.map((version) =>
      f.starts.saveCalendarAdjustment('user', planId, id, version),
    ));
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    const winningVersion = versions[outcomes.findIndex(({ status }) => status === 'fulfilled')];
    const head = await f.starts.getCalendarAdjustment('user', planId, id);
    expect(head).toMatchObject({ versionId: winningVersion.versionId, state: 'READY' });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id)).rejects.toThrow('version changed');
    await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: workout.id } })).resolves.toEqual(workout);
  });

  async function running(
    count = 3,
    options: {
      qualityContract?: PlanQualityContract;
      startDate?: string;
      durationMinutes?: number;
      periodWeeks?: number;
      openSession?: (planId: string) => Promise<{ id: string }>;
    } = {},
  ) {
    const created = await f.service.createPlan('user', {
      title: 'Running',
      periodWeeks: options.periodWeeks ?? Math.ceil(count / 7),
      generationMetadata: { qualityContract: options.qualityContract },
      workouts: Array.from({ length: count }, (_, i) => ({
        weekIndex: Math.floor(i / 7) + 1,
        dayIndex: (i % 7) + 1,
        sportType: 'RUN',
        definition: options.durationMinutes
          ? {
              kind: 'FREEFORM' as const,
              version: 1 as const,
              source: 'STRUCTURE' as const,
              structure: {
                kind: 'FREEFORM' as const,
                version: 1 as const,
                text: `Run ${options.durationMinutes}m`,
                durationSeconds: options.durationMinutes * 60,
              },
            }
          : {
              kind: 'FREEFORM' as const,
              version: 1 as const,
              source: 'TEXT' as const,
              text: `Run ${options.durationMinutes ?? 30}m`,
            },
      })),
    });
    const planId = created.plan!.id;
    await prisma.$transaction((tx) =>
      f.service.activatePlan(
        'user',
        planId,
        options.startDate ?? '2099-11-22',
        undefined,
        {
          tx,
          validatedStartPreview: true,
        },
      ),
    );
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
    const session = options.openSession
      ? await options.openSession(planId)
      : await prisma.aiCoachSession.create({
          data: { userId: 'user', id: 'ordinary-chat' },
        });
    const user = await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.id,
        role: 'USER',
        sequence: 1,
        content: 'No training on Tuesday',
      },
    });
    const assistant = await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.id,
        role: 'ASSISTANT',
        sequence: 2,
        content: '',
      },
    });
    await prisma.coachRun.create({
      data: {
        id: 'run',
        userId: 'user',
        sessionId: session.id,
        branchId: branch.id,
        originMessageId: user.id,
        status: 'running',
        activeAttemptId: 'attempt',
        attempts: {
          create: {
            id: 'attempt',
            userId: 'user',
            requestId: 'request',
            requestHash: 'hash',
            inputMessageId: user.id,
            messageId: assistant.id,
            trigger: 'start',
            operationId: 'op',
            ownerId: 'test',
          },
        },
      },
    });
    return {
      planId,
      binding: { sid: session.id, branchId: branch.id, userMessageId: user.id },
      request: {
        mode: 'SCHEDULE',
        planId,
        range: { from: '2099-11-22', to: '2099-12-31' },
        rationale: 'Coordinate remaining dates',
        evidenceRefs: [],
        changes: [],
        additions: [],
        deletions: [],
        preserveUnmentioned: true,
      } as any,
    };
  }
  it('replays an independent creation without duplicating or recreating a removed workout', async () => {
    const input = {
      idempotencyKey: randomUUID(), scheduledDate: '2099-11-24', sportType: 'RUN' as const,
      name: 'Independent easy run', text: 'work 20m',
    };
    const [first, replay] = await Promise.all([
      f.service.createIndependentWorkout('user', input),
      f.service.createIndependentWorkout('user', input),
    ]);
    expect(replay.workout?.id).toBe(first.workout!.id);
    await expect(f.service.createIndependentWorkout('user', { ...input, name: 'Different run' })).rejects.toThrow('already used');
    const calendar = await f.service.listScheduledWorkouts('user', input.scheduledDate, input.scheduledDate);
    expect(calendar.independent.map((workout) => workout?.id)).toEqual([first.workout!.id]);
    await f.service.deleteIndependentWorkout('user', first.workout!.id);
    await expect(f.service.createIndependentWorkout('user', input)).rejects.toThrow('already processed');
  });

  it('resumes an edited coach workout draft and confirms the same version only once', async () => {
    const { binding } = await running(1);
    const dto = { scheduledDate: '2099-11-24', sportType: 'RUN' as const, name: 'Original', text: 'work 20m' };
    const { draftId } = await presentIndependentWorkoutDraftTool.execute({
      session: { user: { id: 'user' } }, sid: binding.sid, currentUserMessageId: binding.userMessageId, planService: f.service,
    } as never, dto);
    const draft = await f.service.getIndependentWorkoutDraft('user', draftId);
    expect(draft).toMatchObject({ state: 'READY', revision: 1 });
    await expect(f.service.createIndependentWorkoutDraft('user', binding.sid, binding.userMessageId, dto)).resolves.toEqual(draft);
    await expect(f.service.getIndependentWorkoutDraft('other', draft.id)).rejects.toThrow('Draft not found');
    await expect(f.service.listScheduledWorkouts('user', dto.scheduledDate, dto.scheduledDate)).resolves.toMatchObject({ independent: [] });
    const updated = await f.service.transitionIndependentWorkoutDraft('user', draft.id, {
      action: 'SAVE', expectedRevision: 1, workout: { ...dto, name: 'Revised', text: 'work 30m' },
    });
    await expect(f.service.getIndependentWorkoutDraft('user', draft.id)).resolves.toEqual(updated);
    await expect(f.service.transitionIndependentWorkoutDraft('user', draft.id, {
      action: 'CONFIRM', expectedRevision: 1,
    })).rejects.toThrow('Draft version changed');
    const confirm = { action: 'CONFIRM' as const, expectedRevision: updated.revision };
    const [first, second] = await Promise.all([
      f.service.transitionIndependentWorkoutDraft('user', draft.id, confirm),
      f.service.transitionIndependentWorkoutDraft('user', draft.id, confirm),
    ]);
    expect(first).toMatchObject({ state: 'APPLIED', revision: 3 });
    expect(second).toEqual(first);
    await expect(f.service.listScheduledWorkouts('user', dto.scheduledDate, dto.scheduledDate)).resolves.toMatchObject({
      independent: [expect.objectContaining({ id: first.workoutId, name: 'Revised', planId: null })],
    });
  });

  it('keeps an expired independent draft out of the schedule and prevents confirmation after discard', async () => {
    const { binding } = await running(1);
    const workout = { scheduledDate: '2099-11-24', sportType: 'RUN' as const, text: 'work 20m' };
    const draft = await f.service.createIndependentWorkoutDraft('user', binding.sid, binding.userMessageId, workout);
    await prisma.independentWorkoutDraft.update({
      where: { id: draft.id },
      data: { workout: { ...draft.workout, scheduledDate: '2000-01-01' } },
    });
    await expect(f.service.getIndependentWorkoutDraft('user', draft.id)).resolves.toMatchObject({ state: 'EXPIRED' });
    const confirm = { action: 'CONFIRM' as const, expectedRevision: 1 };
    await expect(f.service.transitionIndependentWorkoutDraft('user', draft.id, confirm))
      .rejects.toThrow('Draft is no longer available');
    const discard = { action: 'DISCARD' as const, expectedRevision: 1 };
    const discarded = await f.service.transitionIndependentWorkoutDraft('user', draft.id, discard);
    expect(discarded).toMatchObject({ state: 'DISCARDED', revision: 2, workoutId: null });
    await expect(f.service.transitionIndependentWorkoutDraft('user', draft.id, discard)).resolves.toEqual(discarded);
    await expect(f.service.transitionIndependentWorkoutDraft('user', draft.id, confirm)).rejects.toThrow('Draft version changed');
    await expect(f.service.listScheduledWorkouts('user', '2000-01-01', workout.scheduledDate))
      .resolves.toMatchObject({ independent: [] });
  });

  it('applies only one terminal transition when a user confirms and discards the same workout draft', async () => {
    const { binding } = await running(1);
    const workout = { scheduledDate: '2099-11-24', sportType: 'RUN' as const, text: 'work 20m' };
    const draft = await f.service.createIndependentWorkoutDraft('user', binding.sid, binding.userMessageId, workout);
    const results = await Promise.allSettled([
      f.service.transitionIndependentWorkoutDraft('user', draft.id, { action: 'CONFIRM', expectedRevision: 1 }),
      f.service.transitionIndependentWorkoutDraft('user', draft.id, { action: 'DISCARD', expectedRevision: 1 }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const final = await f.service.getIndependentWorkoutDraft('user', draft.id);
    expect(final.revision).toBe(2);
    const schedule = await f.service.listScheduledWorkouts('user', workout.scheduledDate, workout.scheduledDate);
    expect(schedule.independent.map((row) => row?.id)).toEqual(final.workoutId ? [final.workoutId] : []);
    expect(final.state).toBe(final.workoutId ? 'APPLIED' : 'DISCARDED');
  });

  it('rejects an outdated independent edit after a concurrent update', async () => {
    const input = { scheduledDate: '2099-11-24', sportType: 'RUN' as const, name: 'Original', text: 'work 20m' };
    const first = (await f.service.createIndependentWorkout('user', input)).workout!;
    const edit = { ...input, expectedRevision: first.revision };
    const results = await Promise.allSettled([
      f.service.updateIndependentWorkout('user', first.id, { ...edit, name: 'First edit' }),
      f.service.updateIndependentWorkout('user', first.id, { ...edit, name: 'Second edit' }),
    ]);
    const saved = results.find((result) => result.status === 'fulfilled')?.value.workout;
    expect(saved).toMatchObject({ id: first.id, revision: first.revision + 1 });
    expect(results.find((result) => result.status === 'rejected')?.reason.message).toContain('refresh the calendar');
    await expect(f.service.getIndependentWorkoutDetail('user', first.id)).resolves.toMatchObject({
      workout: { id: first.id, name: saved!.name, revision: saved!.revision },
    });
  });

  it('keeps an independent workout unchanged on forbidden edits and moves it once to a valid occupied date', async () => {
    const input = { scheduledDate: '2099-11-24', sportType: 'RUN' as const, name: 'Original', text: 'work 20m' };
    const original = (await f.service.createIndependentWorkout('user', input)).workout!;
    const target = '2099-12-01';
    const existing = (await f.service.createIndependentWorkout('user', {
      ...input, scheduledDate: target, name: 'Other workout',
    })).workout!;
    const edit = { ...input, expectedRevision: original.revision, scheduledDate: target, name: 'Rescheduled run' };
    await expect(f.service.updateIndependentWorkout('other', original.id, edit)).rejects.toThrow('refresh the calendar');
    await expect(f.service.updateIndependentWorkout('user', original.id, { ...edit, scheduledDate: '2099-02-30' }))
      .rejects.toThrow('Invalid workout date');
    await expect(f.service.updateIndependentWorkout('user', original.id, { ...edit, scheduledDate: '2000-01-01' }))
      .rejects.toThrow('Workout date has passed');
    await expect(f.service.listScheduledWorkouts('user', input.scheduledDate, input.scheduledDate)).resolves.toMatchObject({
      independent: [expect.objectContaining({ id: original.id, revision: original.revision, name: input.name })],
    });
    await f.service.updateIndependentWorkout('user', original.id, edit);
    await expect(f.service.listScheduledWorkouts('user', input.scheduledDate, input.scheduledDate))
      .resolves.toMatchObject({ independent: [] });
    await expect(f.service.listScheduledWorkouts('user', target, target)).resolves.toMatchObject({
      independent: [
        expect.objectContaining({ id: existing.id, revision: existing.revision, sessionIndex: 1 }),
        expect.objectContaining({ id: original.id, revision: original.revision + 1, name: edit.name, sessionIndex: 2 }),
      ],
    });
  });

  it('retains identity when an independent workout joins a plan and resolves a retry to that workout', async () => {
    const { planId } = await running(1);
    const input = { idempotencyKey: randomUUID(), scheduledDate: '2099-11-24', sportType: 'RUN' as const,
      name: 'Joining run', text: 'work 20m' };
    const first = (await f.service.createIndependentWorkout('user', input)).workout!;
    await f.service.attachWorkoutToPlan('user', planId, first.id);
    await expect(f.service.createIndependentWorkout('user', input)).resolves.toMatchObject({
      workout: { id: first.id, planId, revision: first.revision + 1 },
    });
    await expect(f.service.updateIndependentWorkout('user', first.id, { ...input, expectedRevision: first.revision }))
      .rejects.toThrow('refresh the calendar');
  });

  nativeIt('keeps an independent workout outside the plan when automatic activity matching completes first', async () => {
    const { planId } = await running(1);
    const date = '2099-11-24';
    const original = (await f.service.createIndependentWorkout('user', {
      scheduledDate: date, sportType: 'RUN', name: 'Independent run', text: 'work 30m',
    })).workout!;
    const activity = await prisma.activity.create({
      data: {
        userId: 'user', hashId: 'attach-racing-with-automatic-match', sportType: 'RUN',
        state: 1, processingStatus: 'READY', timezone: 'UTC',
        startTime: new Date(`${date}T08:00:00Z`), timerTime: 1800,
      },
    });
    const links = new PlanActivityLinkRepository(prisma as never);
    const createLink = links.create.bind(links);
    const attachment = await raceWithPlanWriteCheckpoint(
      prisma,
      (hold) => {
        jest.spyOn(links, 'create').mockImplementationOnce(async (...args) => {
          const link = await createLink(...args);
          await hold();
          return link;
        });
        return matcher(links).tryAutoLinkForActivity(activity.id);
      },
      () => f.service.attachWorkoutToPlan('user', planId, original.id),
    );
    expect(attachment).toMatchObject({
      status: 'rejected', reason: { message: expect.stringContaining('linked to an activity') },
    });
    await expect(f.service.getIndependentWorkoutDetail('user', original.id)).resolves.toMatchObject({
      workout: {
        id: original.id, planId: null, status: 'DONE', capabilities: { edit: false },
        links: [expect.objectContaining({ activityId: activity.id, source: 'AUTO_MATCH' })],
      },
    });
  });

  it('commits manual moves, additions and deletions atomically and replays the receipt', async () => {
    const { planId } = await running(4);
    const read = () => prisma.planWorkout.findMany({
      where: { planId }, orderBy: [{ dayOffset: 'asc' }, { sessionIndex: 'asc' }],
    });
    const [first, second, third, fourth] = await read();
    const targetDate = fourth.scheduledDate!.toISOString().slice(0, 10);
    const input = {
      versionId: randomUUID(),
      edits: [
        { kind: 'UPDATE' as const, workoutId: first.id, expectedRevision: first.revision, targetDate },
        { kind: 'UPDATE' as const, workoutId: second.id, expectedRevision: second.revision, targetDate },
        { kind: 'DELETE' as const, workoutId: third.id, expectedRevision: third.revision },
        {
          kind: 'ADD' as const, candidateKey: randomUUID(), targetDate,
          workout: {
            name: 'Recovery run', sportType: 'RUN' as const,
            definition: { kind: 'FREEFORM' as const, version: 1 as const, source: 'TEXT' as const, text: 'Easy 20m' },
          },
        },
      ],
    };
    const stale = {
      ...input,
      edits: [...input.edits.slice(0, 2), { ...input.edits[2], expectedRevision: third.revision + 1 }],
    };
    await expect(f.starts.saveCalendarAdjustment('user', planId, input.versionId, stale)).rejects.toThrow();
    expect(await read()).toEqual([first, second, third, fourth]);
    const saved = await f.starts.saveCalendarAdjustment('user', planId, input.versionId, input);
    expect(await read()).toEqual([first, second, third, fourth]);
    const receipt = await f.starts.confirmCalendarAdjustment('user', planId, saved.id, saved.versionId);
    expect(receipt).toMatchObject({ versionId: input.versionId, readbackVerified: true,
      changedWorkoutCount: 2, addedWorkoutCount: 1, deletedWorkoutCount: 1 });
    const committed = await read();
    expect(committed.map(({ id }) => id)).toEqual([fourth.id, first.id, second.id, expect.any(String)]);
    expect(committed.every(({ scheduledDate }) => scheduledDate?.toISOString().startsWith(targetDate))).toBe(true);
    expect(committed.at(-1)?.name).toBe('Recovery run');
    await expect(f.starts.confirmCalendarAdjustment('user', planId, saved.id, saved.versionId)).resolves.toEqual(receipt);
    expect(await read()).toEqual(committed);
  });

  it('versions a cross-month drag once and keeps an independent adjustment in another week', async () => {
    const { planId } = await running(4, { periodWeeks: 5, startDate: '2099-11-22' });
    const [first, second] = await prisma.planWorkout.findMany({ where: { planId }, orderBy: { dayOffset: 'asc' } });
    const id = randomUUID();
    const firstVersion = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{ kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: '2099-11-28' }],
    });
    const latest = await f.starts.saveCalendarAdjustment('user', planId, id, {
      baseVersionId: firstVersion.versionId, versionId: randomUUID(),
      edits: [{ kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: '2099-12-03' }],
    });
    expect(latest.presentation.rows.filter((row) => row.changeKind === 'CHANGED')).toEqual([
      expect.objectContaining({ workoutId: first.id, beforeScheduledDate: '2099-11-22', scheduledDate: '2099-12-03' }),
    ]);
    expect(await f.starts.getCalendarAdjustment('user', planId, id, firstVersion.versionId))
      .toMatchObject({ state: 'SUPERSEDED', currentVersionId: latest.versionId });
    expect(await prisma.planWorkout.findUnique({ where: { id: first.id } })).toEqual(first);
    await expect(f.starts.getCalendarAdjustment('other', planId, id)).rejects.toThrow();
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, firstVersion.versionId)).rejects.toThrow();

    const independentId = randomUUID();
    const unrelated = await f.starts.saveCalendarAdjustment('user', planId, independentId, {
      versionId: independentId,
      edits: [{ kind: 'ADD', candidateKey: randomUUID(), targetDate: '2099-12-16', workout: {
        sportType: 'RUN', name: 'Run',
        definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 20m' },
      } }],
    });
    expect((await f.starts.listCalendarAdjustments('user', planId)).map((item) => item.id)).toEqual(expect.arrayContaining([id, independentId]));
    const receipt = await f.starts.confirmCalendarAdjustment('user', planId, id, latest.versionId);
    expect(receipt).toMatchObject({ readbackVerified: true, changedWorkoutCount: 1 });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, latest.versionId)).resolves.toEqual(receipt);
    expect(await prisma.planWorkout.findUnique({ where: { id: second.id } })).toEqual(second);
    expect(await f.starts.getCalendarAdjustment('user', planId, independentId)).toMatchObject({ state: 'READY' });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, independentId, unrelated.versionId))
      .resolves.toMatchObject({ addedWorkoutCount: 1 });
  });

  it('confirms a saved adjustment when only the floating-point load representation changed', async () => {
    const { planId } = await running(1, { periodWeeks: 2 });
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    await prisma.planWorkout.update({ where: { id: workout.id }, data: { estimatedLoad: 125.4 } });
    const id = randomUUID();
    const saved = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{ kind: 'UPDATE', workoutId: workout.id, expectedRevision: workout.revision, targetDate: '2099-11-24' }],
    });
    const weeks = saved.presentation.calendarAdjustmentWeeks!;
    expect(weeks[0].before.estimatedLoad).toBe(125.4);
    const { proposal } = await prisma.planProposalPreview.findUniqueOrThrow({ where: { id } });
    const setStoredLoad = (estimatedLoad: number) => prisma.planProposalPreview.update({
      where: { id },
      data: { proposal: JSON.parse(JSON.stringify({
        ...(proposal as object),
        presentation: {
          ...saved.presentation,
          calendarAdjustmentWeeks: [{ ...weeks[0], before: { ...weeks[0].before, estimatedLoad } }, ...weeks.slice(1)],
        },
      })) },
    });

    await setStoredLoad(125.5);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, saved.versionId)).rejects.toThrow();
    await setStoredLoad(125.39999999999);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, saved.versionId))
      .resolves.toMatchObject({ changedWorkoutCount: 1, readbackVerified: true });
  });

  it('confirms calendar edits to an endurance workout with separately authored steps', async () => {
    const { planId } = await running(1, { periodWeeks: 2 });
    const workout = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const id = randomUUID();
    const saved = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{
        kind: 'UPDATE', workoutId: workout.id, expectedRevision: workout.revision, targetDate: '2099-11-24',
        workout: {
          name: 'Endurance run', sportType: 'RUN',
          definition: {
            kind: 'ENDURANCE', version: 1, source: 'TEXT',
            text: 'warmup 5m\nwork 40m hr z2\ncooldown 5m',
          },
        },
      }],
    });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, saved.versionId))
      .resolves.toMatchObject({ changedWorkoutCount: 1, readbackVerified: true });
    const actual = await prisma.planWorkout.findUniqueOrThrow({ where: { id: workout.id } });
    expect(actual).toMatchObject({ name: 'Endurance run', plannedDurationSeconds: 3000 });
    const { plan } = await f.service.getPlanDetail('user', planId);
    expect(plan!.workouts![0].structure).toMatchObject({
      kind: 'ENDURANCE',
      blocks: [{ steps: [expect.anything(), { primaryTargetMeta: { kind: 'HEART_RATE_ZONE', zoneIndex: 2 } }, expect.anything()] }],
    });
  });

  it('invalidates completed workouts and only rebases operations selected from the same adjustment', async () => {
    const { planId } = await running(4, { periodWeeks: 2 });
    const [first, second] = await prisma.planWorkout.findMany({ where: { planId }, orderBy: { dayOffset: 'asc' } });
    const id = randomUUID();
    const version = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [
        { kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: '2099-11-27' },
        { kind: 'DELETE', workoutId: second.id, expectedRevision: second.revision },
      ],
    });
    await prisma.planWorkout.update({ where: { id: first.id }, data: { status: 'DONE' } });
    const invalidated = await f.starts.getCalendarAdjustment('user', planId, id);
    expect(invalidated).toMatchObject({
      state: 'INVALIDATED',
      conflicts: [{ key: first.id, reason: 'WORKOUT_STATUS' }],
      recoverableOperationKeys: [second.id],
    });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, version.versionId)).rejects.toThrow();
    expect(await prisma.planWorkout.findUnique({ where: { id: second.id } })).toEqual(second);
    const rebased = await f.starts.rebaseCalendarAdjustment('user', planId, id, {
      versionId: randomUUID(), baseVersionId: version.versionId, operationKeys: [second.id],
    });
    expect(rebased).toMatchObject({ state: 'READY', operationKeys: [second.id] });
    const discarded = await f.starts.discardCalendarAdjustment('user', planId, id, rebased.versionId);
    expect(discarded.state).toBe('DISCARDED');
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, rebased.versionId)).rejects.toThrow();
    expect(await prisma.planWorkout.findUnique({ where: { id: second.id } })).toEqual(second);
  });

  it('keeps a newer workout prescription when refreshing an older draft with unrelated moves', async () => {
    const { planId } = await running(3, { periodWeeks: 3 });
    const read = async () => (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const [first, second] = await read();
    const prescription = (name: string, text: string) => ({ name, sportType: 'RUN' as const,
      definition: { kind: 'FREEFORM' as const, version: 1 as const, source: 'TEXT' as const, text },
    });
    const old = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, old, { versionId: old, edits: [
      { kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: first.scheduledDate!, workout: prescription('Old intervals', 'Easy 20m') },
      { kind: 'UPDATE', workoutId: second.id, expectedRevision: second.revision, targetDate: '2099-11-28' },
    ] });
    const directEdit = {
      weekIndex: first.weekIndex, dayIndex: first.dayIndex, sessionIndex: first.sessionIndex,
      expectedRevision: first.revision, ...prescription('New intervals', 'Easy 30m'),
    };
    await f.service.updateWorkout('user', planId, first.id, directEdit);
    await expect(f.service.updateWorkout('user', planId, first.id, { ...directEdit, name: 'Another old edit' }))
      .rejects.toThrow('Workout revision changed');

    await expect(f.starts.getCalendarAdjustment('user', planId, old)).resolves.toMatchObject({
      conflicts: [{ key: first.id, reason: 'WORKOUT_CHANGED' }], recoverableOperationKeys: [second.id],
    });
    await expect(f.starts.rebaseCalendarAdjustment('user', planId, old, {
      versionId: randomUUID(), baseVersionId: old, operationKeys: [first.id],
    })).rejects.toThrow('Select only operations that are still available');
    const versionId = randomUUID();
    await f.starts.rebaseCalendarAdjustment('user', planId, old, {
      versionId, baseVersionId: old, operationKeys: [second.id],
    });
    await f.starts.confirmCalendarAdjustment('user', planId, old, versionId);
    const actual = await read();
    expect(actual.find(({ id }) => id === first.id)?.name).toBe('New intervals');
    expect(actual.find(({ id }) => id === second.id)?.scheduledDate).toBe('2099-11-28');
  });

  it('keeps a cross-month batch atomic when an activity completes one workout and commits the selected recovery once', async () => {
    const { planId } = await running(8, { periodWeeks: 5, durationMinutes: 30 });
    const read = async () => (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const original = await read();
    const moves = original.slice(0, 7).map((workout, index) => ({
      kind: 'UPDATE' as const,
      workoutId: workout.id,
      expectedRevision: workout.revision,
      targetDate: addCalendarDays('2099-11-30', index),
    }));
    const id = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, id, { versionId: id, edits: moves });
    await expect(read()).resolves.toEqual(original);

    const unavailable = original[3];
    const activity = await prisma.activity.create({
      data: {
        userId: 'user', hashId: 'matched-in-cross-month-draft', sportType: 'RUN',
        state: 1, processingStatus: 'READY', timezone: 'UTC',
        startTime: new Date(`${unavailable.scheduledDate}T08:00:00Z`), timerTime: 1800,
      },
    });
    await matcher().tryAutoLinkForActivity(activity.id);
    const before = await read();
    const completed = before.find(({ id }) => id === unavailable.id);
    expect(completed).toMatchObject({
      id: unavailable.id, scheduledDate: unavailable.scheduledDate, status: 'DONE',
    });
    await expect(f.starts.getCalendarAdjustment('user', planId, id)).resolves.toMatchObject({
      state: 'INVALIDATED', conflicts: [{ key: unavailable.id, reason: 'WORKOUT_STATUS' }],
    });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id)).rejects.toThrow('needs to be refreshed');
    await expect(read()).resolves.toEqual(before);

    const versionId = randomUUID();
    const selected = moves.slice(0, 3);
    await expect(f.starts.rebaseCalendarAdjustment('user', planId, id, {
      versionId, baseVersionId: id, operationKeys: selected.map(({ workoutId }) => workoutId),
    })).resolves.toMatchObject({ state: 'READY', operationKeys: selected.map(({ workoutId }) => workoutId) });
    const [receipt, secondConfirmation] = await Promise.all([
      f.starts.confirmCalendarAdjustment('user', planId, id, versionId),
      f.starts.confirmCalendarAdjustment('user', planId, id, versionId),
    ]);
    expect(receipt).toMatchObject({ readbackVerified: true, changedWorkoutCount: 3 });
    expect(secondConfirmation).toEqual(receipt);
    const after = new Map((await read()).map((workout) => [workout.id, workout]));
    for (const { workoutId, targetDate, expectedRevision } of selected) {
      expect(after.get(workoutId)).toMatchObject({ scheduledDate: targetDate, revision: expectedRevision + 1 });
    }
    expect(before.slice(3).map(({ id }) => after.get(id))).toEqual(before.slice(3));
    const links = await prisma.planWorkoutActivityLink.findMany({
      where: { activityId: activity.id, unlinkedAt: null },
    });
    expect(links).toEqual([expect.objectContaining({ planWorkoutId: unavailable.id, source: 'AUTO_MATCH' })]);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, versionId)).resolves.toEqual(receipt);
  });

  it('keeps an unconfirmed expired adjustment as a draft until its refreshed version is confirmed', async () => {
    const { planId } = await running(1);
    const original = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const id = randomUUID();
    const targetDate = '2099-11-24';
    await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{
        kind: 'UPDATE',
        workoutId: original.id,
        expectedRevision: original.revision,
        targetDate,
      }],
    });
    await prisma.planProposalPreview.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });

    const workouts = () => prisma.planWorkout.findMany({ where: { planId } });
    await expect(f.starts.listCalendarAdjustments('user', planId)).resolves.toEqual([
      expect.objectContaining({ id, versionId: id, state: 'EXPIRED', receipt: null, recoverableOperationKeys: [original.id] }),
    ]);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id))
      .rejects.toThrow('The calendar adjustment needs to be refreshed');
    await expect(workouts()).resolves.toEqual([original]);

    const versionId = randomUUID();
    const refreshed = await f.starts.rebaseCalendarAdjustment('user', planId, id, {
      baseVersionId: id,
      versionId,
    });
    expect(refreshed).toMatchObject({ id, versionId, state: 'READY', receipt: null });
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id))
      .rejects.toThrow('The calendar adjustment version changed');
    await expect(workouts()).resolves.toEqual([original]);

    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, versionId))
      .resolves.toMatchObject({ versionId, readbackVerified: true, changedWorkoutCount: 1 });
    await expect(workouts()).resolves.toEqual([
      expect.objectContaining({
        id: original.id,
        scheduledDate: new Date(targetDate),
        revision: original.revision + 1,
      }),
    ]);
  });

  it('reports no recoverable operations when the original workout date has passed', async () => {
    const { planId } = await running(1, { startDate: '2099-11-16', periodWeeks: 3 });
    const original = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const targetDate = '2099-11-27';
    const id = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{ kind: 'UPDATE', workoutId: original.id, expectedRevision: original.revision, targetDate }],
    });
    const move = await f.starts.previewCalendarMove('user', planId, original.id, {
      targetDate, expectedRevision: original.revision,
    });
    const clock = jest.spyOn(f.starts as unknown as { earliestStartDate: () => string }, 'earliestStartDate')
      .mockReturnValue('2099-11-26');
    try {
      await expect(f.starts.getCalendarAdjustment('user', planId, id)).resolves.toMatchObject({
        state: 'INVALIDATED',
        conflicts: [{ key: original.id, reason: 'HISTORY' }],
        recoverableOperationKeys: [],
      });
      await expect(f.starts.readCalendarMove('user', planId, move.previewId)).resolves.toMatchObject({
        recoveryBlockedReason: 'datesPassed',
      });
      await expect(f.starts.rebaseCalendarAdjustment('user', planId, id, {
        baseVersionId: id, versionId: randomUUID(),
      })).rejects.toThrow('Select only operations that are still available');
      await expect(prisma.planWorkout.findUnique({ where: { id: original.id } })).resolves.toEqual(original);
    } finally {
      clock.mockRestore();
    }
  });

  nativeIt('rejects confirmation when the calendar adjustment expires while waiting for the write lock', async () => {
    const { planId } = await running(1);
    const original = await prisma.planWorkout.findFirstOrThrow({ where: { planId } });
    const id = randomUUID();
    const saved = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{
        kind: 'UPDATE',
        workoutId: original.id,
        expectedRevision: original.revision,
        targetDate: '2099-11-24',
      }],
    });
    const expiresAt = Date.parse(saved.expiresAt);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(expiresAt - 1);
    try {
      const result = await raceWithPlanWriteCheckpoint(
        prisma,
        (hold) => prisma.$transaction(async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, 'user');
          await hold();
          clock.mockReturnValue(expiresAt);
        }),
        () => f.starts.confirmCalendarAdjustment('user', planId, id, id),
      );
      expect(result).toMatchObject({
        status: 'rejected',
        reason: { message: 'The calendar adjustment needs to be refreshed' },
      });
      await expect(f.starts.getCalendarAdjustment('user', planId, id))
        .resolves.toMatchObject({ state: 'EXPIRED', receipt: null });
      await expect(prisma.planWorkout.findMany({ where: { planId } }))
        .resolves.toEqual([original]);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps review evidence and rolling decisions stable until a calendar proposal is confirmed', async () => {
    const d = await running(1, { periodWeeks: 3 });
    const workout = await prisma.planWorkout.findFirstOrThrow({
      where: { planId: d.planId },
    });
    const branch = await prisma.coachBranch.findUniqueOrThrow({
      where: { id: d.binding.branchId },
    });
    const coach = new CoachStateContextService(prisma as never);
    const branching = new CoachBranchingService(
      prisma as never, f.service, f.context, f.query, f.apply, f.proposals,
    );
    const completedActivity = await prisma.activity.create({
      data: {
        userId: 'user', hashId: 'reviewed-run', sportType: 'RUN', state: 1,
        processingStatus: 'READY', startTime: new Date('2099-11-22T08:00:00Z'),
        timezone: 'UTC', timerTime: 1200, distance: 2400,
      },
    });
    const pmc = {
      getStoredSliceAsOf: async () => ({ latest: null, daily: [] }),
      listRange: async () => [],
    } as never;
    const profiles = { getComposedUserProfile: async () => ({}) } as never;
    const loads = {
      getActualLoadForActivity: async () => ({ actualLoad: 22 }),
      batchGetActualLoad: async () => new Map([[completedActivity.id, { actualLoad: 22 }]]),
    } as never;
    const activityRead = new ActivityReadService(prisma as never);
    const plans = new PlanRepository(prisma as never);
    const workouts = new PlanWorkoutRepository(prisma as never);
    const execution = new PlanExecutionContextService(
      prisma as never, pmc, undefined as never, f.users,
      plans, workouts,
      new CoachContextRepository(prisma as never), activityRead, undefined as never,
    );
    const reviews = new CoachReviewContextService(
      f.query, activityRead, loads, pmc, profiles, f.codecs,
    );
    const digests = new ReviewDigestContextService(execution, reviews);
    const summary = new PlanSummaryService(prisma as never, loads, plans, workouts);
    const activityReview = new ActivityAiReviewService(
      prisma as never, undefined as never, profiles, pmc,
      undefined as never, undefined as never, loads, undefined as never,
      { getRecordSeriesStats: async () => ({}) } as never,
    );
    const periods = [
      { scale: 'daily', type: 'DAILY', start: '2099-11-22' },
      { scale: 'weekly', type: 'WEEKLY', start: '2099-11-16' },
      { scale: 'monthly', type: 'MONTHLY', start: '2099-11-01' },
    ] as const;
    const passiveInputs = async () => {
      const context = await execution.buildContext({
        userId: 'user', surface: 'HOME_TODAY', timezone: 'UTC', anchorDate: '2099-11-22',
      });
      const reports = await Promise.all(periods.map(async ({ scale, type, start }) => {
        const window = {
          userId: 'user', lang: 'en', periodStart: new Date(start),
          periodEnd: new Date('2099-11-23'),
        };
        const report = await reviews.build({ ...window, scale, context });
        return {
          reviewFactHash: report.reviewFactHash,
          report: await digests.build({ ...window, type, timezone: 'UTC' }),
        };
      }));
      return {
        decisions: (await coach.build({
          userId: 'user', contextId: branch.contextId, anchorDate: context.anchor.anchorDate,
          recentEvents: context.recentEvents,
        })).decisions,
        rollingRevision: (await f.starts.automationSnapshot(
          'user', d.planId, '2099-11-22', '2099-11-28', prisma,
        )).revision,
        reports,
        cycleWeeks: (await summary.summarize('user', d.planId)).weeks,
        activityEvidence: (await activityReview.buildCoachEvidenceBundle({
          userId: 'user', activityId: completedActivity.id, lang: 'en',
        })).evidenceHash,
      };
    };
    const before = await passiveInputs();
    expect(before.reports.map(({ report }) => report?.reviewWindow.planned)).toEqual([1, 1, 1]);
    expect(before.cycleWeeks.map(({ workoutCount }) => workoutCount)).toEqual([1, 0, 0]);
    d.request.changes = [{
      sourceWorkoutId: workout.id,
      expectedRevision: workout.revision,
      workout: {
        weekIndex: 2, dayIndex: 3, sportType: 'RUN',
        definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 20m' },
      },
    }];
    const preview = await f.proposals.createPreview('user', d.request, d.binding);
    const decision = await prisma.coachDecision.create({
      data: {
        branchId: branch.id, contextId: branch.contextId,
        decisionType: 'PLAN_SCHEDULE', state: 'PROPOSED', payload: preview.decisionPayload,
      },
    });
    await prisma.$transaction((tx) => f.proposals.claimDecision({
      userId: 'user', sourcePlanId: d.planId, previewId: preview.previewId,
      decisionId: decision.id, tx,
    }));
    await expect(branching.listPendingDecisions({ userId: 'user' })).resolves.toMatchObject({
      decisions: [expect.objectContaining({ id: decision.id })],
    });
    await expect(passiveInputs()).resolves.toEqual(before);
    await prisma.planProposalPreview.update({
      where: { id: preview.previewId }, data: { expiresAt: new Date(0) },
    });
    await expect(passiveInputs()).resolves.toEqual(before);
    await expect(branching.listPendingDecisions({ userId: 'user' })).resolves.toMatchObject({
      decisions: [],
    });
    await expect(f.starts.getCalendarAdjustment('user', d.planId, decision.id))
      .resolves.toMatchObject({ state: 'EXPIRED' });

    const refreshed = await f.starts.rebaseCalendarAdjustment('user', d.planId, decision.id, {
      baseVersionId: preview.previewId,
      versionId: randomUUID(),
    });
    await f.starts.confirmCalendarAdjustment('user', d.planId, decision.id, refreshed.versionId);
    const applied = await passiveInputs();
    expect(applied.rollingRevision).not.toBe(before.rollingRevision);
    expect(applied.reports.map(({ report }) => report?.reviewWindow.planned)).toEqual([0, 0, 0]);
    expect(applied.reports.map(({ reviewFactHash }) => reviewFactHash))
      .not.toEqual(before.reports.map(({ reviewFactHash }) => reviewFactHash));
    expect(applied.cycleWeeks.map(({ workoutCount }) => workoutCount)).toEqual([0, 1, 0]);
    expect(applied.activityEvidence).toBe(before.activityEvidence);
  });

  it('retries delivery of a committed version without writing the schedule again', async () => {
    const { planId } = await running(3);
    const [first] = await prisma.planWorkout.findMany({ where: { planId }, orderBy: { dayOffset: 'asc' } });
    const id = randomUUID();
    const saved = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{ kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: '2099-11-26' }],
    });
    await f.starts.confirmCalendarAdjustment('user', planId, id, saved.versionId);
    const bus = new EventEmitter2();
    const worker = new CalendarAdjustmentSyncWorker(prisma as never, bus);
    const delivery: string[] = [];
    bus.on(PLAN_WORKOUTS_CHANGED_EVENT, (event) => {
      delivery.push(event.calendarAdjustmentVersionId);
      if (delivery.length === 1) throw new Error('Temporary sync target failure');
    });
    const record = () => prisma.planProposalPreview.findUniqueOrThrow({ where: { id: saved.versionId } });
    await worker.drain();
    expect((await record()).calendarSyncSentAt).toBeNull();
    await worker.drain();
    expect((await record()).calendarSyncSentAt).toBeInstanceOf(Date);
    await worker.drain();
    expect(delivery).toEqual([saved.versionId, saved.versionId]);
    expect((await prisma.planWorkout.findUniqueOrThrow({ where: { id: first.id } })).revision).toBe(first.revision + 1);
  });

  it('adds an agent proposal to the same adjustment from a new conversation and rejects a late claim', async () => {
    const d = await running(3, { periodWeeks: 3 });
    const [first, second] = await prisma.planWorkout.findMany({ where: { planId: d.planId }, orderBy: { dayOffset: 'asc' } });
    const id = randomUUID();
    const base = await f.starts.saveCalendarAdjustment('user', d.planId, id, {
      versionId: id,
      edits: [{ kind: 'UPDATE', workoutId: first.id, expectedRevision: first.revision, targetDate: '2099-11-28' }],
    });
    const branch = await prisma.coachBranch.findUniqueOrThrow({ where: { id: d.binding.branchId } });
    const amended = { ...d.request,
      calendarAdjustment: { id, baseVersionId: base.versionId },
      changes: [{
        sourceWorkoutId: second.id, expectedRevision: second.revision,
        workout: { weekIndex: 2, dayIndex: 3, sessionIndex: 1, sportType: 'RUN',
          definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Run 30m' } },
      }],
    };
    const proposed = await f.proposals.createPreview('user', amended, d.binding);
    const late = await f.proposals.createPreview('user', amended, d.binding);
    const claim = (previewId: string) => prisma.$transaction(async (tx) => {
      const decision = await tx.coachDecision.create({ data: {
        branchId: branch.id, contextId: branch.contextId, decisionType: 'PLAN_SCHEDULE',
        state: 'PROPOSED', payload: { planId: d.planId, previewId },
      } });
      await f.proposals.claimDecision({
        previewId, decisionId: decision.id, userId: 'user', sourcePlanId: d.planId, tx,
      });
    });
    await claim(proposed.previewId);
    await expect(claim(late.previewId)).rejects.toThrow(/version changed/);
    const head = await f.starts.getCalendarAdjustment('user', d.planId, id);
    expect(head).toMatchObject({ versionId: proposed.previewId, operationKeys: [first.id, second.id] });
    expect(await f.starts.getCalendarAdjustment('user', d.planId, id, base.versionId))
      .toMatchObject({ state: 'SUPERSEDED', currentVersionId: proposed.previewId });
    await expect(f.starts.confirmCalendarAdjustment('user', d.planId, id, head.versionId))
      .resolves.toMatchObject({ changedWorkoutCount: 2 });
  });

  it('removes the old coach confirmation when the user restores a move in a newer batch', async () => {
    const d = await running(4, { periodWeeks: 5 });
    const read = async () => (await f.service.getPlanDetail('user', d.planId)).plan!.workouts!;
    const before = await read();
    const [first, second, third, untouched] = before;
    const move = (workout: typeof first, targetDate: string) => ({
      kind: 'UPDATE' as const, workoutId: workout.id, expectedRevision: workout.revision, targetDate,
    });
    const id = randomUUID();
    await f.starts.saveCalendarAdjustment('user', d.planId, id, {
      versionId: id, edits: [move(first, '2099-11-28')],
    });
    const preview = await f.proposals.createPreview('user', {
      ...d.request,
      calendarAdjustment: { id, baseVersionId: id },
      changes: [{
        sourceWorkoutId: second.id, expectedRevision: second.revision,
        workout: { weekIndex: 2, dayIndex: 3, sessionIndex: 1, sportType: 'RUN',
          definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Run 30m' } },
      }],
    }, d.binding);
    const branch = await prisma.coachBranch.findUniqueOrThrow({ where: { id: d.binding.branchId } });
    const decision = await prisma.$transaction(async (tx) => {
      const proposed = await tx.coachDecision.create({ data: {
        branchId: branch.id, contextId: branch.contextId, decisionType: 'PLAN_SCHEDULE',
        state: 'PROPOSED', payload: preview.decisionPayload,
      } });
      await f.proposals.claimDecision({
        previewId: preview.previewId, decisionId: proposed.id, userId: 'user', sourcePlanId: d.planId, tx,
      });
      return proposed;
    });
    const coach = new CoachBranchingService(
      prisma as never, f.service, f.context, f.query, f.apply, f.proposals,
    );
    const pending = () => coach.listPendingDecisions({ userId: 'user' });
    await expect(pending()).resolves.toMatchObject({ decisions: [{ id: decision.id }] });

    const saved = await f.starts.saveCalendarAdjustment('user', d.planId, id, {
      baseVersionId: preview.previewId,
      versionId: randomUUID(),
      edits: [move(first, '2099-11-22'), move(third, '2099-12-07')],
    });
    expect(saved).toMatchObject({ operationKeys: [second.id, third.id] });
    expect(saved.presentation.rows).toContainEqual(expect.objectContaining({
      workoutId: first.id, scheduledDate: '2099-11-22', changeKind: 'PRESERVED',
    }));
    await expect(pending()).resolves.toMatchObject({ decisions: [] });
    await expect(f.starts.confirmCalendarAdjustment('user', d.planId, id, preview.previewId))
      .rejects.toThrow('version changed');
    await expect(read()).resolves.toEqual(before);
    await expect(f.starts.confirmCalendarAdjustment('user', d.planId, id, saved.versionId))
      .resolves.toMatchObject({ readbackVerified: true, changedWorkoutCount: 2 });
    const after = await read();
    expect(after.find((workout) => workout.id === first.id)).toEqual(first);
    expect(after.find((workout) => workout.id === untouched.id)).toEqual(untouched);
    expect(after).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: second.id, scheduledDate: '2099-12-01', revision: second.revision + 1 }),
      expect.objectContaining({ id: third.id, scheduledDate: '2099-12-07', revision: third.revision + 1 }),
    ]));
  });

  it('closes a batch when every move is restored to its committed date', async () => {
    const { planId } = await running(2, { periodWeeks: 5 });
    const read = async () => (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const original = await read();
    const edits = original.map((workout) => ({
      kind: 'UPDATE' as const,
      workoutId: workout.id,
      expectedRevision: workout.revision,
      targetDate: '2099-12-07',
    }));
    const id = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, id, { versionId: id, edits });
    const input = {
      baseVersionId: id,
      versionId: randomUUID(),
      edits: edits.map((edit, index) => ({ ...edit, targetDate: original[index].scheduledDate! })),
    };
    const restored = await f.starts.saveCalendarAdjustment('user', planId, id, input);
    expect(restored).toMatchObject({ state: 'DISCARDED', operationKeys: [], receipt: null });
    await expect(f.starts.saveCalendarAdjustment('user', planId, id, input)).resolves.toEqual(restored);
    await expect(f.starts.listCalendarAdjustments('user', planId)).resolves.toEqual([]);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id)).rejects.toThrow('version changed');
    await expect(read()).resolves.toEqual(original);
  });

  it('edits an unpublished workout and closes the saved adjustment when it is removed', async () => {
    const { planId } = await running(1);
    const read = async () => (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const original = await read();
    const id = randomUUID();
    const candidateKey = randomUUID();
    await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: [{ kind: 'ADD', candidateKey, targetDate: '2099-11-24', workout: {
        name: 'Extra easy run', sportType: 'RUN',
        definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 20m' },
      } }],
    });
    const revision = randomUUID();
    await expect(f.starts.saveCalendarAdjustment('user', planId, id, {
      baseVersionId: id, versionId: revision, edits: [{
        kind: 'UPDATE', workoutId: `candidate:${candidateKey}`, expectedRevision: 0, targetDate: '2099-11-25',
        workout: {
          name: 'Extra recovery run', sportType: 'RUN',
          definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 15m' },
        },
      }],
    })).resolves.toMatchObject({
      state: 'READY', operationKeys: [`candidate:${candidateKey}`],
      presentation: { rows: expect.arrayContaining([
        expect.objectContaining({ candidateKey, name: 'Extra recovery run', scheduledDate: '2099-11-25' }),
      ]) },
    });
    await expect(read()).resolves.toEqual(original);
    const remove = {
      baseVersionId: revision,
      versionId: randomUUID(),
      edits: [{ kind: 'DELETE' as const, workoutId: candidateKey, expectedRevision: 0 }],
    };
    const closed = await f.starts.saveCalendarAdjustment('user', planId, id, remove);
    expect(closed).toMatchObject({ versionId: remove.versionId, state: 'DISCARDED', operationKeys: [], receipt: null });
    await expect(f.starts.saveCalendarAdjustment('user', planId, id, remove)).resolves.toEqual(closed);
    await expect(f.starts.confirmCalendarAdjustment('user', planId, id, id)).rejects.toThrow('version changed');
    await expect(read()).resolves.toEqual(original);
  });

  it('covers all 210 courses from an ordinary chat without truncation or requiring a start session', async () => {
    const d = await running(210);
    const result = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(result).toMatchObject({
      mode: 'SCHEDULE',
      decisionType: 'PLAN_SCHEDULE',
      presentation: {
        counts: { total: 210, preserved: 210 },
        range: d.request.range,
      },
    });
  }, 30_000);
  it('previews a calendar move across two weeks and applies it once after confirmation', async () => {
    const d = await running(1, {
      startDate: '2099-11-16',
      durationMinutes: 30,
      periodWeeks: 3,
    });
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const workout = before.workouts![0];
    const preview = await f.starts.previewCalendarMove(
      'user',
      d.planId,
      workout.id,
      {
        targetDate: '2099-11-24',
        expectedRevision: workout.revision,
      },
    );
    expect(preview.impact).toMatchObject({
      from: '2099-11-16',
      to: '2099-11-24',
      weeks: [
        {
          weekStart: '2099-11-16',
          before: { sessions: 1 },
          after: { sessions: 0 },
        },
        {
          weekStart: '2099-11-23',
          before: { sessions: 0 },
          after: { sessions: 1 },
        },
      ],
    });
    expect(preview.presentation.rows).toContainEqual(
      expect.objectContaining({
        workoutId: workout.id,
        beforeScheduledDate: '2099-11-16',
        scheduledDate: '2099-11-24',
      }),
    );
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts![0],
    ).toMatchObject({ scheduledDate: '2099-11-16' });
    const receipt = await f.starts.confirmCalendarMove(
      'user',
      d.planId,
      preview.previewId,
    );
    expect(receipt).toMatchObject({
      readbackVerified: true,
      identityMap: [
        {
          workoutId: workout.id,
          scheduledDate: '2099-11-24',
          revision: workout.revision + 1,
        },
      ],
    });
    expect(
      await f.starts.confirmCalendarMove('user', d.planId, preview.previewId),
    ).toEqual(receipt);
  });
  it('confirms a date-only move in a rolling plan with adjacent structured workouts', async () => {
    const startDate = addCalendarDays(new Date().toISOString().slice(0, 10), -1);
    const offsets = [0, 2, 4, 6, 8, 11, 13, 16];
    const draft = await f.service.createPlan('user', {
      title: 'Continuous running',
      goal: 'Build endurance',
      planningMode: 'ROLLING',
      periodWeeks: null,
      workouts: offsets.map((offset) => ({
        weekIndex: Math.floor(offset / 7) + 1,
        dayIndex: (offset % 7) + 1,
        sportType: 'RUN',
        definition: {
          kind: 'ENDURANCE',
          version: 1,
          source: 'TEXT',
          text: 'warmup 5m\nwork 40m\ncooldown 5m',
        },
      })),
    });
    const planId = draft.plan!.id;
    await prisma.plan.update({
      where: { id: planId },
      data: { status: 'ACTIVE', startDate: new Date(startDate), activationTimezone: 'UTC' },
    });
    const scheduled = await prisma.planWorkout.findMany({
      where: { planId },
      orderBy: { dayOffset: 'asc' },
    });
    for (const item of scheduled) {
      await prisma.planWorkout.update({
        where: { id: item.id },
        data: { scheduledDate: new Date(addCalendarDays(startDate, item.dayOffset)) },
      });
    }
    const workout = scheduled[1];
    const targetDate = addCalendarDays(startDate, 7);
    const preview = await f.starts.previewCalendarMove('user', planId, workout.id, {
      targetDate,
      expectedRevision: workout.revision,
    });
    await expect(f.starts.confirmCalendarMove('user', planId, preview.previewId)).resolves.toMatchObject({
      readbackVerified: true,
      identityMap: [{ workoutId: workout.id, scheduledDate: targetDate, revision: workout.revision + 1 }],
    });
  });

  it('rejects an unowned, cancelled or stale calendar move without changing the workout', async () => {
    const d = await running(1, { startDate: '2099-11-16', periodWeeks: 3 });
    const workout = (await f.service.getPlanDetail('user', d.planId)).plan!
      .workouts![0];
    const moves = await Promise.all(
      ['2099-11-24', '2099-11-25', '2099-11-26'].map((targetDate) =>
        f.starts.previewCalendarMove('user', d.planId, workout.id, {
          targetDate,
          expectedRevision: workout.revision,
        }),
      ),
    );
    await expect(
      f.starts.confirmCalendarMove('other', d.planId, moves[0].previewId),
    ).rejects.toThrow();
    await expect(
      f.starts.cancelCalendarMove('user', d.planId, moves[0].previewId),
    ).resolves.toMatchObject({ state: 'CANCELLED' });
    await expect(
      f.starts.confirmCalendarMove('user', d.planId, moves[0].previewId),
    ).rejects.toThrow();
    await f.starts.confirmCalendarMove('user', d.planId, moves[1].previewId);
    await expect(
      f.starts.confirmCalendarMove('user', d.planId, moves[2].previewId),
    ).rejects.toThrow();
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(after.workouts![0]).toMatchObject({
      id: workout.id,
      scheduledDate: '2099-11-25',
    });
  });

  it('only resumes the same coaching session for an authorized, open calendar move', async () => {
    const d = await running(1, { startDate: '2099-11-16', periodWeeks: 3 });
    const workout = (await f.service.getPlanDetail('user', d.planId)).plan!
      .workouts![0];
    const move = await f.starts.previewCalendarMove(
      'user',
      d.planId,
      workout.id,
      {
        targetDate: '2099-11-17',
        expectedRevision: workout.revision,
      },
    );
    expect(move.impact.reasons).toEqual([]);
    await expect(
      f.starts.openCalendarMoveCoach('user', d.planId, move.previewId),
    ).rejects.toThrow();
    let authorized = true;
    Object.defineProperty(f.starts, 'automationAccess', {
      value: {
        assertAllowed: async () => {
          if (!authorized) throw new Error('Plan advice required');
        },
      },
      configurable: true,
    });
    try {
      const session = await f.starts.openCalendarMoveCoach(
        'user',
        d.planId,
        move.previewId,
        true,
      );
      const sessionRow = () => prisma.aiCoachSession.findUniqueOrThrow({
        where: { userId_id: { userId: 'user', id: session.sid } },
      });
      expect((await sessionRow()).type).toBe('BACKGROUND');
      await expect(
        f.starts.openCalendarMoveCoach('user', d.planId, move.previewId),
      ).resolves.toEqual(session);
      expect((await sessionRow()).type).toBe('CHAT');
      await expect(
        f.starts.calendarCoachSession('other', session.sid),
      ).rejects.toThrow();
      authorized = false;
      await expect(
        f.starts.calendarCoachSession('user', session.sid),
      ).rejects.toThrow('Plan advice required');
      authorized = true;
      await f.starts.cancelCalendarMove('user', d.planId, move.previewId);
      await expect(
        f.starts.calendarCoachSession('user', session.sid),
      ).rejects.toThrow();
    } finally {
      Object.defineProperty(f.starts, 'automationAccess', {
        value: undefined,
        configurable: true,
      });
    }
  });

  it('rechecks an expired move against the current workout in its original coaching session', async () => {
    const d = await running(1, { startDate: '2099-11-16', periodWeeks: 3 });
    const workout = (await f.service.getPlanDetail('user', d.planId)).plan!
      .workouts![0];
    const move = await f.starts.previewCalendarMove('user', d.planId, workout.id, {
      targetDate: '2099-11-24',
      expectedRevision: workout.revision,
    });
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
      configurable: true,
    });
    const session = await f.starts.openCalendarMoveCoach('user', d.planId, move.previewId);
    await prisma.planProposalPreview.update({
      where: { id: move.previewId },
      data: { expiresAt: new Date(0) },
    });
    await prisma.planWorkout.update({
      where: { id: workout.id },
      data: { name: 'Latest workout', revision: { increment: 1 } },
    });
    await expect(f.starts.calendarCoachSession('user', session.sid)).rejects.toThrow();
    await expect(f.starts.refreshCalendarMoveCoach('other', session.sid)).rejects.toThrow('not found');

    await expect(f.starts.refreshCalendarMoveCoach('user', session.sid)).resolves.toMatchObject({
      status: 'refreshed',
      preview: {
        previewId: move.previewId,
        state: 'PENDING',
        requiresCoachConfirmation: true,
        confirmationId: expect.any(String),
        impact: { from: move.impact.from, to: move.impact.to },
        presentation: { rows: expect.arrayContaining([expect.objectContaining({ name: 'Latest workout' })]) },
      },
    });
    await expect(f.starts.calendarCoachSession('user', session.sid)).resolves.toMatchObject({ sid: session.sid });
    await expect(f.starts.confirmCalendarMove('user', d.planId, move.previewId)).rejects.toThrow();
    expect((await f.service.getPlanDetail('user', d.planId)).plan?.workouts?.[0]?.scheduledDate).toBe(move.impact.from);

    await prisma.planWorkout.update({ where: { id: workout.id }, data: { status: 'DONE' } });
    await expect(f.starts.refreshCalendarMoveCoach('user', session.sid)).resolves.toEqual({ status: 'scheduleChanged' });
    await f.starts.cancelCalendarMove('user', d.planId, move.previewId);
    await expect(f.starts.refreshCalendarMoveCoach('user', session.sid)).resolves.toEqual({ status: 'discarded' });
  });

  it.each(['confirm', 'complete'] as const)('rebuilds an entire calendar adjustment and handles %s across conversations', async (action) => {
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
      configurable: true,
    });
    const d = await running(4, {
      startDate: '2099-11-16',
      periodWeeks: 3,
      openSession: async (planId) => {
        const [workout] = (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
        const move = await f.starts.previewCalendarMove('user', planId, workout.id, {
          targetDate: '2099-11-24',
          expectedRevision: workout.revision,
        });
        const session = await f.starts.openCalendarMoveCoach('user', planId, move.previewId);
        return { id: session.sid };
      },
    });
    const { sid, branchId } = d.binding;
    const session = await f.starts.calendarCoachSession('user', sid);
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!.workouts!;
    const [, companion, removed, independent] = before;
    d.request.changes = [{
      sourceWorkoutId: companion.id,
      expectedRevision: companion.revision,
      workout: {
        weekIndex: 2,
        dayIndex: 4,
        sessionIndex: 1,
        sportType: 'CYCLING',
        name: 'Companion adjustment',
        definition: { kind: 'FREEFORM', version: 1, source: 'STRUCTURE', structure: companion.structure },
      },
    }];
    d.request.deletions = [{ sourceWorkoutId: removed.id, expectedRevision: removed.revision }];
    d.request.additions = [{
      candidateKey: 'new-recovery-run',
      workout: {
        ...d.request.changes[0].workout,
        dayIndex: 5,
        sportType: 'RUN',
        name: 'New recovery run',
      },
    }];
    const draft = await f.starts.createPreview('user', d.request, d.binding);
    const branch = await prisma.coachBranch.findUniqueOrThrow({ where: { id: branchId } });
    const decision = await prisma.coachDecision.create({
      data: {
        branchId,
        contextId: branch.contextId,
        decisionType: 'PLAN_SCHEDULE',
        state: 'PROPOSED',
        payload: draft.decisionPayload,
      },
    });
    await prisma.planProposalPreview.update({ where: { id: draft.previewId }, data: { decisionId: decision.id } });
    await prisma.planProposalPreview.update({ where: { id: session.previewId }, data: { expiresAt: new Date(0) } });

    const restored = await f.starts.refreshCalendarMoveCoach('user', sid);
    expect(restored).toMatchObject({
      status: 'refreshed',
      preview: {
        state: 'PENDING',
        presentation: { rows: expect.arrayContaining([
          expect.objectContaining({ workoutId: before[0].id, scheduledDate: '2099-11-24' }),
          expect.objectContaining({ workoutId: companion.id, scheduledDate: '2099-11-26', name: 'Companion adjustment', beforeSportType: 'RUN', sportType: 'CYCLING' }),
          expect.objectContaining({ workoutId: removed.id, changeKind: 'DELETED' }),
          expect.objectContaining({ name: 'New recovery run', scheduledDate: '2099-11-27', changeKind: 'ADDED' }),
        ]) },
      },
    });
    if (restored.status !== 'refreshed') throw new Error('Expected a refreshed preview');
    expect((await prisma.coachDecision.findUniqueOrThrow({ where: { id: decision.id } })).state).toBe('SUPERSEDED');
    const firstVersion = restored.preview.confirmationId!;
    const otherMove = await f.starts.previewCalendarMove('user', d.planId, independent.id, {
      targetDate: '2099-11-29',
      expectedRevision: independent.revision,
    });
    const otherSession = await f.starts.openCalendarMoveCoach('user', d.planId, otherMove.previewId);
    expect(otherSession.sid).not.toBe(sid);
    await expect(f.starts.readCoachCalendarMove('user', sid)).resolves.toMatchObject({
      state: 'PENDING', confirmationId: firstVersion,
    });

    if (action === 'complete') {
      await prisma.planWorkout.update({
        where: { id: companion.id },
        data: { status: 'DONE', completedAt: new Date() },
      });
      await expect(f.starts.readCoachCalendarMove('user', sid)).resolves.toMatchObject({ state: 'INVALIDATED' });
      await expect(f.starts.confirmCalendarMove('user', d.planId, session.previewId, firstVersion)).rejects.toThrow();
      await expect(f.starts.refreshCalendarMoveCoach('user', sid)).resolves.toEqual({ status: 'scheduleChanged' });
      await expect(f.starts.readCoachCalendarMove('user', otherSession.sid)).resolves.toMatchObject({ state: 'PENDING' });
      const unchanged = (await f.service.getPlanDetail('user', d.planId)).plan!.workouts!;
      expect(unchanged.map((workout) => workout.scheduledDate)).toEqual(before.map((workout) => workout.scheduledDate));
      return;
    }
    const current = await f.starts.refreshCalendarMoveCoach('user', sid, firstVersion);
    if (current.status !== 'refreshed') throw new Error('Expected a new preview version');
    const currentVersion = current.preview.confirmationId!;
    expect(currentVersion).not.toBe(firstVersion);
    await expect(f.starts.confirmCalendarMove('user', d.planId, session.previewId, firstVersion)).rejects.toThrow();
    await expect(f.starts.confirmCalendarMove('other', d.planId, session.previewId, currentVersion)).rejects.toThrow('not found');
    expect((await f.service.getPlanDetail('user', d.planId)).plan!.workouts!.map((workout) => workout.scheduledDate)).toEqual(before.map((workout) => workout.scheduledDate));

    const receipt = await f.starts.confirmCalendarMove('user', d.planId, session.previewId, currentVersion);
    expect(receipt).toMatchObject({
      readbackVerified: true,
      deletedWorkoutIds: [removed.id],
      identityMap: expect.arrayContaining([
        expect.objectContaining({ workoutId: before[0].id, scheduledDate: '2099-11-24' }),
        expect.objectContaining({ workoutId: companion.id, scheduledDate: '2099-11-26' }),
        expect.objectContaining({ scheduledDate: '2099-11-27' }),
      ]),
    });
    expect(receipt.identityMap).toHaveLength(3);
    await expect(f.starts.confirmCalendarMove('user', d.planId, session.previewId, currentVersion)).resolves.toEqual(receipt);
    await expect(f.starts.readCoachCalendarMove('user', sid)).resolves.toMatchObject({ state: 'APPLIED', receipt });
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!.workouts!;
    expect(after.map((workout) => workout.scheduledDate)).toEqual([independent.scheduledDate, '2099-11-24', '2099-11-26', '2099-11-27']);
    expect(after.find((workout) => workout.id === companion.id)?.name).toBe('Companion adjustment');
  });

  it('revises a recovered calendar with mixed edits before committing the current version', async () => {
    const { planId } = await running(4, { startDate: '2099-11-16', periodWeeks: 4 });
    const read = async () => (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const before = await read();
    const [anchor, companion, removed, unchanged] = before;
    const preview = await f.starts.previewCalendarMove('user', planId, anchor.id, {
      targetDate: '2099-11-24', expectedRevision: anchor.revision,
    });
    const sid = `calendar-move:${preview.previewId}`;
    await prisma.aiCoachSession.create({ data: { userId: 'user', id: sid } });
    const restored = await f.starts.refreshCalendarMoveCoach('user', sid);
    if (restored.status !== 'refreshed') throw new Error('Expected a refreshed preview');
    const confirmationId = restored.preview.confirmationId!;
    const candidateKey = randomUUID();
    const workout = {
      name: 'Revised recovery', sportType: 'RUN',
      definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Easy 20m' },
    } as const;
    const changes = {
      confirmationId,
      edits: [
        { kind: 'UPDATE' as const, workoutId: anchor.id, expectedRevision: anchor.revision, targetDate: '2099-12-01' },
        { kind: 'UPDATE' as const, workoutId: companion.id, expectedRevision: companion.revision, targetDate: '2099-12-01', workout },
        { kind: 'DELETE' as const, workoutId: removed.id, expectedRevision: removed.revision },
        { kind: 'ADD' as const, candidateKey, targetDate: '2099-12-02', workout },
      ],
    };
    const revision = await f.starts.reviseCalendarAdjustment('user', planId, preview.previewId, changes);
    expect(revision.confirmationId).not.toBe(confirmationId);
    expect(revision.presentation.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ workoutId: anchor.id, beforeScheduledDate: '2099-11-16', scheduledDate: '2099-12-01' }),
      expect.objectContaining({ workoutId: companion.id, name: workout.name, scheduledDate: '2099-12-01' }),
      expect.objectContaining({ workoutId: removed.id, changeKind: 'DELETED' }),
      expect.objectContaining({ candidateKey, changeKind: 'ADDED', scheduledDate: '2099-12-02' }),
    ]));
    await expect(f.starts.reviseCalendarAdjustment('user', planId, preview.previewId, changes)).rejects.toThrow();
    await expect(f.starts.confirmCalendarMove('user', planId, preview.previewId, confirmationId)).rejects.toThrow();
    expect(await read()).toEqual(before);
    const next = await f.starts.reviseCalendarAdjustment('user', planId, preview.previewId, {
      confirmationId: revision.confirmationId!,
      edits: [{ kind: 'UPDATE', workoutId: `candidate:${candidateKey}`, expectedRevision: 0, targetDate: '2099-12-03' }],
    });
    await expect(f.starts.readCoachCalendarMove('user', sid)).resolves.toMatchObject({ confirmationId: next.confirmationId });
    const receipt = await f.starts.confirmCalendarMove('user', planId, preview.previewId, next.confirmationId);
    expect(receipt.identityMap.map((row) => row.scheduledDate).sort()).toEqual(['2099-12-01', '2099-12-01', '2099-12-03']);
    expect(receipt.deletedWorkoutIds).toEqual([removed.id]);
    expect((await read()).find((item) => item.id === unchanged.id)?.revision).toBe(unchanged.revision);
    await expect(f.starts.reviseCalendarAdjustment('user', planId, preview.previewId, {
      ...changes, confirmationId: next.confirmationId!,
    })).rejects.toThrow();
  });

  async function apply(d: Awaited<ReturnType<typeof running>>) {
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    const branch = await prisma.coachBranch.findUniqueOrThrow({
      where: { id: d.binding.branchId },
    });
    const decision = await prisma.coachDecision.create({
      data: {
        branchId: branch.id,
        contextId: branch.contextId,
        decisionType: 'PLAN_SCHEDULE',
        state: 'APPROVED',
        payload: preview.decisionPayload,
      },
    });
    await prisma.$transaction((tx) =>
      f.proposals.claimDecision({
        previewId: preview.previewId,
        decisionId: decision.id,
        userId: 'user',
        sourcePlanId: d.planId,
        tx,
      }),
    );
    return prisma.$transaction(
      (tx) =>
        f.apply.apply({
          userId: 'user',
          decisionId: decision.id,
          branchId: branch.id,
          contextPlanId: d.planId,
          previewId: preview.previewId,
          tx,
        }),
      { isolationLevel: 'Serializable', timeout: 60000 },
    );
  }
  it('commits a calendar coach batch and closes the original move with a verified receipt', async () => {
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
      configurable: true,
    });
    try {
      const d = await running(2, {
        startDate: '2099-11-16',
        periodWeeks: 3,
        openSession: async (planId) => {
          const [workout] = (await f.service.getPlanDetail('user', planId))
            .plan!.workouts!;
          const preview = await f.starts.previewCalendarMove(
            'user',
            planId,
            workout.id,
            { targetDate: '2099-11-24', expectedRevision: workout.revision },
          );
          const session = await f.starts.openCalendarMoveCoach(
            'user',
            planId,
            preview.previewId,
          );
          return { id: session.sid };
        },
      });
      const session = await f.starts.calendarCoachSession(
        'user',
        d.binding.sid,
      );
      d.request.range = { from: '2099-11-01', to: '2099-12-31' };
      const before = (await f.service.getPlanDetail('user', d.planId)).plan!
        .workouts!;
      const moveOnly = await f.proposals.createPreview('user', d.request, d.binding);
      expect(moveOnly.presentation.calendarMoveOnly).toBe(true);
      // The model only needs to propose the related edit.
      d.request.changes = before.slice(1).map((row) => ({
        sourceWorkoutId: row.id,
        expectedRevision: row.revision,
        workout: {
          weekIndex: 2,
          dayIndex: 4,
          sessionIndex: 1,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'STRUCTURE',
            structure: {
              kind: 'FREEFORM',
              version: 1,
              text: row.text,
              durationSeconds: 1800,
            },
          },
        },
      }));
      const branches = new CoachBranchingService(
        prisma as never,
        f.service,
        f.context,
        f.query,
        f.apply,
        f.proposals,
      );
      const relatedEdit = d.request.changes[0];
      await expect(
        f.proposals.createPreview(
          'user',
          {
            ...d.request,
            changes: [{
              ...relatedEdit,
              workout: { ...relatedEdit.workout, weekIndex: 3, dayIndex: 5 },
            }],
          },
          d.binding,
        ),
      ).rejects.toThrow('Candidate target is outside the mutable schedule range');
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(preview.presentation.calendarMoveOnly).toBeUndefined();
      const { decision } = await branches.squashBranch({
        userId: 'user',
        branchId: d.binding.branchId,
        decisionType: 'PLAN_SCHEDULE',
        payload: preview.decisionPayload,
        rationale: 'Keep the recovery interval after moving the run.',
        binding: d.binding,
        options: [{ optionKey: 'apply', title: 'Apply', isSelected: true }],
      });
      const card = await prisma.aiCoachMessage.update({
        where: {
          userId_sessionId_sequence: {
            userId: 'user',
            sessionId: session.sid,
            sequence: 2,
          },
        },
        data: {
          createdAt: new Date(Date.now() - 60_000),
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'CoachDecisionDraft',
                input: {
                  decisionId: decision.id,
                  branchId: d.binding.branchId,
                  payload: preview.decisionPayload,
                },
              },
            ],
          },
        },
      });
      const ai = Object.assign(Object.create(AiService.prototype) as AiService, {
        coachBranching: branches,
        aiDataConsent: { assertGranted: async () => undefined },
      });
      const message = {
        content: [
          { type: 'text', text: 'Confirm' },
          {
            type: 'tool_result',
            tool_use_id: 'draft',
            content: {
              kind: 'coach_decision_confirmation',
              decisionId: decision.id,
              repliesToAssistantMessageId: card.id,
            },
          },
        ],
      } satisfies CoachUserMessageBody;
      const confirm = async (branchId = d.binding.branchId) => {
        const events: CoachQueryYield[] = [];
        const stream = await ai.coachStream({
          session: { user: { id: 'user' } },
          sid: session.sid,
          branchId,
          calendarEdit: session,
          lang: 'en',
          prompt: 'Confirm',
          message,
          signal: new AbortController().signal,
        });
        for await (const event of stream) events.push(event);
        return events;
      };
      await expect(confirm('wrong-branch')).rejects.toThrow(
        'CALENDAR_CONFIRMATION_MISMATCH',
      );
      await expect(confirm()).rejects.toThrow('START_CONFIRMATION_REQUIRED');
      expect(
        await prisma.planWorkout.findUnique({ where: { id: before[0].id } }),
      ).toMatchObject({
        scheduledDate: new Date('2099-11-16T00:00:00.000Z'),
      });
      await prisma.aiCoachSession.update({
        where: { userId_id: { userId: 'user', id: session.sid } },
        data: { nextSequence: 3 },
      });
      const runs = new CoachRunStore(
        prisma as never,
        undefined,
        undefined,
        undefined,
        f.starts,
      );
      const confirmationTurn = {
        userId: 'user',
        sid: session.sid,
        branchId: d.binding.branchId,
        lang: 'en',
        prompt: 'Confirm',
        message,
        operationId: 'confirm-adjustment',
        command: { kind: 'start' as const, requestId: 'confirm-adjustment' },
      };
      const begun = await runs.begin(confirmationTurn);
      if (!begun.handle) throw new Error('Expected a new confirmation run');
      const events = await confirm();
      expect(events[0]).toMatchObject({
        type: 'assistant',
        message: {
          content: [
            {
              name: 'CoachDecisionApplied',
              input: {
                result: 'APPLIED',
                receipt: { readbackVerified: true, changedWorkoutCount: 2 },
              },
            },
          ],
        },
      });
      const replay = await confirm();
      expect(replay[0]).toMatchObject({
        type: 'assistant',
        message: { content: [{ input: { result: 'APPLIED' } }] },
      });
      expect(
        await prisma.coachCommit.count({ where: { decisionId: decision.id } }),
      ).toBe(1);
      for (const event of events) begun.handle.projector.consume(event);
      begun.handle.projector.finish('completed');
      await runs.checkpoint(begun.handle, 'completed');
      await expect(runs.begin(confirmationTurn)).resolves.toMatchObject({
        replay: { id: begun.handle.projector.message.id },
      });
      const after = (await f.service.getPlanDetail('user', d.planId)).plan!
        .workouts!;
      expect(
        after.map((workout) => [workout.id, workout.scheduledDate]),
      ).toEqual([
        [before[0].id, '2099-11-24'],
        [before[1].id, '2099-11-26'],
      ]);
      await expect(
        f.starts.readCalendarMove('user', d.planId, session.previewId),
      ).resolves.toMatchObject({
        state: 'APPLIED',
        receipt: {
          readbackVerified: true,
          identityMap: [
            { workoutId: before[0].id, scheduledDate: '2099-11-24' },
          ],
        },
      });
      await expect(
        f.starts.calendarCoachSession('user', session.sid),
      ).rejects.toThrow();
      await expect(
        f.starts.calendarCoachSession('user', session.sid, undefined, {
          allowApplied: true,
        }),
      ).resolves.toMatchObject({ sid: session.sid });
    } finally {
      Object.defineProperty(f.starts, 'automationAccess', {
        value: undefined,
        configurable: true,
      });
    }
  });
  it('swaps remaining positions and reads back original identities and RPE without restarting the plan', async () => {
    const d = await running();
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const rows = before.workouts;
    await prisma.planWorkout.update({
      where: { id: rows[0].id },
      data: { plannedSessionRpe: 6 },
    });
    d.request.changes = rows.slice(0, 2).map((w, i) => ({
      sourceWorkoutId: w.id,
      expectedRevision: w.revision ?? 1,
      workout: {
        weekIndex: 1,
        dayIndex: i === 0 ? 2 : 1,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'STRUCTURE',
          structure: w.structure,
        },
      },
    }));
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      mode: 'SCHEDULE',
      readbackVerified: true,
      changedWorkoutCount: 2,
      preservedWorkoutCount: 1,
      range: d.request.range,
    });
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(after.startDate).toBe(before.startDate);
    expect(after.workouts.find((w) => w.id === rows[0].id)).toMatchObject({
      dayIndex: 2,
      plannedSessionRpe: 6,
    });
    expect(after.workouts.find((w) => w.id === rows[1].id)).toMatchObject({
      dayIndex: 1,
    });
  });
  it.each(['DONE', 'IN_PROGRESS', 'SKIPPED', 'MOVED'])(
    'protects %s courses while preserving their full source coverage',
    async (status) => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
      });
      await prisma.planWorkout.update({
        where: { id: w.id },
        data: { status: status as never },
      });
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(preview.presentation.counts).toMatchObject({
        total: 3,
        preserved: 3,
        protected: 1,
      });
      d.request.deletions = [
        { sourceWorkoutId: w.id, expectedRevision: w.revision },
      ];
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow(/protected/);
    },
  );
  it('rejects late old runs after a newer persisted athlete request', async () => {
    const d = await running();
    await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: d.binding.sid,
        role: 'USER',
        sequence: 3,
        content: 'Thursday too',
      },
    });
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/replaced/);
  });
  it('applies constraints only and returns their actual revision and rules', async () => {
    const d = await running(2);
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [4],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'request' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      readbackVerified: true,
      changedWorkoutCount: 0,
      scheduleConstraints: d.request.scheduleConstraints,
    });
  });
  it('commits a newly confirmed daily budget with the remaining courses and preserves protected history', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = await running(3, {
      startDate: addCalendarDays(today, -2),
      durationMinutes: 60,
      qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
    });
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const remaining = before.workouts[2];
    d.request.range = { from: today, to: addCalendarDays(today, 4) };
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: today,
      confirmation: { source: 'USER', reference: 'daily-availability' },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxDailyMinutes: 30,
    };
    d.request.changes = [
      {
        sourceWorkoutId: remaining.id,
        expectedRevision: remaining.revision ?? 1,
        workout: {
          weekIndex: 1,
          dayIndex: 3,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'STRUCTURE',
            structure: {
              kind: 'FREEFORM',
              version: 1,
              text: 'Run 30m',
              durationSeconds: 1800,
            },
          },
        },
      },
    ];
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!
        .generationMetadata,
    ).toMatchObject({ qualityContract: { maxDailyMinutes: 60 } });
    const receipt = await apply(d);
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(after.generationMetadata).toMatchObject({
      qualityContract: { maxDailyMinutes: 30, requiredSports: ['RUN'] },
    });
    expect(receipt).toMatchObject({
      readbackVerified: true,
      qualityContract: { maxDailyMinutes: 30 },
    });
    expect(preview.presentation.qualityContract).toMatchObject({
      maxDailyMinutes: 30,
      requiredSports: ['RUN'],
    });
    expect(after.workouts.slice(0, 2)).toEqual(before.workouts.slice(0, 2));
    expect(after.workouts[2].summary.durationSeconds).toBe(1800);
    await expect(
      f.service.addWorkout('user', d.planId, {
        weekIndex: 1,
        dayIndex: 4,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'STRUCTURE',
          structure: {
            kind: 'FREEFORM',
            version: 1,
            text: 'Run 40m',
            durationSeconds: 2400,
          },
        },
      }),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(3);
  });

  it('persists an explicitly expanded weekly availability and enforces it on later ordinary additions', async () => {
    const d = await running(3, {
      qualityContract: { maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'] },
    });
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'weekly-availability' },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxTrainingDaysPerWeek: 5,
    };
    const workout = (dayIndex: number) => ({
      weekIndex: 1,
      dayIndex,
      sportType: 'RUN' as const,
      definition: {
        kind: 'FREEFORM' as const,
        version: 1 as const,
        source: 'TEXT' as const,
        text: 'Run 30m',
      },
    });
    d.request.additions = [4, 5].map((day) => ({
      candidateKey: `extra-${day}`,
      workout: workout(day),
    }));
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      qualityContract: { maxTrainingDaysPerWeek: 5, requiredSports: ['RUN'] },
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!,
    ).toMatchObject({
      generationMetadata: { qualityContract: { maxTrainingDaysPerWeek: 5 } },
      workouts: expect.any(Array),
    });
    await expect(
      f.service.addWorkout('user', d.planId, workout(6)),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(5);
  });

  it('saves a lower weekly limit over protected history and only permits new days within the remaining weekly budget', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = await running(3, {
      startDate: addCalendarDays(today, -3),
      periodWeeks: 2,
      qualityContract: { maxTrainingDaysPerWeek: 3 },
    });
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    d.request.range = { from: today, to: addCalendarDays(today, 10) };
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: today,
      confirmation: {
        source: 'USER',
        reference: 'reduced-weekly-availability',
      },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxTrainingDaysPerWeek: 2,
    };
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      qualityContract: { maxTrainingDaysPerWeek: 2 },
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toEqual(before.workouts);
    const workout = (weekIndex: number, dayIndex: number) => ({
      weekIndex,
      dayIndex,
      sportType: 'RUN' as const,
      definition: {
        kind: 'FREEFORM' as const,
        version: 1 as const,
        source: 'TEXT' as const,
        text: 'Run 30m',
      },
    });
    await expect(
      f.service.addWorkout('user', d.planId, workout(1, 4)),
    ).rejects.toThrow();
    await f.service.addWorkout('user', d.planId, workout(2, 1));
    await f.service.addWorkout('user', d.planId, workout(2, 2));
    await expect(
      f.service.addWorkout('user', d.planId, workout(2, 3)),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(5);
  });

  it.each([
    { previous: 60, next: 30, beforeAllowed: true, duringAllowed: false },
    { previous: 30, next: 60, beforeAllowed: false, duringAllowed: true },
  ])(
    'applies daily availability only inside its confirmed date window (%j)',
    async ({ previous, next, beforeAllowed, duringAllowed }) => {
      const d = await running(1, {
        durationMinutes: 30,
        qualityContract: { maxDailyMinutes: previous },
      });
      d.request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-25',
        effectiveUntil: '2099-11-26',
        confirmation: { source: 'USER', reference: 'future-time-availability' },
      };
      d.request.qualityContractTransition = {
        mode: 'INHERIT',
        maxDailyMinutes: next,
      };
      const workout = (minutes: number) => ({
        kind: 'FREEFORM' as const,
        version: 1 as const,
        source: 'STRUCTURE' as const,
        structure: {
          kind: 'FREEFORM' as const,
          version: 1 as const,
          text: `Run ${minutes}m`,
          durationSeconds: minutes * 60,
        },
      });
      const source = (await f.service.getPlanDetail('user', d.planId)).plan!
        .workouts[0];
      d.request.changes = [
        {
          sourceWorkoutId: source.id,
          expectedRevision: source.revision ?? 1,
          workout: {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            definition: workout(45),
          },
        },
      ];
      if (beforeAllowed)
        await f.proposals.createPreview('user', d.request, d.binding);
      else {
        await expect(
          f.proposals.createPreview('user', d.request, d.binding),
        ).rejects.toThrow();
        d.request.changes = [];
      }
      await apply(d);
      const toolContext = {
        session: { user: { id: 'user' } },
        currentTurnCalendar: { date: '2099-11-23' },
        planQuery: f.query,
      } as never;
      const read = await planByIdTool.execute(toolContext, {
        planId: d.planId,
        asOf: '2099-11-23',
        calendarFrom: '2099-11-22',
        calendarTo: '2099-11-28',
      });
      const model = (planByIdTool.summarizeForModel as any)({ output: read });
      expect(
        model.plan.scheduleRules.effective.qualityContract.maxDailyMinutes,
      ).toBe(previous);
      expect(
        model.plan.generationMetadata.qualityContract.maxDailyMinutes,
      ).toBe(previous);
      expect(
        model.plan.scheduleRules.latestConfirmed.scheduleConstraints
          .effectiveFrom,
      ).toBe('2099-11-25');
      expect(
        model.scheduleRulePeriods.map((period) => [
          period.from,
          period.to,
          period.availability.maxDailyMinutes,
        ]),
      ).toEqual([
        ['2099-11-22', '2099-11-24', previous],
        ['2099-11-25', '2099-11-26', next],
        ['2099-11-27', '2099-11-28', previous],
      ]);
      const active = await planActiveTool.execute(toolContext, {
        asOf: '2099-11-23',
      });
      expect(
        (planActiveTool.summarizeForModel as any)({ output: active }).plan
          .scheduleRules.effective.qualityContract.maxDailyMinutes,
      ).toBe(previous);
      for (const [date, allowed] of [
        ['2099-11-23', beforeAllowed],
        ['2099-11-25', duringAllowed],
        ['2099-11-27', beforeAllowed],
      ] as const) {
        const operation = f.write.createIndependentWorkout('user', {
          scheduledDate: date,
          sportType: 'RUN',
          definition: workout(45),
        });
        if (allowed) await operation;
        else await expect(operation).rejects.toThrow();
      }
      if (beforeAllowed) {
        await f.write.createIndependentWorkout('user', {
          scheduledDate: '2099-11-22',
          sportType: 'RUN',
          definition: workout(15),
        });
        const updateFirstDayWorkout = (minutes: number, revision: number) =>
          f.service.updatePlan('user', d.planId, {
            scheduleConstraints: {
              ...d.request.scheduleConstraints,
              revision,
            },
            qualityContractTransition: { mode: 'INHERIT' },
            workouts: [
              {
                id: source.id,
                weekIndex: 1,
                dayIndex: 1,
                sportType: 'RUN',
                definition: workout(minutes),
              },
            ],
          });

        // The 60-minute budget allows 69 minutes, including the independent workout.
        await updateFirstDayWorkout(50, 2);
        await expect(updateFirstDayWorkout(55, 3)).rejects.toThrow(
          'DAILY_TIME_BUDGET@2099-11-22',
        );
        const stored = await prisma.planWorkout.findUniqueOrThrow({
          where: { id: source.id },
        });
        expect(stored.plannedDurationSeconds).toBe(50 * 60);
      }
    },
  );

  it.each([false, true])(
    'keeps a future budget pending across a rest-only revision and honors an explicit earlier repeat (explicit=%s)',
    async (explicit) => {
      const d = await running(1, {
        durationMinutes: 30,
        qualityContract: { maxDailyMinutes: 60 },
      });
      d.request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-25',
        effectiveUntil: '2099-11-26',
        confirmation: { source: 'USER', reference: 'future-budget' },
      };
      d.request.qualityContractTransition = {
        mode: 'INHERIT',
        maxDailyMinutes: 30,
      };
      await apply(d);
      d.request.scheduleConstraints = {
        ...d.request.scheduleConstraints,
        revision: 2,
        effectiveFrom: '2099-11-22',
        effectiveUntil: '2099-11-24',
      };
      d.request.qualityContractTransition = explicit
        ? { mode: 'INHERIT', maxDailyMinutes: 30 }
        : { mode: 'INHERIT' };
      await apply(d);
      const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
      expect(after.generationMetadata).toMatchObject({
        scheduleConstraintHistory: expect.arrayContaining([
          expect.objectContaining({
            qualityContractTransition: { mode: 'INHERIT', maxDailyMinutes: 30 },
          }),
        ]),
      });
      for (const [date, allowed] of [
        ['2099-11-23', !explicit],
        ['2099-11-25', false],
        ['2099-11-27', true],
      ] as const) {
        const operation = f.write.createIndependentWorkout('user', {
          scheduledDate: date,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'STRUCTURE',
            structure: {
              kind: 'FREEFORM',
              version: 1,
              text: 'Run 45m',
              durationSeconds: 2700,
            },
          },
        });
        if (allowed) await operation;
        else await expect(operation).rejects.toThrow();
      }
    },
  );

  it('keeps prior rest rules before a future revision and restores them after an explicit empty-rule window', async () => {
    const d = await running(1);
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: ['2099-11-23', '2099-11-25', '2099-11-27'],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'initial-rest-dates' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    await apply(d);
    d.request.scheduleConstraints = {
      ...d.request.scheduleConstraints,
      revision: 2,
      unavailableDates: [],
      effectiveFrom: '2099-11-25',
      effectiveUntil: '2099-11-26',
    };
    await apply(d);
    for (const [dayIndex, allowed] of [
      [2, false],
      [4, true],
      [6, false],
    ] as const) {
      const operation = f.service.addWorkout('user', d.planId, {
        weekIndex: 1,
        dayIndex,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'TEXT',
          text: 'Run 30m',
        },
      });
      if (allowed) await operation;
      else await expect(operation).rejects.toThrow();
    }
  });

  it.each([{ allowedDays: [1] }, { allowedDays: null }])(
    'restores prior relative allowed days outside an explicit replacement window (%j)',
    async ({ allowedDays }) => {
      const d = await running(1, {
        periodWeeks: 2,
        qualityContract: { allowedDays: [1, 2] },
      });
      d.request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-25',
        effectiveUntil: '2099-11-26',
        confirmation: { source: 'USER', reference: 'relative-day-window' },
      };
      d.request.qualityContractTransition = {
        mode: 'REPLACE_ALLOWED_DAYS',
        allowedDays,
      };
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(
        preview.presentation.scheduleRulePeriods.map(
          (period) => period.allowedDays,
        ),
      ).toEqual([[1, 2], allowedDays, [1, 2]]);
      await apply(d);
      const workout = (weekIndex: number, dayIndex: number) => ({
        weekIndex,
        dayIndex,
        sportType: 'RUN' as const,
        definition: {
          kind: 'FREEFORM' as const,
          version: 1 as const,
          source: 'TEXT' as const,
          text: 'Run 30m',
        },
      });
      await f.service.addWorkout('user', d.planId, workout(1, 2));
      const during = f.service.addWorkout('user', d.planId, workout(1, 4));
      if (allowedDays === null) await during;
      else await expect(during).rejects.toThrow();
      await f.service.addWorkout('user', d.planId, workout(2, 2));
      await expect(
        f.service.addWorkout('user', d.planId, workout(2, 3)),
      ).rejects.toThrow();
    },
  );

  it.each([
    { maxDailyMinutes: 0 },
    { maxDailyMinutes: 1441 },
    { maxTrainingDaysPerWeek: 0 },
    { maxTrainingDaysPerWeek: 8 },
    { requiredSports: ['SWIM'] },
    { raceDiscipline: 'SWIM' },
    { weekPhases: ['TAPER'] },
  ])(
    'rejects invalid or unrelated availability transition %j before writing',
    async (patch) => {
      const d = await running();
      d.request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-22',
        confirmation: { source: 'USER', reference: 'invalid-availability' },
      };
      d.request.qualityContractTransition = { mode: 'INHERIT', ...patch };
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow();
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!
          .generationMetadata,
      ).not.toHaveProperty('scheduleConstraints');
    },
  );

  it('rejects targets outside the explicit range and preserves out-of-range sources', async () => {
    const d = await running();
    d.request.range.to = '2099-11-23';
    const w = (await f.service.getPlanDetail('user', d.planId)).plan!
      .workouts[2];
    d.request.changes = [
      {
        sourceWorkoutId: w.id,
        expectedRevision: w.revision ?? 1,
        workout: {
          weekIndex: 1,
          dayIndex: 4,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 30m',
          },
        },
      },
    ];
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/out-of-range/);
  });

  it('keeps a 200-operation manual draft recoverable when a later edit exceeds the limit', async () => {
    const { planId } = await running(1, { periodWeeks: 30 });
    const read = async () =>
      (await f.service.getPlanDetail('user', planId)).plan!.workouts!;
    const original = await read();
    const additions = Array.from({ length: 201 }, (_, index) => ({
      kind: 'ADD' as const,
      candidateKey: randomUUID(),
      targetDate: addCalendarDays('2099-11-23', index),
      workout: {
        name: `Easy run ${index + 1}`,
        sportType: 'RUN' as const,
        definition: {
          kind: 'FREEFORM' as const,
          version: 1 as const,
          source: 'TEXT' as const,
          text: 'Easy 20m',
        },
      },
    }));
    const id = randomUUID();
    const initial = await f.starts.saveCalendarAdjustment('user', planId, id, {
      versionId: id,
      edits: additions.slice(0, 199),
    });
    expect(initial.operationKeys).toHaveLength(199);
    const full = await f.starts.saveCalendarAdjustment('user', planId, id, {
      baseVersionId: initial.versionId,
      versionId: randomUUID(),
      edits: [additions[199]],
    });
    expect(full.operationKeys).toEqual(
      additions
        .slice(0, 200)
        .map(({ candidateKey }) => `candidate:${candidateKey}`),
    );

    const rejectedVersionId = randomUUID();
    await expect(
      f.starts.saveCalendarAdjustment('user', planId, id, {
        baseVersionId: full.versionId,
        versionId: rejectedVersionId,
        edits: [additions[200]],
      }),
    ).rejects.toThrow('A calendar adjustment can contain up to 200 changes');
    await expect(
      f.starts.getCalendarAdjustment('user', planId, id, rejectedVersionId),
    ).rejects.toThrow('Calendar adjustment version not found');
    await expect(read()).resolves.toEqual(original);

    const recoverable = await f.starts.listCalendarAdjustments('user', planId);
    expect(recoverable).toEqual([full]);
    const [recovered] = recoverable;
    const receipt = await f.starts.confirmCalendarAdjustment(
      'user',
      planId,
      recovered.id,
      recovered.versionId,
    );
    expect(receipt).toMatchObject({
      addedWorkoutCount: 200,
      changedWorkoutCount: 0,
      readbackVerified: true,
    });
    await expect(
      f.starts.confirmCalendarAdjustment(
        'user',
        planId,
        recovered.id,
        recovered.versionId,
      ),
    ).resolves.toEqual(receipt);
    const after = await read();
    expect(
      after.find(({ id: workoutId }) => workoutId === original[0].id),
    ).toEqual(original[0]);
    expect(
      after
        .filter(({ id: workoutId }) => workoutId !== original[0].id)
        .map(({ name, scheduledDate }) => [name, scheduledDate]),
    ).toEqual(
      additions
        .slice(0, 200)
        .map(({ workout, targetDate }) => [workout.name, targetDate]),
    );
  }, 60_000);

  describe('large schedule', () => {
    let prepared: Awaited<ReturnType<typeof running>>;
    beforeEach(async () => {
      prepared = await running(210);
    }, 30_000);

    it('atomically applies a complete 210-course positional rotation without a 200-course batch truncation', async () => {
      const d = prepared;
      d.request.range.to = '2100-06-30';
      const rows = await prisma.planWorkout.findMany({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'asc' },
      });
      d.request.changes = rows.map((w, i) => {
        const offset = (i + 1) % 210;
        return {
          sourceWorkoutId: w.id,
          expectedRevision: w.revision,
          workout: {
            weekIndex: Math.floor(offset / 7) + 1,
            dayIndex: (offset % 7) + 1,
            sportType: 'RUN',
            plannedSessionRpe: 6,
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Run 30m',
            },
          },
        };
      });
      const receipt = await apply(d);
      expect(receipt).toMatchObject({
        readbackVerified: true,
        changedWorkoutCount: 210,
        preservedWorkoutCount: 0,
      });
      expect(receipt.identityMap).toHaveLength(210);
      const final = await prisma.planWorkout.findMany({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'asc' },
      });
      expect(final[0]).toMatchObject({
        id: rows[209].id,
        revision: 2,
        plannedSessionRpe: 6,
      });
      expect(final[209]).toMatchObject({ id: rows[208].id, revision: 2 });
    }, 30_000);
  });

  nativeIt(
    'does not overwrite a concurrent workout completion during schedule application',
    async () => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'asc' },
      });
      d.request.changes = [
        {
          sourceWorkoutId: w.id,
          expectedRevision: w.revision,
          workout: {
            weekIndex: 1,
            dayIndex: 4,
            sportType: 'RUN',
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Run 30m',
            },
          },
        },
      ];
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      const branch = await prisma.coachBranch.findUniqueOrThrow({
        where: { id: d.binding.branchId },
      });
      const decision = await prisma.coachDecision.create({
        data: {
          branchId: branch.id,
          contextId: branch.contextId,
          decisionType: 'PLAN_SCHEDULE',
          state: 'APPROVED',
          payload: preview.decisionPayload,
        },
      });
      await prisma.$transaction((tx) =>
        f.proposals.claimDecision({
          previewId: preview.previewId,
          decisionId: decision.id,
          userId: 'user',
          sourcePlanId: d.planId,
          tx,
        }),
      );
      const applying = await raceWithUncommittedPlanWrite(
        prisma,
        (tx) => f.write.updateWorkoutStatus('user', d.planId, w.id, 'DONE', undefined, { tx }),
        () => prisma.$transaction(
          (tx) => f.apply.apply({
            userId: 'user',
            decisionId: decision.id,
            branchId: branch.id,
            contextPlanId: d.planId,
            previewId: preview.previewId,
            tx,
          }),
          { isolationLevel: 'Serializable', timeout: 15000 },
        ),
      );
      expect(applying.status).toBe('rejected');
      expect(
        await prisma.planWorkout.findUniqueOrThrow({ where: { id: w.id } }),
      ).toMatchObject({ status: 'DONE', dayOffset: w.dayOffset });
    },
  );
  it('preserves historical courses and rejects a canceled run from creating a fresh card', async () => {
    const d = await running();
    const rows = await prisma.planWorkout.findMany({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    await prisma.plan.update({
      where: { id: d.planId },
      data: {
        startDate: new Date('2000-01-01'),
        endDate: new Date('2000-01-07'),
      },
    });
    for (const w of rows) {
      const date = new Date('2000-01-01');
      date.setUTCDate(date.getUTCDate() + w.dayOffset);
      await prisma.planWorkout.update({
        where: { id: w.id },
        data: { scheduledDate: date },
      });
    }
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'new-rules' },
    };
    d.request.qualityContractTransition = {
      mode: 'REPLACE_ALLOWED_DAYS',
      allowedDays: [7],
    };
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(preview.presentation.counts).toMatchObject({
      preserved: 3,
      protected: 3,
    });
    expect(
      preview.presentation.rows.every((w) => w.protectedReason === 'HISTORY'),
    ).toBe(true);
    expect(await apply(d)).toMatchObject({
      readbackVerified: true,
      preservedWorkoutCount: 3,
    });
    await prisma.coachRunAttempt.update({
      where: { id: 'attempt' },
      data: { cancelRequestedAt: new Date() },
    });
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/no longer current/);
  });
  it('reports a related independent rest-day conflict as unmanaged without changing or globally forbidding that course', async () => {
    const d = await running(1);
    const related = await f.write.createIndependentWorkout('user', {
      scheduledDate: '2099-11-23',
      sportType: 'RUN',
      name: 'Separate easy run',
      definition: {
        kind: 'FREEFORM',
        version: 1,
        source: 'STRUCTURE',
        structure: {
          kind: 'FREEFORM',
          version: 1,
          text: 'Easy',
          durationSeconds: 1800,
        },
      },
    });
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: ['2099-11-23'],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'request' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(preview.presentation.relatedCalendarConflicts).toEqual([
      {
        code: 'UNAVAILABLE_DATE',
        date: '2099-11-23',
        workoutId: related.workout!.id,
        planId: null,
        name: 'Separate easy run',
        managed: false,
      },
    ]);
    const receipt = await apply(d);
    expect(receipt.presentation.relatedCalendarConflicts).toEqual(
      preview.presentation.relatedCalendarConflicts,
    );
    expect(
      (await f.write.getIndependentWorkoutDetail('user', related.workout!.id))
        .workout,
    ).toMatchObject({
      planId: null,
      scheduledDate: '2099-11-23',
      name: 'Separate easy run',
    });
  });
  it.each(['linked', 'successor'])(
    'protects courses already %s and keeps them explicitly covered',
    async (kind) => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'desc' },
      });
      if (kind === 'linked') {
        const activity = await prisma.activity.create({
          data: {
            userId: 'user',
            hashId: 'linked-run',
            sportType: 'RUN',
            startTime: new Date('2099-11-24'),
            timerTime: 1800,
          },
        });
        await prisma.planWorkoutActivityLink.create({
          data: {
            planId: d.planId,
            planWorkoutId: w.id,
            activityId: activity.id,
          },
        });
      } else
        await prisma.plan.create({
          data: {
            userId: 'user',
            title: 'Successor',
            periodWeeks: 1,
            status: 'SCHEDULED',
            startDate: new Date('2099-11-24'),
            supersedesPlanId: d.planId,
          },
        });
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(preview.presentation.counts).toMatchObject({
        protected: 1,
        preserved: 3,
      });
      expect(
        preview.presentation.rows.find((row) => row.workoutId === w.id)
          ?.protectedReason,
      ).toBe(kind === 'linked' ? 'ACTIVITY_LINKED' : 'PENDING_SUPERSESSION');
      d.request.deletions = [
        { sourceWorkoutId: w.id, expectedRevision: w.revision },
      ];
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow(/protected/);
    },
  );
});
