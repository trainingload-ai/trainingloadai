import { Injectable, Optional } from '@nestjs/common';
import {
  CoachApplyResult,
  CoachDecisionRiskTier,
  CoachDecisionState,
  CoachFlowStatus,
  CoachThreadKind,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PlanService } from '../plan/plan.service';
import { PlanQueryService } from '../plan/application/plan-query.service';
import { PlanProposalApplyService } from '../plan/application/plan-proposal-apply.service';
import { PlanProposalService } from '../plan/application/plan-proposal.service';
import type {
  PlanProposalPreviewRequest,
  PlanProposalPreviewResult,
} from '@shared/plan-proposal';
import { CoachContextService } from '../plan/coach-context.service';
import { UpdatePlanWorkoutDto } from '../plan/dto/update-plan-workout.dto';
import { UpdatePlanDto } from '../plan/dto/update-plan.dto';
import {
  PLAN_SPORT_TYPES,
  PLAN_WORKOUT_STATUSES,
  type PlanSportType,
  type PlanWorkoutStatus,
} from '../plan/plan.constants';
import { asRecord } from './core/ai-common.util';
import {
  isListablePendingCoachDecision,
  presentPendingCoachDecision,
  presentReviewGuidance,
  rankPendingCoachDecisions,
} from './pending-coach-decision.presenter';
import {
  canApplyCoachDecisionOnContext,
  canOpenCoachBranch,
  isOpenNextLifecyclePayload,
} from './coach-branching-finalized';
import { isOwnDecisionHeadAdvance } from './coach-decision-apply-conflict';
import {
  workoutChangeDiff,
  workoutChangeSnapshot,
} from './core/coach-workout-change';
import { CoachAssessmentCaseQueryService } from './athlete-state/coach-assessment-case-query.service';

