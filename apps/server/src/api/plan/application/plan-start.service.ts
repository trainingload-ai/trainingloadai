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
  isCalendarDate,
  parseScheduleConstraints,
  resolveScheduleQualityContract,
} from '@shared/plan-calendar';
import {
  assessPlanQuality,
  parsePlanQualityContract,
} from '@shared/plan-quality';
import { normalizePlanRow } from './plan-row.mapper';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
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
  mode: 'START';
  planId: string;
  binding: PlanStartBinding;
  conversationRevision: number;
  startDate: string;
  calendarTimeZone: string;
  sourceFingerprint: string;
  factFingerprint: string;
  sourceWorkouts: Array<{ id: string; revision: number }>;
  request: PlanStartPreviewRequest;
  candidate: Array<{
    sourceWorkoutId?: string;
    candidateKey?: string;
    workout: PlanStartWorkoutDraft;
  }>;
  preserved: Array<{ sourceWorkoutId: string; expectedRevision: number }>;
  presentation: PlanProposalPresentation;
};

/** Owns the saved-draft start candidate and transaction-scoped source/fact binding. */
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
  ): Promise<Source> {
    const plan = await this.storage.source(planId, tx);
    if (
      !plan ||
      plan.userId !== userId ||
      (plan.status !== 'DRAFT' && !(allowStarted && plan.status === 'ACTIVE'))
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
      title: plan.title,
      description: plan.description,
      goal: plan.goal,
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
      tx.activity.findMany({
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
      tx.userDailyHealthMetric.findMany({
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
      tx.userProfile.findUnique({ where: { userId } }),
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
      tx.userZoneSetting.findMany({
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
      tx.competitionEvent.findMany({
        where: { userId, startDate: { gte: since, lte: until } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          version: true,
          startDate: true,
          endDate: true,
          startTimeMinute: true,
          timezone: true,
          status: true,
          deletedAt: true,
          importance: true,
          sportType: true,
          goalType: true,
          targetTimeSeconds: true,
          distanceMeters: true,
        },
      }),
      tx.userAnalysisConfigVersion.findMany({
        where: { userId },
        orderBy: { effectiveAt: 'asc' },
        select: { effectiveAt: true, loadSources: true },
      }),
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
      where: { userId, sourcePlanId: planId, mode: 'START', appliedAt: null },
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
    if (!session?.planStartPlanId) return;
    await acquireHashtextAdvisoryXactLock(tx, userId);
    session = await tx.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: sid } },
    });
    if (!session?.planStartPlanId || session.planStartBranchId !== branchId)
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
            decisionType: 'PLAN_START',
            state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] },
            context: { userId, planId: session.planStartPlanId },
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
    if (!exactCard) await this.invalidate(userId, session.planStartPlanId, tx);
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

          const startDate =
            selectedDate ??
            prior?.planStartDate ??
            activityCalendarYmdInZone(new Date(), calendarTimeZone)!;
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
            earliestStartDate: this.earliestStartDate(calendarTimeZone),
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
      session.planStartPlanId !== planId ||
      session.planStartBranchId !== binding.branchId ||
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
    return session;
  }

  async createPreview(
    userId: string,
    request: PlanStartPreviewRequest,
    binding?: PlanStartBinding,
  ): Promise<PlanProposalPreviewResult> {
    if (!binding) fail('A server-owned start conversation is required');
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await acquireHashtextAdvisoryXactLock(tx, userId);
          const session = await this.assertBinding(
            userId,
            request.planId,
            binding,
            tx,
            request.startDate,
          );
          if (!isCalendarDate(request.startDate))
            fail('Invalid calendar start date');
          const source = await this.source(userId, request.planId, tx);
          const calendarTimeZone =
            this.constraints(request.scheduleConstraints)?.calendarTimeZone ??
            this.constraints(
              (source.generationMetadata as Record<string, unknown> | null)
                ?.scheduleConstraints,
            )?.calendarTimeZone ??
            (await this.users.getPreferredTimezone(userId, tx)) ??
            'UTC';
          this.assertFutureStart(request.startDate, calendarTimeZone);
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
          const cover = (item: {
            sourceWorkoutId: string;
            expectedRevision: number;
          }) => {
            const row = byId.get(item.sourceWorkoutId);
            if (
              !row ||
              row.revision !== item.expectedRevision ||
              covered.has(row.id)
            )
              fail(
                'Each source workout must be covered exactly once at its current revision',
              );
            if (row.status !== 'PLANNED' || row.links.length)
              fail('A protected or linked workout cannot be started');
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
            cover(item);
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
          if (!candidate.length)
            fail('A start candidate must contain at least one workout');
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
              w.weekIndex > source.periodWeeks ||
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
          const contract = request.qualityContractTransition
            ? resolveScheduleQualityContract(
                parsePlanQualityContract(metadata.qualityContract),
                request.qualityContractTransition,
              )
            : parsePlanQualityContract(metadata.qualityContract);
          const quality = assessPlanQuality(
            source.periodWeeks,
            display.map((w) => ({
              ...w,
              durationSeconds: w.summary?.durationSeconds,
            })),
            contract,
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
            status: 'PLANNED',
            sportType: w.sportType ?? 'UNKNOWN',
            durationSeconds: w.summary?.durationSeconds ?? null,
          }));
          const report = assessPlanSchedule({
            periodWeeks: source.periodWeeks,
            workouts: scheduled,
            changedWorkoutIds: scheduled.map((w) => w.id),
            startDate: request.startDate,
            constraints: constraints ?? undefined,
            qualityContract: contract,
            projectDates: true,
          });
          if (!report.valid)
            throw new UnprocessableEntityException({
              code: 'PLAN_SCHEDULE_INVALID',
              issues: report.issues,
            });
          const presentation: PlanProposalPresentation = {
            title: source.title,
            summary: request.rationale,
            mode: 'START',
            startDate: request.startDate,
            calendarTimeZone,
            ...(constraints ? { scheduleConstraints: constraints } : {}),
            calendarDraft: {
              title: source.title,
              periodWeeks: source.periodWeeks,
              workouts: display,
            },
            facts: request.evidenceRefs ?? [],
            counts: {
              total: candidate.length,
              changed: request.changes.length,
              preserved: preserved.length,
              skipped: 0,
              added: request.additions.length,
              deleted: request.deletions.length,
            },
            syncImpact: '',
            rows: [
              ...candidate.map((item) => {
                const w = item.workout;
                const date = new Date(`${request.startDate}T00:00:00Z`);
                date.setUTCDate(
                  date.getUTCDate() + (w.weekIndex - 1) * 7 + w.dayIndex - 1,
                );
                return {
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
                const date = new Date(`${request.startDate}T00:00:00Z`);
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
            mode: 'START',
            planId: source.id,
            binding: binding!,
            conversationRevision: session.planStartRevision,
            startDate: request.startDate,
            calendarTimeZone,
            sourceFingerprint: this.fingerprint(source),
            factFingerprint: await this.facts(
              userId,
              source.id,
              request.startDate,
              source.periodWeeks,
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
              mode: 'START',
              request: json(request) as Prisma.InputJsonValue,
              proposal: json(proposal) as unknown as Prisma.InputJsonValue,
              sourceSnapshot: {
                sourceFingerprint: proposal.sourceFingerprint,
                factFingerprint: proposal.factFingerprint,
                binding: binding!,
              },
              presentation: json(presentation) as Prisma.InputJsonValue,
              expiresAt,
            },
          });
          return {
            kind: 'plan_proposal_preview',
            previewId: preview.id,
            mode: 'START',
            expiresAt: expiresAt.toISOString(),
            decisionType: 'PLAN_START',
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
    const tx = args.tx;
    const session = await this.assertBinding(
      args.userId,
      proposal.planId,
      { sid: proposal.binding.sid, branchId: proposal.binding.branchId },
      tx,
      proposal.startDate,
    );
    if (
      session.planStartRevision !== proposal.conversationRevision ||
      args.branchId !== proposal.binding.branchId ||
      args.contextPlanId !== proposal.planId
    )
      fail('Start conversation changed; reassess the start');
    const source = await this.source(args.userId, proposal.planId, tx);
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
    this.assertFutureStart(proposal.startDate, timezone);
    if (
      timezone !== proposal.calendarTimeZone ||
      (await this.facts(
        args.userId,
        source.id,
        proposal.startDate,
        source.periodWeeks,
        tx,
      )) !== proposal.factFingerprint
    )
      fail('Training facts or calendar timezone changed; reassess the start');
    const meta = {
      source: 'ai' as const,
      action: 'decision_apply_plan_start',
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
    const readback = await this.storage.readback(source.id, tx);
    if (
      readback.status !== 'ACTIVE' ||
      readback.activationTimezone !== proposal.calendarTimeZone ||
      readback.startDate?.toISOString().slice(0, 10) !== proposal.startDate ||
      readback.workouts.length !== proposal.candidate.length
    )
      fail('Start readback failed');
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
    const expectedContract = proposal.request.qualityContractTransition
      ? resolveScheduleQualityContract(
          parsePlanQualityContract(
            (source.generationMetadata as Record<string, unknown> | null)
              ?.qualityContract,
          ),
          proposal.request.qualityContractTransition,
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
    return {
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
    };
  }
}
