import { Injectable } from '@nestjs/common';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import type { PlanDb } from '../persistence/plan-db';
import { PlanService } from '../plan.service';
import { CoachContextService } from './coach-context.service';
import { UserService } from '@/api/user/user.service';
import { WorkoutPrescriptionService } from '@/api/workout/workout-prescription.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  activityCalendarYmdInZone,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';
import type { CanonicalPlanProposal } from './plan-proposal.service';
import type { CreatePlanDto } from '../dto/create-plan.dto';
import type { UpdatePlanWorkoutDto } from '../dto/update-plan-workout.dto';
import type { PlanProposalPresentation } from '@shared/plan-proposal';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanProposalRepository } from '../persistence/plan-proposal.repository';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { workoutImmutabilityReason } from './plan-workout-mutability.policy';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';

dayjs.extend(utc);
dayjs.extend(timezone);

type ApplyArgs = {
  userId: string;
  decisionId: string;
  branchId: string;
  contextPlanId: string;
  previewId: string;
  tx: PlanDb;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function conflict(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_CONFLICT,
    message,
  });
}

function invalid(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_INVALID,
    message,
  });
}

@Injectable()
export class PlanProposalApplyService {
  constructor(
    private readonly planService: PlanService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly proposals: PlanProposalRepository,
    private readonly coachContext: CoachContextService,
    private readonly users: UserService,
    private readonly prescriptions: WorkoutPrescriptionService,
    private readonly loads: PlanLoadEstimatorService,
  ) {}

