import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { asRecord, dayDiffByYmd } from './core/ai-common.util';

export type TodayAdviceCoachDecision = {
  id: string;
  state: string;
  stateRole:
    | 'INTERNAL_DRAFT'
    | 'ACTIVE_PROPOSAL'
    | 'REJECTED_HISTORY'
    | 'APPLIED_HISTORY'
    | 'SUPERSEDED_HISTORY';
  decisionType: string;
  riskTier: string;
  rationale: string | null;
  confidence: number | null;
  relevance: 'TODAY' | 'TOMORROW' | 'PAST' | 'FUTURE' | 'UNKNOWN';
  target: {
    planId: string | null;
    workoutId: string | null;
    sourceWorkoutId: string | null;
    workoutName: string | null;
    targetDate: string | null;
    status: string | null;
  };
  adjustment: {
    kind: string | null;
    before: {
      name: string | null;
      date: string | null;
      summary: string | null;
      expectedLoad: number | null;
    } | null;
    after: {
      name: string | null;
      date: string | null;
      summary: string | null;
      expectedLoad: number | null;
    } | null;
  } | null;
  selectedOptions: Array<{
    optionKey: string;
    title: string | null;
  }>;
  branchOpenReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
  supersededByDecisionId: string | null;
};

export type TodayAdviceCoachReview = {
  seq: number;
  type: string;
  occurredAt: string;
  outcome: string | null;
  decision: string | null;
  presentation: string | null;
  action: string | null;
  rationale: string | null;
  targetWorkoutId: string | null;
  sourceWorkoutId: string | null;
  targetDate: string | null;
  evidenceCodes: string[];
};

export type TodayAdviceCoachState = {
  decisionReadStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  decisions: TodayAdviceCoachDecision[];
  recentReviews: TodayAdviceCoachReview[];
  athleteState: {
    caseId: string;
    caseStatus: string;
    assessmentId: string;
    state: string;
    decisionReadiness: string;
    evidenceHash: string;
    decisionId: string | null;
    expiresAt: string;
  } | null;
};

type RecentCoachEvent = {
  seq: number;
  type: string;
  occurredAt: string;
  payload: unknown;
};

type CoachDecisionContextRow = {
  id: string;
  state: unknown;
  decisionType: string;
  riskTier: unknown;
  rationale: string | null;
  confidence: number | null;
  payload: unknown;
  createdAt: Date;
  approvedAt: Date | null;
  appliedAt: Date | null;
  supersededByDecisionId: string | null;
  branch: { openReason: string | null };
  options: Array<{ optionKey: string; title: string | null }>;
};

/**
 * 为今日建议提供紧凑、只读的 Coach 状态视图。
 *
 * Decision 仍由 CoachBranchingService 拥有和写入；这里不改变状态机，只把同一
 * CoachContext 下的草案、待确认、已拒绝、已应用和已替代状态统一投影给建议层。
 */
