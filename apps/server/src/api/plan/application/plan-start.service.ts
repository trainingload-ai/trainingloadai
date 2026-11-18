import { RollingPlanAuthorizationService } from './rolling-plan-authorization.service';
import { RollingPlanService } from './rolling-plan.service';
import { isoWeekStart, parseRollingStartSettings } from '@shared/rolling-plan';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { HealthDataRepository } from '@/health-data/persistence/health-data.repository';
import { UserQueryService } from '@/api/user/user-query.service';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlanWorkoutInputDto } from '../dto/create-plan.dto';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import {
  PlanStartRepository,
  type Source,
} from '../persistence/plan-start.repository';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { UserService } from '@/api/user/user.service';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { PlanService } from '../plan.service';
import type { PlanDb } from '../persistence/plan-db';
import type {
  PlanStartPreviewRequest,
  PlanSchedulePreviewRequest,
  PlanProposalPreviewResult,
  PlanProposalPresentation,
  PlanStartWorkoutDraft,
} from '@shared/plan-proposal';
import {
  safeParseCoachDecisionConfirmationPayload,
  type CoachPlanDraftWorkout,
} from '@shared/ai-coach-schema';
import {
  assessPlanSchedule,
  addCalendarDays,
  isCalendarDate,
  parseScheduleConstraints,
  transitionScheduleMetadata,
  scheduleRulePeriods,
} from '@shared/plan-calendar';
import {
  assessPlanQuality,
  assessRollingPlanQuality,
  parsePlanQualityContract,
} from '@shared/plan-quality';
import { normalizePlanRow } from './plan-row.mapper';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PlanCalendarValidationService } from './plan-calendar-validation.service';
import { workoutImmutabilityReason } from './plan-workout-mutability.policy';
import type { UpdatePlanDto } from '../dto/update-plan.dto';

export type PlanStartBinding = {
  sid: string;
  branchId: string;
  userMessageId?: string;
};
function fail(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_CONFLICT,
    message,
  });
}
function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
function hash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

export type CanonicalStartProposal = {
  mode: 'START' | 'SCHEDULE';
  planId: string;
  binding?: PlanStartBinding;
  conversationRevision?: number;
  automationJobId?: string;
  automationMonthStrategyIds?: string[];
  startDate: string;
  calendarTimeZone: string;
  sourceFingerprint: string;
  factFingerprint: string;
  sourceWorkouts: Array<{ id: string; revision: number }>;
  request: PlanStartPreviewRequest | PlanSchedulePreviewRequest;
  candidate: Array<{
    sourceWorkoutId?: string;
    candidateKey?: string;
    workout: PlanStartWorkoutDraft;
  }>;
  preserved: Array<{ sourceWorkoutId: string; expectedRevision: number }>;
  presentation: PlanProposalPresentation;
};

