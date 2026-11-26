import { findConsumedTemplatePlan } from '@/api/plan-template/persistence/plan-template-preview.repository';
import type { WorkoutStructure } from '@shared/workout-structure';
import { RollingPlanAuthorizationService } from './rolling-plan-authorization.service';
import { RollingPlanService } from './rolling-plan.service';
import { isoWeekStart, parseRollingStartSettings } from '@shared/rolling-plan';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { HealthDataRepository } from '@/health-data/persistence/health-data.repository';
import { UserQueryService } from '@/api/user/user-query.service';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { ConflictException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlanWorkoutInputDto } from '../dto/create-plan.dto';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import {
  PlanStartRepository,
  sourceInclude,
  type Source,
} from '../persistence/plan-start.repository';
import { CalendarAdjustmentSyncWorker } from './calendar-adjustment-sync.worker';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PlanProposalPreview } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { UserService } from '@/api/user/user.service';
import { WorkoutService, type WorkoutPlanStepDraft } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { PlanService } from '../plan.service';
import type { PlanDb } from '../persistence/plan-db';
import {
  CalendarAdjustmentState,
  type CalendarAdjustment,
  type CalendarAdjustmentReceipt,
  PlanCalendarMoveState,
  type PlanStartPreviewRequest,
  type PlanSchedulePreviewRequest,
  type PlanProposalPreviewResult,
  type PlanProposalPresentation,
  type PlanStartWorkoutDraft,
  type PlanCalendarMoveInput,
  type PlanCalendarMovePreview,
  type PlanCalendarMoveRefreshResult,
  type PlanCalendarMoveReceipt,
  type PlanCalendarCoachSession,
} from '@shared/plan-proposal';
import {
  safeParseCoachDecisionConfirmationPayload,
  type CoachPlanDraftWorkout,
} from '@shared/ai-coach-schema';
import {
  assessPlanSchedule,
  addCalendarDays,
  calendarIsoWeekday,
  isCalendarDate,
  officialPlanTargetRaceDate,
  parseScheduleConstraints,
  transitionScheduleMetadata,
  scheduleRulePeriods,
} from '@shared/plan-calendar';
import {
  assessRollingPlanQuality,
  parsePlanAssessment,
  parsePlanQualityContract,
} from '@shared/plan-quality';
import { normalizePlanRow, normalizePlanWorkoutRow } from './plan-row.mapper';
import { assessCalendarMoveImpact, calendarWeekTotals } from './plan-calendar-move-impact';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PlanCalendarValidationService } from './plan-calendar-validation.service';
import { workoutImmutabilityReason } from './plan-workout-mutability.policy';
import type { UpdatePlanDto } from '../dto/update-plan.dto';
import type { ReviseCalendarAdjustmentDto, SaveCalendarAdjustmentDto, RebaseCalendarAdjustmentDto } from '../dto/apply-calendar-edits.dto';

// Persistence assigns exercise/set IDs; compare the prescription independently of those identities.
function workoutStructureKey(value: WorkoutStructure, workout?: WorkoutService) {
  if (value.kind === 'ENDURANCE' && workout) {
    // The database stores ordered steps, coalescing adjacent blocks on readback.
    const comparableStep = (step: WorkoutPlanStepDraft): WorkoutPlanStepDraft => {
      const children = step.children?.map(comparableStep);
      if (step.targetResolutionMode !== 'DYNAMIC_ZONE') return { ...step, children };
      // Dynamic targets are prescribed by zone; their numeric projection can be unavailable.
      return {
        ...step,
        children,
        targetValueLow: null,
        targetValueHigh: null,
        targetUnit: null,
        targetZoneLabel: null,
        targetZoneSystem: null,
        targetZoneSource: null,
        targetZoneBasis: null,
        targetZoneSystemKey: null,
        targetZoneFingerprint: null,
        intensityIntent: step.intensityIntent ?? workout.inferIntensityIntent(step),
      };
    };
    const steps = workout.assignNewPrescriptionModes(workout.buildWorkoutPlanSteps(value.blocks));
    return hash(steps.map(comparableStep));
  }
  if (value.kind === 'STRENGTH')
    return hash({
      ...value,
      exercises: value.exercises.map(({ id: _exerciseId, ...exercise }) => ({
        ...exercise,
        setGroups: exercise.setGroups.map(({ id: _setId, ...group }) => group),
      })),
    });
  return hash({
    ...value,
    ...(value.kind === 'FREEFORM'
      ? { durationSeconds: value.durationSeconds ?? null }
      : {}),
  });
}

export type PlanStartBinding = {
  sid: string;
  branchId: string;
  userMessageId?: string;
};
type CalendarMoveIntent = PlanCalendarMoveInput & {
  planId: string;
  workoutId: string;
};
type CalendarMoveOrigin = { workoutId: string; from: string; to: string };
type CalendarEdit = SaveCalendarAdjustmentDto['edits'][number] & { plannedSessionRpe?: number };
type CalendarAdjustmentIntent = {
  planId: string;
  adjustment: {
    id: string;
    versionId: string;
    number: number;
    edits: CalendarEdit[];
    mutationHash?: string;
    validateOnly?: boolean;
  };
};
const calendarEditKey = (edit: CalendarEdit) =>
  edit.kind === 'ADD' ? `candidate:${edit.candidateKey}` : edit.workoutId!;

type CalendarRevisionIntent = { planId: string; previewId: string; revision: ReviseCalendarAdjustmentDto };
class CalendarMoveRefreshBlocked extends Error {
  constructor(
    readonly status: Exclude<PlanCalendarMoveRefreshResult['status'], 'refreshed'>,
  ) {
    super(status);
  }
}
const CALENDAR_MOVE_SESSION_PREFIX = 'calendar-move:';

export function isCalendarMoveSession(sid: string) {
  return sid.startsWith(CALENDAR_MOVE_SESSION_PREFIX);
}

function calendarAdjustmentReadRange(range: { from: string; to: string }) {
  return {
    from: addCalendarDays(isoWeekStart(range.from), -1),
    to: addCalendarDays(isoWeekStart(range.to), 7),
  };
}

function calendarMoveReadRange(move: CalendarMoveOrigin, range?: { from: string; to: string }) {
  const dates = [move.from, move.to, ...(range ? [range.from, range.to] : [])].sort();
  return {
    from: addCalendarDays(isoWeekStart(dates[0]), -1),
    to: addCalendarDays(isoWeekStart(dates.at(-1)!), 7),
  };
}

function calendarMoveState(
  preview: { expiresAt: Date; appliedAt: Date | null },
  proposal: CanonicalStartProposal,
): PlanCalendarMoveState {
  if (preview.appliedAt) return PlanCalendarMoveState.Applied;
  if (proposal.calendarMoveCancelled) return PlanCalendarMoveState.Cancelled;
  if (proposal.calendarMoveInvalidated) return PlanCalendarMoveState.Invalidated;
  return preview.expiresAt.getTime() <= Date.now()
    ? PlanCalendarMoveState.Expired
    : PlanCalendarMoveState.Pending;
}
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

function calendarWeekComparisonHash(weeks: PlanProposalPresentation['calendarAdjustmentWeeks']) {
  // Summing decimal load estimates in a different order can change the floating-point tail.
  const normalize = (total: NonNullable<typeof weeks>[number]['before']) => ({
    ...total,
    estimatedLoad: total.estimatedLoad?.toFixed(8) ?? null,
  });
  return hash(weeks?.map((week) => ({
    ...week,
    before: normalize(week.before),
    after: normalize(week.after),
  })));
}