@Injectable()
export class CoachStateContextService {
  private readonly logger = new Logger(CoachStateContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(args: {
    userId: string;
    contextId: string | null;
    anchorDate: string;
    recentEvents: RecentCoachEvent[];
  }): Promise<TodayAdviceCoachState> {
    let decisions: CoachDecisionContextRow[] = [];
    let decisionReadStatus: TodayAdviceCoachState['decisionReadStatus'] =
      args.contextId ? 'AVAILABLE' : 'NOT_APPLICABLE';
    if (args.contextId) {
      try {
        decisions = await this.prisma.coachDecision.findMany({
          where: {
            contextId: args.contextId,
            context: { userId: args.userId },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            state: true,
            decisionType: true,
            riskTier: true,
            rationale: true,
            confidence: true,
            payload: true,
            createdAt: true,
            approvedAt: true,
            appliedAt: true,
            supersededByDecisionId: true,
            branch: { select: { openReason: true } },
            options: {
              where: { isSelected: true },
              orderBy: { createdAt: 'asc' },
              take: 2,
              select: {
                optionKey: true,
                title: true,
              },
            },
          },
        });
      } catch (error) {
        decisionReadStatus = 'UNAVAILABLE';
        this.logger.warn(
          `[coach-state-context] decision read failed userId=${args.userId} contextId=${args.contextId} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let athleteState: TodayAdviceCoachState['athleteState'] = null;
    try {
      const row = await this.prisma.coachAssessmentCase?.findFirst({
        where: {
          userId: args.userId,
          status: {
            in: [
              'OPEN',
              'ASSESSING',
              'WAITING_FOR_DATA',
              'WAITING_FOR_USER',
              'DECISION_READY',
            ],
          },
          expiresAt: { gt: new Date() },
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          assessmentId: true,
          evidenceHash: true,
          decisionId: true,
          expiresAt: true,
          assessment: { select: { state: true, decisionReadiness: true } },
        },
      });
      if (row) {
        athleteState = {
          caseId: row.id,
          caseStatus: row.status,
          assessmentId: row.assessmentId,
          state: row.assessment.state,
          decisionReadiness: row.assessment.decisionReadiness,
          evidenceHash: row.evidenceHash,
          decisionId: row.decisionId,
          expiresAt: row.expiresAt.toISOString(),
        };
      }
    } catch (error) {
      this.logger.warn(
        `[coach-state-context] athlete state read failed userId=${args.userId} reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      decisionReadStatus,
      decisions: decisions.map((decision) =>
        presentDecision(decision, args.anchorDate),
      ),
      recentReviews: args.recentEvents
        .filter((event) => event.type.startsWith('REVIEW_'))
        .slice(-3)
        .map(presentReview),
      athleteState,
    };
  }
}

function presentDecision(
  decision: CoachDecisionContextRow,
  anchorDate: string,
): TodayAdviceCoachDecision {
  const payload = asRecord(decision.payload) ?? {};
  const adjustment = asRecord(payload.adjustment);
  const before = asRecord(adjustment?.before);
  const after = asRecord(adjustment?.after);
  const targetDate =
    text(payload.targetDate) ?? text(after?.date) ?? text(before?.date);
  const relevantDates = [
    text(payload.targetDate),
    text(before?.date),
    text(after?.date),
  ].filter((value): value is string => Boolean(value));

  return {
    id: decision.id,
    state: String(decision.state),
    stateRole: decisionStateRole(String(decision.state)),
    decisionType: decision.decisionType,
    riskTier: String(decision.riskTier),
    rationale: clippedText(decision.rationale, 280),
    confidence:
      typeof decision.confidence === 'number' ? decision.confidence : null,
    relevance: decisionRelevance(relevantDates, anchorDate),
    target: {
      planId: text(payload.planId),
      workoutId: text(payload.workoutId),
      sourceWorkoutId: text(payload.sourceWorkoutId),
      workoutName: clippedText(payload.workoutName, 120),
      targetDate,
      status: text(payload.status),
    },
    adjustment: adjustment
      ? {
          kind: text(adjustment.kind),
          before: presentImpactSide(before),
          after: presentImpactSide(after),
        }
      : null,
    selectedOptions: decision.options.map((option) => ({
      optionKey: option.optionKey,
      title: clippedText(option.title, 120),
    })),
    branchOpenReason: decision.branch.openReason,
    createdAt: decision.createdAt.toISOString(),
    approvedAt: decision.approvedAt?.toISOString() ?? null,
    appliedAt: decision.appliedAt?.toISOString() ?? null,
    supersededByDecisionId: decision.supersededByDecisionId,
  };
}

function presentReview(event: RecentCoachEvent): TodayAdviceCoachReview {
  const payload = asRecord(event.payload) ?? {};
  return {
    seq: event.seq,
    type: event.type,
    occurredAt: event.occurredAt,
    outcome: text(payload.outcome),
    decision: text(payload.decision),
    presentation: text(payload.presentation),
    action: text(payload.action),
    rationale: clippedText(payload.rationale, 280),
    targetWorkoutId: text(payload.targetWorkoutId),
    sourceWorkoutId: text(payload.sourceWorkoutId),
    targetDate: text(payload.targetDate),
    evidenceCodes: stringArray(payload.evidenceCodes, 8),
  };
}

function presentImpactSide(value: Record<string, unknown> | null) {
  if (!value || Object.keys(value).length === 0) return null;
  const expectedLoad = Number(value.expectedLoad);
  return {
    name: clippedText(value.name, 120),
    date: text(value.date),
    summary: clippedText(value.summary, 160),
    expectedLoad: Number.isFinite(expectedLoad) ? expectedLoad : null,
  };
}

function decisionStateRole(
  state: string,
): TodayAdviceCoachDecision['stateRole'] {
  if (state === 'PROPOSED' || state === 'APPROVED') return 'ACTIVE_PROPOSAL';
  if (state === 'REJECTED') return 'REJECTED_HISTORY';
  if (state === 'APPLIED') return 'APPLIED_HISTORY';
  if (state === 'SUPERSEDED') return 'SUPERSEDED_HISTORY';
  return 'INTERNAL_DRAFT';
}

function decisionRelevance(
  dates: string[],
  anchorDate: string,
): TodayAdviceCoachDecision['relevance'] {
  const offsets = dates
    .map((date) => dayDiffByYmd(anchorDate, date))
    .filter((value): value is number => value !== null);
  if (offsets.includes(0)) return 'TODAY';
  if (offsets.includes(1)) return 'TOMORROW';
  if (offsets.some((value) => value > 1)) return 'FUTURE';
  if (offsets.some((value) => value < 0)) return 'PAST';
  return 'UNKNOWN';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clippedText(value: unknown, max: number): string | null {
  const normalized = text(value)?.replace(/\s+/g, ' ') ?? null;
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function stringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(text)
    .filter((item): item is string => Boolean(item))
    .slice(0, max);
}