  async apply(args: ApplyArgs) {
    await acquireHashtextAdvisoryXactLock(args.tx, args.userId);
    const preview = await this.proposals.findUnique(
      {
        where: { id: args.previewId },
      },
      args.tx,
    );
    if (!preview || preview.userId !== args.userId)
      invalid('Plan proposal preview not found');
    if (preview.decisionId !== args.decisionId)
      conflict('Plan proposal is linked to a different decision');
    if (preview.appliedAt) conflict('Plan proposal has already been applied');
    if (preview.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_EXPIRED,
        message: 'Plan proposal has expired; generate a fresh preview',
      });
    }
    if (preview.sourcePlanId !== args.contextPlanId)
      conflict('Decision no longer belongs to the source plan context');

    const proposal = preview.proposal as unknown as CanonicalPlanProposal;
    const presentation =
      preview.presentation as unknown as PlanProposalPresentation;
    const receipt =
      proposal.mode === 'ADAPT'
        ? await this.applyAdaptation(args, proposal)
        : await this.applySupersession(args, proposal);

    const consumed = await this.proposals.updateMany(
      {
        where: { id: preview.id, appliedAt: null },
        data: {
          appliedAt: new Date(),
          appliedDecisionId: args.decisionId,
          ...(receipt.createdPlanId
            ? { createdPlanId: receipt.createdPlanId }
            : {}),
        },
      },
      args.tx,
    );
    if (consumed.count !== 1)
      conflict('Plan proposal was consumed concurrently');
    return {
      previewId: preview.id,
      mode: proposal.mode,
      presentation,
      ...receipt,
    };
  }

  private async applyAdaptation(
    args: ApplyArgs,
    proposal: Extract<CanonicalPlanProposal, { mode: 'ADAPT' }>,
  ) {
    if (proposal.planId !== args.contextPlanId)
      conflict('Adaptation targets a different plan');
    if (!proposal.changes.length) invalid('Adaptation contains no changes');

    const ids = proposal.changes.map((change) => change.workoutId);
    const assessedIds = proposal.sourceWorkouts.map((workout) => workout.id);
    const current = await this.workouts.findMany(
      {
        where: {
          id: { in: assessedIds },
          planId: proposal.planId,
          userId: args.userId,
        },
        include: {
          steps: { include: { children: true } },
          links: { where: { unlinkedAt: null } },
          plan: { include: { supersededBy: true } },
        },
      },
      args.tx,
    );
    if (current.length !== assessedIds.length)
      conflict('One or more assessed workouts no longer exist');
    const byId = new Map(current.map((workout) => [workout.id, workout]));
    const zoneFingerprints = new Map<string, Promise<string | null>>();
    const athleteTimezone = await this.users.getPreferredTimezone(
      args.userId,
      args.tx,
    );
    const athleteTodayYmd =
      activityCalendarYmdInZone(new Date(), athleteTimezone) ??
      new Date().toISOString().slice(0, 10);
    for (const expected of proposal.sourceWorkouts) {
      const workout = byId.get(expected.id);
      if (!workout || workout.revision !== expected.revision)
        conflict(`Workout ${expected.id} changed after preview`);
      // source workout 的 Z4 是动态引用，阈值变化不等于计划被修改。
      // 这里只锁计划状态；真正要写入的新目标在下方用 preview fingerprint 单独校验。
      if (
        workout.plan?.status !== proposal.expectedPlanStatus ||
        workout.status !== expected.status ||
        (workout.scheduledDate?.toISOString().slice(0, 10) ?? null) !==
          expected.scheduledDate ||
        workout.links.length !== expected.activeActivityLinkCount
      ) {
        conflict(`Workout ${expected.id} state changed after preview`);
      }
      if (
        workoutImmutabilityReason({
          planStatus: workout.plan.status,
          workoutStatus: workout.status,
          scheduledDateYmd:
            workout.scheduledDate?.toISOString().slice(0, 10) ?? null,
          athleteTodayYmd,
          activeActivityLinkCount: workout.links.length,
          pendingSupersessionYmd:
            workout.plan.supersededBy?.status === 'SCHEDULED'
              ? (workout.plan.supersededBy.startDate
                  ?.toISOString()
                  .slice(0, 10) ?? null)
              : null,
        })
      ) {
        conflict(`Workout ${expected.id} is no longer mutable`);
      }
    }
    for (const change of proposal.changes) {
      const workout = byId.get(change.workoutId)!;
      if (workout.revision !== change.expectedRevision)
        conflict(`Workout ${workout.id} changed after preview`);
      if (workout.links.length)
        conflict(`Workout ${workout.id} became linked after preview`);
      const dynamicTarget = this.firstDynamicTarget(change.dto.blocks);
      if (dynamicTarget) {
        const fingerprint = await this.cachedCurrentZoneFingerprint(
          zoneFingerprints,
          `${workout.sportType}:${dynamicTarget.dimension}`,
          {
            userId: args.userId,
            sportType: workout.sportType,
            dimension: dynamicTarget.dimension,
          },
          args.tx,
        );
        if (
          !fingerprint ||
          fingerprint !== dynamicTarget.fingerprint ||
          fingerprint !== change.expectedZoneFingerprint
        ) {
          conflict(`Training zones changed after preview for ${workout.id}`);
        }
      }
    }

    const changes = proposal.changes.map((change) => ({
      workoutId: change.workoutId,
      dto: change.dto as UpdatePlanWorkoutDto,
    }));
    const applied = await this.planService.updateWorkouts(
      args.userId,
      proposal.planId,
      changes,
      {
        source: 'ai',
        action: 'decision_apply_plan_adaptation',
        decisionId: args.decisionId,
        branchId: args.branchId,
      },
      { tx: args.tx },
    );
    await this.workouts.updateExternalMappings(
      {
        where: {
          planWorkoutId: { in: ids },
          syncState: { notIn: ['LOCAL_DELETED', 'REMOTE_DELETED'] },
        },
        data: { syncState: 'LOCAL_CHANGED', lastError: null },
      },
      args.tx,
    );
    return {
      planId: proposal.planId,
      createdPlanId: null as string | null,
      changedWorkoutCount: applied.after.length,
      workoutIds: ids,
    };
  }

  private async applySupersession(
    args: ApplyArgs,
    proposal: Extract<CanonicalPlanProposal, { mode: 'SUPERSEDE' }>,
  ) {
    if (proposal.sourcePlanId !== args.contextPlanId)
      conflict('Supersession targets a different source plan');
    const source = await this.plans.findUnique(
      {
        where: { id: proposal.sourcePlanId },
        include: {
          supersededBy: true,
          workouts: {
            include: {
              links: { where: { unlinkedAt: null }, select: { id: true } },
              steps: {
                where: { parentId: null },
                include: { children: true },
              },
            },
          },
        },
      },
      args.tx,
    );
    if (!source || source.userId !== args.userId)
      conflict('Source plan no longer exists');
    if (!['ACTIVE', 'PAUSED'].includes(source.status))
      conflict('Source plan is no longer active or paused');
    if (source.supersededBy) conflict('Source plan already has a successor');
    if (source.workouts.length !== proposal.sourceWorkouts.length)
      conflict('Source plan workouts changed after preview');
    const currentWorkouts = new Map(
      source.workouts.map((workout) => [workout.id, workout]),
    );
    for (const expected of proposal.sourceWorkouts) {
      const workout = currentWorkouts.get(expected.id);
      if (!workout || workout.revision !== expected.revision)
        conflict(`Workout ${expected.id} changed after preview`);
      // supersession 同样不把来源计划的动态区间投影当作并发版本。
      if (
        workout.status !== expected.status ||
        (workout.scheduledDate?.toISOString().slice(0, 10) ?? null) !==
          expected.scheduledDate ||
        workout.links.length !== expected.activeActivityLinkCount
      ) {
        conflict(`Workout ${expected.id} state changed after preview`);
      }
    }
    for (const expected of proposal.expectedReplacementZones ?? []) {
      const currentFingerprint = await this.currentZoneFingerprint(
        {
          userId: args.userId,
          sportType: expected.sportType,
          dimension: expected.dimension,
        },
        args.tx,
      );
      if (currentFingerprint !== expected.fingerprint) {
        conflict(
          `Training zones changed after preview for ${expected.sportType} ${expected.dimension}`,
        );
      }
    }
    const anotherScheduled = await this.plans.findFirst(
      {
        where: {
          userId: args.userId,
          status: 'SCHEDULED',
        },
        select: { id: true },
      },
      args.tx,
    );
    if (anotherScheduled)
      conflict('Another replacement plan is already scheduled');

    const timezone = await this.users.getPreferredTimezone(
      args.userId,
      args.tx,
    );
    const today =
      activityCalendarYmdInZone(new Date(), timezone) ??
      new Date().toISOString().slice(0, 10);
    if (proposal.effectiveFrom < today)
      conflict('The replacement effective date is now in the past');

    const created = await this.planService.createPlan(
      args.userId,
      {
        title: proposal.plan.title,
        description: proposal.plan.description,
        goal: proposal.plan.goal,
        sourceType: 'AI',
        generationMetadata: {
          proposalPreview: true,
          supersedesPlanId: source.id,
          rationale: proposal.rationale,
        },
        periodWeeks: proposal.plan.periodWeeks,
        workouts: proposal.plan.workouts,
      } as CreatePlanDto,
      { tx: args.tx },
    );
    const createdPlanId = created.plan.id;
    const startDate = scheduledDateFromCalendar(proposal.effectiveFrom);
    const endDate = new Date(startDate);
    endDate.setUTCDate(
      endDate.getUTCDate() + proposal.plan.periodWeeks * 7 - 1,
    );

    await this.plans.update(
      {
        where: { id: createdPlanId },
        data: {
          supersedesPlanId: source.id,
          startDate,
          endDate,
          activationTimezone: proposal.activationTimezone,
        },
      },
      args.tx,
    );
    const newWorkouts = await this.workouts.findMany(
      {
        where: { planId: createdPlanId },
        select: { id: true, dayOffset: true },
      },
      args.tx,
    );
    for (const workout of newWorkouts) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setUTCDate(scheduledDate.getUTCDate() + workout.dayOffset);
      await this.workouts.update(
        {
          where: { id: workout.id },
          data: { scheduledDate },
        },
        args.tx,
      );
    }

    const immediate = proposal.effectiveFrom === today;
    if (immediate) {
      await this.plans.update(
        {
          where: { id: source.id },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        },
        args.tx,
      );
      await this.planService.activatePlan(
        args.userId,
        createdPlanId,
        proposal.effectiveFrom,
        {
          source: 'ai',
          action: 'decision_apply_plan_supersession',
          decisionId: args.decisionId,
          branchId: args.branchId,
        },
        { tx: args.tx },
      );
      await this.coachContext.supersedeContext({
        userId: args.userId,
        planId: source.id,
        successorPlanId: createdPlanId,
        effectiveFrom: proposal.effectiveFrom,
        source: 'ai',
        decisionId: args.decisionId,
        branchId: args.branchId,
        tx: args.tx,
      });
    } else {
      const activationAt = dayjs
        .tz(`${proposal.effectiveFrom}T00:00:00`, proposal.activationTimezone)
        .toDate();
      await this.plans.update(
        {
          where: { id: createdPlanId },
          data: {
            status: 'SCHEDULED',
            scheduledActivationAt: activationAt,
          },
        },
        args.tx,
      );
      await this.coachContext.ensureContext({
        userId: args.userId,
        planId: createdPlanId,
        startDate,
        endDate,
        status: 'SCHEDULED',
        tx: args.tx,
      });
      await this.coachContext.appendEvent({
        userId: args.userId,
        planId: source.id,
        type: 'ADAPTATION_APPLIED',
        source: 'ai',
        decisionId: args.decisionId,
        branchId: args.branchId,
        payload: {
          action: 'plan_supersession_scheduled',
          successorPlanId: createdPlanId,
          effectiveFrom: proposal.effectiveFrom,
        },
        tx: args.tx,
      });
      await this.loads.applyForPlan(createdPlanId, { tx: args.tx });
    }

    await this.workouts.updateExternalMappings(
      {
        where: {
          planWorkout: {
            planId: source.id,
            scheduledDate: { gte: startDate },
          },
          syncState: { notIn: ['LOCAL_DELETED', 'REMOTE_DELETED'] },
        },
        data: {
          syncState: 'LOCAL_DELETED',
          localDeletedAt: new Date(),
          lastError: null,
        },
      },
      args.tx,
    );

    return {
      planId: source.id,
      createdPlanId,
      changedWorkoutCount: proposal.plan.workouts.length,
      workoutIds: newWorkouts.map((workout) => workout.id),
      status: immediate ? 'ACTIVE' : 'SCHEDULED',
      effectiveFrom: proposal.effectiveFrom,
    };
  }

  private firstDynamicTarget(blocks: unknown): {
    dimension: 'PACE' | 'HEART_RATE' | 'POWER';
    fingerprint: string;
  } | null {
    const visit = (
      value: unknown,
    ): ReturnType<PlanProposalApplyService['firstDynamicTarget']> => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item);
          if (found) return found;
        }
        return null;
      }
      const row = record(value);
      if (!row) return null;
      if (
        row.resolutionMode === 'DYNAMIC_ZONE' &&
        typeof row.zoneFingerprint === 'string'
      ) {
        const kind = String(row.kind ?? '');
        return {
          dimension:
            kind === 'SPEED'
              ? 'PACE'
              : kind.startsWith('HEART_RATE')
                ? 'HEART_RATE'
                : 'POWER',
          fingerprint: row.zoneFingerprint,
        };
      }
      for (const child of Object.values(row)) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(blocks);
  }

  private async currentZoneFingerprint(
    args: {
      userId: string;
      sportType: string;
      dimension: 'PACE' | 'HEART_RATE' | 'POWER';
    },
    tx: PlanDb,
  ): Promise<string | null> {
    if (!['RUN', 'CYCLING', 'SWIM'].includes(args.sportType)) return null;
    const sportType = args.sportType as 'RUN' | 'CYCLING' | 'SWIM';
    const profile = await this.users.getComposedUserProfile(
      args.userId,
      sportType,
      undefined,
      tx,
    );
    const setting =
      args.dimension === 'PACE'
        ? await this.users.getPaceZoneSettingResolved(
            args.userId,
            sportType,
            {
              vo2max: profile?.vo2max,
              tp: profile?.tp,
              cs: profile?.cs,
              paceZoneModel: profile?.paceZoneModel,
            },
            tx,
          )
        : args.dimension === 'POWER'
          ? await this.users.getPowerZoneSettingResolved(
              args.userId,
              sportType,
              {
                FTP: profile?.ftp,
                CP: profile?.cp,
                powerZoneModel: profile?.powerZoneModel,
              },
              tx,
            )
          : await this.users.getHeartRateZoneSetting(
              args.userId,
              sportType,
              {
                maxHeartRate: profile?.maxHeartRate,
                restingHeartRate: profile?.restingHeartRate,
                lthr: profile?.lthr,
                heartRateZoneModel: profile?.heartRateZoneModel,
              },
              tx,
            );
    if (!setting?.zones?.length) return null;
    return this.prescriptions.zoneIdentity({
      sportType,
      dimension: args.dimension,
      setting,
    }).fingerprint;
  }

  private cachedCurrentZoneFingerprint(
    cache: Map<string, Promise<string | null>>,
    key: string,
    args: {
      userId: string;
      sportType: string;
      dimension: 'PACE' | 'HEART_RATE' | 'POWER';
    },
    tx: PlanDb,
  ): Promise<string | null> {
    const pending = cache.get(key) ?? this.currentZoneFingerprint(args, tx);
    cache.set(key, pending);
    return pending;
  }
}