export type CanonicalStartProposal = {
  mode: 'START' | 'SCHEDULE';
  planId: string;
  binding?: PlanStartBinding;
  conversationRevision?: number;
  automationJobId?: string;
  automationMonthStrategyIds?: string[];
  calendarMove?: CalendarMoveOrigin;
  calendarMoveReceipt?: PlanCalendarMoveReceipt;
  calendarMoveCancelled?: true;
  calendarMoveInvalidated?: true;
  calendarMoveRefreshedForCoach?: true;
  calendarMoveConfirmationId?: string;
  calendarMoveIncludesCoachChanges?: true;
  calendarMoveManuallyRevised?: true;
  calendarEditHash?: string;
  calendarAdjustmentEdits?: CalendarEdit[];
  calendarAdjustmentMutationHash?: string;
  calendarAdjustmentReadRange?: { from: string; to: string };
  calendarAdjustmentFingerprint?: string;
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
    @Optional() private readonly adjustmentSync?: CalendarAdjustmentSyncWorker,
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

  private async calendarAdjustmentFingerprint(
    source: Source, range: { from: string; to: string },
    presentation: PlanProposalPresentation, tx: PlanDb,
  ) {
    const weeks = new Set(presentation.rows.flatMap((row) =>
      row.changeKind && row.changeKind !== 'PRESERVED'
        ? [row.beforeScheduledDate, row.scheduledDate].filter(isCalendarDate).map(isoWeekStart)
        : [],
    ));
    const inAffectedWeek = (date: Date | null) =>
      Boolean(date && weeks.has(isoWeekStart(date.toISOString().slice(0, 10))));
    const outsidePlan = await this.storage.calendar(source.userId, source.id, new Date(range.from), new Date(range.to), tx);
    const workouts = source.workouts.filter((w) => inAffectedWeek(w.scheduledDate));
    const sports = [...new Set(presentation.rows.filter((row) => row.changeKind !== 'PRESERVED')
      .map((row) => row.sportType).filter((sport): sport is 'RUN' | 'CYCLING' | 'SWIM' =>
        sport === 'RUN' || sport === 'CYCLING' || sport === 'SWIM'))].sort();
    return hash({
      schedule: this.fingerprint({ ...source, workouts }),
      loads: workouts.map((w) => w.estimatedLoad),
      thresholds: await Promise.all(sports.map((sport) => this.loads.loadThresholdsForUser(source.userId, sport, tx))),
      external: outsidePlan.filter((w) => inAffectedWeek(w.scheduledDate)),
    });
  }

  async automationEvidence(
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
          value: true,
          unit: true,
          semanticVersion: true,
          semanticHash: true,
        },
      }),
      tx.athleteMemoryFact.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          version: true,
          status: true,
          kind: true,
          category: true,
          claim: true,
          value: true,
          validFrom: true,
          validUntil: true,
          eventStart: true,
          eventEnd: true,
          confidence: true,
        },
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
    return {
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
    };
  }

  async automationSnapshot(
    userId: string,
    planId: string,
    from: string,
    through: string,
    tx: PlanDb,
  ) {
    const plan = await this.storage.source(planId, tx, {
      from: addCalendarDays(from, -90),
      to: through,
    });
    if (!plan || plan.userId !== userId) fail('ROLLING_PLAN_NOT_FOUND');
    const external = await this.automationEvidence(
      userId,
      planId,
      from,
      Math.ceil(
        (new Date(through).getTime() - new Date(from).getTime()) / 604800000,
      ) + 1,
      tx,
    );
    const externalWorkouts = plan.workouts
      .filter(
        (w) =>
          w.automationProtected ||
          !w.generationId ||
          w.status !== 'PLANNED' ||
          w.links.length,
      )
      .map((w) => ({
        id: w.id,
        revision: w.revision,
        status: w.status,
        date: w.scheduledDate,
        links: w.links,
        protected: w.automationProtected,
      }));
    return {
      plan,
      external,
      revision: hash({
        external: {
          ...external,
          activities: external.activities.map(
            ({ updatedAt: _auditClock, ...activity }) => ({
              ...activity,
              fitnessMetricsSnapshot: activity.fitnessMetricsSnapshot
                ? {
                    actualLoad: activity.fitnessMetricsSnapshot.actualLoad,
                    actualLoadSource:
                      activity.fitnessMetricsSnapshot.actualLoadSource,
                  }
                : null,
            }),
          ),
        },
        externalWorkouts,
        goal: plan.goal,
        metadata: plan.generationMetadata,
        startDate: plan.startDate,
      }),
    };
  }

  private async assertAutomationFacts(
    job: { receipt: unknown; planId: string; plan: { userId: string } },
    tx: PlanDb,
  ) {
    const receipt = job.receipt as {
      preparedRevision?: string;
      input?: { from: string; through: string };
    } | null;
    if (
      receipt?.preparedRevision &&
      receipt.input &&
      (
        await this.automationSnapshot(
          job.plan.userId,
          job.planId,
          receipt.input.from,
          receipt.input.through,
          tx,
        )
      ).revision !== receipt.preparedRevision
    )
      fail('ROLLING_FACTS_CHANGED');
  }

  private async facts(
    userId: string,
    planId: string,
    startDate: string,
    weeks: number,
    tx: PlanDb,
  ) {
    return hash(
      await this.automationEvidence(userId, planId, startDate, weeks, tx),
    );
  }

  async invalidate(
    userId: string,
    planId: string,
    tx: PlanDb,
    scope?: { sid?: string; branchId?: string },
  ) {
    const old = await tx.planProposalPreview.findMany({
      where: {
        userId,
        sourcePlanId: planId,
        mode: { in: ['START', 'SCHEDULE'] },
        appliedAt: null,
        calendarAdjustmentId: null,
      },
      select: { id: true, decisionId: true, proposal: true },
    });
    await this.expirePreviews(
      old.filter((row) => {
        const proposal = row.proposal as unknown as CanonicalStartProposal;
        if (proposal.calendarMove) return false;
        if (scope?.sid && proposal.binding?.sid !== scope.sid) return false;
        if (scope?.branchId && proposal.binding?.branchId !== scope.branchId)
          return false;
        return true;
      }),
      tx,
    );
  }

  private async expirePreviews(
    old: { id: string; decisionId: string | null }[],
    tx: PlanDb,
  ) {
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
        await this.invalidate(userId, id, tx, { sid });
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
    if (!exactCard) {
      if (isCalendarMoveSession(sid))
        await this.expireCalendarCoachPreviews(userId, planId, sid, tx);
      else await this.invalidate(userId, planId, tx, { sid });
    }
  }

  private async officialStartContext(userId: string, planId: string, tx: PlanDb) {
    const source = await this.source(userId, planId, tx, true);
    const template = source.sourceType === 'TEMPLATE' && source.planningMode === 'FIXED'
      ? await findConsumedTemplatePlan(tx, planId)
      : null;
    if (!template?.consumedAt || template.userId !== userId)
      fail('An official template draft is required');

    const metadata = source.generationMetadata as Record<string, unknown> | null;
    const constraints = this.constraints(metadata?.scheduleConstraints);
    const calendarTimeZone = constraints?.calendarTimeZone ??
      (await this.users.getPreferredTimezone(userId, tx)) ?? 'UTC';
    const earliestStartDate = this.earliestStartDate(calendarTimeZone);
    const preview = template.normalizedInput as { startDate?: unknown; requestedStartDate?: unknown } | null;
    const targetRaceDate = officialPlanTargetRaceDate(metadata);
    const fixedStartDate = targetRaceDate && source.periodWeeks
      ? addCalendarDays(targetRaceDate, 1 - source.periodWeeks * 7)
      : undefined;
    const suggestedDate = metadata?.officialDraftStartDate ?? preview?.startDate ?? preview?.requestedStartDate;
    const startDate = source.startDate?.toISOString().slice(0, 10) ??
      fixedStartDate ?? (isCalendarDate(suggestedDate) && suggestedDate >= earliestStartDate ? suggestedDate : earliestStartDate);
    const plan = normalizePlanRow(source, {
      workoutService: this.workout,
      workoutDefinitionService: this.definitions,
      workoutPersistence: this.persistence,
    })!;
    const revision = hash({ source: this.fingerprint(source), calendarTimeZone });
    return { source, plan, startDate, earliestStartDate, calendarTimeZone, targetRaceDate, constraints, revision };
  }

  async officialDraft(userId: string, planId: string) {
    return this.calendarTransaction(userId, async (tx) => {
      const { plan, startDate, earliestStartDate, calendarTimeZone, targetRaceDate, revision } =
        await this.officialStartContext(userId, planId, tx);
      return { plan, startDate, earliestStartDate, calendarTimeZone, targetRaceDate, revision };
    });
  }

  async saveOfficialStartDate(userId: string, planId: string, startDate: string, revision: string) {
    if (!isCalendarDate(startDate))
      throw new UnprocessableEntityException('Invalid calendar start date');
    return this.calendarTransaction(userId, async (tx) => {
      const current = await this.officialStartContext(userId, planId, tx);
      if (current.source.status !== 'DRAFT' || current.revision !== revision)
        throw new ConflictException('The draft changed. Review the latest calendar.');
      if (current.targetRaceDate && current.startDate !== startDate)
        fail('The plan start date is fixed by its target race');
      this.assertFutureStart(startDate, current.calendarTimeZone);
      if (current.startDate === startDate) return { startDate, revision };
      const metadata = current.source.generationMetadata;
      await this.storage.updatePlan(tx, {
        where: { id: planId },
        data: {
          generationMetadata: {
            ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
            officialDraftStartDate: startDate,
          } as Prisma.InputJsonObject,
        },
      });
      const updated = await this.officialStartContext(userId, planId, tx);
      return { startDate: updated.startDate, revision: updated.revision };
    });
  }

  async startOfficialDraft(userId: string, planId: string, startDate: string, revision: string) {
    if (!isCalendarDate(startDate))
      throw new UnprocessableEntityException('Invalid calendar start date');
    const result = await this.calendarTransaction(userId, async (tx) => {
      const { source, plan, calendarTimeZone, constraints, targetRaceDate, startDate: suggestedStart, revision: currentRevision } =
        await this.officialStartContext(userId, planId, tx);
      if (source.status === 'ACTIVE') {
        if (source.startDate?.toISOString().slice(0, 10) !== startDate)
          fail('An active plan cannot change its start date');
        return { plan, started: false };
      }
      if (revision !== currentRevision)
        throw new ConflictException({ code: 'PLAN_START_REASSESSMENT_REQUIRED', message: 'The draft changed. Review the latest calendar before starting.' });
      if (targetRaceDate && (suggestedStart !== startDate || !source.workouts.some(
        (workout) => workout.dayOffset === source.periodWeeks! * 7 - 1,
      ))) fail('The plan calendar must match its target race');
      this.assertFutureStart(startDate, calendarTimeZone);
      let qualityContract;
      try {
        qualityContract = parsePlanQualityContract(
          (source.generationMetadata as Record<string, unknown> | null)?.qualityContract,
        );
      } catch {
        throw new UnprocessableEntityException('Invalid plan quality contract');
      }
      const workouts = (plan.workouts ?? []).map((workout) => ({
        ...workout, durationSeconds: workout.summary.durationSeconds,
      }));
      const quality = await this.loads.assessPlanQualityForViewer(
        userId, source.periodWeeks!, workouts,
        qualityContract && { ...qualityContract, startDate }, tx,
      );
      if (!quality.valid)
        throw new UnprocessableEntityException({ code: 'PLAN_QUALITY_INVALID', data: { issues: quality.issues } });

      const schedule = assessPlanSchedule({
        workouts,
        changedWorkoutIds: workouts.map((workout) => workout.id), startDate,
        periodWeeks: source.periodWeeks, constraints, qualityContract, projectDates: true,
      });
      if (!schedule.valid)
        throw new UnprocessableEntityException({ code: 'PLAN_SCHEDULE_INVALID', data: { issues: schedule.issues } });

      const activated = await this.plans.activatePlan(
        userId, planId, startDate, { source: 'manual', action: 'official_template_start' },
        { tx, validatedStartPreview: true, calendarTimeZone },
      );
      await this.invalidate(userId, planId, tx);
      return { ...activated, started: true };
    });
    if (result.started) await this.plans.notifyWorkoutChanges(userId, planId);
    return { plan: result.plan };
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
          const draftAnchor = source.sourceType === 'AI' && source.status === 'DRAFT'
            ? (source.generationMetadata as { qualityContract?: { startDate?: unknown } } | null)?.qualityContract?.startDate
            : undefined;
          const suggestedDate = typeof draftAnchor === 'string' && isCalendarDate(draftAnchor)
            ? draftAnchor : earliestStartDate;
          const savedDate =
            selectedDate ?? prior?.planStartDate ?? suggestedDate;
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

  async previewCalendarMove(
    userId: string,
    planId: string,
    workoutId: string,
    input: PlanCalendarMoveInput,
  ): Promise<PlanCalendarMovePreview> {
    const preview = await this.preparePreview(userId, {
      ...input,
      planId,
      workoutId,
    });
    return this.readCalendarMove(userId, planId, preview.previewId);
  }

  async registerCoachCalendarAdjustment(
    previewId: string, decisionId: string, tx: PlanDb,
  ) {
    const row = await tx.planProposalPreview.findUniqueOrThrow({ where: { id: previewId } });
    if (row.mode !== 'SCHEDULE') return;
    const proposal = row.proposal as unknown as CanonicalStartProposal;
    if (proposal.request.mode !== 'SCHEDULE' || !this.proposalEdits(proposal).length ||
      proposal.request.scheduleConstraints || proposal.request.qualityContractTransition) return;
    const reference = proposal.request.calendarAdjustment;
    const head = reference
      ? await this.requireCurrentCalendarAdjustment(row.userId, row.sourcePlanId, reference, tx)
      : undefined;
    if (head && reference && !head.calendarAdjustmentId) {
      await tx.planProposalPreview.update({
        where: { id: head.id },
        data: { calendarAdjustmentId: reference.id, calendarVersion: 0 },
      });
    }
    await tx.planProposalPreview.update({
      where: { id: previewId },
      data: {
        calendarAdjustmentId: reference?.id ?? decisionId,
        calendarVersion: head ? (head.calendarVersion ?? 0) + 1 : 0,
      },
    });
    if (head?.decisionId) await this.expirePreviews([head], tx);
  }

  private async requireCurrentCalendarAdjustment(
    userId: string, planId: string,
    reference: NonNullable<PlanSchedulePreviewRequest['calendarAdjustment']>,
    tx: PlanDb,
  ) {
    const head = await this.calendarAdjustmentHead(userId, planId, reference.id, tx);
    if (!head || head.id !== reference.baseVersionId ||
      (await this.calendarAdjustmentView(reference.id, head, head, tx)).state !== CalendarAdjustmentState.Ready)
      fail('The calendar adjustment version changed');
    return head;
  }

  private async amendCalendarRequest(userId: string, request: PlanSchedulePreviewRequest, tx: PlanDb) {
    if (!request.calendarAdjustment) return request;
    if (request.scheduleConstraints || request.qualityContractTransition)
      fail('Calendar editing cannot change plan rules');
    const head = await this.requireCurrentCalendarAdjustment(userId, request.planId, request.calendarAdjustment, tx);
    const baseline = (head.proposal as unknown as CanonicalStartProposal).request;
    if (baseline.mode !== 'SCHEDULE' || baseline.scheduleConstraints || baseline.qualityContractTransition)
      fail('Calendar editing cannot change plan rules');
    const operations = new Map<string,
      | { change: PlanSchedulePreviewRequest['changes'][number] }
      | { deletion: PlanSchedulePreviewRequest['deletions'][number] }>();
    const additions = new Map(baseline.additions.map((addition) => [addition.candidateKey, addition]));
    for (const change of baseline.changes) operations.set(change.sourceWorkoutId, { change });
    for (const deletion of baseline.deletions) operations.set(deletion.sourceWorkoutId, { deletion });
    const touched = new Set<string>();
    for (const change of request.changes) {
      if (touched.has(change.sourceWorkoutId)) fail('Each source workout can only be edited once');
      touched.add(change.sourceWorkoutId);
      operations.set(change.sourceWorkoutId, { change });
    }
    for (const deletion of request.deletions) {
      if (touched.has(deletion.sourceWorkoutId)) fail('Each source workout can only be edited once');
      touched.add(deletion.sourceWorkoutId);
      operations.set(deletion.sourceWorkoutId, { deletion });
    }
    for (const addition of request.additions) {
      if (touched.has(addition.candidateKey)) fail('Each candidate can only be edited once');
      touched.add(addition.candidateKey);
      additions.set(addition.candidateKey, addition);
    }
    const values = [...operations.values()];
    return {
      ...request,
      range: {
        from: baseline.range.from < request.range.from ? baseline.range.from : request.range.from,
        to: baseline.range.to > request.range.to ? baseline.range.to : request.range.to,
      },
      changes: values.flatMap((operation) => 'change' in operation ? [operation.change] : []),
      deletions: values.flatMap((operation) => 'deletion' in operation ? [operation.deletion] : []),
      additions: [...additions.values()],
      preserved: undefined,
      preserveUnmentioned: true,
    };
  }

  private async calendarAdjustmentHead(userId: string, planId: string, id: string, tx: PlanDb) {
    const where = { userId, sourcePlanId: planId, mode: 'SCHEDULE' as const };
    const head = await tx.planProposalPreview.findFirst({
      where: { ...where, calendarAdjustmentId: id },
      orderBy: { calendarVersion: 'desc' },
      include: { decision: { select: { state: true } } },
    });
    return head ?? tx.planProposalPreview.findFirst({
      where: {
        ...where, calendarAdjustmentId: null,
        OR: [
          { decisionId: id },
          { id, decisionId: null, proposal: { path: ['calendarMoveRefreshedForCoach'], equals: true } },
        ],
      },
      include: { decision: { select: { state: true } } },
    });
  }

  private async calendarAdjustmentEligibility(
    userId: string, planId: string, edits: CalendarEdit[], presentation: PlanProposalPresentation, tx: PlanDb,
  ) {
    const plan = await this.storage.findPlan(tx, {
      where: { id: planId, userId },
      select: {
        status: true, startDate: true, endDate: true, planningMode: true,
        generationMetadata: true, activationTimezone: true,
        supersededBy: { select: { status: true, startDate: true } },
      },
    });
    const ymd = (value: Date | null | undefined) => value?.toISOString().slice(0, 10);
    const start = ymd(plan?.startDate);
    const end = plan?.planningMode === 'ROLLING' ? undefined : ymd(plan?.endDate);
    const timezone = this.constraints(
      (plan?.generationMetadata as Record<string, unknown> | null)?.scheduleConstraints,
    )?.calendarTimeZone ?? plan?.activationTimezone ?? (await this.users.getPreferredTimezone(userId, tx)) ?? 'UTC';
    const today = this.earliestStartDate(timezone);
    const replacement = plan?.supersededBy?.status === 'SCHEDULED' ? ymd(plan.supersededBy.startDate) : undefined;
    const workouts = await this.storage.findWorkouts(tx, {
      where: {
        userId, planId,
        id: { in: edits.flatMap((edit) => edit.workoutId ? [edit.workoutId] : []) },
      },
      select: {
        id: true, revision: true, status: true, scheduledDate: true,
        _count: { select: { links: { where: { unlinkedAt: null } } } },
      },
    });
    const byId = new Map(workouts.map((workout) => [workout.id, workout]));
    const originalDates = new Map(presentation.rows.map((row) => [row.workoutId, row.beforeScheduledDate]));
    const conflicts: CalendarAdjustment['conflicts'] = [];
    const eligible: CalendarEdit[] = [];
    for (const edit of edits) {
      const row = byId.get(edit.workoutId ?? '');
      const target = edit.targetDate;
      const reason = !start || !plan || !['ACTIVE', 'PAUSED'].includes(plan.status)
        ? 'PLAN_STATUS'
        : edit.kind !== 'ADD' && !row
          ? 'WORKOUT_REMOVED'
          : row && workoutImmutabilityReason({
            planStatus: plan.status, workoutStatus: row.status, scheduledDateYmd: ymd(row.scheduledDate),
            athleteTodayYmd: today, activeActivityLinkCount: row._count.links,
            pendingSupersessionYmd: replacement,
          });
      if (reason) {
        conflicts.push({ key: calendarEditKey(edit), reason });
      } else if (edit.kind !== 'DELETE' && (
        !isCalendarDate(target) || target < today || target < start! ||
        (end && target > end) || (replacement && target >= replacement)
      )) {
        conflicts.push({ key: calendarEditKey(edit), reason: 'TARGET_DATE' });
      } else if (row && row.revision !== edit.expectedRevision && (
        edit.kind === 'DELETE' || edit.workout ||
        (originalDates.get(row.id) !== ymd(row.scheduledDate) && target !== ymd(row.scheduledDate))
      )) {
        conflicts.push({ key: calendarEditKey(edit), reason: 'WORKOUT_CHANGED' });
      } else {
        eligible.push(row ? { ...edit, expectedRevision: row.revision } : edit);
      }
    }
    return { conflicts, eligible, timezone };
  }

  private async calendarAdjustmentView(
    id: string,
    head: PlanProposalPreview & { decision?: { state: string } | null },
    row: PlanProposalPreview,
    tx: PlanDb,
  ): Promise<CalendarAdjustment> {
    const proposal = row.proposal as unknown as CanonicalStartProposal;
    const edits = this.proposalEdits(proposal);
    let state: CalendarAdjustment['state'] = CalendarAdjustmentState.Ready;
    let conflicts: CalendarAdjustment['conflicts'] = [];
    let eligible: CalendarEdit[] = [];
    if (row.appliedAt) state = CalendarAdjustmentState.Applied;
    else if (row.discardedAt || proposal.calendarMoveCancelled ||
      (head.id === row.id && head.decision?.state === 'REJECTED'))
      state = CalendarAdjustmentState.Discarded;
    else if (row.id !== head.id) state = CalendarAdjustmentState.Superseded;
    else {
      const eligibility = await this.calendarAdjustmentEligibility(row.userId, row.sourcePlanId, edits, proposal.presentation, tx);
      conflicts = eligibility.conflicts;
      eligible = eligibility.eligible;
      const range = proposal.request.mode === 'SCHEDULE' ? proposal.request.range : undefined;
      if (proposal.calendarMoveInvalidated || conflicts.length ||
        (!edits.length && !proposal.request.scheduleConstraints)) {
        state = CalendarAdjustmentState.Invalidated;
      } else if (head.decision?.state === 'SUPERSEDED') {
        state = CalendarAdjustmentState.Stale;
      } else if (row.expiresAt.getTime() <= Date.now()) {
        state = CalendarAdjustmentState.Expired;
      } else {
        const readRange = proposal.calendarAdjustmentReadRange ?? (proposal.calendarMove
          ? calendarMoveReadRange(proposal.calendarMove, proposal.calendarMoveManuallyRevised ? range : undefined)
          : range);
        const source = await this.storage.source(row.sourcePlanId, tx, readRange);
        const fingerprint = source && proposal.calendarAdjustmentReadRange
          ? await this.calendarAdjustmentFingerprint(source, proposal.calendarAdjustmentReadRange, proposal.presentation, tx)
          : source && this.fingerprint(source);
        if (!source || eligibility.timezone !== proposal.calendarTimeZone ||
          fingerprint !== (proposal.calendarAdjustmentFingerprint ?? proposal.sourceFingerprint) ||
          eligibility.eligible.some((edit, index) => edit.expectedRevision !== edits[index].expectedRevision)) {
          state = CalendarAdjustmentState.Stale;
        }
      }
    }
    const needsRecovery = state === CalendarAdjustmentState.Stale || state === CalendarAdjustmentState.Expired ||
      state === CalendarAdjustmentState.Invalidated;
    const canRebase = !proposal.request.scheduleConstraints && !proposal.request.qualityContractTransition;
    return {
      id, planId: row.sourcePlanId, versionId: row.id, currentVersionId: head.id, state,
      decisionId: head.decisionId,
      expiresAt: row.expiresAt.toISOString(), presentation: proposal.presentation,
      isVersioned: Boolean(row.calendarAdjustmentId && (row.calendarVersion || row.discardedAt || row.calendarReceipt)),
      conflicts, operationKeys: edits.map(calendarEditKey),
      ...(needsRecovery && { recoverableOperationKeys: canRebase ? eligible.map(calendarEditKey) : [] }),
      receipt: row.calendarReceipt as CalendarAdjustmentReceipt | null,
    };
  }

  async getCalendarAdjustment(userId: string, planId: string, id: string, versionId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const head = await this.calendarAdjustmentHead(userId, planId, id, tx);
      if (!head) throw new NotFoundException('Calendar adjustment not found');
      const row = !versionId || versionId === head.id ? head : await tx.planProposalPreview.findFirst({
        where: { id: versionId, userId, sourcePlanId: planId, calendarAdjustmentId: id },
      });
      if (!row) throw new NotFoundException('Calendar adjustment version not found');
      return this.calendarAdjustmentView(id, head, row, tx);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async listCalendarAdjustments(userId: string, planId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id"
        FROM "t_plan_proposal_preview" p
        WHERE p."user_id" = ${userId}
          AND p."source_plan_id" = ${planId}
          AND p."calendar_adjustment_id" IS NOT NULL
          AND p."applied_at" IS NULL
          AND p."discarded_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "t_plan_proposal_preview" newer
            WHERE newer."calendar_adjustment_id" = p."calendar_adjustment_id"
              AND newer."calendar_version" > p."calendar_version"
          )
        ORDER BY p."created_at" DESC
        LIMIT 50
      `);
      const heads = await tx.planProposalPreview.findMany({
        where: { userId, sourcePlanId: planId, id: { in: rows.map((row) => row.id) } },
        orderBy: { createdAt: 'desc' },
        include: { decision: { select: { state: true } } },
      });
      return Promise.all(heads.map((row) => this.calendarAdjustmentView(row.calendarAdjustmentId!, row, row, tx)));
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }

  async saveCalendarAdjustment(userId: string, planId: string, id: string, input: SaveCalendarAdjustmentDto) {
    return this.writeCalendarAdjustment(userId, planId, id, input);
  }

  async rebaseCalendarAdjustment(userId: string, planId: string, id: string, input: RebaseCalendarAdjustmentDto) {
    return this.writeCalendarAdjustment(userId, planId, id, input);
  }

  private async writeCalendarAdjustment(
    userId: string, planId: string, id: string,
    input: SaveCalendarAdjustmentDto | RebaseCalendarAdjustmentDto,
  ) {
    return this.calendarTransaction(userId, async (tx) => {
      const head = await this.calendarAdjustmentHead(userId, planId, id, tx);
      const mutationHash = hash(input);
      if (head?.id === input.versionId) {
        if ((head.proposal as unknown as CanonicalStartProposal).calendarAdjustmentMutationHash !== mutationHash)
          fail('Calendar adjustment version ID was already used');
        return this.calendarAdjustmentView(id, head, head, tx);
      }
      if (head?.id !== input.baseVersionId) fail('The calendar adjustment version changed');
      if (!head && (id !== input.versionId || 'operationKeys' in input)) fail('Invalid calendar adjustment identity');
      const proposal = head?.proposal as unknown as CanonicalStartProposal | undefined;
      const current = head && await this.calendarAdjustmentView(id, head, head, tx);
      let edits: CalendarEdit[];
      if ('edits' in input) {
        if (current && current.state !== CalendarAdjustmentState.Ready) fail('The current adjustment needs to be refreshed');
        edits = this.mergeCalendarEdits(proposal ? this.proposalEdits(proposal) : [], input.edits);
      } else {
        if (!head || !proposal || !current || !['STALE', 'EXPIRED', 'INVALIDATED'].includes(current.state))
          fail('This calendar adjustment cannot be refreshed');
        const baseline = this.proposalEdits(proposal);
        const selected = input.operationKeys ? new Set(input.operationKeys) : null;
        edits = selected ? baseline.filter((edit) => selected.has(calendarEditKey(edit))) : baseline;
        const eligibility = await this.calendarAdjustmentEligibility(userId, planId, edits, proposal.presentation, tx);
        if (!edits.length || (selected && selected.size !== edits.length) || eligibility.conflicts.length)
          fail('Select only operations that are still available');
        edits = eligibility.eligible;
      }
      if (proposal?.request.scheduleConstraints || proposal?.request.qualityContractTransition)
        fail('Calendar editing cannot change plan rules');
      if (head && !head.calendarAdjustmentId) {
        await tx.planProposalPreview.update({
          where: { id: head.id },
          data: { calendarAdjustmentId: id, calendarVersion: 0 },
        });
      }
      const calendarVersion = (head?.calendarVersion ?? 0) + 1;
      if (!edits.length) {
        if (!head || !proposal) fail('A calendar revision must include a change');
        const row = await tx.planProposalPreview.create({ data: {
          id: input.versionId,
          userId, sourcePlanId: planId, mode: head.mode,
          request: head.request as Prisma.InputJsonValue,
          sourceSnapshot: head.sourceSnapshot as Prisma.InputJsonValue,
          proposal: json({ ...proposal, calendarAdjustmentEdits: [], calendarAdjustmentMutationHash: mutationHash }) as unknown as Prisma.InputJsonValue,
          presentation: head.presentation as Prisma.InputJsonValue,
          expiresAt: head.expiresAt, calendarAdjustmentId: id, calendarVersion,
          discardedAt: new Date(),
        } });
        if (head.decisionId) await this.expirePreviews([head], tx);
        return this.calendarAdjustmentView(id, row, row, tx);
      }
      const version = await this.preparePreview(userId, {
        planId, adjustment: { id, versionId: input.versionId, number: calendarVersion, edits, mutationHash },
      }, undefined, undefined, tx);
      if (head?.decisionId) await this.expirePreviews([head], tx);
      const row = await tx.planProposalPreview.findUniqueOrThrow({ where: { id: version.previewId } });
      return this.calendarAdjustmentView(id, row, row, tx);
    });
  }

  async confirmCalendarAdjustment(userId: string, planId: string, id: string, versionId: string) {
    const result = await this.calendarTransaction(userId, async (tx) => {
      const head = await this.calendarAdjustmentHead(userId, planId, id, tx);
      if (!head) throw new NotFoundException('Calendar adjustment not found');
      const row = head.id === versionId ? head : await tx.planProposalPreview.findFirst({
        where: { id: versionId, userId, sourcePlanId: planId, calendarAdjustmentId: id },
      });
      if (row?.appliedAt && row.calendarReceipt) return { receipt: row.calendarReceipt as CalendarAdjustmentReceipt };
      if (head.id !== versionId || !head.calendarAdjustmentId)
        fail('The calendar adjustment version changed');
      const current = await this.calendarAdjustmentView(id, head, head, tx);
      if (current.state !== CalendarAdjustmentState.Ready) fail('The calendar adjustment needs to be refreshed');
      const stored = head.proposal as unknown as CanonicalStartProposal;
      let proposal = stored;
      if (stored.calendarAdjustmentEdits) {
        const checked = await this.preparePreview(userId, {
          planId,
          adjustment: {
            id, versionId, number: head.calendarVersion!,
            edits: this.proposalEdits(stored), validateOnly: true,
          },
        }, undefined, undefined, tx);
        proposal = checked.calendarAdjustmentProposal!;
        if (calendarWeekComparisonHash(proposal.presentation.calendarAdjustmentWeeks) !==
            calendarWeekComparisonHash(stored.presentation.calendarAdjustmentWeeks))
          fail('The adjustment comparison changed; refresh before confirming');
      }
      const applied = await this.applyCandidate({ userId, contextPlanId: planId, tx }, proposal, 'calendar');
      const receipt: CalendarAdjustmentReceipt = {
        planId, versionId, readbackVerified: true,
        changedWorkoutCount: applied.changedWorkoutCount,
        addedWorkoutCount: applied.addedWorkoutCount,
        deletedWorkoutCount: applied.deletedWorkoutCount,
      };
      await tx.planProposalPreview.update({
        where: { id: versionId },
        data: { appliedAt: new Date(), calendarReceipt: receipt },
      });
      if (head.decisionId) {
        await tx.coachDecision.updateMany({
          where: { id: head.decisionId, state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] } },
          data: { state: 'APPLIED', approvedBy: userId, approvedAt: new Date(), appliedAt: new Date() },
        });
      }
      return { receipt, applied: true };
    });
    if (this.adjustmentSync) void this.adjustmentSync.dispatch(versionId, userId, planId);
    else if (result.applied) await this.plans.notifyWorkoutChanges(userId, planId);
    return result.receipt;
  }

  async discardCalendarAdjustment(userId: string, planId: string, id: string, versionId: string) {
    return this.calendarTransaction(userId, async (tx) => {
      const head = await this.calendarAdjustmentHead(userId, planId, id, tx);
      if (!head) throw new NotFoundException('Calendar adjustment not found');
      if (head.id !== versionId || head.appliedAt) fail('The calendar adjustment version changed');
      if (head.discardedAt) return this.calendarAdjustmentView(id, head, head, tx);
      const row = await tx.planProposalPreview.update({
        where: { id: versionId },
        data: { discardedAt: new Date(), calendarAdjustmentId: id, calendarVersion: head.calendarVersion ?? 0 },
      });
      return this.calendarAdjustmentView(id, row, row, tx);
    });
  }

  private async calendarEditRequest(
    userId: string,
    { planId, edits, omitUnchanged = false }: {
      planId: string;
      edits: Array<CalendarEdit & { plannedSessionRpe?: number }>;
      omitUnchanged?: boolean;
    },
    tx: PlanDb,
  ): Promise<PlanSchedulePreviewRequest> {
    const [plan, workouts] = await Promise.all([
      this.storage.findPlan(tx, { where: { id: planId, userId }, select: { startDate: true } }),
      this.storage.findWorkouts(tx, {
        where: {
          planId,
          userId,
          id: { in: edits.flatMap((edit) => edit.kind === 'ADD' ? [] : [edit.workoutId!]) },
        },
        include: sourceInclude.workouts.include,
      }),
    ]);
    if (!plan?.startDate) fail('The plan does not have a calendar start date');
    const startDate = plan.startDate.toISOString().slice(0, 10);
    const byId = new Map(workouts.map((workout) => [workout.id, workout]));
    const nextPosition = new Map<number, number>();
    const dates: string[] = [];
    const restoredDates: string[] = [];
    const changes: PlanSchedulePreviewRequest['changes'] = [];
    const additions: PlanSchedulePreviewRequest['additions'] = [];
    const deletions: PlanSchedulePreviewRequest['deletions'] = [];
    for (const edit of edits) {
      const prior = edit.kind === 'ADD' ? undefined : byId.get(edit.workoutId!);
      const originalDate = prior?.scheduledDate?.toISOString().slice(0, 10);
      if (edit.kind !== 'ADD' && (!originalDate || !edit.expectedRevision || prior?.revision !== edit.expectedRevision))
        fail('Workout revision changed; refresh the calendar');
      if (edit.kind === 'DELETE') {
        dates.push(originalDate!);
        deletions.push({ sourceWorkoutId: prior!.id, expectedRevision: prior!.revision });
        continue;
      }
      const date = edit.targetDate!;
      if (!isCalendarDate(date) || date < startDate) fail('Candidate target is outside the plan');
      const offset = (Date.parse(date) - Date.parse(startDate)) / 86400000;
      let sessionIndex = prior?.sessionIndex ?? 1;
      if (date !== originalDate) {
        const occupied = nextPosition.get(offset) ?? (await this.storage.lastSessionIndex(tx, planId, userId, offset));
        sessionIndex = occupied + 1;
        nextPosition.set(offset, sessionIndex);
      }
      const stored = prior && normalizePlanWorkoutRow(prior, {
        workoutService: this.workout,
        workoutDefinitionService: this.definitions,
        workoutPersistence: this.persistence,
      });
      const workout: PlanStartWorkoutDraft = {
        weekIndex: Math.floor(offset / 7) + 1,
        dayIndex: (offset % 7) + 1,
        sessionIndex,
        sportType: edit.workout?.sportType ?? stored!.sportType,
        sportDefinitionCode: edit.workout?.sportDefinitionCode ?? stored?.sportDefinitionCode,
        name: edit.workout ? edit.workout.name ?? undefined : stored?.name ?? undefined,
        notes: edit.workout ? edit.workout.notes ?? undefined : stored?.notes ?? undefined,
        plannedSessionRpe: edit.plannedSessionRpe ?? stored?.plannedSessionRpe ?? undefined,
        definition: edit.workout
          ? edit.workout.definition as PlanStartWorkoutDraft['definition']
          : { kind: stored!.structureKind, version: 1, source: 'STRUCTURE', structure: stored!.structure },
      };
      if (omitUnchanged && stored && date === originalDate &&
        workout.sportType === stored.sportType &&
        (workout.sportDefinitionCode ?? null) === (stored.sportDefinitionCode ?? null) &&
        (workout.name ?? null) === (stored.name ?? null) &&
        (workout.notes ?? null) === (stored.notes ?? null) &&
        (workout.plannedSessionRpe ?? null) === (stored.plannedSessionRpe ?? null) &&
        workoutStructureKey(this.definitions.resolve(workout.definition!).structure, this.workout) ===
          workoutStructureKey(stored.structure, this.workout)) {
        restoredDates.push(date);
        continue;
      }
      if (originalDate) dates.push(originalDate);
      dates.push(date);
      if (prior) changes.push({ sourceWorkoutId: prior.id, expectedRevision: prior.revision, workout });
      else additions.push({ candidateKey: edit.candidateKey!, workout });
    }
    const bounds = (dates.length ? dates : restoredDates).sort();
    return {
      mode: 'SCHEDULE', planId, range: { from: bounds[0], to: bounds[bounds.length - 1] },
      rationale: 'Calendar edits', evidenceRefs: [], changes, additions, deletions,
      preserveUnmentioned: true,
    };
  }

  async reviseCalendarAdjustment(userId: string, planId: string, previewId: string, revision: ReviseCalendarAdjustmentDto) {
    await this.preparePreview(userId, { planId, previewId, revision });
    return this.readCalendarMove(userId, planId, previewId);
  }

  private async reviseCalendarRequest(
    userId: string,
    { planId, previewId, revision }: CalendarRevisionIntent,
    tx: PlanDb,
  ) {
    const { preview, proposal } = await this.calendarMoveRecord(userId, planId, previewId, tx);
    const sid = CALENDAR_MOVE_SESSION_PREFIX + previewId;
    if (preview.calendarAdjustmentId || calendarMoveState(preview, proposal) !== PlanCalendarMoveState.Pending ||
      proposal.calendarMoveConfirmationId !== revision.confirmationId ||
      proposal.request.mode !== 'SCHEDULE' || !proposal.calendarMove)
      fail('Calendar move preview must be refreshed');
    const later = await this.latestCalendarMoveDraft(userId, planId, sid, tx, preview.updatedAt);
    if (later?.decision && ['DRAFT', 'PROPOSED', 'APPROVED'].includes(later.decision.state))
      fail('A newer coach preview is available');

    const edits = this.mergeCalendarEdits(this.proposalEdits(proposal), revision.edits);
    if (!edits.length) fail('A calendar revision must include a change');
    const next = await this.calendarEditRequest(userId, { planId, edits }, tx);
    const anchor = edits.find((edit) => calendarEditKey(edit) === proposal.calendarMove!.workoutId);
    return {
      sid, previewId, request: next,
      calendarMove: { ...proposal.calendarMove, to: anchor?.targetDate ?? proposal.calendarMove.from },
    };
  }

  private proposalEdits(proposal: CanonicalStartProposal): CalendarEdit[] {
    if (proposal.calendarAdjustmentEdits) return proposal.calendarAdjustmentEdits;
    if (proposal.request.mode !== 'SCHEDULE') return [];
    const request = proposal.request;
    const changes = new Map(request.changes.map((change) => [change.sourceWorkoutId, change.expectedRevision]));
    const existing = new Map(proposal.candidate.flatMap(({ sourceWorkoutId, candidateKey, workout }) => {
      const expectedRevision = sourceWorkoutId ? changes.get(sourceWorkoutId) : undefined;
      if (!candidateKey && expectedRevision == null) return [];
      const targetDate = addCalendarDays(proposal.startDate, (workout.weekIndex - 1) * 7 + workout.dayIndex - 1);
      const edit = {
        kind: candidateKey ? 'ADD' : 'UPDATE',
        candidateKey,
        workoutId: sourceWorkoutId,
        expectedRevision,
        targetDate,
        workout: { ...workout, definition: workout.definition! } as CalendarEdit['workout'],
        plannedSessionRpe: workout.plannedSessionRpe,
      } satisfies CalendarEdit & { plannedSessionRpe?: number };
      return [[candidateKey ? `candidate:${candidateKey}` : sourceWorkoutId!, edit] as const];
    }));
    const edits = new Map<string, CalendarEdit>(existing);
    for (const deletion of request.deletions) {
      edits.set(deletion.sourceWorkoutId, {
        kind: 'DELETE', workoutId: deletion.sourceWorkoutId, expectedRevision: deletion.expectedRevision,
      });
    }
    return [...edits.values()];
  }

  private mergeCalendarEdits(baseline: CalendarEdit[], delta: CalendarEdit[]) {
    const edits = new Map(baseline.map((edit) => [calendarEditKey(edit), edit]));
    const touched = new Set<string>();
    for (const edit of delta) {
      const candidate = edit.kind !== 'ADD' && edit.expectedRevision === 0;
      const key = candidate ? `candidate:${edit.workoutId!.replace(/^candidate:/, '')}` : calendarEditKey(edit);
      if (touched.has(key)) fail('A calendar revision must edit each workout at most once');
      touched.add(key);
      const current = edits.get(key);
      if (edit.kind === 'ADD') {
        if (current) fail('New workout candidate keys must be unique');
        edits.set(key, edit);
      } else if (candidate) {
        if (current?.kind !== 'ADD') fail('The proposed workout is no longer available');
        if (edit.kind === 'DELETE') edits.delete(key);
        else edits.set(key, { ...current, targetDate: edit.targetDate, workout: edit.workout ?? current.workout });
      } else {
        if (current?.kind === 'DELETE' ||
          (current && current.expectedRevision !== edit.expectedRevision))
          fail('Workout revision changed; refresh the calendar');
        edits.set(key, edit.kind === 'DELETE' ? edit : {
          ...edit, workout: edit.workout ?? current?.workout, plannedSessionRpe: current?.plannedSessionRpe,
        });
      }
    }
    if (edits.size > 200) fail('A calendar adjustment can contain up to 200 changes');
    return [...edits.values()];
  }

  private async calendarMoveRecord(
    userId: string,
    planId: string,
    previewId: string,
    tx: PlanDb,
  ) {
    const preview = await tx.planProposalPreview.findFirst({
      where: {
        id: previewId,
        userId,
        sourcePlanId: planId,
        mode: 'SCHEDULE',
        decisionId: null,
      },
    });
    const proposal = preview?.proposal as unknown as
      | CanonicalStartProposal
      | undefined;
    if (
      !preview ||
      !proposal?.calendarMove ||
      !proposal.presentation.calendarMoveImpact
    )
      fail('Calendar move preview not found');
    return {
      preview,
      proposal,
      impact: proposal.presentation.calendarMoveImpact,
    };
  }

  async readCalendarMove(
    userId: string,
    planId: string,
    previewId: string,
  ): Promise<PlanCalendarMovePreview> {
    return withSerializableRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const { preview, proposal, impact } = await this.calendarMoveRecord(
          userId, planId, previewId, tx,
        );
        const state = calendarMoveState(preview, proposal);
        if (state === PlanCalendarMoveState.Applied || state === PlanCalendarMoveState.Cancelled)
          return this.calendarMoveView(preview, proposal, impact);

        let current = proposal;
        if ((state === PlanCalendarMoveState.Pending || state === PlanCalendarMoveState.Expired) &&
          await this.calendarMoveHasProtectedWorkouts(userId, preview, proposal, tx)) {
          const invalidated: CanonicalStartProposal = { ...proposal, calendarMoveInvalidated: true };
          await this.expireCalendarCoachPreviews(userId, planId, CALENDAR_MOVE_SESSION_PREFIX + previewId, tx);
          await tx.planProposalPreview.update({
            where: { id: previewId },
            data: { proposal: json(invalidated) as unknown as Prisma.InputJsonValue },
          });
          current = invalidated;
        }

        const today = this.earliestStartDate(proposal.calendarTimeZone);
        const datePassed = proposal.calendarMoveManuallyRevised && proposal.request.mode === 'SCHEDULE'
          ? proposal.request.range.from < today
          : impact.from < today || impact.to < today;
        let recoveryBlockedReason: PlanCalendarMovePreview['recoveryBlockedReason'];
        if (datePassed || current.calendarMoveInvalidated) {
          const draft = await this.latestCalendarMoveDraft(userId, planId, CALENDAR_MOVE_SESSION_PREFIX + previewId, tx,
            proposal.calendarMoveConfirmationId ? preview.updatedAt : undefined);
          const adjustmentId = draft?.calendarAdjustmentId ?? draft?.decisionId ?? preview.calendarAdjustmentId ??
            (proposal.calendarMoveRefreshedForCoach ? previewId : undefined);
          const head = adjustmentId ? await this.calendarAdjustmentHead(userId, planId, adjustmentId, tx) : null;
          const adjustment = head && adjustmentId && await this.calendarAdjustmentView(adjustmentId, head, head, tx);
          if (adjustment && adjustment.state === CalendarAdjustmentState.Applied)
            recoveryBlockedReason = 'alreadyApplied';
          else if (!adjustment || (adjustment.state !== CalendarAdjustmentState.Ready && !adjustment.recoverableOperationKeys?.length))
            recoveryBlockedReason = datePassed ? 'datesPassed' : 'scheduleChanged';
        }

        return this.calendarMoveView(preview, current, impact, recoveryBlockedReason);
      }, { isolationLevel: 'Serializable' }),
    );
  }

  private async calendarMoveHasProtectedWorkouts(
    userId: string,
    preview: { id: string; sourcePlanId: string; updatedAt: Date },
    proposal: CanonicalStartProposal,
    tx: PlanDb,
  ) {
    const draft = await this.latestCalendarMoveDraft(
      userId,
      preview.sourcePlanId,
      CALENDAR_MOVE_SESSION_PREFIX + preview.id,
      tx,
      proposal.calendarMoveConfirmationId ? preview.updatedAt : undefined,
    );
    const requests = [proposal.request];
    if (draft?.decision && draft.decision.state !== 'REJECTED' && draft.decision.state !== 'APPLIED')
      requests.push((draft.proposal as unknown as CanonicalStartProposal).request);
    const workoutIds = new Set(requests.flatMap(({ changes, deletions }) =>
      [...changes, ...deletions].map(({ sourceWorkoutId }) => sourceWorkoutId)));
    const mutableWorkouts = await this.storage.countWorkouts(tx, {
      where: {
        userId,
        planId: preview.sourcePlanId,
        id: { in: [...workoutIds] },
        status: 'PLANNED',
        completedAt: null,
        links: { none: { unlinkedAt: null } },
      },
    });
    return mutableWorkouts !== workoutIds.size;
  }

  private calendarMoveView(
    preview: { id: string; sourcePlanId: string; expiresAt: Date; appliedAt: Date | null },
    proposal: CanonicalStartProposal,
    impact: PlanCalendarMovePreview['impact'],
    recoveryBlockedReason?: PlanCalendarMovePreview['recoveryBlockedReason'],
  ): PlanCalendarMovePreview {
    return {
      previewId: preview.id,
      planId: preview.sourcePlanId,
      expiresAt: preview.expiresAt.toISOString(),
      state: calendarMoveState(preview, proposal),
      impact,
      presentation: proposal.presentation,
      receipt: proposal.calendarMoveReceipt ?? null,
      ...(recoveryBlockedReason && { recoveryBlockedReason }),
      ...(proposal.calendarMoveRefreshedForCoach
        ? { requiresCoachConfirmation: true }
        : {}),
      ...(proposal.calendarMoveConfirmationId
        ? { confirmationId: proposal.calendarMoveConfirmationId }
        : {}),
    };
  }

  async readCoachCalendarMove(userId: string, sid: string) {
    const { preview } = await this.calendarMoveCoachRecord(
      userId, sid, this.prisma,
    );
    return this.readCalendarMove(userId, preview.sourcePlanId, preview.id);
  }

  async refreshCalendarMoveCoach(
    userId: string,
    sid: string,
    previousConfirmationId?: string,
  ): Promise<PlanCalendarMoveRefreshResult> {
    try {
      const current = await this.preparePreview(userId, {
        refreshSid: sid,
        previousConfirmationId,
      });
      const preview = await this.readCalendarMove(
        userId,
        current.decisionPayload.planId,
        current.previewId,
      );
      return { status: 'refreshed', preview };
    } catch (error) {
      if (error instanceof CalendarMoveRefreshBlocked)
        return { status: error.status };
      if (error instanceof BusinessException || error instanceof UnprocessableEntityException)
        return { status: 'scheduleChanged' };
      throw error;
    }
  }

  private async calendarMoveCoachRecord(userId: string, sid: string, tx: PlanDb) {
    if (!isCalendarMoveSession(sid))
      throw new NotFoundException('Calendar coaching session not found');
    const previewId = sid.slice(CALENDAR_MOVE_SESSION_PREFIX.length);
    const [session, record] = await Promise.all([
      tx.aiCoachSession.findUnique({
        where: { userId_id: { userId, id: sid } },
        select: { id: true },
      }),
      tx.planProposalPreview.findFirst({
        where: { id: previewId, userId, mode: 'SCHEDULE', decisionId: null },
        select: { sourcePlanId: true },
      }),
    ]);
    if (!session || !record)
      throw new NotFoundException('Calendar coaching session not found');
    return this.calendarMoveRecord(
      userId,
      record.sourcePlanId,
      previewId,
      tx,
    );
  }

  private async calendarMoveRefreshIntent(
    userId: string,
    sid: string,
    tx: PlanDb,
    previousConfirmationId?: string,
  ) {
    const { preview, proposal, impact } = await this.calendarMoveCoachRecord(userId, sid, tx);
    if (preview.calendarAdjustmentId)
      throw new CalendarMoveRefreshBlocked('scheduleChanged');
    const state = calendarMoveState(preview, proposal);
    if (state === PlanCalendarMoveState.Applied)
      throw new CalendarMoveRefreshBlocked('alreadyApplied');
    if (state === PlanCalendarMoveState.Cancelled)
      throw new CalendarMoveRefreshBlocked('discarded');
    if (state === PlanCalendarMoveState.Invalidated)
      throw new CalendarMoveRefreshBlocked('scheduleChanged');
    const today = this.earliestStartDate(proposal.calendarTimeZone);
    if (proposal.calendarMoveManuallyRevised && proposal.request.mode === 'SCHEDULE') {
      if (proposal.request.range.from < today)
        throw new CalendarMoveRefreshBlocked('datesPassed');
      return { kind: 'revised' as const, sid, previewId: preview.id, request: proposal.request, calendarMove: proposal.calendarMove! };
    }
    if (impact.from < today || impact.to < today)
      throw new CalendarMoveRefreshBlocked('datesPassed');
    const workout = await this.storage.findWorkout(tx, {
      where: { id: impact.workoutId, userId, planId: preview.sourcePlanId },
      select: { revision: true, status: true, scheduledDate: true },
    });
    if (
      !workout ||
      workout.status !== 'PLANNED' ||
      workout.scheduledDate?.toISOString().slice(0, 10) !== impact.from
    )
      throw new CalendarMoveRefreshBlocked('scheduleChanged');
    if (
      state === PlanCalendarMoveState.Pending &&
      proposal.calendarMoveConfirmationId &&
      proposal.calendarMoveConfirmationId !== previousConfirmationId &&
      workout.revision === proposal.request.changes[0]?.expectedRevision
    ) {
      const existing: PlanProposalPreviewResult = {
        kind: 'plan_proposal_preview',
        previewId: preview.id,
        mode: 'SCHEDULE',
        expiresAt: preview.expiresAt.toISOString(),
        decisionType: 'PLAN_SCHEDULE',
        decisionPayload: {
          planId: preview.sourcePlanId,
          previewId: preview.id,
          presentation: proposal.presentation,
        },
        presentation: proposal.presentation,
      };
      return { kind: 'current' as const, existing };
    }
    const lastDraft = await this.latestCalendarMoveDraft(
      userId,
      preview.sourcePlanId,
      sid,
      tx,
      proposal.calendarMoveConfirmationId ? preview.updatedAt : undefined,
    );
    const savedDraft = lastDraft
      ? lastDraft.decision?.state !== 'REJECTED' && lastDraft.decision?.state !== 'APPLIED'
        ? (lastDraft.proposal as unknown as CanonicalStartProposal)
        : null
      : proposal.calendarMoveIncludesCoachChanges
        ? proposal
        : null;
    return {
      kind: 'expired' as const,
      sid,
      previewId: preview.id,
      planId: preview.sourcePlanId,
      workoutId: impact.workoutId,
      targetDate: impact.to,
      expectedRevision: workout.revision,
      savedDraft,
      today,
    };
  }

  private latestCalendarMoveDraft(
    userId: string,
    planId: string,
    sid: string,
    tx: PlanDb,
    after?: Date,
  ) {
    return tx.planProposalPreview.findFirst({
      where: {
        userId,
        sourcePlanId: planId,
        mode: 'SCHEDULE',
        decisionId: { not: null },
        proposal: { path: ['binding', 'sid'], equals: sid },
        ...(after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { proposal: true, calendarAdjustmentId: true, decisionId: true, decision: { select: { state: true } } },
    });
  }

  async openCalendarMoveCoach(
    userId: string,
    planId: string,
    previewId: string,
    background = false,
  ) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const { preview, proposal } = await this.calendarMoveRecord(
            userId,
            planId,
            previewId,
            tx,
          );
          const sid = CALENDAR_MOVE_SESSION_PREFIX + previewId;
          const state = calendarMoveState(preview, proposal);
          if (
            state === PlanCalendarMoveState.Applied ||
            state === PlanCalendarMoveState.Cancelled ||
            state === PlanCalendarMoveState.Invalidated
          )
            fail('This move does not have an open coaching request');
          await tx.aiCoachSession.upsert({
            where: { userId_id: { userId, id: sid } },
            create: {
              userId,
              id: sid,
              title: proposal.presentation.title,
              type: background ? 'BACKGROUND' : 'CHAT',
            },
            update: background ? {} : { type: 'CHAT' },
          });
          return this.calendarCoachSession(userId, sid, tx, {
            allowApplied: false,
            reportExpired: true,
          });
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      ),
    );
  }

  async calendarCoachSession(
    userId: string,
    sid: string,
    tx: PlanDb = this.prisma,
    options?: { allowApplied: boolean; reportExpired?: boolean },
  ): Promise<PlanCalendarCoachSession> {
    const previewId = sid.slice(CALENDAR_MOVE_SESSION_PREFIX.length);
    const session = await tx.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: sid } },
      select: { id: true },
    });
    const parent = await tx.planProposalPreview.findFirst({
      where: { id: previewId, userId, mode: 'SCHEDULE' },
      select: { sourcePlanId: true },
    });
    if (!isCalendarMoveSession(sid) || !session || !parent)
      fail('Calendar coaching session not found');
    const { preview, proposal, impact } = await this.calendarMoveRecord(
      userId,
      parent.sourcePlanId,
      previewId,
      tx,
    );
    const state = calendarMoveState(preview, proposal);
    const replay =
      Boolean(options?.allowApplied) &&
      state === PlanCalendarMoveState.Applied &&
      Boolean(proposal.calendarMoveReceipt);
    const expired = state === PlanCalendarMoveState.Expired;
    if (
      !replay &&
      (state === PlanCalendarMoveState.Applied ||
        state === PlanCalendarMoveState.Cancelled ||
        state === PlanCalendarMoveState.Invalidated ||
        (expired && !options?.reportExpired))
    )
      fail('This calendar coaching session has closed');
    if (!replay && !expired) {
      if (!this.automationAccess) fail('Plan advice access is unavailable');
      await this.automationAccess.assertAllowed(userId, tx);
      const workout = await this.storage.findWorkout(tx, {
        where: { id: impact.workoutId, userId, planId: parent.sourcePlanId },
        select: { revision: true },
      });
      if (workout?.revision !== proposal.request.changes[0]?.expectedRevision)
        fail('The moved workout changed; start a new calendar preview');
    }
    const readRange = calendarMoveReadRange(impact);
    const today = this.earliestStartDate(proposal.calendarTimeZone);
    const range = {
      from: readRange.from < today ? today : readRange.from,
      to: readRange.to,
    };
    const branch = await tx.coachRun.findFirst({
      where: { userId, sessionId: sid, branchId: { not: null } },
      orderBy: { startedAt: 'desc' },
      select: { branchId: true },
    });
    return {
      sid,
      previewId,
      planId: parent.sourcePlanId,
      impact,
      range,
      branchId: branch?.branchId ?? undefined,
      ...(expired ? { expired: true } : {}),
    };
  }

  private async expireCalendarCoachPreviews(
    userId: string,
    planId: string,
    sid: string,
    tx: PlanDb,
  ) {
    await this.expirePreviews(
      await tx.planProposalPreview.findMany({
        where: {
          userId,
          sourcePlanId: planId,
          appliedAt: null,
          proposal: { path: ['binding', 'sid'], equals: sid },
        },
        select: { id: true, decisionId: true },
      }),
      tx,
    );
  }

  async cancelCalendarMove(userId: string, planId: string, previewId: string) {
    await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const { preview, proposal } = await this.calendarMoveRecord(
            userId,
            planId,
            previewId,
            tx,
          );
          if (preview.calendarAdjustmentId) fail('Use the current calendar adjustment version');
          const state = calendarMoveState(preview, proposal);
          if (state === PlanCalendarMoveState.Applied || state === PlanCalendarMoveState.Cancelled ||
            state === PlanCalendarMoveState.Invalidated) return;
          await this.expireCalendarCoachPreviews(
            userId,
            planId,
            CALENDAR_MOVE_SESSION_PREFIX + previewId,
            tx,
          );
          await tx.planProposalPreview.update({
            where: { id: preview.id },
            data: {
              expiresAt: new Date(),
              proposal: json({
                ...proposal,
                calendarMoveCancelled: true,
              }) as unknown as Prisma.InputJsonValue,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
    return this.readCalendarMove(userId, planId, previewId);
  }

  async confirmCalendarMove(
    userId: string,
    planId: string,
    previewId: string,
    confirmationId?: string,
  ): Promise<PlanCalendarMoveReceipt> {
    const { receipt, applied } = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const { preview, proposal } = await this.calendarMoveRecord(
            userId,
            planId,
            previewId,
            tx,
          );
          if (preview.calendarAdjustmentId) fail('Use the current calendar adjustment version');
          if (
            (confirmationId && confirmationId !== proposal.calendarMoveConfirmationId) ||
            (!confirmationId && proposal.calendarMoveRefreshedForCoach)
          )
            fail('Calendar move preview must be refreshed');
          const state = calendarMoveState(preview, proposal);
          if (state === PlanCalendarMoveState.Applied && proposal.calendarMoveReceipt)
            return { receipt: proposal.calendarMoveReceipt, applied: false };
          if (state !== PlanCalendarMoveState.Pending)
            fail('Calendar move preview must be refreshed');
          const sid = CALENDAR_MOVE_SESSION_PREFIX + previewId;
          if (confirmationId) {
            const later = await this.latestCalendarMoveDraft(userId, planId, sid, tx, preview.updatedAt);
            if (later?.decision && ['DRAFT', 'PROPOSED', 'APPROVED'].includes(later.decision.state))
              fail('A newer coach preview is available');
          }
          const applied = await this.applyCandidate(
            { userId, contextPlanId: planId, tx },
            proposal,
            'calendar',
          );
          await this.expireCalendarCoachPreviews(userId, planId, sid, tx);
          const changedWorkoutIds = new Set(proposal.request.changes.map(({ sourceWorkoutId }) => sourceWorkoutId));
          const receipt: PlanCalendarMoveReceipt = {
            previewId,
            planId,
            readbackVerified: true,
            deletedWorkoutIds: proposal.request.deletions.map(({ sourceWorkoutId }) => sourceWorkoutId),
            identityMap: applied.identityMap
              .filter((item) => item.candidateKey !== null || changedWorkoutIds.has(item.workoutId))
              .map(({ workoutId, scheduledDate, revision }) => ({ workoutId, scheduledDate, revision })),
          };
          await tx.planProposalPreview.update({
            where: { id: previewId },
            data: {
              appliedAt: new Date(),
              proposal: json({
                ...proposal,
                calendarMoveReceipt: receipt,
              }) as unknown as Prisma.InputJsonValue,
            },
          });
          return { receipt, applied: true };
        },
        { isolationLevel: 'Serializable', timeout: 60000 },
      ),
    );
    if (applied) await this.plans.notifyWorkoutChanges(userId, planId);
    return receipt;
  }

  private async calendarMoveRequest(
    userId: string,
    input: CalendarMoveIntent,
    tx: PlanDb,
  ) {
    if (!isCalendarDate(input.targetDate)) fail('Invalid calendar move date');
    const row = await this.storage.findWorkout(tx, {
      where: { id: input.workoutId, planId: input.planId, userId },
      include: { ...sourceInclude.workouts.include, plan: true },
    });
    if (
      !row?.plan?.startDate ||
      !row.scheduledDate ||
      row.revision !== input.expectedRevision
    )
      fail('Workout revision changed; refresh the calendar');
    const from = row.scheduledDate.toISOString().slice(0, 10);
    const to = input.targetDate;
    if (from === to) fail('Choose a different date');
    const calendarMove = { workoutId: row.id, from, to };
    const offset = (Date.parse(to) - row.plan.startDate.getTime()) / 86400000;
    if (offset < 0) fail('Candidate target is outside the plan');
    const occupied = await this.storage.lastSessionIndex(tx, input.planId, userId, offset);
    const w = normalizePlanWorkoutRow(row, {
      workoutService: this.workout,
      workoutDefinitionService: this.definitions,
      workoutPersistence: this.persistence,
    });
    const request: PlanSchedulePreviewRequest = {
      mode: 'SCHEDULE',
      planId: input.planId,
      range: { from: from < to ? from : to, to: from > to ? from : to },
      rationale: 'Calendar workout move',
      evidenceRefs: [],
      changes: [
        {
          sourceWorkoutId: row.id,
          expectedRevision: input.expectedRevision,
          workout: {
            weekIndex: Math.floor(offset / 7) + 1,
            dayIndex: (offset % 7) + 1,
            sessionIndex: occupied + 1,
            sportType: w.sportType,
            sportDefinitionCode: w.sportDefinitionCode,
            name: w.name ?? undefined,
            notes: w.notes ?? undefined,
            plannedSessionRpe: w.plannedSessionRpe ?? undefined,
            definition: {
              kind: w.structureKind,
              version: 1,
              source: 'STRUCTURE',
              structure: w.structure,
            },
          },
        },
      ],
      additions: [],
      deletions: [],
      preserveUnmentioned: true,
    };
    return { request, calendarMove };
  }

  private async bindCalendarCoachRequest(
    userId: string,
    session: PlanCalendarCoachSession,
    request: PlanStartPreviewRequest | PlanSchedulePreviewRequest,
    tx: PlanDb,
  ): Promise<PlanSchedulePreviewRequest> {
    if (
      request.mode !== 'SCHEDULE' ||
      request.planId !== session.planId ||
      request.rolling ||
      request.scheduleConstraints ||
      request.qualityContractTransition
    )
      fail('The proposal exceeds this calendar edit scope');

    const { proposal } = await this.calendarMoveRecord(
      userId,
      session.planId,
      session.previewId,
      tx,
    );
    const [boundMove] = proposal.request.changes;
    if (!boundMove || boundMove.sourceWorkoutId !== session.impact.workoutId)
      fail('Calendar move preview is missing the requested workout');
    const changes = (request.changes ?? []).map((change) => {
      if (change.sourceWorkoutId !== boundMove.sourceWorkoutId) return change;
      return {
        ...change,
        workout: {
          ...change.workout,
          weekIndex: boundMove.workout.weekIndex,
          dayIndex: boundMove.workout.dayIndex,
          sessionIndex: boundMove.workout.sessionIndex,
        },
      };
    });
    if (
      !changes.some((change) => change.sourceWorkoutId === boundMove.sourceWorkoutId)
    )
      changes.unshift(boundMove);

    return {
      ...request,
      range: session.range,
      changes,
      additions: request.additions ?? [],
      deletions: request.deletions ?? [],
      preserveUnmentioned: true,
      preserved: request.preserved?.filter(
        (item) => item.sourceWorkoutId !== boundMove.sourceWorkoutId,
      ),
    };
  }

  private async preparePreview(
    userId: string,
    input:
      | PlanStartPreviewRequest
      | PlanSchedulePreviewRequest
      | CalendarMoveIntent
      | CalendarAdjustmentIntent
      | CalendarRevisionIntent
      | { refreshSid: string; previousConfirmationId?: string },
    binding?: PlanStartBinding,
    automation?: { jobId: string; claimToken: string },
    transaction?: PlanDb,
  ): Promise<PlanProposalPreviewResult & { calendarAdjustmentProposal?: CanonicalStartProposal }> {
    const run = (operation: (tx: PlanDb) => Promise<
      PlanProposalPreviewResult & { calendarAdjustmentProposal?: CanonicalStartProposal }
    >) => transaction ? operation(transaction) : this.calendarTransaction(userId, operation);
    return run(
        async (tx) => {
          const adjustment = 'adjustment' in input ? input.adjustment : undefined;
          const revision = 'revision' in input
            ? await this.reviseCalendarRequest(userId, input, tx)
            : null;
          const restoration = 'refreshSid' in input
            ? await this.calendarMoveRefreshIntent(
                userId, input.refreshSid, tx, input.previousConfirmationId,
              )
            : { kind: 'new' as const, input };
          if (restoration.kind === 'current') return restoration.existing;
          const refresh = restoration.kind === 'expired' ? restoration : null;
          const revised = revision ?? (restoration.kind === 'revised' ? restoration : null);
          const resolved = restoration.kind === 'expired' ? restoration : input;
          const { request: proposedRequest, calendarMove } =
            revised ?? ('adjustment' in resolved
              ? { request: await this.calendarEditRequest(userId, {
                  planId: resolved.planId,
                  edits: resolved.adjustment.edits,
                  omitUnchanged: !resolved.adjustment.validateOnly,
                }, tx), calendarMove: null }
              : 'mode' in resolved
              ? { request: resolved, calendarMove: null }
              : 'targetDate' in resolved
                ? await this.calendarMoveRequest(userId, resolved, tx)
                : fail('Missing calendar edit intent'));
          const calendarCoach =
            binding && isCalendarMoveSession(binding.sid)
              ? await this.calendarCoachSession(userId, binding.sid, tx)
              : null;
          const savedDraft = refresh?.savedDraft;
          let refreshedRequest = proposedRequest;
          if (
            refresh && calendarMove && proposedRequest.mode === 'SCHEDULE' &&
            savedDraft?.request.mode === 'SCHEDULE'
          ) {
            const [boundMove] = proposedRequest.changes;
            const savedMove = savedDraft.request.changes.find(
              (item) => item.sourceWorkoutId === calendarMove.workoutId,
            );
            if (!savedMove) fail('The prior proposal does not contain this calendar move');
            const { weekIndex, dayIndex, sessionIndex } = boundMove.workout;
            const range = calendarMoveReadRange(calendarMove);
            refreshedRequest = {
              ...savedDraft.request,
              range: { from: range.from < refresh.today ? refresh.today : range.from, to: range.to },
              changes: [
                { ...savedMove, workout: { ...savedMove.workout, weekIndex, dayIndex, sessionIndex } },
                ...savedDraft.request.changes.filter((item) => item !== savedMove),
              ],
              preserved: undefined,
              preserveUnmentioned: true,
            };
          }
          const authoredRequest = refreshedRequest.mode === 'SCHEDULE'
            ? await this.amendCalendarRequest(userId, refreshedRequest, tx)
            : refreshedRequest;
          let request = calendarCoach
            ? await this.bindCalendarCoachRequest(
                userId,
                calendarCoach,
                authoredRequest,
                tx,
              )
            : authoredRequest;
          const schedule = request.mode === 'SCHEDULE';
          const automationJob = automation
            ? await this.assertAutomationJob(
                automation.jobId,
                automation.claimToken,
                tx,
              )
            : null;
          if (automationJob) {
            await this.assertAutomationFacts(automationJob, tx);
            this.assertAutomationSettings(request);
          }
          const session =
            automationJob || calendarMove || adjustment
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
            adjustment && request.mode === 'SCHEDULE'
              ? calendarAdjustmentReadRange(request.range)
              : calendarMove
              ? calendarMoveReadRange(calendarMove, revised?.request.range)
              : schedule &&
                  isCalendarDate(
                    (request as PlanSchedulePreviewRequest).range?.from,
                  ) &&
                  isCalendarDate(
                    (request as PlanSchedulePreviewRequest).range?.to,
                  )
                ? (request as PlanSchedulePreviewRequest).range
                : undefined,
          );
          const startDate = schedule
            ? source.startDate?.toISOString().slice(0, 10)
            : (request as PlanStartPreviewRequest).startDate;
          if (!startDate || !isCalendarDate(startDate))
            fail('Invalid calendar start date');
          if (savedDraft && savedDraft.startDate !== startDate)
            fail('The start date changed after the previous calendar move preview');
          if (calendarCoach) {
            const move = request.changes?.find(
              (change) =>
                change.sourceWorkoutId === calendarCoach.impact.workoutId,
            );
            if (
              !move ||
              addCalendarDays(
                startDate,
                (move.workout.weekIndex - 1) * 7 + move.workout.dayIndex - 1,
              ) !== calendarCoach.impact.to
            )
              fail('The plan dates changed; start a new calendar preview');
          }
          const calendarTimeZone =
            this.constraints(request.scheduleConstraints)?.calendarTimeZone ??
            this.constraints(
              (source.generationMetadata as Record<string, unknown> | null)
                ?.scheduleConstraints,
            )?.calendarTimeZone ??
            (schedule ? source.activationTimezone : undefined) ??
            (await this.users.getPreferredTimezone(userId, tx)) ??
            'UTC';
          if (!schedule) this.assertFutureStart(startDate, calendarTimeZone);
          const today = this.earliestStartDate(calendarTimeZone);
          const range = schedule
            ? (request as PlanSchedulePreviewRequest).range
            : undefined;
          if (
            schedule &&
            ((!automation && !calendarMove && !adjustment && !binding?.userMessageId) ||
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
          let preserved = [...(request.preserved ?? [])];
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
          const draftMetadata = source.generationMetadata as Record<string, unknown> | null;
          const fixedDays = this.constraints(draftMetadata?.scheduleConstraints);
          const datedAiDraft =
            request.mode === 'START' &&
            source.planningMode === 'FIXED' &&
            source.sourceType === 'AI';
          const draftQuality = datedAiDraft
            ? parsePlanQualityContract(draftMetadata?.qualityContract)
            : null;
          const assessedStartDate = draftQuality?.startDate;
          if (
            assessedStartDate &&
            !fixedDays &&
            !draftQuality.allowedDays?.length &&
            !draftQuality.maxMinutesByIsoWeekday &&
            !request.scheduleConstraints &&
            calendarIsoWeekday(assessedStartDate) !== calendarIsoWeekday(startDate)
          ) {
            throw new UnprocessableEntityException({
              code: 'PLAN_START_WEEKDAY_REVIEW_REQUIRED',
              message: 'The selected start changes the weekdays of this draft. Confirm the intended weekdays in the schedule or select a start on the assessed weekday.',
              data: { assessedStartDate, requestedStartDate: startDate },
            });
          }
          const shouldAlign =
            datedAiDraft &&
            fixedDays &&
            fixedDays.fixedRestWeekdays.length > 0 &&
            fixedDays.effectiveFrom <= startDate &&
            (!fixedDays.effectiveUntil ||
              fixedDays.effectiveUntil >= addCalendarDays(startDate, source.periodWeeks * 7 - 1)) &&
            !request.scheduleConstraints &&
            !request.qualityContractTransition &&
            request.preserveUnmentioned === true &&
            !request.preserved?.length &&
            !request.changes.length &&
            !request.additions.length &&
            !request.deletions.length;
          const draftAnchor = shouldAlign ? assessedStartDate : undefined;
          // Keep each prescription on its original weekday, including weekday-specific time limits.
          const dayShift = draftAnchor
            ? calendarIsoWeekday(draftAnchor) - calendarIsoWeekday(startDate)
            : 0;
          const dateChanges: PlanStartPreviewRequest['changes'] = [];
          for (const item of preserved) {
            cover(item, !schedule);
            const w = normalizedById.get(item.sourceWorkoutId)!;
            const workout: PlanStartWorkoutDraft = {
              weekIndex: w.weekIndex,
              dayIndex: (w.dayIndex + dayShift + 6) % 7 + 1,
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
            };
            candidate.push({ sourceWorkoutId: item.sourceWorkoutId, workout });
            if (dayShift) dateChanges.push({ ...item, workout });
          }
          if (dateChanges.length) {
            request = { ...request, changes: dateChanges };
            preserved = [];
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
          const display: Array<CoachPlanDraftWorkout & {
            sourceWorkoutId?: string;
            candidateKey?: string;
            plannedSessionRpe?: number;
          }> = candidate.map((item) => {
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
              sourceWorkoutId: item.sourceWorkoutId,
              candidateKey: item.candidateKey,
              plannedSessionRpe,
              text: resolved.text,
              structureKind: resolved.kind,
              dslVersion: 1,
              structure: resolved.structure,
              summary: resolved.summary,
              sportDefinitionCode: w.sportDefinitionCode ?? undefined,
            };
          });
          if (automationJob) {
            const changed = new Set(
              request.changes.map((change) => change.sourceWorkoutId),
            );
            await this.assertAutomationSports(
              automationJob.policy.settings,
              display.filter(
                (_, index) =>
                  candidate[index].candidateKey ||
                  changed.has(candidate[index].sourceWorkoutId!),
              ),
              tx,
            );
          }
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
              ? await this.rolling.validateStart(
                  request.rolling,
                  startDate,
                  display,
                  tx,
                )
              : undefined;
          if (source.planningMode !== 'ROLLING' && request.rolling)
            fail('Automatic policy requires a rolling plan');
          const candidateWeeks =
            source.periodWeeks ??
            Math.max(1, ...display.map((w) => w.weekIndex));
          const quality =
            source.planningMode === 'ROLLING'
              ? assessRollingPlanQuality(qualityInput, contract)
              : await this.loads.assessPlanQualityForViewer(
                  userId,
                  source.periodWeeks,
                  qualityInput,
                  schedule && contract
                    ? {
                        ...contract,
                        allowedDays: undefined,
                        maxDailyMinutes: undefined,
                        maxMinutesByIsoWeekday: undefined,
                        maxTrainingDaysPerWeek: undefined,
                      }
                    : contract && { ...contract, startDate },
                  tx,
                  parsePlanAssessment(candidateMetadata.planAssessment, candidateWeeks),
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
          const movedWorkoutId = calendarCoach?.impact.workoutId;
          const originalMoveWorkout = movedWorkoutId && normalizedById.get(movedWorkoutId);
          const proposedMoveWorkout = movedWorkoutId && display.find((w) => w.sourceWorkoutId === movedWorkoutId);
          const calendarMoveOnly = originalMoveWorkout && proposedMoveWorkout &&
            request.changes.length === 1 && !request.additions.length && !request.deletions.length &&
            originalMoveWorkout.name === (proposedMoveWorkout.name ?? null) &&
            originalMoveWorkout.notes === (proposedMoveWorkout.notes ?? null) &&
            originalMoveWorkout.plannedSessionRpe === (proposedMoveWorkout.plannedSessionRpe ?? null) &&
            originalMoveWorkout.sportType === proposedMoveWorkout.sportType &&
            originalMoveWorkout.sportDefinitionCode === proposedMoveWorkout.sportDefinitionCode &&
            workoutStructureKey(originalMoveWorkout.structure, this.workout) ===
              workoutStructureKey(proposedMoveWorkout.structure, this.workout);
          const presentation: PlanProposalPresentation = {
            ...(calendarMoveOnly ? { calendarMoveOnly: true } : {}),
            ...(calendarMove
              ? {
                  calendarMoveImpact: assessCalendarMoveImpact(
                    source.workouts,
                    calendarMove,
                    calendarAssessment.relatedConflicts.length > 0,
                  ),
                }
              : {}),
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
                const before = item.sourceWorkoutId
                  ? normalizedById.get(item.sourceWorkoutId)
                  : undefined;
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
                  sourceRevision: item.sourceWorkoutId ? byId.get(item.sourceWorkoutId)?.revision : undefined,
                  candidateKey: item.candidateKey,
                  beforeScheduledDate: item.sourceWorkoutId
                    ? byId.get(item.sourceWorkoutId)?.scheduledDate?.toISOString().slice(0, 10) ??
                      (dayShift && draftAnchor && before
                        ? addCalendarDays(draftAnchor, (before.weekIndex - 1) * 7 + before.dayIndex - 1)
                        : undefined)
                    : undefined,
                  name: w.name ?? w.sportType,
                  ...(before && before.name !== w.name
                    ? { beforeName: before.name ?? before.sportType }
                    : {}),
                  beforeSportType: before?.sportType,
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
                  before: before?.text ?? '—',
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
                  sourceRevision: w.revision,
                  beforeScheduledDate: date.toISOString().slice(0, 10),
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
          if (adjustment) {
            const weeks = [...new Set(presentation.rows.flatMap((row) =>
              row.changeKind && row.changeKind !== 'PRESERVED'
                ? [row.beforeScheduledDate, row.scheduledDate].filter(isCalendarDate).map(isoWeekStart)
                : [],
            ))].sort();
            const before = source.workouts.flatMap((w) =>
              w.scheduledDate && !['MOVED', 'SKIPPED'].includes(w.status)
                ? [{ ...w, day: w.scheduledDate.toISOString().slice(0, 10) }] : [],
            );
            const changed = new Set(request.changes.map((w) => w.sourceWorkoutId));
            const index = new Map(source.workouts.map((w) => [w.id, w]));
            const updates = display.filter((w) => !w.sourceWorkoutId || changed.has(w.sourceWorkoutId));
            const estimates = await this.loads.estimateForViewerWorkouts(userId, updates.map((w) => ({
              ...w,
              sportType: w.sportType ?? 'UNKNOWN',
              durationSeconds: w.summary?.durationSeconds,
            })), { tx });
            const estimatedByWorkout = new Map(updates.map((w, i) => [w, estimates[i].estimatedLoad]));
            const after = display.flatMap((w) => {
              const prior = w.sourceWorkoutId ? index.get(w.sourceWorkoutId) : undefined;
              if (prior && ['MOVED', 'SKIPPED'].includes(prior.status)) return [];
              return [{
                id: w.sourceWorkoutId ?? w.candidateKey!,
                status: prior?.status ?? 'PLANNED',
                scheduledDate: prior?.scheduledDate ?? null,
                day: addCalendarDays(startDate, (w.weekIndex - 1) * 7 + w.dayIndex - 1),
                plannedDurationSeconds: w.summary?.durationSeconds ?? null,
                estimatedLoad: estimatedByWorkout.has(w) ? estimatedByWorkout.get(w)! : prior?.estimatedLoad ?? null,
              }];
            });
            presentation.calendarAdjustmentWeeks = weeks.map((weekStart) => ({
              weekStart, before: calendarWeekTotals(before, weekStart), after: calendarWeekTotals(after, weekStart),
            }));
          }
          const readRange = adjustment && range ? calendarAdjustmentReadRange(range) : undefined;
          const adjustmentKeys = adjustment && request.mode === 'SCHEDULE'
            ? new Set([
                ...request.changes.map(({ sourceWorkoutId }) => sourceWorkoutId),
                ...request.deletions.map(({ sourceWorkoutId }) => sourceWorkoutId),
                ...request.additions.map(({ candidateKey }) => `candidate:${candidateKey}`),
              ])
            : undefined;
          if (automation) {
            await this.assertAutomationJob(automation.jobId, automation.claimToken, tx);
          }
          const proposal: CanonicalStartProposal = {
            mode: request.mode,
            planId: source.id,
            ...(refresh || revised
              ? {
                  calendarMoveRefreshedForCoach: true,
                  calendarMoveConfirmationId: randomUUID(),
                  ...(savedDraft ? { calendarMoveIncludesCoachChanges: true } : {}),
                }
              : {}),
            ...(revised ? { calendarMoveManuallyRevised: true } : {}),
            ...(calendarMove
              ? { calendarMove }
              : adjustment
                ? {
                    calendarAdjustmentEdits: adjustment.edits.filter((edit) => adjustmentKeys!.has(calendarEditKey(edit))),
                    calendarAdjustmentMutationHash: adjustment.mutationHash,
                    calendarEditHash: hash(adjustment.edits),
                    calendarAdjustmentReadRange: readRange!,
                    calendarAdjustmentFingerprint: await this.calendarAdjustmentFingerprint(source, readRange!, presentation, tx),
                  }
                : binding
                ? { binding, conversationRevision: session!.planStartRevision }
                : {
                    automationJobId: automation!.jobId,
                    automationMonthStrategyIds:
                      await this.rolling.weekDependencies(
                        source.id,
                        isoWeekStart(
                          (request as PlanSchedulePreviewRequest).range.from,
                        ),
                        tx,
                        (request as PlanSchedulePreviewRequest).range.from,
                      ),
                  }),
            startDate,
            calendarTimeZone,
            sourceFingerprint: this.fingerprint(source),
            factFingerprint: adjustment ? '' : await this.facts(
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
          if (adjustment?.validateOnly) {
            return {
              kind: 'plan_proposal_preview',
              mode: 'SCHEDULE',
              decisionType: 'PLAN_SCHEDULE',
              previewId: adjustment.versionId,
              expiresAt: new Date().toISOString(),
              presentation,
              decisionPayload: { planId: source.id, previewId: adjustment.versionId, presentation },
              calendarAdjustmentProposal: proposal,
            };
          }
          const calendarSid = revised?.sid ?? refresh?.sid ?? calendarCoach?.sid;
          if (calendarSid && !(request.mode === 'SCHEDULE' && request.calendarAdjustment))
            await this.expireCalendarCoachPreviews(
              userId,
              source.id,
              calendarSid,
              tx,
            );
          else if (
            !automation &&
            !calendarMove &&
            !adjustment &&
            !(request.mode === 'SCHEDULE' && request.calendarAdjustment)
          )
            await this.invalidate(
              userId,
              source.id,
              tx,
              binding?.sid ? { sid: binding.sid } : undefined,
            );
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
          const data = {
            userId,
            sourcePlanId: source.id,
            mode: request.mode,
            request: json(request) as Prisma.InputJsonValue,
            proposal: json(proposal) as unknown as Prisma.InputJsonValue,
            sourceSnapshot: {
              sourceFingerprint: proposal.sourceFingerprint,
              factFingerprint: proposal.factFingerprint,
              ...(calendarMove
                ? { calendarMove }
                : adjustment ? { calendarAdjustmentId: adjustment.id }
                  : binding
                  ? { binding }
                  : { automationJobId: automation!.jobId }),
            },
            presentation: json(presentation) as Prisma.InputJsonValue,
            expiresAt,
          };
          const replacement = revised ?? refresh;
          const preview = replacement
            ? await tx.planProposalPreview.update({
                where: { id: replacement.previewId }, data,
              })
            : await tx.planProposalPreview.create({
                data: {
                  ...data,
                  ...(adjustment ? {
                    id: adjustment.versionId,
                    calendarAdjustmentId: adjustment.id,
                    calendarVersion: adjustment.number,
                    ...(proposal.calendarAdjustmentEdits?.length === 0 ? { discardedAt: new Date() } : {}),
                  } : {}),
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
              ...(request.mode === 'SCHEDULE' && request.calendarAdjustment
                ? { calendarAdjustmentId: request.calendarAdjustment.id }
                : {}),
              presentation,
            },
            presentation,
          };
        },
    );
  }

  private calendarTransaction<T>(userId: string, operation: (tx: PlanDb) => Promise<T>) {
    return withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(tx, userId);
      return operation(tx);
    }, { isolationLevel: 'Serializable', timeout: 60000 }));
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

  private async assertAutomationSports(
    settings: unknown,
    workouts: Array<{
      sportType?: string;
      sportDefinitionCode?: string | null;
      structureKind?: string;
      definition?: { kind?: string };
    }>,
    tx: PlanDb,
  ) {
    const sports = (settings as { sportTypes?: unknown })?.sportTypes;
    if (
      !Array.isArray(sports) ||
      !sports.length ||
      !(await this.rolling.areSportsAuthorized(sports, workouts, tx))
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
          await this.assertAutomationFacts(job, tx);
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
          await this.assertAutomationSports(
            job.policy.settings,
            proposal.candidate
              .filter((c) => c.candidateKey || changed.has(c.sourceWorkoutId!))
              .map((c) => c.workout),
            tx,
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
            weekStart,
            tx,
            range.from,
          );
          if (hash(dependencies) !== hash(proposal.automationMonthStrategyIds))
            fail('Month strategy changed after assessment');
          const receipt = await this.applyCandidate(
            { userId: job.plan.userId, contextPlanId: job.planId, tx },
            proposal,
            'automation',
          );
          const generation = ['WEEK', 'ADJUST'].includes(job.kind)
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
            reason: (job.receipt as { candidate?: { reason?: string } })
              ?.candidate?.reason,
            runId: (job.receipt as { runId?: string })?.runId,
            semanticRevision: (
              job.receipt as { input?: { semanticRevision?: string } }
            )?.input?.semanticRevision,
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
    const original = await args.tx.planProposalPreview.findUnique({
      where: { decisionId: args.decisionId },
      select: { calendarAdjustmentId: true, calendarVersion: true, discardedAt: true },
    });
    if (original?.calendarAdjustmentId) {
      const adjustment = await this.calendarAdjustmentHead(
        args.userId, proposal.planId, original.calendarAdjustmentId, args.tx,
      );
      if (original.discardedAt || original.calendarVersion !== adjustment?.calendarVersion)
        fail('The calendar adjustment has a newer state');
    }
    const calendarCoach =
      proposal.binding && isCalendarMoveSession(proposal.binding.sid)
        ? await this.calendarCoachSession(
            args.userId,
            proposal.binding.sid,
            args.tx,
          )
        : null;
    const applied = await this.applyCandidate(args, proposal);
    if (calendarCoach) {
      const { proposal: original } = await this.calendarMoveRecord(
        args.userId,
        proposal.planId,
        calendarCoach.previewId,
        args.tx,
      );
      const receipt: PlanCalendarMoveReceipt = {
        previewId: calendarCoach.previewId,
        planId: proposal.planId,
        readbackVerified: true,
        identityMap: applied.identityMap.filter(
          (item) => item.workoutId === calendarCoach.impact.workoutId,
        ),
      };
      await args.tx.planProposalPreview.update({
        where: { id: calendarCoach.previewId },
        data: {
          appliedAt: new Date(),
          proposal: json({
            ...original,
            calendarMoveReceipt: receipt,
          }) as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return applied;
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
    execution: 'coach' | 'automation' | 'calendar' = 'coach',
  ) {
    const tx = args.tx;
    const automation = execution === 'automation';
    if (execution === 'coach') {
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
    const readRange = proposal.calendarAdjustmentReadRange ?? (proposal.calendarMove
      ? calendarMoveReadRange(
          proposal.calendarMove,
          proposal.calendarMoveManuallyRevised && proposal.request.mode === 'SCHEDULE'
            ? proposal.request.range : undefined,
        )
      : schedule
        ? (proposal.request as PlanSchedulePreviewRequest).range
        : undefined);
    const source = await this.source(
      args.userId,
      proposal.planId,
      tx,
      false,
      schedule,
      readRange,
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
      (schedule ? source.activationTimezone : undefined) ??
      (await this.users.getPreferredTimezone(args.userId, tx)) ??
      'UTC';
    if (!schedule) this.assertFutureStart(proposal.startDate, timezone);
    if (
      timezone !== proposal.calendarTimeZone ||
      (!proposal.calendarAdjustmentReadRange && (await this.facts(
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
      )) !== proposal.factFingerprint)
    )
      fail('Training facts or calendar timezone changed; reassess the start');
    const meta = {
      source: execution === 'calendar' ? ('manual' as const) : ('ai' as const),
      action:
        execution === 'calendar'
          ? proposal.calendarEditHash ? 'calendar_edit_workouts' : 'calendar_move_workout'
          : automation
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
    if (automation) {
      const normalizedSource = normalizePlanRow(source, {
        workoutService: this.workout,
        workoutDefinitionService: this.definitions,
        workoutPersistence: this.persistence,
      })!;
      for (const candidate of proposal.candidate) {
        if (
          !candidate.sourceWorkoutId ||
          !changed.has(candidate.sourceWorkoutId)
        )
          continue;
        const prior = normalizedSource.workouts!.find(
          (w) => w.id === candidate.sourceWorkoutId,
        )!;
        const draft = candidate.workout;
        const resolved = this.definitions.resolve(draft.definition!);
        if (
          prior.weekIndex === draft.weekIndex &&
          prior.dayIndex === draft.dayIndex &&
          prior.sessionIndex === (draft.sessionIndex ?? 1) &&
          prior.sportType === draft.sportType &&
          prior.name === (draft.name ?? null) &&
          prior.notes === (draft.notes ?? null) &&
          prior.plannedSessionRpe === (draft.plannedSessionRpe ?? null) &&
          workoutStructureKey(prior.structure) ===
            workoutStructureKey(resolved.structure)
        )
          changed.delete(candidate.sourceWorkoutId);
      }
    }
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
    if (
      !automation ||
      input.workouts?.length ||
      input.deletedWorkoutIds?.length
    )
      await this.plans.updatePlan(args.userId, source.id, input, meta, {
        tx,
        ...(!schedule ? { validatedStartDate: proposal.startDate } : {}),
      });
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
    const readback = await this.storage.readback(source.id, tx, readRange);
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
        workoutStructureKey(actual.structure, this.workout) !==
          workoutStructureKey(expectedDefinition.structure, this.workout) ||
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
      changed: Boolean(
        input.workouts?.length || input.deletedWorkoutIds?.length,
      ),
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
