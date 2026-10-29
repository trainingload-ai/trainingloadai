import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserService } from '@/api/user/user.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  WorkoutPrescriptionError,
  WorkoutPrescriptionService,
  type PrescriptionTargetDimension,
  type PrescriptionZoneSetting,
} from '@/api/workout/workout-prescription.service';
import {
  WorkoutService,
  type PlanBlock,
  type WorkRestStep,
} from '@/api/workout/workout.service';
import { activityCalendarYmdInZone } from '../plan-link-calendar.util';
import { workoutImmutabilityReason } from './plan-workout-mutability.policy';
import type {
  PlanAdaptationPreviewRequest,
  PlanAssessmentGroup,
  PlanProposalEvidenceRef,
  PlanProposalPresentation,
  PlanProposalPreviewRequest,
  PlanProposalPreviewResult,
  PlanReplacementDraft,
  PlanSupersessionPreviewRequest,
} from '@shared/plan-proposal';
import type { EnduranceWorkoutStepTarget } from '@shared/endurance-workout-ir';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanProposalRepository } from '../persistence/plan-proposal.repository';
import type { PlanDb } from '../persistence/plan-db';

const PREVIEW_TTL_MS = 30 * 60 * 1000;

type ProposalWorkoutRow = Prisma.PlanWorkoutGetPayload<{
  include: {
    plan: { include: { supersededBy: true } };
    links: true;
    externalMappings: true;
    steps: { include: { children: true } };
  };
}>;

type CanonicalAdaptChange = {
  workoutId: string;
  expectedRevision: number;
  expectedZoneFingerprint: string | null;
  dto: {
    weekIndex: number;
    dayIndex: number;
    sessionIndex: number;
    sportType: string;
    sportDefinitionCode?: string | null;
    name?: string | null;
    notes?: string | null;
    text: string;
    blocks: PlanBlock[];
    reason: string;
  };
};

type CanonicalWorkoutSnapshot = {
  id: string;
  revision: number;
  dynamicZones: Array<{
    dimension: PrescriptionTargetDimension;
    fingerprint: string;
  }>;
  status: string;
  scheduledDate: string | null;
  activeActivityLinkCount: number;
};

type CanonicalAdaptProposal = {
  mode: 'ADAPT';
  planId: string;
  expectedPlanStatus: string;
  sourceWorkouts: CanonicalWorkoutSnapshot[];
  changes: CanonicalAdaptChange[];
  preservedWorkoutIds: string[];
};

type CanonicalSupersedeProposal = {
  mode: 'SUPERSEDE';
  sourcePlanId: string;
  sourceWorkouts: CanonicalWorkoutSnapshot[];
  expectedReplacementZones: Array<{
    sportType: 'RUN' | 'CYCLING' | 'SWIM';
    dimension: PrescriptionTargetDimension;
    systemKey: string;
    fingerprint: string;
  }>;
  effectiveFrom: string;
  activationTimezone: string;
  rationale: string;
  plan: PlanReplacementDraft;
};

export type CanonicalPlanProposal =
  | CanonicalAdaptProposal
  | CanonicalSupersedeProposal;

function invalid(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_INVALID,
    message,
  });
}

function expired(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_EXPIRED,
    message,
  });
}

function conflict(message: string): never {
  throw new BusinessException({
    code: BUSINESS_ERROR_CODE.PLAN_PROPOSAL_CONFLICT,
    message,
  });
}

