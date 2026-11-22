import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { ActivityReadService } from '../../activity/activity-read.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import {
  resolveActivityCalendarDayStr,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';
import { plannedStepTotal } from './plan-execution-chart';
import { matchWorkoutDay } from './workout-day-matching';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import {
  PLAN_WORKOUTS_CHANGED_EVENT,
  PlanWorkoutsChangedEvent,
} from '../events/plan.events';
import type {
  WorkoutMatchingReview,
  WorkoutMatchingReason,
} from '@shared/workout-matching';

const ACTIVITY_SELECT = {
  id: true,
  userId: true,
  activityName: true,
  hashId: true,
  sportType: true,
  sportDefinitionCode: true,
  startTime: true,
  timezone: true,
  timerTime: true,
  elapsedTime: true,
  distance: true,
  planWorkoutLinks: {
    where: { unlinkedAt: null },
    select: {
      id: true,
      planWorkoutId: true,
      source: true,
      autoMarkedWorkoutDone: true,
      planWorkout: {
        select: { status: true, plan: { select: { status: true } } },
      },
    },
  },
  workoutMatchState: true,
} satisfies Prisma.ActivitySelect;
const WORKOUT_INCLUDE = {
  plan: { select: { status: true, title: true } },
  steps: true,
  links: {
    where: { unlinkedAt: null },
    select: { id: true, source: true, activityId: true },
  },
} satisfies Prisma.PlanWorkoutInclude;
const MATCH_REGISTRATION_LOOKBACK_MS = 24 * 60 * 60 * 1000;
type Workout = Prisma.PlanWorkoutGetPayload<{
  include: typeof WORKOUT_INCLUDE;
}>;

function expected(workout: Pick<Workout, 'plannedDurationSeconds' | 'steps'>) {
  const steps = workout.steps.map((step) => ({
    ...step,
    durationUnit:
      step.durationUnit ?? (step.durationType === 'TIME' ? 'SECONDS' : null),
  }));
  const duration = plannedStepTotal(steps, 'DURATION_MIN');
  const distance = plannedStepTotal(steps, 'DISTANCE_KM');
  return {
    durationSeconds:
      workout.plannedDurationSeconds ??
      (duration == null ? null : duration * 60),
    distanceMeters: distance == null ? null : distance * 1000,
  };
}

/** Owns day-wide inference, reversible completion and the Coach's unresolved matching facts. */
@Injectable()
export class PlanLinkMatcherService {
  private readonly logger = new Logger(PlanLinkMatcherService.name);
  private readonly pending = new Map<
    string,
    { dirty: boolean; work: Promise<void> }
  >();
  private sweeping = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly links: PlanActivityLinkRepository,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  private async timezone(userId: string) {
    return this.userService
      ? this.userService.getPreferredTimezone(userId)
      : ((
          await this.users.bodyMetrics().findFirst({
            where: { userId, type: 'TIMEZONE' },
            orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
            select: { value: true },
          })
        )?.value ?? null);
  }

  async sumExpectedDurationSeconds(workoutId: string): Promise<number | null> {
    const steps = await this.links.findSteps({ where: { workoutId } });
    const duration = plannedStepTotal(
      steps.map((step) => ({
        ...step,
        durationUnit:
          step.durationUnit ??
          (step.durationType === 'TIME' ? 'SECONDS' : null),
      })),
      'DURATION_MIN',
    );
    return duration == null || duration <= 0 ? null : duration * 60;
  }

  async tryAutoLinkForActivity(activityId: number): Promise<void> {
    const activity = await this.activityRead.findFirst({
      where: { id: activityId, state: 1, mergedIntoActivityId: null },
      select: { userId: true, startTime: true, timezone: true },
    });
    if (!activity?.startTime) return;
    // Match the association lock order before the state's foreign-key write.
    const persisted = await withSerializableRetry(() =>
      this.prisma.$transaction(async (tx) => {
        if (!(await this.links.lockLinkTargets(activityId, null, tx)))
          return false;
        await this.links.putMatchState(
          {
            where: { activityId },
            create: {
              activityId,
              userId: activity.userId,
              outcome: 'NO_MATCH',
              reason: 'PENDING',
              candidateWorkoutIds: [],
            },
            update: {},
          },
          tx,
        );
        return true;
      }),
    );
    if (!persisted) return;
    const timezone = await this.timezone(activity.userId);
    const day = resolveActivityCalendarDayStr(
      activity.startTime,
      activity.timezone,
      null,
      timezone,
    );
    if (day) await this.requestDay(activity.userId, day);
  }