/** Owns immutable START/SCHEDULE candidates and transaction-scoped source/fact binding. */
@Injectable()
export class PlanStartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly users: UserService,
    private readonly definitions: WorkoutDefinitionService,
    private readonly workout: WorkoutService,
    private readonly persistence: WorkoutPersistenceService,
    private readonly storage: PlanStartRepository,
    private readonly loads: PlanLoadEstimatorService,
    private readonly calendarValidation: PlanCalendarValidationService,
    private readonly activityRead: ActivityReadService,
    private readonly healthData: HealthDataRepository,
    private readonly userQuery: UserQueryService,
    private readonly competitions: CompetitionQueryService,
    private readonly analysisConfig: UserAnalysisConfigService,
    private readonly rolling: RollingPlanService,
    private readonly automationAccess?: RollingPlanAuthorizationService,
  ) {}

  private constraints(value: unknown) {
    try {
      return parseScheduleConstraints(value);
    } catch {
      throw new UnprocessableEntityException({
        code: 'PLAN_SCHEDULE_INVALID',
        message:
          'Invalid saved or proposed calendar constraints; review the plan settings',
      });
    }
  }

  private earliestStartDate(calendarTimeZone: string) {
    const today = activityCalendarYmdInZone(new Date(), calendarTimeZone);
    if (!today) fail('Invalid calendar timezone');
    return today;
  }

  private assertFutureStart(startDate: string, calendarTimeZone: string) {
    if (startDate < this.earliestStartDate(calendarTimeZone))
      throw new UnprocessableEntityException({
        code: 'PLAN_START_REASSESSMENT_REQUIRED',
        message: 'Choose today or a future calendar day and reassess the start',
      });
  }

  private async source(
    userId: string,
    planId: string,
    tx: PlanDb,
    allowStarted = false,
    schedule = false,
    window?: { from: string; to: string },
  ): Promise<Source> {
    const plan = await this.storage.source(planId, tx, window);
    if (
      !plan ||
      plan.userId !== userId ||
      (schedule
        ? !['ACTIVE', 'PAUSED'].includes(plan.status)
        : plan.status !== 'DRAFT' &&
          !(allowStarted && plan.status === 'ACTIVE'))
    )
      fail('A saved DRAFT plan is required; reassess the start');
    if (plan.workouts.length > 10000)
      fail('The plan exceeds the supported start candidate capacity');
    return plan;
  }

  private fingerprint(plan: Source) {
    return hash({
      id: plan.id,
      status: plan.status,
      startDate: plan.startDate,
      endDate: plan.endDate,
      activationTimezone: plan.activationTimezone,
      supersededBy: plan.supersededBy,
      title: plan.title,
      description: plan.description,
      goal: plan.goal,
      planningMode: plan.planningMode,
      periodWeeks: plan.periodWeeks,
      metadata: plan.generationMetadata,
      workouts: plan.workouts.map((w) => ({
        id: w.id,
        revision: w.revision,
        status: w.status,
        dayOffset: w.dayOffset,
        sessionIndex: w.sessionIndex,
        scheduledDate: w.scheduledDate,
        sportType: w.sportType,
        sportDefinitionCode: w.sportDefinitionCode,
        name: w.name,
        notes: w.notes,
        text: w.text,
        structureKind: w.structureKind,
        dslVersion: w.dslVersion,
        plannedDurationSeconds: w.plannedDurationSeconds,
        plannedSessionRpe: w.plannedSessionRpe,
        steps: w.steps,
        strengthExercises: w.strengthExercises,
        links: w.links.map((l) => ({ id: l.id, activityId: l.activityId })),
      })),
    });
  }

  private async facts(
    userId: string,
    planId: string,
    startDate: string,
    weeks: number,
    tx: PlanDb,
  ) {
    const since = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    );
    since.setUTCDate(since.getUTCDate() - 90);
    const until = new Date(`${startDate}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + weeks * 7);
    const [
      activities,
      health,
      memory,
      profile,
      calendar,
      preferredTimezone,
      composedProfiles,
      thresholds,
      zones,
      competitions,
      loadConfigurations,
    ] = await Promise.all([
      this.activityRead.activity(tx).findMany({
        where: {
          userId,
          OR: [{ startTime: { gte: since } }, { startTime: null }],
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          updatedAt: true,
          startTime: true,
          sportType: true,
          timerTime: true,
          sessionRpe: true,
          processingStatus: true,
          elapsedTime: true,
          sportDefinitionCode: true,
          coggan: { select: { bikeStress: true } },
          trimp: { select: { trimp100: true } },
          bikeScore: { select: { bikeScore: true } },
          govss: { select: { govss: true } },
          swimScore: { select: { swimScore: true } },
          fitnessMetricsSnapshot: {
            select: {
              resolutionVersion: true,
              actualLoad: true,
              actualLoadSource: true,
            },
          },
          activitySources: {
            where: { isActive: true, isPrimary: true },
            select: { metadata: true },
          },
        },
      }),
      this.healthData.dailyMetrics(tx).findMany({
        where: { userId, date: { gte: since } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          date: true,
          metricType: true,
          semanticVersion: true,
          semanticHash: true,
        },
      }),
      tx.athleteMemoryFact.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
        select: { id: true, version: true, status: true },
      }),
      this.userQuery.profiles(tx).findUnique({ where: { userId } }),
      this.storage.calendar(userId, planId, since, until, tx),
      this.users.getPreferredTimezone(userId, tx),
      Promise.all(
        (['RUN', 'CYCLING', 'SWIM'] as const).map(async (sport) => ({
          sport,
          profile: await this.users.getComposedUserProfile(
            userId,
            sport,
            undefined,
            tx,
          ),
        })),
      ),
      Promise.all(
        (['RUN', 'CYCLING', 'SWIM'] as const).map(async (sport) => ({
          sport,
          thresholds: await this.loads.loadThresholdsForUser(userId, sport, tx),
        })),
      ),
      this.userQuery.zoneSettings(tx).findMany({
        where: { userId },
        orderBy: [{ sportType: 'asc' }, { zoneType: 'asc' }],
        select: {
          sportType: true,
          zoneType: true,
          benchmark: true,
          zones: {
            orderBy: { order: 'asc' },
            select: { order: true, min: true, max: true },
          },
        },
      }),
      this.competitions.findPlanProposalFacts(userId, since, until, tx),
      this.analysisConfig.listVersions(userId, until, tx).then((rows) =>
        rows.map((row) => ({
          effectiveAt: row.effectiveAt,
          loadSources: row.loadSources,
        })),
      ),
    ]);
    // Execution/audit clocks are excluded; new activity/health/memory/calendar evidence remains observable.
    const {
      updatedAt: _updated,
      createdAt: _created,
      ...settings
    } = profile ?? {};
    return hash({
      activities,
      health,
      memory,
      settings,
      calendar,
      preferredTimezone,
      composedProfiles,
      thresholds,
      zones,
      competitions,
      loadConfigurations,
    });
  }

  async invalidate(userId: string, planId: string, tx: PlanDb) {
    const old = await tx.planProposalPreview.findMany({
      where: {
        userId,
        sourcePlanId: planId,
        mode: { in: ['START', 'SCHEDULE'] },
        appliedAt: null,
      },
      select: { id: true, decisionId: true },
    });
    await tx.planProposalPreview.updateMany({
      where: { id: { in: old.map((p) => p.id) } },
      data: { expiresAt: new Date() },
    });
    await tx.coachDecision.updateMany({
      where: {
        id: { in: old.flatMap((p) => (p.decisionId ? [p.decisionId] : [])) },
        state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] },
      },
      data: { state: 'SUPERSEDED' },
    });
  }

  /** Revoke pending starts when a new discussion turn changes the athlete's instructions. */
  async prepareTurn(
    userId: string,
    sid: string,
    branchId: string | null,
    message: unknown,
    tx: PlanDb,
  ) {
    let session = await tx.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: sid } },
    });
    if (!session) return;
    const branch = branchId
      ? await tx.coachBranch.findFirst({
          where: { id: branchId, context: { userId } },
          include: { context: true },
        })
      : null;
    const planId = session.planStartPlanId ?? branch?.context.planId;
    if (!planId) {
      await acquireHashtextAdvisoryXactLock(tx, userId);
      const pending = await tx.planProposalPreview.findMany({
        where: {
          userId,
          mode: 'SCHEDULE',
          appliedAt: null,
          proposal: { path: ['binding', 'sid'], equals: sid },
        },
        select: { sourcePlanId: true },
      });
      for (const id of new Set(pending.map((p) => p.sourcePlanId)))
        await this.invalidate(userId, id, tx);
      return;
    }
    await acquireHashtextAdvisoryXactLock(tx, userId);
    session = await tx.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: sid } },
    });
    if (
      !session ||
      (session.planStartPlanId && session.planStartBranchId !== branchId)
    )
      fail('Start conversation branch changed');
    const record = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const content = record(message)?.content;
    const results = Array.isArray(content)
      ? content.filter((block) => record(block)?.type === 'tool_result')
      : [];
    const block = record(results[0]);
    const confirmation =
      results.length === 1 && !block?.is_error
        ? safeParseCoachDecisionConfirmationPayload(block?.content)
        : null;
    let exactCard = false;
    if (confirmation) {
      const [decision, assistant] = await Promise.all([
        tx.coachDecision.findFirst({
          where: {
            id: confirmation.decisionId,
            branchId: branchId!,
            decisionType: { in: ['PLAN_START', 'PLAN_SCHEDULE'] },
            state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] },
            context: { userId, planId },
          },
        }),
        tx.aiCoachMessage.findFirst({
          where: {
            id: confirmation.repliesToAssistantMessageId,
            userId,
            sessionId: sid,
            role: 'ASSISTANT',
          },
        }),
      ]);
      const envelope = record(assistant?.message);
      const legacy = record(envelope?.legacyMessage) ?? envelope;
      const cards = legacy?.content;
      exactCard = Boolean(
        decision &&
        Array.isArray(cards) &&
        cards.some((item) => {
          const row = record(item),
            input = record(row?.input),
            payload = record(input?.payload);
          return (
            row?.type === 'tool_use' &&
            row.name === 'CoachDecisionDraft' &&
            input?.decisionId === decision.id &&
            input.branchId === branchId &&
            payload?.previewId === record(decision.payload)?.previewId
          );
        }),
      );
    }
    if (!exactCard) await this.invalidate(userId, planId, tx);
  }

  async conversation(userId: string, planId: string, selectedDate?: string) {
    if (selectedDate !== undefined && !isCalendarDate(selectedDate))
      throw new UnprocessableEntityException('Invalid calendar start date');
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const prior = await tx.aiCoachSession.findUnique({
            where: {
              userId_planStartPlanId: { userId, planStartPlanId: planId },
            },
          });
          const applied =
            prior &&
            (await this.storage.appliedStart(userId, planId, prior.id, tx));
          const source = await this.source(
            userId,
            planId,
            tx,
            Boolean(applied),
          );
          if (
            source.status !== 'DRAFT' &&
            selectedDate &&
            selectedDate !== prior?.planStartDate
          )
            fail('An active plan cannot change its start date');
          const calendarTimeZone =
            this.constraints(
              (source.generationMetadata as Record<string, unknown> | null)
                ?.scheduleConstraints,
            )?.calendarTimeZone ??
            (await this.users.getPreferredTimezone(userId, tx)) ??
            'UTC';

          const earliestStartDate = this.earliestStartDate(calendarTimeZone);
          const savedDate =
            selectedDate ?? prior?.planStartDate ?? earliestStartDate;
          const startDate =
            source.status === 'DRAFT' &&
            selectedDate === undefined &&
            savedDate < earliestStartDate
              ? earliestStartDate
              : savedDate;
          if (!startDate) fail('Invalid calendar timezone');
          if (source.status === 'DRAFT')
            this.assertFutureStart(startDate, calendarTimeZone);
          let session = prior;
          if (!session)
            session = await tx.aiCoachSession.create({
              data: {
                userId,
                id: randomUUID(),
                title: source.title,
                planStartPlanId: planId,
                planStartDate: startDate,
                planStartRevision: 1,
              },
            });
          else if (session.planStartDate !== startDate) {
            await this.invalidate(userId, planId, tx);
            session = await tx.aiCoachSession.update({
              where: { userId_id: { userId, id: session.id } },
              data: {
                planStartDate: startDate,
                planStartRevision: { increment: 1 },
              },
            });
          }
          const plan = normalizePlanRow(source, {
            workoutService: this.workout,
            workoutDefinitionService: this.definitions,
            workoutPersistence: this.persistence,
          });
          const evaluationStarted = Boolean(
            await tx.coachRunAttempt.findUnique({
              where: {
                userId_operationId: {
                  userId,
                  operationId: `coach-entry:plan-start:${session.id}:${session.planStartRevision}`,
                },
              },
              select: { id: true },
            }),
          );
          return {
            sid: session.id,
            evaluationStarted,
            branchId: session.planStartBranchId,
            entryKey: `plan-start:${session.id}:${session.planStartRevision}`,
            startDate,
            calendarTimeZone,
            earliestStartDate,
            plan,
          };
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      ),
    );
  }

  async assertBinding(
    userId: string,
    planId: string,
    binding: PlanStartBinding | undefined,
    tx: PlanDb,
    date?: string,
    schedule = false,
  ) {
    if (!binding?.sid || !binding.branchId)
      fail('A server-owned start conversation is required');
    const session = await tx.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: binding.sid } },
    });
    const branch = await tx.coachBranch.findUnique({
      where: { id: binding.branchId },
      include: { context: true },
    });
    if (
      !session ||
      (!schedule &&
        (session.planStartPlanId !== planId ||
          session.planStartBranchId !== binding.branchId)) ||
      !branch ||
      branch.context.planId !== planId ||
      branch.context.userId !== userId ||
      (date && session.planStartDate !== date)
    )
      fail('Start conversation no longer matches this plan, branch or date');
    if (binding.userMessageId) {
      const latest = await tx.aiCoachMessage.findFirst({
        where: { userId, sessionId: binding.sid, role: 'USER' },
        orderBy: { sequence: 'desc' },
        select: { id: true },
      });
      if (latest?.id !== binding.userMessageId)
        fail(
          'The evaluation turn was replaced; reassess the latest user request',
        );
    }
    if (schedule && binding.userMessageId) {
      const attempt = await tx.coachRunAttempt.findFirst({
        where: {
          userId,
          inputMessageId: binding.userMessageId,
          cancelRequestedAt: null,
          status: 'running',
          run: {
            userId,
            sessionId: binding.sid,
            branchId: binding.branchId,
            status: 'running',
          },
        },
        include: { run: true },
      });
      if (!attempt || attempt.run.activeAttemptId !== attempt.id)
        fail('The schedule evaluation run is no longer current');
    }
    return session;
  }

  async createPreview(
    userId: string,
    request: PlanStartPreviewRequest | PlanSchedulePreviewRequest,
    binding?: PlanStartBinding,
  ): Promise<PlanProposalPreviewResult> {
    if (!binding) fail('A server-owned start conversation is required');
    return this.preparePreview(userId, request, binding);
  }

  async createAutomationPreview(
    jobId: string,
    claimToken: string,
    request: PlanSchedulePreviewRequest,
  ) {
    const job = await this.prisma.rollingPlanJob.findUnique({
      where: { id: jobId },
      include: { plan: true },
    });
    if (!job || request.planId !== job.planId || request.mode !== 'SCHEDULE')
      fail('Automation job targets a different schedule');
    return this.preparePreview(job.plan.userId, request, undefined, {
      jobId,
      claimToken,
    });
  }

  private async preparePreview(
    userId: string,
    request: PlanStartPreviewRequest | PlanSchedulePreviewRequest,
    binding?: PlanStartBinding,
    automation?: { jobId: string; claimToken: string },
  ): Promise<PlanProposalPreviewResult> {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const schedule = request.mode === 'SCHEDULE';
          const automationJob = automation
            ? await this.assertAutomationJob(
                automation.jobId,
                automation.claimToken,
                tx,
              )
            : null;
          if (automationJob) {
            this.assertAutomationSettings(request);
            this.assertAutomationSports(automationJob.policy.settings, [
              ...request.changes.map((c) => c.workout),
              ...request.additions.map((a) => a.workout),
            ]);
          }
          const session = automationJob
            ? null
            : await this.assertBinding(
                userId,
                request.planId,
                binding,
                tx,
                schedule
                  ? undefined
                  : (request as PlanStartPreviewRequest).startDate,
                schedule,
              );
          const source = await this.source(
            userId,
            request.planId,
            tx,
            false,
            schedule,
            schedule &&
              isCalendarDate(
                (request as PlanSchedulePreviewRequest).range?.from,
              ) &&
              isCalendarDate((request as PlanSchedulePreviewRequest).range?.to)
              ? (request as PlanSchedulePreviewRequest).range
              : undefined,
          );
          const startDate = schedule
            ? source.startDate?.toISOString().slice(0, 10)
            : (request as PlanStartPreviewRequest).startDate;
          if (!startDate || !isCalendarDate(startDate))
            fail('Invalid calendar start date');
          const calendarTimeZone =
            this.constraints(request.scheduleConstraints)?.calendarTimeZone ??
            this.constraints(
              (source.generationMetadata as Record<string, unknown> | null)
                ?.scheduleConstraints,
            )?.calendarTimeZone ??
            (await this.users.getPreferredTimezone(userId, tx)) ??
            'UTC';
          if (!schedule) this.assertFutureStart(startDate, calendarTimeZone);
          const today = this.earliestStartDate(calendarTimeZone);
          const range = schedule
            ? (request as PlanSchedulePreviewRequest).range
            : undefined;
          if (
            schedule &&
            ((!automation && !binding?.userMessageId) ||
              !range ||
              !isCalendarDate(range.from) ||
              !isCalendarDate(range.to) ||
              range.from < today ||
              range.to < range.from)
          )
            fail(
              'SCHEDULE requires a current user turn and a future explicit date range',
            );
          const successor =
            schedule && source.supersededBy?.status === 'SCHEDULED'
              ? source.supersededBy
              : null;
          const protectedReason = (row: Source['workouts'][number]) =>
            automation && row.automationProtected
              ? 'USER_EXCEPTION'
              : schedule
                ? workoutImmutabilityReason({
                    planStatus: source.status,
                    workoutStatus: row.status,
                    scheduledDateYmd: row.scheduledDate
                      ?.toISOString()
                      .slice(0, 10),
                    athleteTodayYmd: today,
                    activeActivityLinkCount: row.links.length,
                    pendingSupersessionYmd: successor?.startDate
                      ?.toISOString()
                      .slice(0, 10),
                  })
                : row.status !== 'PLANNED' || row.links.length
                  ? 'WORKOUT_STATUS'
                  : null;
          const inRange = (date: string | null | undefined) =>
            !range || (!!date && date >= range.from && date <= range.to);
          const normalized = normalizePlanRow(source, {
            workoutService: this.workout,
            workoutDefinitionService: this.definitions,
            workoutPersistence: this.persistence,
          })!;
          const byId = new Map(source.workouts.map((w) => [w.id, w]));
          const normalizedById = new Map(
            normalized.workouts!.map((w) => [w.id, w]),
          );
          const covered = new Set<string>();
          const cover = (
            item: {
              sourceWorkoutId: string;
              expectedRevision: number;
            },
            mutating = true,
          ) => {
            const row = byId.get(item.sourceWorkoutId);
            if (
              !row ||
              row.revision !== item.expectedRevision ||
              covered.has(row.id)
            )
              fail(
                'Each source workout must be covered exactly once at its current revision',
              );
            if (
              mutating &&
              (protectedReason(row) ||
                !inRange(row.scheduledDate?.toISOString().slice(0, 10)))
            )
              fail('A protected or out-of-range workout cannot be changed');
            covered.add(row.id);
            return row;
          };
          if (
            !Array.isArray(request.changes) ||
            !Array.isArray(request.additions) ||
            !Array.isArray(request.deletions)
          )
            fail('Explicit changes, additions and deletions are required');
          const candidate: CanonicalStartProposal['candidate'] = [];
          for (const change of request.changes) {
            cover(change);
            candidate.push({
              sourceWorkoutId: change.sourceWorkoutId,
              workout: json(change.workout),
            });
          }
          for (const deletion of request.deletions) cover(deletion);
          const preserved = [...(request.preserved ?? [])];
          if (request.preserveUnmentioned)
            for (const w of source.workouts)
              if (
                !covered.has(w.id) &&
                !preserved.some((p) => p.sourceWorkoutId === w.id)
              )
                preserved.push({
                  sourceWorkoutId: w.id,
                  expectedRevision: w.revision,
                });
          for (const item of preserved) {
            cover(item, !schedule);
            const w = normalizedById.get(item.sourceWorkoutId)!;
            candidate.push({
              sourceWorkoutId: item.sourceWorkoutId,
              workout: {
                weekIndex: w.weekIndex,
                dayIndex: w.dayIndex,
                sessionIndex: w.sessionIndex,
                sportType: w.sportType,
                plannedSessionRpe: w.plannedSessionRpe ?? undefined,
                sportDefinitionCode: w.sportDefinitionCode,
                name: w.name ?? undefined,
                notes: w.notes ?? undefined,
                definition: {
                  kind: w.structureKind,
                  version: 1,
                  source: 'STRUCTURE',
                  structure: w.structure,
                },
              },
            });
          }
          if (covered.size !== source.workouts.length)
            fail('The candidate must cover every source workout');
          const keys = new Set<string>();
          for (const addition of request.additions) {
            if (
              !addition.candidateKey?.trim() ||
              keys.has(addition.candidateKey) ||
              byId.has(addition.candidateKey)
            )
              fail('New workout candidate keys must be unique');
            keys.add(addition.candidateKey);
            candidate.push({
              candidateKey: addition.candidateKey,
              workout: json(addition.workout),
            });
          }
          if (
            (!candidate.length && source.planningMode !== 'ROLLING') ||
            candidate.length > 10000
          )
            fail(
              'A calendar candidate must contain 1–10000 workouts; choose an explicit smaller scope if this capacity is exceeded',
            );
          const slots = new Set<string>();
          const display: CoachPlanDraftWorkout[] = candidate.map((item) => {
            const w = item.workout;
            if (
              !PLAN_SPORT_TYPES.includes(
                w.sportType as (typeof PLAN_SPORT_TYPES)[number],
              )
            )
              fail('Unsupported candidate sport');
            if (
              !Number.isInteger(w.weekIndex) ||
              w.weekIndex < 1 ||
              (source.planningMode !== 'ROLLING' &&
                w.weekIndex > source.periodWeeks) ||
              !Number.isInteger(w.dayIndex) ||
              w.dayIndex < 1 ||
              w.dayIndex > 7 ||
              !Number.isInteger(w.sessionIndex ?? 1) ||
              (w.sessionIndex ?? 1) < 1
            )
              fail('Invalid candidate calendar position');
            const slot = `${w.weekIndex}:${w.dayIndex}:${w.sessionIndex ?? 1}`;
            if (slots.has(slot))
              fail('Candidate workouts occupy the same session');
            slots.add(slot);
            if (
              validateSync(plainToInstance(PlanWorkoutInputDto, w), {
                forbidNonWhitelisted: true,
                whitelist: true,
              }).length
            )
              throw new UnprocessableEntityException({
                code: 'PLAN_START_WORKOUT_INVALID',
                message: 'The candidate workout fields are invalid',
              });
            let resolved = this.definitions.resolve(
              w.definition ?? {
                kind: 'ENDURANCE',
                version: 1,
                source: 'TEXT',
                text: w.text ?? '',
              },
            );
            const plannedSessionRpe =
              w.plannedSessionRpe ??
              (resolved.structure.kind === 'STRENGTH'
                ? resolved.structure.plannedSessionRpe
                : undefined) ??
              (item.sourceWorkoutId
                ? byId.get(item.sourceWorkoutId)?.plannedSessionRpe
                : undefined) ??
              undefined;
            if (
              resolved.structure.kind === 'STRENGTH' &&
              plannedSessionRpe !== undefined
            )
              resolved = this.definitions.resolve({
                kind: 'STRENGTH',
                version: 1,
                source: 'STRUCTURE',
                structure: { ...resolved.structure, plannedSessionRpe },
              });
            if (
              (item.candidateKey ||
                request.changes.some(
                  (c) => c.sourceWorkoutId === item.sourceWorkoutId,
                )) &&
              schedule
            ) {
              const date = new Date(`${startDate}T00:00:00Z`);
              date.setUTCDate(
                date.getUTCDate() + (w.weekIndex - 1) * 7 + w.dayIndex - 1,
              );
              if (
                !inRange(date.toISOString().slice(0, 10)) ||
                (successor?.startDate && date >= successor.startDate)
              )
                fail('Candidate target is outside the mutable schedule range');
            }
            item.workout = {
              ...w,
              plannedSessionRpe,
              definition: {
                kind: resolved.kind,
                version: 1,
                source: 'STRUCTURE',
                structure: resolved.structure,
              },
              text: resolved.text,
            };
            return {
              ...w,
              plannedSessionRpe,
              text: resolved.text,
              structureKind: resolved.kind,
              dslVersion: 1,
              structure: resolved.structure,
              summary: resolved.summary,
              sportDefinitionCode: w.sportDefinitionCode ?? undefined,
            };
          });
          const metadata = (source.generationMetadata ?? {}) as Record<
            string,
            unknown
          >;
          const priorConstraints = this.constraints(
            metadata.scheduleConstraints,
          );
          const constraints = request.scheduleConstraints
            ? this.constraints(request.scheduleConstraints)
            : priorConstraints;
          if (
            request.scheduleConstraints &&
            (!constraints ||
              constraints.revision !== (priorConstraints?.revision ?? 0) + 1 ||
              !request.qualityContractTransition)
          )
            fail(
              'New constraints require the next revision and an explicit contract transition',
            );
          if (constraints && constraints.calendarTimeZone !== calendarTimeZone)
            fail('Calendar timezone changed; reassess constraints');
          if (request.qualityContractTransition && !request.scheduleConstraints)
            fail(
              'A contract transition requires an explicit new schedule constraint revision',
            );
          const candidateMetadata =
            request.scheduleConstraints && request.qualityContractTransition
              ? transitionScheduleMetadata(
                  metadata,
                  request.scheduleConstraints,
                  request.qualityContractTransition,
                )
              : metadata;
          const contract = parsePlanQualityContract(
            candidateMetadata.qualityContract,
          );
          const qualityInput = display.map((w) => ({
            ...w,
            durationSeconds: w.summary?.durationSeconds,
          }));
          const rollingStart =
            source.planningMode === 'ROLLING' && !schedule
              ? this.rolling.validateStart(request.rolling, startDate, display)
              : undefined;
          if (source.planningMode !== 'ROLLING' && request.rolling)
            fail('Automatic policy requires a rolling plan');
          const candidateWeeks =
            source.periodWeeks ??
            Math.max(1, ...display.map((w) => w.weekIndex));
          const quality =
            source.planningMode === 'ROLLING'
              ? assessRollingPlanQuality(qualityInput, contract)
              : assessPlanQuality(
                  source.periodWeeks,
                  display.map((w) => ({
                    ...w,
                    durationSeconds: w.summary?.durationSeconds,
                  })),
                  schedule && contract
                    ? {
                        ...contract,
                        allowedDays: undefined,
                        maxDailyMinutes: undefined,
                        maxTrainingDaysPerWeek: undefined,
                      }
                    : contract,
                );
          if (!quality.valid)
            throw new UnprocessableEntityException({
              code: 'PLAN_QUALITY_INVALID',
              issues: quality.issues,
            });
          const scheduled = display.map((w, i) => ({
            id: String(i),
            dayOffset: (w.weekIndex - 1) * 7 + w.dayIndex - 1,
            sessionIndex: w.sessionIndex ?? 1,
            status: candidate[i].sourceWorkoutId
              ? byId.get(candidate[i].sourceWorkoutId!)!.status
              : 'PLANNED',
            sportType: w.sportType ?? 'UNKNOWN',
            durationSeconds: w.summary?.durationSeconds ?? null,
          }));
          const changedWorkoutIds = scheduled
            .filter(
              (w, i) =>
                !schedule ||
                candidate[i].candidateKey ||
                request.changes.some(
                  (c) => c.sourceWorkoutId === candidate[i].sourceWorkoutId,
                ) ||
                (request.scheduleConstraints &&
                  candidate[i].sourceWorkoutId &&
                  !protectedReason(byId.get(candidate[i].sourceWorkoutId!)!) &&
                  inRange(
                    byId
                      .get(candidate[i].sourceWorkoutId!)!
                      .scheduledDate?.toISOString()
                      .slice(0, 10),
                  )),
            )
            .map((w) => w.id);
          const scheduleInput = {
            planningMode: source.planningMode,
            periodWeeks: source.periodWeeks,
            workouts: scheduled,
            changedWorkoutIds,
            startDate,
            constraints: constraints ?? undefined,
            qualityContract: contract,
            projectDates: true,
            scheduleRuleMetadata: candidateMetadata,
          };
          const report = assessPlanSchedule(scheduleInput);
          const calendarAssessment =
            await this.calendarValidation.assertCandidate(
              {
                ...scheduleInput,
                userId,
                planId: source.id,
                ...(range
                  ? { validationRange: { from: range.from, until: range.to } }
                  : {}),
              },
              tx,
            );
          if (!report.valid)
            throw new UnprocessableEntityException({
              code: 'PLAN_SCHEDULE_INVALID',
              issues: report.issues,
            });
          const calendarDraftStartDate =
            source.planningMode === 'ROLLING'
              ? (range?.from ?? startDate)
              : startDate;
          const calendarDisplay =
            source.planningMode === 'ROLLING'
              ? display.flatMap((w) => {
                  const date = addCalendarDays(
                    startDate,
                    (w.weekIndex - 1) * 7 + w.dayIndex - 1,
                  );
                  if (range && (date < range.from || date > range.to))
                    return [];
                  const offset = Math.round(
                    (new Date(date).getTime() -
                      new Date(calendarDraftStartDate).getTime()) /
                      86400000,
                  );
                  return [
                    {
                      ...w,
                      weekIndex: Math.floor(offset / 7) + 1,
                      dayIndex: (offset % 7) + 1,
                    },
                  ];
                })
              : display;
          const presentation: PlanProposalPresentation = {
            calendarDraftStartDate,
            ...(rollingStart ? { rolling: rollingStart } : {}),
            scheduleRulePeriods: scheduleRulePeriods(
              candidateMetadata,
              range?.from ?? startDate,
              range?.to ?? addCalendarDays(startDate, candidateWeeks * 7 - 1),
            ),
            ...(contract ? { qualityContract: contract } : {}),
            relatedCalendarConflicts: calendarAssessment.relatedConflicts,
            title: source.title,
            summary: request.rationale,
            mode: request.mode,
            startDate,
            calendarTimeZone,
            ...(range ? { range } : {}),
            ...(constraints ? { scheduleConstraints: constraints } : {}),
            calendarDraft: {
              title: source.title,
              periodWeeks:
                source.planningMode === 'ROLLING'
                  ? Math.max(1, ...calendarDisplay.map((w) => w.weekIndex))
                  : candidateWeeks,
              workouts: calendarDisplay,
            },
            facts: request.evidenceRefs ?? [],
            counts: {
              total: candidate.length,
              changed: request.changes.length,
              preserved: preserved.length,
              skipped: 0,
              protected: preserved.filter(
                (p) => !!protectedReason(byId.get(p.sourceWorkoutId)!),
              ).length,
              added: request.additions.length,
              deleted: request.deletions.length,
            },
            syncImpact: '',
            rows: [
              ...candidate.map((item) => {
                const w = item.workout;
                const date = new Date(`${startDate}T00:00:00Z`);
                date.setUTCDate(
                  date.getUTCDate() + (w.weekIndex - 1) * 7 + w.dayIndex - 1,
                );
                return {
                  ...(item.sourceWorkoutId &&
                  !inRange(
                    byId
                      .get(item.sourceWorkoutId)!
                      .scheduledDate?.toISOString()
                      .slice(0, 10),
                  )
                    ? { protectedReason: 'OUTSIDE_RANGE' }
                    : {}),
                  ...(item.sourceWorkoutId &&
                  protectedReason(byId.get(item.sourceWorkoutId)!)
                    ? {
                        protectedReason: protectedReason(
                          byId.get(item.sourceWorkoutId)!,
                        )!,
                      }
                    : {}),
                  workoutId: item.sourceWorkoutId,
                  name: w.name ?? w.sportType,
                  sportType: w.sportType,
                  scheduledDate: date.toISOString().slice(0, 10),
                  disposition:
                    item.candidateKey ||
                    request.changes.some(
                      (c) => c.sourceWorkoutId === item.sourceWorkoutId,
                    )
                      ? ('APPLY' as const)
                      : ('PRESERVE' as const),
                  changeKind: item.candidateKey
                    ? ('ADDED' as const)
                    : request.changes.some(
                          (c) => c.sourceWorkoutId === item.sourceWorkoutId,
                        )
                      ? ('CHANGED' as const)
                      : ('PRESERVED' as const),
                  before: item.candidateKey
                    ? '—'
                    : normalizedById.get(item.sourceWorkoutId!)!.text,
                  after: w.text ?? '—',
                  rationale: request.rationale,
                };
              }),
              ...request.deletions.map((item) => {
                const w = normalizedById.get(item.sourceWorkoutId)!;
                const date = new Date(`${startDate}T00:00:00Z`);
                date.setUTCDate(
                  date.getUTCDate() + (w.weekIndex - 1) * 7 + w.dayIndex - 1,
                );
                return {
                  workoutId: item.sourceWorkoutId,
                  name: w.name ?? w.sportType,
                  sportType: w.sportType,
                  scheduledDate: date.toISOString().slice(0, 10),
                  disposition: 'APPLY' as const,
                  changeKind: 'DELETED' as const,
                  before: w.text,
                  after: '—',
                  rationale: request.rationale,
                };
              }),
            ],
            warnings: [],
          };
          const proposal: CanonicalStartProposal = {
            mode: request.mode,
            planId: source.id,
            ...(binding
              ? { binding, conversationRevision: session!.planStartRevision }
              : {
                  automationJobId: automation!.jobId,
                  automationMonthStrategyIds:
                    await this.rolling.weekDependencies(
                      source.id,
                      (
                        await this.assertAutomationJob(
                          automation!.jobId,
                          automation!.claimToken,
                          tx,
                        )
                      ).policyId,
                      isoWeekStart(
                        (request as PlanSchedulePreviewRequest).range.from,
                      ),
                      tx,
                    ),
                }),
            startDate,
            calendarTimeZone,
            sourceFingerprint: this.fingerprint(source),
            factFingerprint: await this.facts(
              userId,
              source.id,
              source.planningMode === 'ROLLING' && range
                ? range.from
                : startDate,
              source.planningMode === 'ROLLING' && range
                ? Math.max(
                    1,
                    Math.ceil(
                      (new Date(range.to).getTime() -
                        new Date(range.from).getTime() +
                        86400000) /
                        (7 * 86400000),
                    ),
                  )
                : candidateWeeks,
              tx,
            ),
            sourceWorkouts: source.workouts.map((w) => ({
              id: w.id,
              revision: w.revision,
            })),
            request: json(request),
            candidate,
            preserved,
            presentation,
          };
          await this.invalidate(userId, source.id, tx);
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
          const preview = await tx.planProposalPreview.create({
            data: {
              userId,
              sourcePlanId: source.id,
              mode: request.mode,
              request: json(request) as Prisma.InputJsonValue,
              proposal: json(proposal) as unknown as Prisma.InputJsonValue,
              sourceSnapshot: {
                sourceFingerprint: proposal.sourceFingerprint,
                factFingerprint: proposal.factFingerprint,
                ...(binding
                  ? { binding }
                  : { automationJobId: automation!.jobId }),
              },
              presentation: json(presentation) as Prisma.InputJsonValue,
              expiresAt,
            },
          });
          if (automation)
            await tx.rollingPlanJob.update({
              where: { id: automation.jobId },
              data: { previewId: preview.id },
            });
          return {
            kind: 'plan_proposal_preview',
            previewId: preview.id,
            mode: request.mode,
            expiresAt: expiresAt.toISOString(),
            decisionType: schedule ? 'PLAN_SCHEDULE' : 'PLAN_START',
            decisionPayload: {
              planId: source.id,
              previewId: preview.id,
              presentation,
            },
            presentation,
          };
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      ),
    );
  }

  private assertAutomationSettings(
    request: PlanStartPreviewRequest | PlanSchedulePreviewRequest,
  ) {
    if (
      request.scheduleConstraints !== undefined ||
      request.qualityContractTransition !== undefined ||
      request.rolling !== undefined
    )
      fail('Automatic candidates cannot change user settings');
  }

  private assertAutomationSports(
    settings: unknown,
    workouts: Array<{ sportType?: string }>,
  ) {
    const sports = (settings as { sportTypes?: unknown })?.sportTypes;
    if (
      !Array.isArray(sports) ||
      !sports.length ||
      workouts.some((w) => !sports.includes(w.sportType ?? 'UNKNOWN'))
    )
      fail('Automatic workout is outside the authorized sports');
  }

  private async assertAutomationJob(
    jobId: string,
    claimToken: string,
    tx: PlanDb,
  ) {
    const job = await tx.rollingPlanJob.findUnique({
      where: { id: jobId },
      include: { plan: true, policy: true },
    });
    if (!job) fail('Automation job not found');
    await acquireHashtextAdvisoryXactLock(tx, job.plan.userId);
    if (
      job.state !== 'RUNNING' ||
      job.claimToken !== claimToken ||
      !job.leaseUntil ||
      job.leaseUntil.getTime() <= Date.now() ||
      job.plan.planningMode !== 'ROLLING' ||
      job.plan.status !== 'ACTIVE' ||
      job.policy.revokedAt ||
      job.policy.planId !== job.planId ||
      job.policy.userId !== job.plan.userId ||
      !['WEEK', 'ADJUST'].includes(job.kind)
    )
      fail('Automation lease or current policy is no longer valid');
    const current = await tx.planAutomationPolicy.findFirst({
      where: { planId: job.planId, revokedAt: null },
    });
    if (current?.id !== job.policyId) fail('Automation policy was superseded');
    const settings = job.policy.settings as Record<string, unknown>;
    if (
      settings.autoGenerateWeeks !== true ||
      (job.kind === 'ADJUST' && settings.autoAdjustFuture !== true)
    )
      fail('Automatic operation is outside the authorized scope');
    if (!this.automationAccess)
      fail('Automation access provider is unavailable');
    await this.automationAccess.assertAllowed(job.plan.userId, tx);
    return job;
  }

  /** Server-only execution port. HTTP/model tools never receive this capability. */
  async applyAutomation(jobId: string, claimToken: string) {
    const result = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const previous = await tx.rollingPlanJob.findUnique({
            where: { id: jobId },
          });
          if (
            previous?.state === 'APPLIED' &&
            previous.claimToken === claimToken
          )
            return previous.receipt;
          const job = await this.assertAutomationJob(jobId, claimToken, tx);
          if (!job.previewId) fail('Automation job has no validated candidate');
          const preview = await tx.planProposalPreview.findUnique({
            where: { id: job.previewId },
          });
          if (
            !preview ||
            preview.userId !== job.plan.userId ||
            preview.sourcePlanId !== job.planId ||
            preview.decisionId ||
            preview.appliedAt ||
            preview.expiresAt.getTime() <= Date.now()
          )
            fail('Automation candidate is invalid or expired');
          const proposal =
            preview.proposal as unknown as CanonicalStartProposal;
          if (
            proposal.mode !== 'SCHEDULE' ||
            proposal.automationJobId !== job.id ||
            proposal.binding
          )
            fail('Automation cannot consume a user-confirmation proposal');
          this.assertAutomationSettings(proposal.request);
          const changed = new Set(
            proposal.request.changes.map((c) => c.sourceWorkoutId),
          );
          this.assertAutomationSports(
            job.policy.settings,
            proposal.candidate
              .filter((c) => c.candidateKey || changed.has(c.sourceWorkoutId!))
              .map((c) => c.workout),
          );
          const range = (proposal.request as PlanSchedulePreviewRequest).range;
          const weekStart = job.windowStart.toISOString().slice(0, 10);
          if (
            isoWeekStart(range.from) !== weekStart ||
            range.to !== addCalendarDays(weekStart, 6)
          )
            fail('Automated schedule must cover the actual remaining ISO week');
          const dependencies = await this.rolling.weekDependencies(
            job.planId,
            job.policyId,
            weekStart,
            tx,
          );
          if (hash(dependencies) !== hash(proposal.automationMonthStrategyIds))
            fail('Month strategy changed after assessment');
          const receipt = await this.applyCandidate(
            { userId: job.plan.userId, contextPlanId: job.planId, tx },
            proposal,
            true,
          );
          const generation =
            job.kind === 'WEEK'
              ? await this.rolling.publishWeek(
                  {
                    planId: job.planId,
                    policyId: job.policyId,
                    weekStart,
                    from: range.from,
                    evidenceRevision: proposal.factFingerprint,
                    strategyIds: dependencies,
                    receipt,
                  },
                  tx,
                )
              : undefined;
          const context = await tx.coachContext.findUniqueOrThrow({
            where: { planId: job.planId },
          });
          const commit = await tx.coachCommit.create({
            data: {
              contextId: context.id,
              commitMessage: 'Automatic rolling plan schedule applied',
            },
          });
          const fullReceipt = {
            ...receipt,
            ...(generation ? { rolling: generation } : {}),
            commitId: commit.id,
            policyRevision: job.policy.revision,
            jobId: job.id,
          };
          await tx.planProposalPreview.update({
            where: { id: preview.id },
            data: { appliedAt: new Date() },
          });
          await this.assertAutomationJob(job.id, claimToken, tx);
          await tx.rollingPlanJob.update({
            where: { id: job.id },
            data: {
              state: 'APPLIED',
              receipt: json(fullReceipt) as Prisma.InputJsonValue,
            },
          });
          return fullReceipt;
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      ),
    );
    const job = await this.prisma.rollingPlanJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { plan: true },
    });
    await this.plans.notifyWorkoutChanges(job.plan.userId, job.planId);
    return result;
  }

  async apply(
    args: {
      userId: string;
      decisionId: string;
      branchId: string;
      contextPlanId: string;
      tx: PlanDb;
    },
    proposal: CanonicalStartProposal,
  ) {
    return this.applyCandidate(args, proposal);
  }

  private async applyCandidate(
    args: {
      userId: string;
      decisionId?: string;
      branchId?: string;
      contextPlanId: string;
      tx: PlanDb;
    },
    proposal: CanonicalStartProposal,
    automation = false,
  ) {
    const tx = args.tx;
    if (!automation) {
      const session = await this.assertBinding(
        args.userId,
        proposal.planId,
        { sid: proposal.binding.sid, branchId: proposal.binding.branchId },
        tx,
        proposal.mode === 'START' ? proposal.startDate : undefined,
        proposal.mode === 'SCHEDULE',
      );
      if (
        session.planStartRevision !== proposal.conversationRevision ||
        args.branchId !== proposal.binding.branchId ||
        args.contextPlanId !== proposal.planId
      )
        fail('Start conversation changed; reassess the start');
    }
    const schedule = proposal.mode === 'SCHEDULE';
    const source = await this.source(
      args.userId,
      proposal.planId,
      tx,
      false,
      schedule,
      schedule
        ? (proposal.request as PlanSchedulePreviewRequest).range
        : undefined,
    );
    if (
      schedule &&
      (proposal.request as PlanSchedulePreviewRequest).range.from <
        this.earliestStartDate(proposal.calendarTimeZone)
    )
      fail('The schedule range is now historical; reassess');
    if (this.fingerprint(source) !== proposal.sourceFingerprint)
      fail('Source plan or a preserved workout changed after preview');
    const timezone =
      this.constraints(proposal.request.scheduleConstraints)
        ?.calendarTimeZone ??
      this.constraints(
        (source.generationMetadata as Record<string, unknown> | null)
          ?.scheduleConstraints,
      )?.calendarTimeZone ??
      (await this.users.getPreferredTimezone(args.userId, tx)) ??
      'UTC';
    if (!schedule) this.assertFutureStart(proposal.startDate, timezone);
    if (
      timezone !== proposal.calendarTimeZone ||
      (await this.facts(
        args.userId,
        source.id,
        source.planningMode === 'ROLLING' && schedule
          ? (proposal.request as PlanSchedulePreviewRequest).range.from
          : proposal.startDate,
        source.planningMode === 'ROLLING' && schedule
          ? Math.max(
              1,
              Math.ceil(
                (new Date(
                  (proposal.request as PlanSchedulePreviewRequest).range.to,
                ).getTime() -
                  new Date(
                    (proposal.request as PlanSchedulePreviewRequest).range.from,
                  ).getTime() +
                  86400000) /
                  (7 * 86400000),
              ),
            )
          : (source.periodWeeks ??
              Math.max(
                1,
                ...proposal.candidate.map((c) => c.workout.weekIndex),
              )),
        tx,
      )) !== proposal.factFingerprint
    )
      fail('Training facts or calendar timezone changed; reassess the start');
    const meta = {
      source: 'ai' as const,
      action: automation
        ? 'automation_apply_plan_schedule'
        : schedule
          ? 'decision_apply_plan_schedule'
          : 'decision_apply_plan_start',
      decisionId: args.decisionId,
      branchId: args.branchId,
    };
    const changed = new Set(
      proposal.request.changes.map((c) => c.sourceWorkoutId),
    );
    const input: UpdatePlanDto = {
      workouts: proposal.candidate
        .filter((c) => c.candidateKey || changed.has(c.sourceWorkoutId!))
        .map((c) => ({
          ...c.workout,
          id: c.sourceWorkoutId,
        })) as UpdatePlanDto['workouts'],
      deletedWorkoutIds: proposal.request.deletions.map(
        (d) => d.sourceWorkoutId,
      ),
      scheduleConstraints: proposal.request.scheduleConstraints,
      qualityContractTransition: proposal.request.qualityContractTransition,
    };
    if (!input.workouts?.length) delete input.workouts;
    await this.plans.updatePlan(args.userId, source.id, input, meta, { tx });
    if (!schedule)
      await this.plans.activatePlan(
        args.userId,
        source.id,
        proposal.startDate,
        meta,
        {
          tx,
          validatedStartPreview: true,
          calendarTimeZone: proposal.calendarTimeZone,
        },
      );
    const readback = await this.storage.readback(
      source.id,
      tx,
      schedule
        ? (proposal.request as PlanSchedulePreviewRequest).range
        : undefined,
    );
    if (
      readback.status !== (schedule ? source.status : 'ACTIVE') ||
      (!schedule &&
        readback.activationTimezone !== proposal.calendarTimeZone) ||
      readback.startDate?.toISOString().slice(0, 10) !== proposal.startDate ||
      readback.workouts.length !== proposal.candidate.length
    )
      fail('Start readback failed');
    if (
      proposal.request.deletions.some((d) =>
        readback.workouts.some((w) => w.id === d.sourceWorkoutId),
      )
    )
      fail('Deleted workout readback failed');
    const normalizedReadback = normalizePlanRow(readback, {
      workoutService: this.workout,
      workoutDefinitionService: this.definitions,
      workoutPersistence: this.persistence,
    })!;
    const expectedConstraints =
      proposal.request.scheduleConstraints ??
      (source.generationMetadata as Record<string, unknown> | null)
        ?.scheduleConstraints;
    const actualMetadata = (readback.generationMetadata ?? {}) as Record<
      string,
      unknown
    >;
    if (
      hash(actualMetadata.scheduleConstraints ?? null) !==
      hash(expectedConstraints ?? null)
    )
      fail('Start constraints readback failed');
    const expectedContract =
      proposal.request.qualityContractTransition &&
      proposal.request.scheduleConstraints
        ? parsePlanQualityContract(
            transitionScheduleMetadata(
              source.generationMetadata,
              proposal.request.scheduleConstraints,
              proposal.request.qualityContractTransition,
            ).qualityContract,
          )
        : parsePlanQualityContract(
            (source.generationMetadata as Record<string, unknown> | null)
              ?.qualityContract,
          );
    if (
      hash(parsePlanQualityContract(actualMetadata.qualityContract) ?? {}) !==
      hash(expectedContract ?? {})
    )
      fail('Start quality contract readback failed');
    const identityMap = proposal.candidate.map((c) => {
      const offset = (c.workout.weekIndex - 1) * 7 + c.workout.dayIndex - 1;
      const row = c.sourceWorkoutId
        ? readback.workouts.find((w) => w.id === c.sourceWorkoutId)
        : readback.workouts.find(
            (w) =>
              w.dayOffset === offset &&
              w.sessionIndex === (c.workout.sessionIndex ?? 1),
          );
      const expected = new Date(`${proposal.startDate}T00:00:00Z`);
      expected.setUTCDate(expected.getUTCDate() + offset);
      if (
        !row ||
        (!c.sourceWorkoutId && source.workouts.some((w) => w.id === row.id)) ||
        row.dayOffset !== offset ||
        row.sessionIndex !== (c.workout.sessionIndex ?? 1) ||
        row.scheduledDate?.getTime() !== expected.getTime()
      )
        fail('Start workout identity/date readback failed');
      const actual = normalizedReadback.workouts!.find(
        (w) => w.id === row!.id,
      )!;
      const expectedDefinition = this.definitions.resolve(
        c.workout.definition!,
      );
      if (
        hash({
          ...actual.structure,
          ...(actual.structure.kind === 'FREEFORM'
            ? { durationSeconds: actual.structure.durationSeconds ?? null }
            : {}),
        }) !==
          hash({
            ...expectedDefinition.structure,
            ...(expectedDefinition.kind === 'FREEFORM'
              ? {
                  durationSeconds:
                    (
                      expectedDefinition.structure as {
                        durationSeconds?: number | null;
                      }
                    ).durationSeconds ?? null,
                }
              : {}),
          }) ||
        actual.sportType !== c.workout.sportType ||
        actual.name !== (c.workout.name ?? null) ||
        actual.notes !== (c.workout.notes ?? null) ||
        actual.plannedSessionRpe !== (c.workout.plannedSessionRpe ?? null)
      )
        fail('Start workout definition readback failed');
      const prior = proposal.sourceWorkouts.find(
        (w) => w.id === c.sourceWorkoutId,
      );
      if (
        prior &&
        row.revision !== prior.revision + (changed.has(prior.id) ? 1 : 0)
      )
        fail('Start workout revision readback failed');
      return {
        sourceWorkoutId: c.sourceWorkoutId ?? null,
        candidateKey: c.candidateKey ?? null,
        workoutId: row.id,
        scheduledDate: expected.toISOString().slice(0, 10),
        revision: row.revision,
      };
    });
    const rollingReceipt =
      source.planningMode === 'ROLLING' && !schedule
        ? await this.rolling.publishStart(
            {
              userId: args.userId,
              planId: source.id,
              decisionId: args.decisionId,
              startDate: proposal.startDate,
              settings: parseRollingStartSettings(
                proposal.request.rolling,
                proposal.startDate,
              ),
              evidenceRevision: proposal.factFingerprint,
              receipt: {
                executionSource: 'USER_CONFIRMATION',
                readbackVerified: true,
              },
            },
            tx,
          )
        : undefined;
    return {
      ...(rollingReceipt ? { rolling: rollingReceipt } : {}),
      planId: source.id,
      createdPlanId: null as string | null,
      changedWorkoutCount: changed.size,
      addedWorkoutCount: proposal.request.additions.length,
      deletedWorkoutCount: proposal.request.deletions.length,
      preservedWorkoutCount: proposal.preserved.length,
      workoutIds: readback.workouts.map((w) => w.id),
      startDate: proposal.startDate,
      calendarTimeZone: proposal.calendarTimeZone,
      identityMap,
      readbackVerified: true,
      executionSource: automation ? 'AUTOMATION_POLICY' : 'USER_CONFIRMATION',
      qualityContract: expectedContract ?? null,
      scheduleConstraints: expectedConstraints ?? null,
      ...(schedule
        ? {
            range: (proposal.request as PlanSchedulePreviewRequest).range,
            protectedWorkoutCount: proposal.presentation.counts.protected ?? 0,
          }
        : {}),
    };
  }
}