function toSafeString(v: unknown): string {
  return String(v ?? '').trim();
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function isPlanWorkoutStatus(value: string): value is PlanWorkoutStatus {
  return (PLAN_WORKOUT_STATUSES as readonly string[]).includes(value);
}

function asPlanSportType(value: unknown): PlanSportType | null {
  const raw = String(value ?? '');
  return (PLAN_SPORT_TYPES as readonly string[]).includes(raw)
    ? (raw as PlanSportType)
    : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function asUpdatePlanWorkoutDto(value: unknown): UpdatePlanWorkoutDto | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const sportType = asPlanSportType(rec.sportType);
  const weekIndex = Number(rec.weekIndex);
  const dayIndex = Number(rec.dayIndex);
  if (
    !sportType ||
    !Number.isInteger(weekIndex) ||
    weekIndex < 1 ||
    weekIndex > 520 ||
    !Number.isInteger(dayIndex) ||
    dayIndex < 1 ||
    dayIndex > 7 ||
    (rec.sessionIndex !== undefined &&
      (!Number.isInteger(rec.sessionIndex) || Number(rec.sessionIndex) < 1))
  ) {
    return null;
  }
  return {
    weekIndex,
    dayIndex,
    sessionIndex:
      typeof rec.sessionIndex === 'number' ? rec.sessionIndex : undefined,
    sportType,
    sportDefinitionCode: asNullableString(rec.sportDefinitionCode),
    text: asOptionalString(rec.text),
    notes: asNullableString(rec.notes),
    name: asNullableString(rec.name),
    reason: asOptionalString(rec.reason),
    definition:
      rec.definition && typeof rec.definition === 'object'
        ? (rec.definition as UpdatePlanWorkoutDto['definition'])
        : undefined,
    blocks: rec.blocks,
  };
}

function asUpdatePlanWorkoutInput(
  value: unknown,
): NonNullable<UpdatePlanDto['workouts']>[number] | null {
  const dto = asUpdatePlanWorkoutDto(value);
  if (!dto) return null;
  const rec = asRecord(value);
  return {
    ...dto,
    id: typeof rec?.id === 'string' ? rec.id : undefined,
  };
}

@Injectable()
export class CoachBranchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    private readonly coachContext: CoachContextService,
    private readonly planQuery: PlanQueryService,
    private readonly planProposals: PlanProposalApplyService,
    private readonly planProposalPreviews: PlanProposalService,
    @Optional()
    private readonly assessmentCases?: CoachAssessmentCaseQueryService,
  ) {}

  private fail(message: string): never {
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message,
    });
  }

  private async requireContextOwner(userId: string, contextId: string) {
    const context = await this.planQuery.findContextById(contextId);
    if (!context || context.userId !== userId) {
      this.fail('Coach context not found');
    }
    return context;
  }

  private async requireBranchOwner(userId: string, branchId: string) {
    const branch = await this.prisma.coachBranch.findUnique({
      where: { id: branchId },
      include: {
        context: true,
        thread: true,
      },
    });
    if (!branch || branch.context.userId !== userId) {
      this.fail('Coach branch not found');
    }
    return branch;
  }

  private async requireDecisionOwner(userId: string, decisionId: string) {
    const decision = await this.prisma.coachDecision.findUnique({
      where: { id: decisionId },
      include: {
        context: true,
        branch: true,
      },
    });
    if (!decision || decision.context.userId !== userId) {
      this.fail('Coach decision not found');
    }
    return decision;
  }

  private async getOrCreateMainThread(tx: PrismaTx, contextId: string) {
    const existing = await tx.coachThread.findFirst({
      where: { contextId, kind: CoachThreadKind.MAIN },
    });
    if (existing) return existing;
    return tx.coachThread.create({
      data: {
        contextId,
        kind: CoachThreadKind.MAIN,
        status: CoachFlowStatus.OPEN,
      },
    });
  }

  /**
   * `msgSeq` is unique across the whole thread, not per branch. Always allocate
   * it by atomically advancing the thread head so concurrent writers and new
   * branch source messages share the same sequence.
   */
  private async nextThreadMessageSeq(tx: PrismaTx, threadId: string) {
    const thread = await tx.coachThread.update({
      where: { id: threadId },
      data: {
        headMsgSeq: { increment: 1 },
      },
      select: { headMsgSeq: true },
    });
    return thread.headMsgSeq;
  }

  async openBranch(args: {
    userId: string;
    contextId?: string;
    planId?: string;
    anchor?: { baseEventSeq?: number; baseCommitId?: string | null };
    openReason?: string;
    sourceNode?: unknown;
    allowFinalized?: boolean;
  }) {
    const context = args.contextId
      ? await this.requireContextOwner(args.userId, args.contextId)
      : args.planId
        ? await this.coachContext.ensureContext({
            userId: args.userId,
            planId: args.planId,
          })
        : null;
    if (!context || context.userId !== args.userId) {
      this.fail('Coach context not found');
    }
    if (
      !canOpenCoachBranch({
        status: context.status,
        allowFinalized: args.allowFinalized,
      })
    ) {
      this.fail('Context is not active');
    }

    const baseEventSeq =
      typeof args.anchor?.baseEventSeq === 'number'
        ? args.anchor.baseEventSeq
        : context.headEventSeq;
    if (
      typeof args.anchor?.baseEventSeq === 'number' &&
      args.anchor.baseEventSeq !== context.headEventSeq
    ) {
      this.fail('BASE_VERSION_MISMATCH');
    }

    return this.prisma.$transaction(async (tx) => {
      const thread = await this.getOrCreateMainThread(tx, context.id);
      const latestCommit = await tx.coachCommit.findFirst({
        where: { contextId: context.id },
        orderBy: [{ eventToSeq: 'desc' }, { createdAt: 'desc' }],
      });
      let branch = await tx.coachBranch.create({
        data: {
          threadId: thread.id,
          contextId: context.id,
          status: CoachFlowStatus.OPEN,
          baseEventSeq,
          baseCommitId:
            toSafeString(args.anchor?.baseCommitId) || latestCommit?.id || null,
          openedBy: args.userId,
          openReason: toSafeString(args.openReason) || null,
        },
      });

      if (args.sourceNode != null) {
        const msgSeq = await this.nextThreadMessageSeq(tx, thread.id);
        await tx.coachBranchMessage.create({
          data: {
            threadId: thread.id,
            branchId: branch.id,
            msgSeq,
            role: 'system',
            content: {
              kind: 'branch_open',
              sourceNode: asJson(args.sourceNode),
            } as Prisma.InputJsonValue,
          },
        });
        branch = await tx.coachBranch.update({
          where: { id: branch.id },
          data: { headMsgSeq: msgSeq },
        });
      }

      return { branch };
    });
  }

  async closeBranch(args: {
    userId: string;
    branchId: string;
    mode: 'CLOSED' | 'ABANDONED';
    reason?: string;
  }) {
    const branch = await this.requireBranchOwner(args.userId, args.branchId);
    const mode = args.mode === 'ABANDONED' ? 'ABANDONED' : 'CLOSED';
    const updated = await this.prisma.coachBranch.update({
      where: { id: branch.id },
      data: {
        status: mode,
        closedAt: new Date(),
        openReason:
          toSafeString(args.reason) ||
          (branch.openReason ? branch.openReason : null),
      },
    });
    return { branch: updated };
  }

  async appendBranchMessage(args: {
    userId: string;
    branchId: string;
    role?: string;
    message: unknown;
    toolCalls?: unknown;
    toolResults?: unknown;
    parentMsgId?: string | null;
    tokenIn?: number | null;
    tokenOut?: number | null;
    allowTerminalWrite?: boolean;
  }) {
    const branch = await this.requireBranchOwner(args.userId, args.branchId);
    if (
      branch.status !== CoachFlowStatus.OPEN &&
      branch.status !== CoachFlowStatus.SQUASHED &&
      branch.status !== CoachFlowStatus.REBASE_REQUIRED &&
      !args.allowTerminalWrite
    ) {
      this.fail('Branch is not writable');
    }

    return this.prisma.$transaction(async (tx) => {
      const msgSeq = await this.nextThreadMessageSeq(tx, branch.threadId);

      const msg = await tx.coachBranchMessage.create({
        data: {
          threadId: branch.threadId,
          branchId: branch.id,
          msgSeq,
          role: toSafeString(args.role) || 'user',
          content: asJson(args.message),
          toolCalls:
            args.toolCalls == null ? undefined : asJson(args.toolCalls),
          toolResults:
            args.toolResults == null ? undefined : asJson(args.toolResults),
          parentMsgId: toSafeString(args.parentMsgId) || null,
          tokenIn:
            typeof args.tokenIn === 'number' ? Math.trunc(args.tokenIn) : null,
          tokenOut:
            typeof args.tokenOut === 'number'
              ? Math.trunc(args.tokenOut)
              : null,
        },
      });

      await tx.coachBranch.update({
        where: { id: branch.id },
        data: {
          headMsgSeq: msgSeq,
        },
      });

      return { message: msg };
    });
  }

  async compactBranch(args: {
    userId: string;
    branchId: string;
    fromSeq: number;
    toSeq: number;
    summaryText?: string;
    summaryJson?: unknown;
    model?: string;
  }) {
    const branch = await this.requireBranchOwner(args.userId, args.branchId);
    if (args.fromSeq > args.toSeq) {
      this.fail('Invalid seq range');
    }

    const messages = await this.prisma.coachBranchMessage.findMany({
      where: {
        branchId: branch.id,
        msgSeq: { gte: args.fromSeq, lte: args.toSeq },
      },
      orderBy: { msgSeq: 'asc' },
      take: 200,
    });

    const fallbackSummary = messages
      .map((m) => {
        const c = asRecord(m.content);
        if (!c) return '';
        if (typeof c.text === 'string') return c.text;
        if (Array.isArray(c.content)) {
          return c.content
            .map((block) => {
              const b = asRecord(block);
              return b?.type === 'text' && typeof b.text === 'string'
                ? b.text
                : '';
            })
            .filter(Boolean)
            .join(' ');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000);

    const compaction = await this.prisma.coachBranchCompaction.create({
      data: {
        branchId: branch.id,
        fromSeq: args.fromSeq,
        toSeq: args.toSeq,
        summaryText: toSafeString(args.summaryText) || fallbackSummary || null,
        summaryJson:
          args.summaryJson == null ? undefined : asJson(args.summaryJson),
        model: toSafeString(args.model) || null,
      },
    });

    return { compaction };
  }

  async squashBranch(args: {
    userId: string;
    branchId: string;
    mode?: 'AUTO' | 'MANUAL';
    riskTier?: 'LOW' | 'HIGH';
    decisionType?: string;
    payload?: unknown;
    rationale?: string;
    confidence?: number;
    options?: Array<{
      optionKey: string;
      title?: string;
      pros?: unknown;
      cons?: unknown;
      impact?: unknown;
      isSelected?: boolean;
    }>;
  }) {
    const branch = await this.requireBranchOwner(args.userId, args.branchId);
    if (
      branch.status !== CoachFlowStatus.OPEN &&
      branch.status !== CoachFlowStatus.SQUASHED &&
      branch.status !== CoachFlowStatus.REBASE_REQUIRED
    ) {
      this.fail('Branch cannot be squashed in current status');
    }

    const decisionType = toSafeString(args.decisionType);
    if (!decisionType) {
      this.fail('decisionType is required');
    }

    let payload = args.payload;
    if (payload == null || typeof payload !== 'object') {
      this.fail('decision payload is required');
    }
    const rec = asRecord(payload)!;
    if (rec.planId && rec.planId !== branch.context.planId)
      this.fail('Decision must target the branch plan');
    if (
      decisionType === 'PLAN_ADAPTATION' ||
      decisionType === 'PLAN_SUPERSESSION'
    ) {
      const previewId = toSafeString(rec.previewId);
      if (!previewId) this.fail('previewId is required');
      const expectedMode =
        decisionType === 'PLAN_ADAPTATION' ? 'ADAPT' : 'SUPERSEDE';
      payload = await this.planProposalPreviews.resolveDecisionPayload({
        userId: args.userId,
        sourcePlanId: branch.context.planId,
        previewId,
        mode: expectedMode,
      });
    }
    if (
      decisionType === 'PLAN_WORKOUT_UPDATE' ||
      decisionType === 'PLAN_WORKOUT_BATCH_UPDATE' ||
      decisionType === 'PLAN_WORKOUT_SCHEDULE'
    ) {
      const changes = this.workoutChanges(decisionType, rec);
      const detail = await this.planService.getPlanDetail(
        args.userId,
        branch.context.planId,
      );
      const workouts = detail.plan?.workouts ?? [];
      if (decisionType === 'PLAN_WORKOUT_BATCH_UPDATE') {
        const scope = asRecord(rec.scope);
        const from = Number(scope?.weekFrom),
          to = Number(scope?.weekTo);
        if (
          !Number.isInteger(from) ||
          !Number.isInteger(to) ||
          from < 1 ||
          to < from ||
          to > (detail.plan?.periodWeeks ?? 0)
        )
          this.fail('Batch scope must specify a valid inclusive week range');
        const expected = workouts.filter(
          (w) =>
            w.weekIndex >= from &&
            w.weekIndex <= to &&
            w.status !== 'DONE' &&
            w.status !== 'SKIPPED',
        );
        if (
          expected.length !== changes.length ||
          expected.some((w) => !changes.some((c) => c.workoutId === w.id))
        )
          this.fail(
            'Batch changes must cover every pending workout in the agreed scope; do not silently reduce it to one week',
          );
      }
      const verified = changes.map((change) => {
        const before = workouts.find((w) => w.id === change.workoutId);
        if (!before || before.status === 'DONE' || before.status === 'SKIPPED')
          this.fail('Editable workout not found in branch plan');
        const dto = {
          ...change.dto,
          sessionIndex: change.dto.sessionIndex ?? before.sessionIndex,
          name: change.dto.name === undefined ? before.name : change.dto.name,
          notes:
            change.dto.notes === undefined ? before.notes : change.dto.notes,
          sportDefinitionCode:
            change.dto.sportDefinitionCode === undefined &&
            change.dto.sportType === before.sportType
              ? before.sportDefinitionCode
              : change.dto.sportDefinitionCode,
        };
        return {
          ...change,
          dto,
          before: workoutChangeSnapshot(before),
          diff: workoutChangeDiff(before, { ...before, ...dto }),
        };
      });
      const additions =
        decisionType === 'PLAN_WORKOUT_SCHEDULE'
          ? this.workoutAdditions(decisionType, rec)
          : [];
      if (decisionType === 'PLAN_WORKOUT_SCHEDULE') {
        const targetDtos = [
          ...verified.map((change) => change.dto),
          ...additions,
        ];
        const targetPositions = targetDtos.map(
          (dto) => `${dto.weekIndex}:${dto.dayIndex}:${dto.sessionIndex ?? 1}`,
        );
        if (new Set(targetPositions).size !== targetPositions.length)
          this.fail('Workout schedule contains duplicate target positions');
        const changedIds = new Set(verified.map((change) => change.workoutId));
        for (const dto of targetDtos) {
          if (dto.weekIndex > (detail.plan?.periodWeeks ?? 0))
            this.fail('Workout target is outside the plan period');
          const occupied = workouts.find(
            (workout) =>
              workout.weekIndex === dto.weekIndex &&
              workout.dayIndex === dto.dayIndex &&
              workout.sessionIndex === (dto.sessionIndex ?? 1) &&
              !changedIds.has(workout.id),
          );
          if (occupied)
            this.fail('Workout addition target position is already occupied');
        }
      }
      payload = {
        ...rec,
        planId: branch.context.planId,
        verifiedChanges: verified,
        ...(additions.length
          ? {
              verifiedAdditions: additions.map((dto) => ({ dto })),
              additions: additions.map((dto) => ({ dto })),
            }
          : {}),
        ...(decisionType === 'PLAN_WORKOUT_UPDATE'
          ? { dto: verified[0].dto }
          : {
              changes: verified.map(({ workoutId, dto }) => ({
                workoutId,
                dto,
              })),
            }),
      };
    }
    if (decisionType === 'PLAN_WORKOUT_ADD') {
      const additions = this.workoutAdditions(decisionType, rec);
      const detail = await this.planService.getPlanDetail(
        args.userId,
        branch.context.planId,
      );
      const dto = additions[0];
      if (dto.weekIndex > (detail.plan?.periodWeeks ?? 0))
        this.fail('Workout target is outside the plan period');
      const occupied = (detail.plan?.workouts ?? []).find(
        (workout) =>
          workout.weekIndex === dto.weekIndex &&
          workout.dayIndex === dto.dayIndex &&
          workout.sessionIndex === (dto.sessionIndex ?? 1),
      );
      if (occupied)
        this.fail('Workout addition target position is already occupied');
      payload = {
        ...rec,
        planId: branch.context.planId,
        dto,
        verifiedAdditions: [{ dto }],
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const decision = await tx.coachDecision.create({
        data: {
          branchId: branch.id,
          contextId: branch.contextId,
          state: CoachDecisionState.PROPOSED,
          riskTier:
            args.riskTier === 'LOW'
              ? CoachDecisionRiskTier.LOW
              : CoachDecisionRiskTier.HIGH,
          decisionType,
          payload: asJson(payload),
          rationale: toSafeString(args.rationale) || null,
          confidence:
            decisionType !== 'PLAN_ADAPTATION' &&
            decisionType !== 'PLAN_SUPERSESSION' &&
            typeof args.confidence === 'number'
              ? Number(args.confidence)
              : null,
          createdBy: args.userId,
          baseEventSeq: branch.baseEventSeq,
        },
      });

      if (
        decisionType === 'PLAN_ADAPTATION' ||
        decisionType === 'PLAN_SUPERSESSION'
      ) {
        await this.planProposalPreviews.claimDecision({
          previewId: toSafeString(asRecord(payload)?.previewId),
          decisionId: decision.id,
          userId: args.userId,
          sourcePlanId: branch.context.planId,
          tx,
        });
      }

      await tx.coachDecision.updateMany({
        where: {
          branchId: branch.id,
          id: { not: decision.id },
          state: {
            in: [
              CoachDecisionState.DRAFT,
              CoachDecisionState.PROPOSED,
              CoachDecisionState.APPROVED,
            ],
          },
        },
        data: {
          state: CoachDecisionState.SUPERSEDED,
          supersededByDecisionId: decision.id,
        },
      });

      if (Array.isArray(args.options) && args.options.length > 0) {
        await tx.coachDecisionOption.createMany({
          data: args.options
            .map((o) => ({
              decisionId: decision.id,
              optionKey: toSafeString(o.optionKey),
              title: toSafeString(o.title) || null,
              pros: o.pros == null ? undefined : asJson(o.pros),
              cons: o.cons == null ? undefined : asJson(o.cons),
              impact: o.impact == null ? undefined : asJson(o.impact),
              isSelected: Boolean(o.isSelected),
            }))
            .filter((o) => o.optionKey.length > 0),
          skipDuplicates: true,
        });
      }

      await tx.coachBranch.update({
        where: { id: branch.id },
        data: { status: CoachFlowStatus.SQUASHED },
      });

      await tx.coachAssessmentCase.updateMany({
        where: {
          branchId: branch.id,
          status: 'DECISION_READY',
        },
        data: { decisionId: decision.id, revision: { increment: 1 } },
      });

      const options = await tx.coachDecisionOption.findMany({
        where: { decisionId: decision.id },
        orderBy: { createdAt: 'asc' },
      });

      return { decision, options };
    });
  }

  async canUseDecisionTools(args: {
    userId: string;
    branchId: string;
  }): Promise<boolean> {
    const branch = await this.prisma.coachBranch.findUnique({
      where: { id: args.branchId },
      select: {
        status: true,
        context: {
          select: {
            userId: true,
            status: true,
          },
        },
      },
    });
    return Boolean(
      branch &&
      branch.context.userId === args.userId &&
      branch.context.status === 'ACTIVE' &&
      (branch.status === CoachFlowStatus.OPEN ||
        branch.status === CoachFlowStatus.SQUASHED ||
        branch.status === CoachFlowStatus.REBASE_REQUIRED),
    );
  }

  async createPlanProposalPreview(args: {
    userId: string;
    request: PlanProposalPreviewRequest;
  }): Promise<PlanProposalPreviewResult> {
    return this.planProposalPreviews.createPreview(args.userId, args.request);
  }

  async approveDecision(args: {
    userId: string;
    decisionId: string;
    selectedOptionKey?: string;
    comment?: string;
    branchId?: string;
    proposedBefore?: Date;
  }) {
    const decision = await this.requireDecisionOwner(
      args.userId,
      args.decisionId,
    );
    if (args.branchId && decision.branchId !== args.branchId)
      this.fail('Decision does not belong to the current branch');
    if (args.proposedBefore && decision.createdAt >= args.proposedBefore)
      this.fail(
        'A newly created proposal must be reviewed before confirmation in a later turn',
      );
    if (args.selectedOptionKey === 'keep')
      this.fail(
        'Keeping the plan requires rejecting, not applying, the decision',
      );
    if (decision.state !== CoachDecisionState.APPLIED) {
      await this.assertNextCycleEligible(args.userId, decision);
    }
    if (
      decision.state !== CoachDecisionState.PROPOSED &&
      decision.state !== CoachDecisionState.DRAFT &&
      decision.state !== CoachDecisionState.APPROVED
    ) {
      if (
        decision.state === CoachDecisionState.APPLIED ||
        decision.state === CoachDecisionState.SUPERSEDED
      ) {
        return { decision };
      }
      this.fail('DECISION_STATE_INVALID');
    }

    return this.prisma.$transaction(async (tx) => {
      if (toSafeString(args.selectedOptionKey)) {
        await tx.coachDecisionOption.updateMany({
          where: { decisionId: decision.id },
          data: { isSelected: false },
        });
        await tx.coachDecisionOption.updateMany({
          where: {
            decisionId: decision.id,
            optionKey: toSafeString(args.selectedOptionKey),
          },
          data: { isSelected: true },
        });
      }

      const updated = await tx.coachDecision.update({
        where: { id: decision.id },
        data: {
          state: CoachDecisionState.APPROVED,
          approvedBy: args.userId,
          approvedAt: new Date(),
          rationale:
            toSafeString(args.comment) && !decision.rationale
              ? toSafeString(args.comment)
              : decision.rationale,
        },
      });

      return { decision: updated };
    });
  }

  async rejectDecision(args: {
    userId: string;
    decisionId: string;
    reason?: string;
  }) {
    const decision = await this.requireDecisionOwner(
      args.userId,
      args.decisionId,
    );
    const reason = toSafeString(args.reason);
    const updated = await this.prisma.coachDecision.update({
      where: { id: decision.id },
      data: {
        state: CoachDecisionState.REJECTED,
        rationale:
          reason.length > 0
            ? [decision.rationale, `[rejected] ${reason}`]
                .filter(Boolean)
                .join('\n')
            : decision.rationale,
      },
    });

    return { decision: updated };
  }

  private async recordApplyAttempt(
    args: {
      decisionId: string;
      result: CoachApplyResult;
      baseEventSeq?: number | null;
      headEventSeq?: number | null;
      error?: unknown;
    },
    tx?: PrismaTx,
  ) {
    const db = tx ?? this.prisma;
    const last = await db.coachApplyAttempt.findFirst({
      where: { decisionId: args.decisionId },
      orderBy: { attemptNo: 'desc' },
      select: { attemptNo: true },
    });
    return db.coachApplyAttempt.create({
      data: {
        decisionId: args.decisionId,
        attemptNo: (last?.attemptNo ?? 0) + 1,
        baseEventSeq:
          typeof args.baseEventSeq === 'number' ? args.baseEventSeq : null,
        headEventSeq:
          typeof args.headEventSeq === 'number' ? args.headEventSeq : null,
        result: args.result,
        error: args.error == null ? undefined : asJson(args.error),
      },
    });
  }

  private workoutChanges(
    decisionType: string,
    payload: Record<string, unknown>,
  ) {
    const raw =
      decisionType === 'PLAN_WORKOUT_BATCH_UPDATE' ||
      decisionType === 'PLAN_WORKOUT_SCHEDULE'
        ? payload.changes
        : [
            {
              workoutId: payload.workoutId,
              dto: payload.dto ?? payload.change,
            },
          ];
    if (!Array.isArray(raw) || !raw.length || raw.length > 200)
      this.fail('Expected 1–200 workout changes');
    const changes = raw.map((item: unknown) => {
      const rec = asRecord(item);
      const workoutId = toSafeString(rec?.workoutId);
      const dto = asUpdatePlanWorkoutDto(rec?.dto);
      if (!workoutId || !dto) this.fail('Invalid workout change');
      return { workoutId, dto };
    });
    if (new Set(changes.map((c) => c.workoutId)).size !== changes.length)
      this.fail('Duplicate workout changes');
    return changes;
  }

  private workoutAdditions(
    decisionType: string,
    payload: Record<string, unknown>,
  ) {
    const raw =
      decisionType === 'PLAN_WORKOUT_SCHEDULE'
        ? payload.additions
        : [{ dto: payload.dto ?? payload.change }];
    if (!Array.isArray(raw) || !raw.length || raw.length > 20)
      this.fail('Expected 1–20 workout additions');
    return raw.map((item: unknown) => {
      const rec = asRecord(item);
      const dto = asUpdatePlanWorkoutInput(rec?.dto ?? item);
      if (!dto) this.fail('Invalid workout addition');
      return dto;
    });
  }

  private async executeDecisionMutation(args: {
    userId: string;
    decisionId: string;
    branchId: string;
    decisionType: string;
    payload: Record<string, unknown>;
  }) {
    const meta = {
      source: 'ai' as const,
      action: `decision_apply_${args.decisionType.toLowerCase()}`,
      reason: 'decision_apply',
      toolCallId: null,
      decisionId: args.decisionId,
      branchId: args.branchId,
      commitId: null,
    };

    switch (args.decisionType) {
      case 'PLAN_LIFECYCLE': {
        const planId = toSafeString(args.payload.planId);
        const action = toSafeString(args.payload.action).toLowerCase();
        if (!planId || !action) this.fail('Invalid PLAN_LIFECYCLE payload');
        if (action === 'activate') {
          return this.planService.activatePlan(
            args.userId,
            planId,
            toSafeString(args.payload.startDate) || undefined,
            meta,
          );
        }
        if (action === 'pause') {
          return this.planService.pausePlan(
            args.userId,
            planId,
            toSafeString(args.payload.reason) || undefined,
            meta,
          );
        }
        if (action === 'complete') {
          return this.planService.completePlan(
            args.userId,
            planId,
            toSafeString(args.payload.completedAt) || undefined,
            toSafeString(args.payload.reason) || undefined,
            meta,
          );
        }
        if (action === 'cancel') {
          return this.planService.cancelPlan(
            args.userId,
            planId,
            toSafeString(args.payload.reason) || undefined,
            meta,
          );
        }
        if (action === 'open_next') {
          await this.assertNextCycleEligible(args.userId, {
            decisionType: 'PLAN_LIFECYCLE',
            payload: args.payload,
            context: { planId },
          });
          await this.coachContext.appendEvent({
            userId: args.userId,
            planId,
            type: 'ADAPTATION_APPLIED',
            source: 'ai',
            decisionId: args.decisionId,
            branchId: args.branchId,
            payload: {
              action: 'open_next',
              summaryId: toSafeString(args.payload.summaryId) || null,
            },
          });
          return {
            openedNextPlan: true,
            planId,
            summaryId: toSafeString(args.payload.summaryId) || null,
          };
        }
        this.fail('Unsupported lifecycle action');
      }
      case 'PLAN_WORKOUT_UPDATE': {
        const planId = toSafeString(args.payload.planId);
        const workoutId = toSafeString(args.payload.workoutId);
        const dto = asUpdatePlanWorkoutDto(
          args.payload.dto ?? args.payload.change,
        );
        if (!planId || !workoutId || !dto)
          this.fail('Invalid PLAN_WORKOUT_UPDATE payload');
        return this.planService.updateWorkout(
          args.userId,
          planId,
          workoutId,
          dto,
          meta,
        );
      }
      case 'PLAN_WORKOUT_ADD': {
        const planId = toSafeString(args.payload.planId);
        const dto = asUpdatePlanWorkoutInput(
          args.payload.dto ?? args.payload.change,
        );
        if (!planId || !dto) {
          this.fail('Invalid PLAN_WORKOUT_ADD payload');
        }
        return this.planService.addWorkout(args.userId, planId, dto, meta);
      }
      case 'PLAN_WORKOUT_STATUS': {
        const planId = toSafeString(args.payload.planId);
        const workoutId = toSafeString(args.payload.workoutId);
        const statusRaw = toSafeString(args.payload.status);
        if (!planId || !workoutId || !isPlanWorkoutStatus(statusRaw)) {
          this.fail('Invalid PLAN_WORKOUT_STATUS payload');
        }
        return this.planService.updateWorkoutStatus(
          args.userId,
          planId,
          workoutId,
          statusRaw,
          meta,
        );
      }
      case 'PLAN_WORKOUT_POSTPONE': {
        const planId = toSafeString(args.payload.planId);
        const workoutId = toSafeString(args.payload.workoutId);
        const weekIndex = Number(args.payload.weekIndex);
        const dayIndex = Number(args.payload.dayIndex);
        if (
          !planId ||
          !workoutId ||
          !Number.isFinite(weekIndex) ||
          !Number.isFinite(dayIndex)
        ) {
          this.fail('Invalid PLAN_WORKOUT_POSTPONE payload');
        }
        const detail = await this.planService.getWorkoutDetail(
          args.userId,
          planId,
          workoutId,
        );
        const w = detail.workout;
        const sportType = asPlanSportType(w.sportType);
        if (!sportType) this.fail('Invalid PLAN_WORKOUT_POSTPONE payload');
        return this.planService.updateWorkout(
          args.userId,
          planId,
          workoutId,
          {
            weekIndex,
            dayIndex,
            sessionIndex: w.sessionIndex ?? 1,
            sportType,
            text: w.text,
            notes: w.notes ?? undefined,
            name: w.name ?? undefined,
            reason: 'postpone',
          },
          meta,
        );
      }
      case 'PLAN_WORKOUT_RESCHEDULE': {
        const planId = toSafeString(args.payload.planId);
        const workoutId = toSafeString(args.payload.workoutId);
        const weekIndex = Number(args.payload.weekIndex);
        const dayIndex = Number(args.payload.dayIndex);
        if (
          !planId ||
          !workoutId ||
          !Number.isFinite(weekIndex) ||
          !Number.isFinite(dayIndex)
        ) {
          this.fail('Invalid PLAN_WORKOUT_RESCHEDULE payload');
        }
        const detail = await this.planService.getWorkoutDetail(
          args.userId,
          planId,
          workoutId,
        );
        const workout = detail.workout;
        const sportType = asPlanSportType(workout.sportType);
        if (!sportType) this.fail('Invalid PLAN_WORKOUT_RESCHEDULE payload');
        return this.planService.updateWorkout(
          args.userId,
          planId,
          workoutId,
          {
            weekIndex,
            dayIndex,
            sessionIndex: workout.sessionIndex ?? 1,
            sportType,
            text: workout.text,
            notes: workout.notes ?? undefined,
            name: workout.name ?? undefined,
            reason: 'reschedule_missed',
          },
          meta,
        );
      }
      case 'ACTIVITY_PLAN_LINK': {
        const hashId = toSafeString(args.payload.hashId);
        const workoutId = toSafeString(args.payload.workoutId);
        if (!hashId || !workoutId) {
          this.fail('Invalid ACTIVITY_PLAN_LINK payload');
        }
        return this.planService.replaceActivityPlanLinkByHash(
          args.userId,
          hashId,
          { workoutId },
          meta,
        );
      }
      default:
        this.fail(`Unsupported decisionType: ${args.decisionType}`);
    }
  }

  async applyDecision(args: {
    userId: string;
    decisionId: string;
    expectedBaseEventSeq?: number;
  }) {
    const decision = await this.requireDecisionOwner(
      args.userId,
      args.decisionId,
    );
    if (decision.state === CoachDecisionState.APPLIED) {
      const commit = await this.prisma.coachCommit.findFirst({
        where: { decisionId: decision.id },
        orderBy: { createdAt: 'desc' },
      });
      return {
        result: 'APPLIED',
        decisionId: decision.id,
        commit,
        receipt: asRecord(decision.payload)?.appliedReceipt ?? null,
        branch: {
          id: decision.branchId,
          status: 'CLOSED',
        },
      };
    }

    if (decision.state === CoachDecisionState.SUPERSEDED) {
      await this.recordApplyAttempt({
        decisionId: decision.id,
        result: CoachApplyResult.FAILED,
        baseEventSeq: decision.baseEventSeq ?? decision.branch.baseEventSeq,
        headEventSeq: decision.context.headEventSeq,
        error: {
          reason: 'SUPERSEDED',
        },
      });
      return {
        result: 'SKIPPED',
        reason: 'SUPERSEDED',
        decisionId: decision.id,
        branch: {
          id: decision.branchId,
          status: decision.branch.status,
        },
      };
    }

    if (decision.state !== CoachDecisionState.APPROVED) {
      this.fail('DECISION_STATE_INVALID');
    }
    await this.assertNextCycleEligible(args.userId, decision);
    if (
      !canApplyCoachDecisionOnContext({
        contextStatus: decision.context.status,
        decisionType: decision.decisionType,
        payload: decision.payload,
      })
    ) {
      this.fail('CONTEXT_FINALIZED');
    }

    const headEventSeq = decision.context.headEventSeq;
    const expectedBaseEventSeq =
      decision.baseEventSeq ?? decision.branch.baseEventSeq ?? headEventSeq;
    if (
      args.expectedBaseEventSeq !== undefined &&
      args.expectedBaseEventSeq !== expectedBaseEventSeq
    )
      this.fail('BASE_EVENT_SEQ_MISMATCH');

    if (expectedBaseEventSeq !== headEventSeq) {
      const intervening = await this.prisma.coachEvent.findMany({
        where: {
          contextId: decision.contextId,
          seq: { gt: expectedBaseEventSeq, lte: headEventSeq },
        },
        select: { decisionId: true },
      });
      if (
        !isOwnDecisionHeadAdvance({
          expectedBaseEventSeq,
          headEventSeq,
          intervening,
          decisionId: decision.id,
        })
      ) {
        await this.recordApplyAttempt({
          decisionId: decision.id,
          result: CoachApplyResult.REBASE_REQUIRED,
          baseEventSeq: expectedBaseEventSeq,
          headEventSeq,
        });
        await this.prisma.coachBranch.update({
          where: { id: decision.branchId },
          data: { status: CoachFlowStatus.REBASE_REQUIRED },
        });
        return {
          result: 'REBASE_REQUIRED',
          decisionId: decision.id,
          branch: {
            id: decision.branchId,
            status: 'REBASE_REQUIRED',
          },
          conflict: {
            expectedBaseEventSeq,
            currentHeadEventSeq: headEventSeq,
          },
        };
      }
    }

    const payload = (decision.payload ?? {}) as Record<string, unknown>;
    const beforeHead = headEventSeq;
    const isWorkoutChange =
      decision.decisionType === 'PLAN_WORKOUT_UPDATE' ||
      decision.decisionType === 'PLAN_WORKOUT_BATCH_UPDATE' ||
      decision.decisionType === 'PLAN_WORKOUT_ADD' ||
      decision.decisionType === 'PLAN_WORKOUT_SCHEDULE';
    const isPlanProposal =
      decision.decisionType === 'PLAN_ADAPTATION' ||
      decision.decisionType === 'PLAN_SUPERSESSION';
    const isAtomicPlanWrite = isWorkoutChange || isPlanProposal;

    try {
      if (!isAtomicPlanWrite)
        await this.executeDecisionMutation({
          userId: args.userId,
          decisionId: decision.id,
          branchId: decision.branchId,
          decisionType: decision.decisionType,
          payload,
        });

      const result = await this.prisma.$transaction(
        async (tx) => {
          let receipt: Record<string, unknown> | null = null;
          if (isAtomicPlanWrite) {
            // Claim the decision before writing. A concurrent apply/reject/supersede cannot apply it twice.
            const claimed = await tx.coachDecision.updateMany({
              where: { id: decision.id, state: CoachDecisionState.APPROVED },
              data: { state: CoachDecisionState.APPLIED },
            });
            if (claimed.count !== 1) this.fail('DECISION_STATE_CHANGED');
            const current = await this.planQuery.findContextById(
              decision.contextId,
              { headEventSeq: true },
              tx,
            );
            if (current?.headEventSeq !== beforeHead)
              this.fail('REBASE_REQUIRED');
            if (payload.planId !== decision.context.planId)
              this.fail('Decision must target the branch plan');
          }
          if (isPlanProposal) {
            const previewId = toSafeString(payload.previewId);
            if (!previewId) this.fail('Plan proposal previewId is required');
            receipt = await this.planProposals.apply({
              userId: args.userId,
              decisionId: decision.id,
              branchId: decision.branchId,
              contextPlanId: decision.context.planId,
              previewId,
              tx,
            });
          }
          if (isWorkoutChange) {
            const changes =
              decision.decisionType === 'PLAN_WORKOUT_ADD'
                ? []
                : this.workoutChanges(decision.decisionType, payload);
            const additions =
              decision.decisionType === 'PLAN_WORKOUT_ADD' ||
              decision.decisionType === 'PLAN_WORKOUT_SCHEDULE'
                ? this.workoutAdditions(decision.decisionType, payload)
                : [];
            const changed = changes.length
              ? await this.planService.updateWorkouts(
                  args.userId,
                  decision.context.planId,
                  changes,
                  {
                    source: 'ai',
                    action: 'decision_apply_workout_changes',
                    decisionId: decision.id,
                    branchId: decision.branchId,
                  },
                  { tx },
                )
              : null;
            const workoutReceipt = {
              planId: decision.context.planId,
              changedWorkoutCount: 0,
              changes: changed
                ? changes.map((c, index) => ({
                    workoutId: c.workoutId,
                    after: workoutChangeSnapshot(changed.after[index]),
                    fields: workoutChangeDiff(
                      changed.before[index],
                      changed.after[index],
                    ),
                  }))
                : [],
            };
            for (const dto of additions) {
              const added = await this.planService.addWorkout(
                args.userId,
                decision.context.planId,
                dto,
                {
                  source: 'ai',
                  action: 'decision_apply_workout_addition',
                  decisionId: decision.id,
                  branchId: decision.branchId,
                },
                { tx },
              );
              workoutReceipt.changes.push({
                workoutId: added.workout.id,
                after: workoutChangeSnapshot(added.workout),
                fields: workoutChangeDiff({}, added.workout),
              });
            }
            workoutReceipt.changedWorkoutCount = workoutReceipt.changes.filter(
              (change) => change.fields.length > 0,
            ).length;
            receipt = workoutReceipt;
          }
          const refreshedContext = await this.planQuery.findContextById(
            decision.contextId,
            { headEventSeq: true },
            tx,
          );
          const afterHead = Number(
            refreshedContext?.headEventSeq ?? beforeHead,
          );
          const eventFromSeq = afterHead > beforeHead ? beforeHead + 1 : null;
          const eventToSeq = afterHead > beforeHead ? afterHead : null;
          const parentCommit = await tx.coachCommit.findFirst({
            where: { contextId: decision.contextId },
            orderBy: [{ eventToSeq: 'desc' }, { createdAt: 'desc' }],
          });

          const commit = await tx.coachCommit.create({
            data: {
              contextId: decision.contextId,
              parentCommitId: parentCommit?.id ?? null,
              decisionId: decision.id,
              eventFromSeq,
              eventToSeq,
              commitMessage:
                toSafeString(payload.commitMessage) ||
                `apply ${decision.decisionType}`,
            },
          });

          if (eventFromSeq != null && eventToSeq != null) {
            await tx.coachEvent.updateMany({
              where: {
                contextId: decision.contextId,
                seq: { gte: eventFromSeq, lte: eventToSeq },
              },
              data: {
                decisionId: decision.id,
                branchId: decision.branchId,
                commitId: commit.id,
              },
            });
          }

          const updatedDecision = await tx.coachDecision.update({
            where: { id: decision.id },
            data: {
              state: CoachDecisionState.APPLIED,
              appliedAt: new Date(),
              ...(receipt
                ? { payload: asJson({ ...payload, appliedReceipt: receipt }) }
                : {}),
            },
          });

          await tx.coachBranch.update({
            where: { id: decision.branchId },
            data: {
              status: CoachFlowStatus.CLOSED,
              closedAt: new Date(),
            },
          });

          if (isAtomicPlanWrite)
            await this.recordApplyAttempt(
              {
                decisionId: decision.id,
                result: CoachApplyResult.APPLIED,
                baseEventSeq: expectedBaseEventSeq,
                headEventSeq: afterHead,
              },
              tx,
            );
          return {
            commit,
            decision: updatedDecision,
            headEventSeq: afterHead,
            receipt,
          };
        },
        { isolationLevel: 'Serializable', timeout: 60_000 },
      );

      if (isAtomicPlanWrite)
        await this.planService.notifyWorkoutChanges(
          args.userId,
          typeof result.receipt?.createdPlanId === 'string'
            ? result.receipt.createdPlanId
            : decision.context.planId,
        );

      if (!isAtomicPlanWrite)
        await this.recordApplyAttempt({
          decisionId: decision.id,
          result: CoachApplyResult.APPLIED,
          baseEventSeq: expectedBaseEventSeq,
          headEventSeq: result.headEventSeq,
        });

      return {
        result: 'APPLIED',
        decisionId: decision.id,
        commit: result.commit,
        receipt: result.receipt,
        branch: {
          id: decision.branchId,
          status: 'CLOSED',
        },
      };
    } catch (error) {
      await this.recordApplyAttempt({
        decisionId: decision.id,
        result: CoachApplyResult.FAILED,
        baseEventSeq: expectedBaseEventSeq,
        headEventSeq: beforeHead,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async rebaseDecision(args: {
    userId: string;
    decisionId: string;
    strategy?: 'AUTO_REPLAN' | string;
  }) {
    const decision = await this.requireDecisionOwner(
      args.userId,
      args.decisionId,
    );
    const context = decision.context;
    if (context.status !== 'ACTIVE') {
      this.fail('CONTEXT_FINALIZED');
    }

    return this.prisma.$transaction(async (tx) => {
      const latestCommit = await tx.coachCommit.findFirst({
        where: { contextId: context.id },
        orderBy: [{ eventToSeq: 'desc' }, { createdAt: 'desc' }],
      });
      const sourceMessages = await tx.coachBranchMessage.findMany({
        where: {
          branchId: decision.branchId,
          role: { not: 'system' },
        },
        orderBy: { msgSeq: 'desc' },
        take: Math.max(
          1,
          Math.min(
            Number(process.env.AI_COACH_REBASE_COPY_MESSAGES || 80),
            200,
          ),
        ),
      });
      sourceMessages.reverse();

      const branch = await tx.coachBranch.create({
        data: {
          contextId: decision.contextId,
          threadId: decision.branch.threadId,
          status: CoachFlowStatus.OPEN,
          baseEventSeq: context.headEventSeq,
          baseCommitId: latestCommit?.id ?? decision.branch.baseCommitId,
          openedBy: args.userId,
          openReason: 'decision_rebase',
        },
      });

      let branchHeadMsgSeq = 0;
      const appendBranchMessage = async (data: {
        role: string;
        content: unknown;
        toolCalls?: unknown;
        toolResults?: unknown;
        parentMsgId?: string | null;
        tokenIn?: number | null;
        tokenOut?: number | null;
      }) => {
        const msgSeq = await this.nextThreadMessageSeq(
          tx,
          decision.branch.threadId,
        );
        branchHeadMsgSeq = msgSeq;
        await tx.coachBranchMessage.create({
          data: {
            threadId: decision.branch.threadId,
            branchId: branch.id,
            msgSeq,
            role: data.role,
            content: asJson(data.content),
            toolCalls:
              data.toolCalls == null ? undefined : asJson(data.toolCalls),
            toolResults:
              data.toolResults == null ? undefined : asJson(data.toolResults),
            parentMsgId: toSafeString(data.parentMsgId) || null,
            tokenIn:
              typeof data.tokenIn === 'number'
                ? Math.trunc(data.tokenIn)
                : null,
            tokenOut:
              typeof data.tokenOut === 'number'
                ? Math.trunc(data.tokenOut)
                : null,
          },
        });
      };

      await appendBranchMessage({
        role: 'system',
        content: {
          kind: 'decision_rebase',
          strategy: toSafeString(args.strategy) || 'AUTO_REPLAN',
          sourceBranchId: decision.branchId,
          sourceDecisionId: decision.id,
          rebaseFromEventSeq:
            decision.baseEventSeq ?? decision.branch.baseEventSeq,
          rebaseToEventSeq: context.headEventSeq,
          decision: {
            id: decision.id,
            state: decision.state,
            riskTier: decision.riskTier,
            decisionType: decision.decisionType,
            payload: decision.payload,
            rationale: decision.rationale,
            confidence: decision.confidence,
          },
        },
      });

      for (const message of sourceMessages) {
        await appendBranchMessage({
          role: message.role,
          content: message.content,
          toolCalls: message.toolCalls,
          toolResults: message.toolResults,
          parentMsgId: message.parentMsgId,
          tokenIn: message.tokenIn,
          tokenOut: message.tokenOut,
        });
      }

      await tx.coachBranch.update({
        where: { id: branch.id },
        data: { headMsgSeq: branchHeadMsgSeq },
      });

      return {
        branch: {
          ...branch,
          headMsgSeq: branchHeadMsgSeq,
        },
        source: {
          branchId: decision.branchId,
          decisionId: decision.id,
          fromEventSeq: decision.baseEventSeq ?? decision.branch.baseEventSeq,
          toEventSeq: context.headEventSeq,
        },
      };
    });
  }

  async listContextBranches(args: {
    userId: string;
    contextId: string;
    status?: string;
  }) {
    await this.requireContextOwner(args.userId, args.contextId);
    const status = toSafeString(args.status);
    const branches = await this.prisma.coachBranch.findMany({
      where: {
        contextId: args.contextId,
        ...(status ? { status: status as CoachFlowStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { branches };
  }

  async getBranchTimeline(args: {
    userId: string;
    branchId: string;
    limit?: number;
  }) {
    const branch = await this.requireBranchOwner(args.userId, args.branchId);
    const take =
      typeof args.limit === 'number' && args.limit > 0
        ? Math.min(Math.trunc(args.limit), 200)
        : 100;

    const [messages, compactions, decisions, attempts] = await Promise.all([
      this.prisma.coachBranchMessage.findMany({
        where: { branchId: branch.id },
        orderBy: { msgSeq: 'asc' },
        take,
      }),
      this.prisma.coachBranchCompaction.findMany({
        where: { branchId: branch.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.coachDecision.findMany({
        where: { branchId: branch.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.coachApplyAttempt.findMany({
        where: {
          decision: {
            branchId: branch.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      branch,
      messages,
      compactions,
      decisions,
      attempts,
    };
  }

  async listContextCommits(args: { userId: string; contextId: string }) {
    await this.requireContextOwner(args.userId, args.contextId);
    const commits = await this.prisma.coachCommit.findMany({
      where: { contextId: args.contextId },
      orderBy: [{ eventToSeq: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return { commits };
  }

  /** GET /ai/coach/pending-decisions：ACTIVE 全要，FINALIZED 只留 open_next。APPROVED 留给 apply 失败后重试。 */
  async listPendingDecisions(args: { userId: string }) {
    const [decisions, latestReview, inquiry] = await Promise.all([
      this.prisma.coachDecision.findMany({
        where: {
          state: {
            in: [CoachDecisionState.PROPOSED, CoachDecisionState.APPROVED],
          },
          context: {
            userId: args.userId,
          },
        },
        include: {
          options: { orderBy: { createdAt: 'asc' } },
          branch: { select: { id: true, openReason: true } },
          context: {
            select: {
              id: true,
              planId: true,
              status: true,
              plan: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.coachEvent.findFirst({
        where: {
          type: { in: ['REVIEW_DAILY', 'REVIEW_WEEKLY', 'REVIEW_MONTHLY'] },
          occurredAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          context: { userId: args.userId, status: 'ACTIVE' },
        },
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          occurredAt: true,
          payload: true,
          context: {
            select: {
              id: true,
              planId: true,
              plan: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.assessmentCases?.pendingInquiry(args.userId) ?? null,
    ]);

    const nextCycleIds = decisions
      .filter((decision) =>
        isOpenNextLifecyclePayload(decision.decisionType, decision.payload),
      )
      .map((decision) => decision.context.planId);
    const eligibleNextCycles = new Set(
      await this.planQuery.findNextCycleEligiblePlanIds(
        args.userId,
        nextCycleIds,
      ),
    );
    const listable = decisions.filter(
      (decision) =>
        (!isOpenNextLifecyclePayload(decision.decisionType, decision.payload) ||
          eligibleNextCycles.has(decision.context.planId)) &&
        isListablePendingCoachDecision({
          contextStatus: decision.context.status,
          decisionType: decision.decisionType,
          payload: decision.payload,
        }),
    );
    const ranked = rankPendingCoachDecisions(listable).slice(0, 8);

    return {
      decisions: ranked.map(presentPendingCoachDecision),
      guidance: presentReviewGuidance(latestReview),
      inquiry,
    };
  }

  private async assertNextCycleEligible(
    userId: string,
    decision: {
      decisionType: string;
      payload: unknown;
      context: { planId: string };
    },
  ) {
    if (!isOpenNextLifecyclePayload(decision.decisionType, decision.payload))
      return;
    const eligible = await this.planQuery.findNextCycleEligiblePlanIds(userId, [
      decision.context.planId,
    ]);
    if (!eligible.length)
      this.fail(
        'This next-plan suggestion is no longer applicable. Refresh to view your current plan.',
      );
  }
}