  private requestDay(userId: string, day: string): Promise<void> {
    const key = userId + ':' + day;
    const existing = this.pending.get(key);
    if (existing) {
      existing.dirty = true;
      return existing.work;
    }
    const entry = { dirty: true, work: Promise.resolve() };
    this.pending.set(key, entry);
    entry.work = (async () => {
      while (entry.dirty) {
        entry.dirty = false;
        try {
          await this.reconcileDay(userId, day);
        } catch (error) {
          const code = (error as { code?: unknown })?.code;
          this.logger.warn(
            'Workout matching failed code=' +
              (typeof code === 'string' && /^[A-Z0-9]+$/.test(code)
                ? code
                : 'UNKNOWN'),
          );
        }
      }
    })().finally(() => {
      if (this.pending.get(key) === entry) this.pending.delete(key);
    });
    return entry.work;
  }

  private async reconcileDay(userId: string, day: string) {
    const timezone = await this.timezone(userId);
    const date = scheduledDateFromCalendar(day);
    const from = new Date(date.getTime() - 86_400_000);
    const to = new Date(date.getTime() + 2 * 86_400_000);
    const result = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.links.lockMatchDay(userId, day, tx);
          const activityWhere: Prisma.ActivityWhereInput = {
            userId,
            state: 1,
            mergedIntoActivityId: null,
            startTime: { gte: from, lt: to },
            OR: [{ status: 'FINISHED' }, { processingStatus: 'READY' }],
          };
          let rows = await this.activityRead.activity(tx).findMany({
            where: activityWhere,
            select: ACTIVITY_SELECT,
            orderBy: { id: 'asc' },
          });
          rows = rows.filter(
            (row) =>
              row.startTime &&
              resolveActivityCalendarDayStr(
                row.startTime,
                row.timezone,
                null,
                timezone,
              ) === day,
          );
          for (const row of rows)
            await this.links.lockLinkTargets(row.id, null, tx);
          rows = await this.activityRead.activity(tx).findMany({
            where: { ...activityWhere, id: { in: rows.map((row) => row.id) } },
            select: ACTIVITY_SELECT,
            orderBy: { id: 'asc' },
          });
          const activePlans = await this.plans.findMany(
            { where: { userId, status: 'ACTIVE' }, select: { id: true } },
            tx,
          );
          const workoutWhere: Prisma.PlanWorkoutWhereInput = {
            userId,
            scheduledDate: date,
            OR: [
              { planId: null },
              { planId: { in: activePlans.map((plan) => plan.id) } },
            ],
          };
          let workouts = await this.workouts.findMany(
            {
              where: workoutWhere,
              include: WORKOUT_INCLUDE,
              orderBy: { id: 'asc' },
            },
            tx,
          );
          const lockIds = [
            ...new Set([
              ...workouts.map((workout) => workout.id),
              ...rows.flatMap((row) =>
                row.planWorkoutLinks.map((link) => link.planWorkoutId),
              ),
            ]),
          ].sort();
          for (const workoutId of lockIds)
            await this.workouts.lockForUpdate(workoutId, tx);
          workouts = await this.workouts.findMany(
            {
              where: { ...workoutWhere, id: { in: lockIds } },
              include: WORKOUT_INCLUDE,
              orderBy: { id: 'asc' },
            },
            tx,
          );
          // Status changes own the workout lock, so their completion flags must be read after it.
          rows = await this.activityRead.activity(tx).findMany({
            where: {
              ...activityWhere,
              id: { in: rows.map((row) => row.id) },
            },
            select: ACTIVITY_SELECT,
            orderBy: { id: 'asc' },
          });
          const activities = rows.filter(
            (row) =>
              !row.workoutMatchState?.suppressedAt &&
              !row.planWorkoutLinks.some(
                (link) =>
                  link.source !== 'AUTO_MATCH' ||
                  !link.autoMarkedWorkoutDone ||
                  (link.planWorkout.plan &&
                    link.planWorkout.plan.status !== 'ACTIVE'),
              ),
          );
          const inferredLinks = activities.flatMap(
            (activity) => activity.planWorkoutLinks,
          );
          const inferredIds = new Set(inferredLinks.map((link) => link.id));
          const inferredWorkouts = new Set(
            inferredLinks.map((link) => link.planWorkoutId),
          );
          workouts = workouts.filter(
            (workout) =>
              (!workout.plan || workout.plan.status === 'ACTIVE') &&
              !workout.links.some((link) => !inferredIds.has(link.id)) &&
              (workout.status === 'PLANNED' ||
                workout.status === 'IN_PROGRESS' ||
                (workout.status === 'DONE' &&
                  inferredWorkouts.has(workout.id))),
          );
          const decision = matchWorkoutDay(
            activities.map((activity) => ({
              id: activity.id,
              sportType: activity.sportType,
              sportDefinitionCode: activity.sportDefinitionCode,
              durationSeconds:
                activity.timerTime && activity.timerTime > 0
                  ? activity.timerTime
                  : activity.elapsedTime && activity.elapsedTime > 0
                    ? activity.elapsedTime
                    : null,
              distanceMeters: activity.distance,
            })),
            workouts.map((workout) => ({
              id: workout.id,
              sportType: workout.sportType,
              sportDefinitionCode: workout.sportDefinitionCode,
              ...expected(workout),
            })),
          );
          const matched = new Map(
            decision.matches.map((match) => [
              match.activityId,
              match.workoutId,
            ]),
          );
          let changed = false;
          for (const activity of activities) {
            for (const link of activity.planWorkoutLinks) {
              if (matched.get(activity.id) === link.planWorkoutId) continue;
              await this.links.updateMany(
                {
                  where: { id: link.id, unlinkedAt: null },
                  data: { unlinkedAt: new Date() },
                },
                tx,
              );
              if (link.autoMarkedWorkoutDone) {
                const remaining = await this.links.findFirst(
                  {
                    where: {
                      planWorkoutId: link.planWorkoutId,
                      unlinkedAt: null,
                      role: 'PRIMARY',
                    },
                  },
                  tx,
                );
                if (!remaining)
                  await this.workouts.updateMany(
                    {
                      where: { id: link.planWorkoutId, status: 'DONE' },
                      data: { status: 'PLANNED', completedAt: null },
                    },
                    tx,
                  );
              }
              changed = true;
            }
          }
          for (const activity of activities) {
            const workoutId = matched.get(activity.id);
            const existing = activity.planWorkoutLinks.find(
              (link) => link.planWorkoutId === workoutId,
            );
            if (workoutId && !existing) {
              const workout = workouts.find(
                (workout) => workout.id === workoutId,
              )!;
              const done = await this.workouts.markDoneIfApplicable(
                workoutId,
                activity.startTime,
                tx,
              );
              if (!done) throw new Error('WORKOUT_MATCH_STATE_CHANGED');
              await this.links.create(
                {
                  data: {
                    planId: workout.planId,
                    planWorkoutId: workoutId,
                    activityId: activity.id,
                    source: 'AUTO_MATCH',
                    role: 'PRIMARY',
                    autoMarkedWorkoutDone: true,
                  },
                },
                tx,
              );
              changed = true;
            }
            const review = decision.reviews.find(
              (review) => review.activityId === activity.id,
            );
            const candidateIds = workoutId
              ? [workoutId]
              : (review?.candidateWorkoutIds ?? []);
            const outcome = workoutId
              ? 'AUTO_LINKED'
              : review
                ? 'NEEDS_REVIEW'
                : 'NO_MATCH';
            const reason = workoutId
              ? 'MATCHED'
              : (review?.reason ?? 'NO_ELIGIBLE_WORKOUT');
            await this.links.putMatchState(
              {
                where: { activityId: activity.id },
                create: {
                  activityId: activity.id,
                  userId,
                  outcome,
                  reason,
                  candidateWorkoutIds: candidateIds,
                },
                update: { outcome, reason, candidateWorkoutIds: candidateIds },
              },
              tx,
            );
          }
          return {
            changed,
            matched: decision.matches.length,
            reviews: decision.reviews.length,
          };
        },
        {
          timeout: 30_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
    if (result.changed) {
      this.logger.log(
        'Workout matching committed dayRef=' +
          createHash('sha256')
            .update(userId + ':' + day)
            .digest('hex')
            .slice(0, 24) +
          ' matched=' +
          result.matched +
          ' reviews=' +
          result.reviews,
      );
      await this.events?.emitAsync(
        PLAN_WORKOUTS_CHANGED_EVENT,
        new PlanWorkoutsChangedEvent(userId, 'automatic_matching'),
      );
    }
  }