function ymd(value?: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function addYmdDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isChineseLocale(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

function immutableReasonText(reason: string, zh: boolean) {
  const values: Record<string, [string, string]> = {
    PLAN_STATUS: ['计划当前状态不可修改', 'The plan status is immutable'],
    WORKOUT_STATUS: [
      '课时已开始或已结束',
      'The workout has started or finished',
    ],
    ACTIVITY_LINKED: ['课时已绑定活动', 'The workout is linked to an activity'],
    HISTORY: ['历史课时不可修改', 'Historical workouts are immutable'],
    PENDING_SUPERSESSION: [
      '该日期已由待接管计划覆盖',
      'A scheduled successor already covers this date',
    ],
  };
  return (
    values[reason]?.[zh ? 0 : 1] ??
    (zh ? '不符合修改条件' : 'Not eligible for change')
  );
}

function toWeekDay(dayOffset: number) {
  return {
    weekIndex: Math.floor(dayOffset / 7) + 1,
    dayIndex: (dayOffset % 7) + 1,
  };
}

function targetSummary(
  target: EnduranceWorkoutStepTarget | null,
  zh = false,
  sportType?: string,
): string {
  if (!target) return zh ? 'RPE / 对话测试体感' : 'RPE / talk-test effort';
  const auxiliaryRpe = target.intensityIntent?.auxiliaryRpe;
  const rpe = auxiliaryRpe
    ? `, RPE ${auxiliaryRpe.low}${auxiliaryRpe.high != null ? `–${auxiliaryRpe.high}` : ''}${zh ? '（辅助检查）' : ' as an auxiliary check'}`
    : '';
  if (target.kind === 'NONE') {
    return auxiliaryRpe
      ? `RPE ${auxiliaryRpe.low}${auxiliaryRpe.high != null ? `–${auxiliaryRpe.high}` : ''} / ${zh ? '对话测试体感' : 'talk-test effort'}`
      : zh
        ? 'RPE / 对话测试体感'
        : 'RPE / talk-test effort';
  }
  if (target.zoneIndex) {
    const dimension =
      target.kind === 'SPEED'
        ? zh
          ? '配速'
          : 'PACE'
        : target.kind.startsWith('HEART_RATE')
          ? zh
            ? '心率'
            : 'HEART_RATE'
          : zh
            ? '功率'
            : 'POWER';
    return `${dimension} ${target.zoneLabel ?? `Z${target.zoneIndex}`}${rpe}`;
  }
  const low = target.value;
  const high = target.valueHigh;
  if (target.kind === 'SPEED' && target.unit === 'seconds' && low != null) {
    const pace = (seconds: number) => {
      const rounded = Math.round(seconds);
      return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
    };
    const range =
      high == null || high === low ? pace(low) : `${pace(low)}–${pace(high)}`;
    return `${range}${sportType === 'SWIM' ? '/100m' : '/km'}${rpe}`;
  }
  const range =
    low == null && high == null
      ? ''
      : low === high || high == null
        ? `${low}`
        : `${low}–${high}`;
  return `${range}${target.unit ? ` ${target.unit}` : ''}${rpe}`.trim();
}

function currentTargetSummary(
  blocks: PlanBlock[],
  zh = false,
  sportType?: string,
): string {
  const targets: string[] = [];
  const visit = (items: PlanBlock[]) => {
    for (const block of items) {
      if (block.type === 'repeat') {
        visit(block.children);
        continue;
      }
      for (const step of block.steps) {
        if (step.primaryTargetMeta)
          targets.push(targetSummary(step.primaryTargetMeta, zh, sportType));
      }
    }
  };
  visit(blocks);
  return (
    [...new Set(targets)].join(', ') ||
    (zh ? 'RPE / 对话测试体感' : 'RPE / talk-test effort')
  );
}

function applyTargetToWorkSteps(
  blocks: PlanBlock[],
  target: EnduranceWorkoutStepTarget | null,
): PlanBlock[] {
  const clearLegacyFields = (step: WorkRestStep): WorkRestStep => ({
    ...step,
    power: undefined,
    powerWatts: undefined,
    heartRatePercent: undefined,
    heartRateBpm: undefined,
    paceKmh: undefined,
    primaryTargetMeta: target ? { ...target } : null,
  });
  const applyWorkRestBlock = (
    block: Extract<PlanBlock, { type: 'work' | 'rest' }>,
  ) => {
    if (block.type !== 'work') return block;
    return {
      ...block,
      steps: block.steps.map((step) =>
        ['WARMUP', 'COOLDOWN', 'RECOVERY', 'REST'].includes(
          String(step.stepKind ?? ''),
        )
          ? step
          : clearLegacyFields(step),
      ),
    };
  };
  return blocks.map((block): PlanBlock => {
    if (block.type === 'repeat') {
      return {
        ...block,
        children: block.children.map(applyWorkRestBlock),
      };
    }
    return applyWorkRestBlock(block);
  });
}

@Injectable()
export class PlanProposalService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly proposals: PlanProposalRepository,
    private readonly users: UserService,
    private readonly workout: WorkoutService,
    private readonly prescriptions: WorkoutPrescriptionService,
    private readonly loads: PlanLoadEstimatorService,
  ) {}

  async createPreview(
    userId: string,
    request: PlanProposalPreviewRequest,
  ): Promise<PlanProposalPreviewResult> {
    return request.mode === 'ADAPT'
      ? this.createAdaptPreview(userId, request)
      : this.createSupersedePreview(userId, request);
  }

  async resolveDecisionPayload(args: {
    userId: string;
    sourcePlanId: string;
    previewId: string;
    mode: 'ADAPT' | 'SUPERSEDE';
  }) {
    const preview = await this.proposals.findUnique({
      where: { id: args.previewId },
    });
    if (
      !preview ||
      preview.userId !== args.userId ||
      preview.sourcePlanId !== args.sourcePlanId ||
      preview.mode !== args.mode
    ) {
      invalid('Plan proposal preview is unavailable');
    }
    if (preview.expiresAt.getTime() <= Date.now())
      expired('Plan proposal has expired; generate a fresh preview');
    if (preview.decisionId || preview.appliedAt)
      conflict('Plan proposal preview is already linked or applied');
    return {
      planId: args.sourcePlanId,
      previewId: preview.id,
      presentation: preview.presentation as unknown as PlanProposalPresentation,
    };
  }

  async claimDecision(args: {
    previewId: string;
    decisionId: string;
    userId: string;
    sourcePlanId: string;
    tx: PlanDb;
  }) {
    const claimed = await this.proposals.updateMany(
      {
        where: {
          id: args.previewId,
          userId: args.userId,
          sourcePlanId: args.sourcePlanId,
          decisionId: null,
          appliedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { decisionId: args.decisionId },
      },
      args.tx,
    );
    if (claimed.count !== 1) {
      const preview = await this.proposals.findUnique(
        { where: { id: args.previewId } },
        args.tx,
      );
      if (
        preview?.userId === args.userId &&
        preview.sourcePlanId === args.sourcePlanId &&
        preview.expiresAt.getTime() <= Date.now()
      ) {
        expired('Plan proposal has expired; generate a fresh preview');
      }
      conflict('Plan proposal preview is unavailable or already linked');
    }
  }

  private async loadSourcePlan(userId: string, planId: string) {
    const plan = await this.plans.findUnique({
      where: { id: planId },
      include: {
        supersededBy: true,
        workouts: {
          orderBy: [{ dayOffset: 'asc' }, { sessionIndex: 'asc' }],
          include: {
            plan: { include: { supersededBy: true } },
            links: { where: { unlinkedAt: null } },
            externalMappings: {
              where: {
                syncState: { notIn: ['LOCAL_DELETED', 'REMOTE_DELETED'] },
              },
            },
            steps: {
              where: { parentId: null },
              orderBy: { orderIndex: 'asc' },
              include: { children: { orderBy: { orderIndex: 'asc' } } },
            },
          },
        },
      },
    });
    if (!plan || plan.userId !== userId) invalid('Plan not found');
    return plan;
  }

  private async createAdaptPreview(
    userId: string,
    request: PlanAdaptationPreviewRequest,
  ): Promise<PlanProposalPreviewResult> {
    const planId = String(request.planId ?? '').trim();
    if (!planId) invalid('planId is required');
    if (!['WORKOUT', 'PLAN_REMAINING'].includes(request.scope))
      invalid('scope must be WORKOUT or PLAN_REMAINING');
    const plan = await this.loadSourcePlan(userId, planId);
    if (
      !Array.isArray(request.assessmentGroups) ||
      !request.assessmentGroups.length
    )
      invalid('assessmentGroups must not be empty');
    const assessmentGroups = request.assessmentGroups.map((group) =>
      this.normalizeAssessmentGroup(group),
    );

    const [timezone, locale] = await Promise.all([
      this.users.getPreferredTimezone(userId),
      this.users.getPreferredLocale(userId),
    ]);
    const zh = isChineseLocale(locale);
    const today =
      activityCalendarYmdInZone(new Date(), timezone) ??
      new Date().toISOString().slice(0, 10);
    const immutableReasons = new Map<string, string>();
    const eligible = plan.workouts.filter((workout) => {
      const reason = workoutImmutabilityReason({
        planStatus: plan.status,
        workoutStatus: workout.status,
        scheduledDateYmd: ymd(workout.scheduledDate),
        athleteTodayYmd: today,
        activeActivityLinkCount: workout.links.length,
        pendingSupersessionYmd:
          plan.supersededBy?.status === 'SCHEDULED'
            ? ymd(plan.supersededBy.startDate)
            : null,
      });
      if (reason) immutableReasons.set(workout.id, reason);
      return !reason;
    });
    const eligibleById = new Map(
      eligible.map((workout) => [workout.id, workout]),
    );
    const covered = new Set<string>();
    for (const group of assessmentGroups) {
      this.validateAssessmentGroup(group);
      for (const workoutId of group.workoutIds) {
        if (covered.has(workoutId))
          invalid(`Workout ${workoutId} is covered more than once`);
        if (!eligibleById.has(workoutId))
          invalid(`Workout ${workoutId} is not eligible for adaptation`);
        covered.add(workoutId);
      }
    }
    if (
      request.scope === 'PLAN_REMAINING' &&
      (covered.size !== eligible.length ||
        eligible.some((workout) => !covered.has(workout.id)))
    ) {
      invalid('PLAN_REMAINING must cover every eligible workout exactly once');
    }

    const zoneCache = new Map<string, Promise<PrescriptionZoneSetting>>();
    const changes: CanonicalAdaptChange[] = [];
    const preservedWorkoutIds: string[] = [];
    const rows: PlanProposalPresentation['rows'] = [];
    const facts: PlanProposalEvidenceRef[] = [];
    let externalMappingCount = 0;

    for (const group of assessmentGroups) {
      facts.push(...group.evidenceRefs);
      for (const workoutId of group.workoutIds) {
        const row = eligibleById.get(workoutId)! as ProposalWorkoutRow;
        const blocks = this.workout.buildPlanBlocksFromWorkoutSteps(
          row.steps as unknown as Parameters<
            WorkoutService['buildPlanBlocksFromWorkoutSteps']
          >[0],
          row.sportType,
        );
        if (group.disposition === 'PRESERVE') {
          preservedWorkoutIds.push(row.id);
          rows.push({
            name: row.name || (zh ? '训练课' : 'Workout'),
            scheduledDate: ymd(row.scheduledDate),
            sportType: row.sportType,
            disposition: 'PRESERVE',
            before: currentTargetSummary(blocks, zh, row.sportType),
            after: currentTargetSummary(blocks, zh, row.sportType),
            rationale: group.rationale,
          });
          continue;
        }
        if (!['RUN', 'CYCLING', 'SWIM'].includes(row.sportType))
          invalid(
            `Workout ${row.id} does not support endurance prescription replacement`,
          );

        const zoneKey = `${row.sportType}:${group.targetDimension}`;
        const zonePromise =
          zoneCache.get(zoneKey) ??
          this.readZoneSetting(
            userId,
            row.sportType as 'RUN' | 'CYCLING' | 'SWIM',
            group.targetDimension,
          );
        zoneCache.set(zoneKey, zonePromise);
        const zoneSetting = await zonePromise;
        const hasZones =
          Array.isArray(zoneSetting.zones) && zoneSetting.zones.length > 0;
        if (
          hasZones &&
          group.zoneIndex == null &&
          !group.fixedTarget?.protocolSpecific
        ) {
          invalid(
            `${group.targetDimension} zones exist for ${row.sportType}; choose an explicit zoneIndex`,
          );
        }
        let resolved;
        try {
          resolved = this.prescriptions.resolve({
            sportType: row.sportType as 'RUN' | 'CYCLING' | 'SWIM',
            dimension: group.targetDimension,
            intent: group.intent,
            zoneSetting,
            zoneIndex: group.zoneIndex,
            fixedTarget: group.fixedTarget
              ? {
                  low: group.fixedTarget.low,
                  high: group.fixedTarget.high,
                  unit: group.fixedTarget.unit,
                  source: group.fixedTarget.source,
                }
              : null,
            allowFixedTarget:
              Boolean(group.fixedTarget?.protocolSpecific) || !hasZones,
            auxiliaryRpe: group.auxiliaryRpe,
          });
        } catch (error) {
          if (error instanceof WorkoutPrescriptionError) invalid(error.message);
          throw error;
        }
        const nextBlocks = applyTargetToWorkSteps(blocks, resolved.target);
        const position = toWeekDay(row.dayOffset);
        changes.push({
          workoutId: row.id,
          expectedRevision: row.revision,
          expectedZoneFingerprint:
            resolved.zoneFingerprint ??
            this.firstDynamicZoneFingerprint(row.steps),
          dto: {
            ...position,
            sessionIndex: row.sessionIndex,
            sportType: row.sportType,
            sportDefinitionCode: row.sportDefinitionCode,
            name: row.name,
            notes: row.notes,
            text: this.workout.stringifyPlan(nextBlocks),
            blocks: nextBlocks,
            reason: 'plan_proposal',
          },
        });
        externalMappingCount += row.externalMappings.length;
        rows.push({
          name: row.name || (zh ? '训练课' : 'Workout'),
          scheduledDate: ymd(row.scheduledDate),
          sportType: row.sportType,
          disposition: 'APPLY',
          before: currentTargetSummary(blocks, zh, row.sportType),
          after: targetSummary(resolved.target, zh, row.sportType),
          rationale: group.rationale,
        });
      }
    }
    for (const workout of plan.workouts) {
      const reason = immutableReasons.get(workout.id);
      if (!reason) continue;
      const blocks = this.workout.buildPlanBlocksFromWorkoutSteps(
        workout.steps as unknown as Parameters<
          WorkoutService['buildPlanBlocksFromWorkoutSteps']
        >[0],
        workout.sportType,
      );
      const current = currentTargetSummary(blocks, zh, workout.sportType);
      rows.push({
        name: workout.name || (zh ? '训练课' : 'Workout'),
        scheduledDate: ymd(workout.scheduledDate),
        sportType: workout.sportType,
        disposition: 'PRESERVE',
        before: current,
        after: current,
        rationale: immutableReasonText(reason, zh),
      });
    }

    if (!changes.length) invalid('Adaptation contains no changes');

    const proposal: CanonicalAdaptProposal = {
      mode: 'ADAPT',
      planId: plan.id,
      expectedPlanStatus: plan.status,
      sourceWorkouts: eligible
        .filter((workout) => covered.has(workout.id))
        .map((workout) => ({
          id: workout.id,
          revision: workout.revision,
          dynamicZones: this.dynamicZoneRefs(workout.steps),
          status: workout.status,
          scheduledDate: ymd(workout.scheduledDate),
          activeActivityLinkCount: workout.links.length,
        })),
      changes,
      preservedWorkoutIds,
    };
    const projectedLoads = await this.loads.estimateForViewerWorkouts(
      userId,
      changes.map((change) => ({
        sportType: change.dto.sportType,
        text: change.dto.text,
      })),
    );
    let estimatedLoadDelta = 0;
    let estimatedLoadComparable = false;
    for (const [index, change] of changes.entries()) {
      const before = eligibleById.get(change.workoutId)?.estimatedLoad;
      const after = projectedLoads[index]?.estimatedLoad;
      if (typeof before === 'number' && typeof after === 'number') {
        estimatedLoadDelta += after - before;
        estimatedLoadComparable = true;
      }
    }
    const presentation: PlanProposalPresentation = {
      title: zh
        ? `调整「${plan.title}」的训练处方`
        : `Adjust prescriptions in “${plan.title}”`,
      summary: zh
        ? `教练评估了 ${covered.size} 节可处理课时，建议调整 ${changes.length} 节。`
        : `The coach assessed ${covered.size} eligible workouts and recommends changing ${changes.length}.`,
      mode: 'ADAPT',
      facts: this.uniqueFacts(facts),
      counts: {
        total: covered.size,
        changed: changes.length,
        preserved: preservedWorkoutIds.length,
        skipped: plan.workouts.length - eligible.length,
      },
      estimatedLoadDelta: estimatedLoadComparable
        ? Math.round(estimatedLoadDelta * 10) / 10
        : null,
      syncImpact:
        externalMappingCount > 0
          ? zh
            ? `${externalMappingCount} 个已连接设备训练需要重新同步`
            : `${externalMappingCount} exported device workouts need resyncing`
          : zh
            ? '没有已导出的设备训练需要更新'
            : 'No exported device workouts need updating',
      rows,
      warnings: [],
    };
    return this.persistPreview({
      userId,
      sourcePlanId: plan.id,
      mode: 'ADAPT',
      request: { ...request, planId: plan.id, assessmentGroups },
      sourceSnapshot: {
        planStatus: plan.status,
        workouts: proposal.sourceWorkouts,
      },
      proposal,
      presentation,
    });
  }

  private async createSupersedePreview(
    userId: string,
    request: PlanSupersessionPreviewRequest,
  ): Promise<PlanProposalPreviewResult> {
    const sourcePlanId = String(request.sourcePlanId ?? '').trim();
    if (!sourcePlanId) invalid('sourcePlanId is required');
    const rationale = String(request.rationale ?? '').trim();
    if (!rationale) invalid('Supersession rationale is required');
    if (!Array.isArray(request.evidenceRefs) || !request.evidenceRefs.length)
      invalid('Supersession needs at least one evidence reference');
    const evidenceRefs = this.normalizeEvidenceRefs(request.evidenceRefs);
    if (!evidenceRefs.length)
      invalid('Supersession evidence references need a type and label');
    const source = await this.loadSourcePlan(userId, sourcePlanId);
    if (!['ACTIVE', 'PAUSED'].includes(source.status))
      invalid('Only active or paused plans can be superseded');
    if (source.supersededBy?.status === 'SCHEDULED')
      invalid('This plan already has a scheduled successor');
    const scheduled = await this.plans.findFirst({
      where: { userId, status: 'SCHEDULED' },
      select: { id: true },
    });
    if (scheduled)
      invalid('Cancel the existing scheduled replacement plan first');
    const [timezone, locale] = await Promise.all([
      this.users.getPreferredTimezone(userId),
      this.users.getPreferredLocale(userId),
    ]);
    const activationTimezone = timezone ?? 'UTC';
    const zh = isChineseLocale(locale);
    const today =
      activityCalendarYmdInZone(new Date(), timezone) ??
      new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.effectiveFrom))
      invalid('effectiveFrom must be YYYY-MM-DD');
    if (request.effectiveFrom < today)
      invalid('effectiveFrom cannot be in the past');
    const replacementPlan = this.normalizeReplacementDraft(request.plan);
    this.validateReplacementDraft(replacementPlan);
    const expectedReplacementZones =
      await this.resolveReplacementZoneExpectations(userId, replacementPlan);
    const futureOld = source.workouts.filter(
      (workout) =>
        workout.scheduledDate &&
        ymd(workout.scheduledDate)! >= request.effectiveFrom,
    );
    const proposal: CanonicalSupersedeProposal = {
      mode: 'SUPERSEDE',
      sourcePlanId: source.id,
      sourceWorkouts: source.workouts.map((workout) => ({
        id: workout.id,
        revision: workout.revision,
        dynamicZones: this.dynamicZoneRefs(workout.steps),
        status: workout.status,
        scheduledDate: ymd(workout.scheduledDate),
        activeActivityLinkCount: workout.links.length,
      })),
      expectedReplacementZones,
      effectiveFrom: request.effectiveFrom,
      activationTimezone,
      rationale,
      plan: replacementPlan,
    };
    const replacementLoads = await this.loads.estimateForViewerWorkouts(
      userId,
      replacementPlan.workouts.map((workout) => ({
        sportType: workout.sportType,
        text: workout.text,
        plannedSessionRpe: workout.plannedSessionRpe,
      })),
    );
    const nextLoad = replacementLoads.reduce(
      (sum, item) => sum + (item.estimatedLoad ?? 0),
      0,
    );
    const oldLoad = futureOld.reduce(
      (sum, workout) => sum + (workout.estimatedLoad ?? 0),
      0,
    );
    const hasComparableLoad =
      replacementLoads.some((item) => item.estimatedLoad != null) ||
      futureOld.some((workout) => workout.estimatedLoad != null);
    const presentation: PlanProposalPresentation = {
      title: zh
        ? `以「${replacementPlan.title}」接管当前计划`
        : `Replace the current plan with “${replacementPlan.title}”`,
      summary:
        request.effectiveFrom === today
          ? zh
            ? '确认后新计划今天立即接管。'
            : 'The new plan will take over today after confirmation.'
          : zh
            ? `旧计划继续到 ${request.effectiveFrom} 前一天，新计划届时自动接管。`
            : `The old plan continues until the day before ${request.effectiveFrom}; the new plan takes over automatically.`,
      mode: 'SUPERSEDE',
      effectiveFrom: request.effectiveFrom,
      facts: this.uniqueFacts([
        ...evidenceRefs,
        {
          type: 'effective_date',
          label: zh ? '接管日期' : 'Effective date',
          value: request.effectiveFrom,
        },
        {
          type: 'source_plan',
          label: zh ? '当前计划状态' : 'Current plan status',
          value: source.status,
        },
      ]),
      counts: {
        total: replacementPlan.workouts.length,
        changed: replacementPlan.workouts.length,
        preserved: source.workouts.length - futureOld.length,
        skipped: futureOld.length,
      },
      estimatedLoadDelta: hasComparableLoad
        ? Math.round((nextLoad - oldLoad) * 10) / 10
        : null,
      syncImpact: zh
        ? `${futureOld.reduce((sum, workout) => sum + workout.externalMappings.length, 0)} 个旧设备训练将撤销，新计划将按正常流程同步`
        : `${futureOld.reduce((sum, workout) => sum + workout.externalMappings.length, 0)} old device workouts will be removed; the new plan will sync normally`,
      rows: [
        ...replacementPlan.workouts.map((workout) => ({
          name: workout.name || (zh ? '训练课' : 'Workout'),
          scheduledDate: addYmdDays(
            request.effectiveFrom,
            (workout.weekIndex - 1) * 7 + workout.dayIndex - 1,
          ),
          sportType: workout.sportType,
          disposition: 'APPLY' as const,
          before: zh ? '旧计划对应日期内容' : 'Old plan content for this date',
          after: currentTargetSummary(
            this.workout.parsePlanText(workout.text),
            zh,
            workout.sportType,
          ),
          rationale,
        })),
        ...source.workouts.map((workout) => {
          const blocks = this.workout.buildPlanBlocksFromWorkoutSteps(
            workout.steps as unknown as Parameters<
              WorkoutService['buildPlanBlocksFromWorkoutSteps']
            >[0],
            workout.sportType,
          );
          const before = currentTargetSummary(blocks, zh, workout.sportType);
          const shadowed = Boolean(
            workout.scheduledDate &&
            ymd(workout.scheduledDate)! >= request.effectiveFrom,
          );
          return {
            name: workout.name || (zh ? '旧计划训练课' : 'Old-plan workout'),
            scheduledDate: ymd(workout.scheduledDate),
            sportType: workout.sportType,
            disposition: 'PRESERVE' as const,
            before,
            after: shadowed
              ? zh
                ? '保留历史记录，由新计划接管'
                : 'Kept for history; replaced on the calendar'
              : before,
            rationale: shadowed
              ? zh
                ? '生效日及之后不再显示或执行旧计划课时，但不会删除历史记录。'
                : 'From the effective date onward, the old workout is hidden from execution but retained for audit.'
              : zh
                ? '旧计划在接管日前继续执行。'
                : 'The old plan remains in effect before the takeover date.',
          };
        }),
      ],
      warnings: [],
    };
    return this.persistPreview({
      userId,
      sourcePlanId: source.id,
      mode: 'SUPERSEDE',
      request: {
        ...request,
        sourcePlanId: source.id,
        rationale,
        evidenceRefs,
        plan: replacementPlan,
      },
      sourceSnapshot: {
        planStatus: source.status,
        workouts: source.workouts.map((workout) => ({
          id: workout.id,
          revision: workout.revision,
          status: workout.status,
          scheduledDate: ymd(workout.scheduledDate),
          activeActivityLinkCount: workout.links.length,
          dynamicZones: this.dynamicZoneRefs(workout.steps),
        })),
      },
      proposal,
      presentation,
    });
  }

  private validateAssessmentGroup(group: PlanAssessmentGroup) {
    if (!Array.isArray(group.workoutIds) || !group.workoutIds.length)
      invalid('Each assessment group must contain workoutIds');
    if (!['APPLY', 'PRESERVE'].includes(group.disposition))
      invalid('Invalid assessment disposition');
    if (!['PACE', 'HEART_RATE', 'POWER'].includes(group.targetDimension))
      invalid('Invalid target dimension');
    if (!group.intent?.family || !String(group.rationale ?? '').trim())
      invalid('Each assessment group needs an intent and rationale');
    if (!Array.isArray(group.evidenceRefs) || !group.evidenceRefs.length)
      invalid('Each assessment group needs at least one evidence reference');
    if (this.normalizeEvidenceRefs(group.evidenceRefs).length === 0)
      invalid('Evidence references need a type and label');
    if (
      group.fixedTarget &&
      (!String(group.fixedTarget.source ?? '').trim() ||
        typeof group.fixedTarget.protocolSpecific !== 'boolean')
    ) {
      invalid('A fixed target needs an evidence source and protocol decision');
    }
    if (
      group.auxiliaryRpe &&
      (!Number.isFinite(group.auxiliaryRpe.low) ||
        group.auxiliaryRpe.low < 1 ||
        group.auxiliaryRpe.low > 10 ||
        (group.auxiliaryRpe.high != null &&
          (!Number.isFinite(group.auxiliaryRpe.high) ||
            group.auxiliaryRpe.high < group.auxiliaryRpe.low ||
            group.auxiliaryRpe.high > 10)))
    ) {
      invalid('auxiliaryRpe must be an ordered range from 1 to 10');
    }
  }

  private normalizeAssessmentGroup(
    group: PlanAssessmentGroup,
  ): PlanAssessmentGroup {
    return {
      ...group,
      workoutIds: Array.isArray(group.workoutIds)
        ? group.workoutIds.map((id) => String(id).trim()).filter(Boolean)
        : [],
      rationale: String(group.rationale ?? '').trim(),
      evidenceRefs: this.normalizeEvidenceRefs(group.evidenceRefs),
      fixedTarget: group.fixedTarget
        ? {
            ...group.fixedTarget,
            source: String(group.fixedTarget.source ?? '').trim(),
          }
        : group.fixedTarget,
    };
  }

  private normalizeEvidenceRefs(refs: PlanProposalEvidenceRef[]) {
    if (!Array.isArray(refs)) return [];
    return refs
      .map((ref) => ({
        type: String(ref?.type ?? '').trim(),
        label: String(ref?.label ?? '').trim(),
        value:
          ref?.value == null ||
          typeof ref.value === 'string' ||
          typeof ref.value === 'number'
            ? ref.value
            : undefined,
      }))
      .filter((ref) => ref.type && ref.label);
  }

  private async resolveReplacementZoneExpectations(
    userId: string,
    plan: PlanReplacementDraft,
  ): Promise<CanonicalSupersedeProposal['expectedReplacementZones']> {
    const settings = new Map<string, Promise<PrescriptionZoneSetting>>();
    const resolved = new Map<
      string,
      CanonicalSupersedeProposal['expectedReplacementZones'][number]
    >();
    for (const workout of plan.workouts) {
      const blocks = this.workout.parsePlanText(workout.text);
      for (const ref of this.zoneReferences(blocks)) {
        const key = `${workout.sportType}:${ref.dimension}`;
        const pending =
          settings.get(key) ??
          this.readZoneSetting(userId, workout.sportType, ref.dimension);
        settings.set(key, pending);
        const setting = await pending;
        let prescription;
        try {
          prescription = this.prescriptions.resolve({
            sportType: workout.sportType,
            dimension: ref.dimension,
            intent: { family: 'OTHER', source: 'AI_COACH' },
            zoneSetting: setting,
            zoneIndex: ref.zoneIndex,
          });
        } catch (error) {
          if (error instanceof WorkoutPrescriptionError) invalid(error.message);
          throw error;
        }
        if (!prescription.zoneSystemKey || !prescription.zoneFingerprint)
          invalid(`Unable to resolve ${key} zone Z${ref.zoneIndex}`);
        resolved.set(key, {
          sportType: workout.sportType,
          dimension: ref.dimension,
          systemKey: prescription.zoneSystemKey,
          fingerprint: prescription.zoneFingerprint,
        });
      }
    }
    return [...resolved.values()].sort((left, right) =>
      `${left.sportType}:${left.dimension}`.localeCompare(
        `${right.sportType}:${right.dimension}`,
      ),
    );
  }

  private zoneReferences(blocks: PlanBlock[]) {
    const refs: Array<{
      dimension: PrescriptionTargetDimension;
      zoneIndex: number;
    }> = [];
    const visit = (items: PlanBlock[]) => {
      for (const block of items) {
        if (block.type === 'repeat') {
          visit(block.children);
          continue;
        }
        for (const step of block.steps) {
          const target = step.primaryTargetMeta;
          if (!target?.zoneIndex) continue;
          const dimension =
            target.kind === 'SPEED'
              ? 'PACE'
              : target.kind === 'HEART_RATE_ZONE'
                ? 'HEART_RATE'
                : target.kind === 'POWER_ZONE'
                  ? 'POWER'
                  : null;
          if (dimension) refs.push({ dimension, zoneIndex: target.zoneIndex });
        }
      }
    };
    visit(blocks);
    return refs;
  }

  private validateReplacementDraft(plan: PlanReplacementDraft) {
    if (!plan?.title?.trim()) invalid('Replacement plan title is required');
    if (
      !Number.isInteger(plan.periodWeeks) ||
      plan.periodWeeks < 1 ||
      plan.periodWeeks > 520
    )
      invalid('Replacement periodWeeks is invalid');
    if (!Array.isArray(plan.workouts) || !plan.workouts.length)
      invalid('Replacement plan needs at least one workout');
    const positions = new Set<string>();
    for (const workout of plan.workouts) {
      if (
        !['RUN', 'CYCLING', 'SWIM'].includes(workout.sportType) ||
        !Number.isInteger(workout.weekIndex) ||
        workout.weekIndex < 1 ||
        workout.weekIndex > plan.periodWeeks ||
        !Number.isInteger(workout.dayIndex) ||
        workout.dayIndex < 1 ||
        workout.dayIndex > 7 ||
        !String(workout.text ?? '').trim()
      ) {
        invalid('Replacement workout schedule or text is invalid');
      }
      if (
        workout.plannedSessionRpe != null &&
        (!Number.isFinite(workout.plannedSessionRpe) ||
          workout.plannedSessionRpe < 1 ||
          workout.plannedSessionRpe > 10)
      ) {
        invalid('Replacement workout RPE must be from 1 to 10');
      }
      try {
        this.workout.parsePlanText(workout.text);
      } catch {
        invalid('Replacement workout text must be valid endurance DSL');
      }
      const key = `${workout.weekIndex}:${workout.dayIndex}:${workout.sessionIndex ?? 1}`;
      if (positions.has(key))
        invalid(`Replacement workout position ${key} is duplicated`);
      positions.add(key);
    }
  }

  private normalizeReplacementDraft(
    plan: PlanReplacementDraft,
  ): PlanReplacementDraft {
    return {
      title: String(plan?.title ?? '').trim(),
      description: plan?.description?.trim() || undefined,
      goal: plan?.goal?.trim() || undefined,
      periodWeeks: plan?.periodWeeks,
      workouts: Array.isArray(plan?.workouts)
        ? plan.workouts.map((workout) => ({
            weekIndex: workout.weekIndex,
            dayIndex: workout.dayIndex,
            sessionIndex: workout.sessionIndex,
            sportType: workout.sportType,
            sportDefinitionCode:
              workout.sportDefinitionCode?.trim() || undefined,
            name: workout.name?.trim() || undefined,
            notes: workout.notes?.trim() || undefined,
            text: String(workout.text ?? '').trim(),
            plannedSessionRpe: workout.plannedSessionRpe,
          }))
        : [],
    };
  }

  private async readZoneSetting(
    userId: string,
    sportType: 'RUN' | 'CYCLING' | 'SWIM',
    dimension: PrescriptionTargetDimension,
  ): Promise<PrescriptionZoneSetting> {
    const profile = await this.users.getComposedUserProfile(userId, sportType);
    if (dimension === 'PACE') {
      return (
        (await this.users.getPaceZoneSettingResolved(userId, sportType, {
          vo2max: profile?.vo2max,
          tp: profile?.tp,
          cs: profile?.cs,
          paceZoneModel: profile?.paceZoneModel,
        })) ?? { zones: [] }
      );
    }
    if (dimension === 'POWER') {
      return (
        (await this.users.getPowerZoneSettingResolved(userId, sportType, {
          FTP: profile?.ftp,
          CP: profile?.cp,
          powerZoneModel: profile?.powerZoneModel,
        })) ?? { zones: [] }
      );
    }
    return (
      (await this.users.getHeartRateZoneSetting(userId, sportType, {
        maxHeartRate: profile?.maxHeartRate,
        restingHeartRate: profile?.restingHeartRate,
        lthr: profile?.lthr,
        heartRateZoneModel: profile?.heartRateZoneModel,
      })) ?? { zones: [] }
    );
  }

  private firstDynamicZoneFingerprint(
    steps: ProposalWorkoutRow['steps'],
  ): string | null {
    const visit = (rows: ProposalWorkoutRow['steps']): string | null => {
      for (const step of rows) {
        if (
          step.targetResolutionMode === 'DYNAMIC_ZONE' &&
          step.targetZoneFingerprint
        )
          return step.targetZoneFingerprint;
        const nested = visit(
          (step.children ?? []) as ProposalWorkoutRow['steps'],
        );
        if (nested) return nested;
      }
      return null;
    };
    return visit(steps);
  }

  private dynamicZoneRefs(steps: ProposalWorkoutRow['steps']): Array<{
    dimension: PrescriptionTargetDimension;
    fingerprint: string;
  }> {
    const values = new Map<
      string,
      { dimension: PrescriptionTargetDimension; fingerprint: string }
    >();
    const visit = (rows: ProposalWorkoutRow['steps']) => {
      for (const step of rows) {
        if (
          step.targetResolutionMode === 'DYNAMIC_ZONE' &&
          step.targetZoneFingerprint
        ) {
          const dimension =
            step.targetType === 'SPEED'
              ? 'PACE'
              : step.targetType === 'HEART_RATE'
                ? 'HEART_RATE'
                : step.targetType === 'POWER'
                  ? 'POWER'
                  : null;
          if (dimension) {
            values.set(`${dimension}:${step.targetZoneFingerprint}`, {
              dimension,
              fingerprint: step.targetZoneFingerprint,
            });
          }
        }
        visit((step.children ?? []) as ProposalWorkoutRow['steps']);
      }
    };
    visit(steps);
    return [...values.values()].sort((left, right) =>
      `${left.dimension}:${left.fingerprint}`.localeCompare(
        `${right.dimension}:${right.fingerprint}`,
      ),
    );
  }

  private uniqueFacts(facts: PlanProposalEvidenceRef[]) {
    const seen = new Set<string>();
    return facts.filter((fact) => {
      const key = `${fact.type}:${fact.label}:${fact.value ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async persistPreview(args: {
    userId: string;
    sourcePlanId: string;
    mode: 'ADAPT' | 'SUPERSEDE';
    request: PlanProposalPreviewRequest;
    sourceSnapshot: unknown;
    proposal: CanonicalPlanProposal;
    presentation: PlanProposalPresentation;
  }): Promise<PlanProposalPreviewResult> {
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    const preview = await this.proposals.create({
      data: {
        userId: args.userId,
        sourcePlanId: args.sourcePlanId,
        mode: args.mode,
        request: args.request as Prisma.InputJsonValue,
        sourceSnapshot: args.sourceSnapshot as Prisma.InputJsonValue,
        proposal: args.proposal as Prisma.InputJsonValue,
        presentation: args.presentation as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    const decisionType =
      args.mode === 'ADAPT' ? 'PLAN_ADAPTATION' : 'PLAN_SUPERSESSION';
    return {
      kind: 'plan_proposal_preview',
      previewId: preview.id,
      mode: args.mode,
      expiresAt: expiresAt.toISOString(),
      decisionType,
      decisionPayload: {
        planId: args.sourcePlanId,
        previewId: preview.id,
        presentation: args.presentation,
      },
      presentation: args.presentation,
    };
  }
}