  @OnEvent(PLAN_WORKOUTS_CHANGED_EVENT, { suppressErrors: false })
  async onWorkoutsChanged(event: PlanWorkoutsChangedEvent) {
    if (event.reason === 'automatic_matching') return;
    const [workouts, states] = await Promise.all([
      this.workouts.findMany({
        where: {
          userId: event.userId,
          ...(event.workoutIds.length
            ? { id: { in: event.workoutIds } }
            : event.planId
              ? { planId: event.planId }
              : {}),
        },
        select: { scheduledDate: true },
        take: 1000,
      }),
      this.links.findMatchStates({
        where: {
          userId: event.userId,
          suppressedAt: null,
          ...(event.workoutIds.length
            ? { candidateWorkoutIds: { hasSome: event.workoutIds } }
            : {}),
        },
        include: { activity: { select: { startTime: true, timezone: true } } },
        take: 1000,
      }),
    ]);
    const timezone = await this.timezone(event.userId);
    const days = new Set(
      workouts.flatMap((workout) =>
        workout.scheduledDate
          ? [workout.scheduledDate.toISOString().slice(0, 10)]
          : [],
      ),
    );
    for (const state of states) {
      if (!state.activity.startTime) continue;
      const day = resolveActivityCalendarDayStr(
        state.activity.startTime,
        state.activity.timezone,
        null,
        timezone,
      );
      if (day) days.add(day);
    }
    for (const day of days) await this.requestDay(event.userId, day);
  }

  /** Repairs missed wakeups for tracked matches and recently available activities. */
  @Interval(60_000)
  async rescanPendingMatches() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const states = await this.links.findMatchStates({
        where: {
          suppressedAt: null,
          outcome: { in: ['NO_MATCH', 'NEEDS_REVIEW', 'AUTO_LINKED'] },
          activity: {
            state: 1,
            mergedIntoActivityId: null,
            startTime: { not: null },
            OR: [{ status: 'FINISHED' }, { processingStatus: 'READY' }],
            planWorkoutLinks: {
              none: {
                unlinkedAt: null,
                OR: [
                  { source: { not: 'AUTO_MATCH' } },
                  { autoMarkedWorkoutDone: false },
                  { planWorkout: { plan: { status: { not: 'ACTIVE' } } } },
                ],
              },
            },
          },
        },
        orderBy: { updatedAt: 'asc' },
        take: 100,
        select: { activityId: true },
      });
      // A failed initial transaction leaves no match state. The persisted
      // activity can still be discovered after a process restart.
      const cutoff = new Date(Date.now() - MATCH_REGISTRATION_LOOKBACK_MS);
      const unregistered = await this.activityRead.findMany({
        where: {
          state: 1,
          mergedIntoActivityId: null,
          startTime: { not: null },
          workoutMatchState: null,
          planWorkoutLinks: { none: { unlinkedAt: null } },
          OR: [
            { processingStatus: 'READY', processingUpdatedAt: { gte: cutoff } },
            { status: 'FINISHED', startTime: { gte: cutoff } },
          ],
        },
        orderBy: { id: 'asc' },
        take: 25,
        select: { id: true },
      });
      let deferred = 0;
      for (const activityId of [
        ...states.map((state) => state.activityId),
        ...unregistered.map((activity) => activity.id),
      ]) {
        try {
          await this.tryAutoLinkForActivity(activityId);
        } catch {
          deferred++;
        }
      }
      if (deferred)
        this.logger.warn(`Workout matching rescan deferred count=${deferred}`);
    } catch {
      this.logger.warn('Workout matching rescan deferred');
    } finally {
      this.sweeping = false;
    }
  }

  async listMatchingReviews(userId: string): Promise<WorkoutMatchingReview[]> {
    const states = await this.links.findMatchStates({
      where: {
        userId,
        outcome: 'NEEDS_REVIEW',
        suppressedAt: null,
        activity: {
          userId,
          state: 1,
          mergedIntoActivityId: null,
          planWorkoutLinks: { none: { unlinkedAt: null } },
          processingStatus: 'READY',
        },
      },
      include: {
        activity: {
          select: {
            hashId: true,
            activityName: true,
            startTime: true,
            timezone: true,
          },
        },
      },
      orderBy: { activity: { startTime: 'desc' } },
      take: 50,
    });
    const workouts = await this.workouts.findMany({
      where: {
        id: {
          in: [
            ...new Set(states.flatMap((state) => state.candidateWorkoutIds)),
          ],
        },
        userId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        OR: [{ planId: null }, { plan: { status: 'ACTIVE' } }],
      },
      include: WORKOUT_INCLUDE,
    });
    const timezone = await this.timezone(userId);
    const reasons = new Set([
      'AMBIGUOUS',
      'INSUFFICIENT_EVIDENCE',
      'COMPLEX_CANDIDATES',
    ]);
    return states
      .flatMap((state) => {
        if (!state.activity.startTime) return [];
        const date = resolveActivityCalendarDayStr(
          state.activity.startTime,
          state.activity.timezone,
          null,
          timezone,
        );
        const candidates = workouts
          .filter(
            (workout) =>
              state.candidateWorkoutIds.includes(workout.id) &&
              workout.scheduledDate?.toISOString().slice(0, 10) === date &&
              !workout.links.length,
          )
          .map((workout) => ({
            workoutId: workout.id,
            planId: workout.planId,
            name: workout.name,
            planTitle: workout.plan?.title ?? null,
            ...expected(workout),
          }));
        if (!date || !candidates.length) return [];
        return [
          {
            id: 'workout-match-' + state.activityId,
            activityHashId: state.activity.hashId,
            activityTitle: state.activity.activityName,
            date,
            reason: (reasons.has(state.reason)
              ? state.reason
              : 'INSUFFICIENT_EVIDENCE') as WorkoutMatchingReason,
            candidates,
          },
        ];
      })
      .slice(0, 8);
  }
}

export { markWorkoutDoneIfApplicable } from '../persistence/plan-workout-done';
