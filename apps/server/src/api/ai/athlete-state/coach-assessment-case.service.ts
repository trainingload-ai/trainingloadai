import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AthleteStateAssessment } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ATHLETE_STATE_POLICY,
  ACTIVE_COACH_ASSESSMENT_CASE_STATUSES,
} from '@/athlete-state/athlete-state-policy';
import type {
  AthleteStateAssessmentResult,
  AthleteStateEvidenceRequest,
} from '@/athlete-state/domain/athlete-state.contracts';
import type { CoachAssessmentOutcome } from './athlete-state.prompt';
import { CoachBranchingService } from '../coach-branching.service';
import { CoachAssessmentCaseQueryService } from './coach-assessment-case-query.service';
import { buildStoredCoachUiMessageEnvelope } from '../core/coach-history-messages';
import type { CoachAssistantMessageBody } from '../core/coach-query-yield';
import type { OpenCoachAssessmentCaseResult } from '@shared/coach-assessment';
import type {
  CoachInteractionSnapshot,
  CoachRunMetadata,
  CoachRunSnapshot,
} from '@shared/ai-coach-run-contract';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';
import { emitCoachAssessmentDecisionRequested } from './coach-assessment.events';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

function localizedFallbackRequest(locale: string): AthleteStateEvidenceRequest {
  const zh = locale.toLowerCase().startsWith('zh');
  return {
    kind: 'RECENT_SLEEP',
    reason: zh
      ? '当前恢复证据不足，近期睡眠会直接影响今天是否需要保守调整。'
      : 'Recovery evidence is incomplete, and recent sleep could change today’s conservative recommendation.',
    decisionImpact: zh
      ? '用于区分短暂疲劳与需要减量的恢复不足。'
      : 'Helps distinguish transient fatigue from under-recovery that merits reducing training.',
    question: {
      id: 'recent_sleep',
      header: zh ? '昨晚睡眠' : 'Last night',
      question: zh
        ? '昨晚的睡眠和平时相比怎么样？'
        : 'How was your sleep last night compared with usual?',
      options: zh
        ? [
            {
              value: 'worse',
              label: '明显更差',
              description: '睡眠时长或质量明显低于平时。',
            },
            {
              value: 'about_usual',
              label: '和平时差不多',
              description: '没有明显变化。',
            },
            {
              value: 'better',
              label: '比平时更好',
              description: '睡得更足或醒来更精神。',
            },
          ]
        : [
            {
              value: 'worse',
              label: 'Clearly worse',
              description: 'Sleep duration or quality was clearly below usual.',
            },
            {
              value: 'about_usual',
              label: 'About usual',
              description: 'There was no meaningful change.',
            },
            {
              value: 'better',
              label: 'Better than usual',
              description: 'You slept longer or woke feeling fresher.',
            },
          ],
    },
  };
}

function evidenceFamily(kind: string): string {
  const normalized = kind.trim().toUpperCase();
  if (
    normalized.includes('ILLNESS') ||
    normalized.includes('SYMPTOM') ||
    normalized.includes('WELLNESS')
  ) {
    return 'SYSTEMIC_SYMPTOMS';
  }
  if (normalized.includes('PAIN') || normalized.includes('INJURY')) {
    return 'PAIN_OR_INJURY';
  }
  if (normalized.includes('SLEEP')) return 'SLEEP';
  if (
    normalized.includes('FATIGUE') ||
    normalized.includes('RECOVERY') ||
    normalized.includes('SORENESS')
  ) {
    return 'RECOVERY';
  }
  if (normalized.includes('STRESS') || normalized.includes('MOOD')) {
    return 'PSYCHOSOCIAL';
  }
  return normalized;
}

export function selectUnaskedRequest(
  requests: AthleteStateEvidenceRequest[],
  previousKinds: string[],
): AthleteStateEvidenceRequest | undefined {
  const askedFamilies = new Set(previousKinds.map(evidenceFamily));
  return requests.find(
    (request) => !askedFamilies.has(evidenceFamily(request.kind)),
  );
}

export function buildAssessmentQuestionStoredMessage(input: {
  questionMessageId: string;
  runId: string;
  attemptId: string;
  visibleText: string;
  legacyMessage: CoachAssistantMessageBody;
  interaction: CoachInteractionSnapshot;
  startedAt: Date;
}) {
  const envelope = buildStoredCoachUiMessageEnvelope({
    role: 'assistant',
    content: input.visibleText,
    message: input.legacyMessage,
  });
  const metadata: CoachRunMetadata = {
    schemaVersion: 2,
    runId: input.runId,
    attemptId: input.attemptId,
  };
  const run: CoachRunSnapshot = {
    runId: input.runId,
    attemptId: input.attemptId,
    messageId: input.questionMessageId,
    revision: 1,
    status: 'awaiting_input',
    startedAt: input.startedAt.toISOString(),
    previousExecutionMs: 0,
    executionMs: 0,
    pendingInteractionId: input.interaction.interactionId,
  };
  return {
    ...envelope,
    version: 2 as const,
    metadata,
    parts: [
      { type: 'data-coach-run', data: run },
      ...envelope.parts,
      { type: 'data-coach-interaction', data: input.interaction },
    ],
  };
}

@Injectable()
export class CoachAssessmentCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branching: CoachBranchingService,
    private readonly queries: CoachAssessmentCaseQueryService,
    private readonly events: EventEmitter2,
  ) {}

  async createForAssessment(input: {
    userId: string;
    assessment: AthleteStateAssessment;
    result: AthleteStateAssessmentResult;
    triggerType: string;
    triggerRef?: string;
    locale: string;
    contextId?: string | null;
    planExecutionFactHash?: string | null;
    outcome?: CoachAssessmentOutcome | null;
  }) {
    const now = new Date();
    const request =
      input.result.evidenceRequests[0] ??
      localizedFallbackRequest(input.locale);
    const needsQuestion = input.result.decisionReadiness === 'NEEDS_USER_INPUT';
    const needsData = input.result.decisionReadiness === 'WAITING_FOR_SYNC';
    const dedupeKey = createHash('sha256')
      .update(
        [
          input.assessment.evidenceHash,
          needsQuestion
            ? request.kind
            : (input.outcome?.action ?? 'ASSESSMENT'),
        ].join(':'),
      )
      .digest('hex');
    const active = await this.prisma.coachAssessmentCase.findFirst({
      where: {
        userId: input.userId,
        dedupeKey,
        status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
      },
      include: { questions: { orderBy: { createdAt: 'asc' } } },
    });
    if (active) return active;
    const cooling = await this.prisma.coachAssessmentCase.findFirst({
      where: {
        userId: input.userId,
        evidenceHash: input.assessment.evidenceHash,
        cooldownUntil: { gt: now },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (cooling) return null;

    const expiresAt = new Date(
      now.getTime() + ATHLETE_STATE_POLICY.caseMaxAgeHours * 3_600_000,
    );
    const zh = input.locale.toLowerCase().startsWith('zh');
    const currentOutcome = needsQuestion
      ? {
          kind: 'INQUIRY',
          title: zh ? '补充一项状态信息' : 'One quick state check',
          observation:
            input.result.state === 'UNKNOWN'
              ? zh
                ? '现有数据还不足以可靠判断今天的恢复状态。'
                : 'The current evidence is not enough to judge today’s recovery reliably.'
              : zh
                ? '现有信号提示状态可能偏离平时，但还缺一项关键证据。'
                : 'Current signals may differ from usual, but one key fact is missing.',
          reason: request.reason,
        }
      : needsData
        ? {
            kind: 'WAITING_FOR_DATA',
            title: zh ? '正在等待状态数据' : 'Waiting for state data',
            observation: zh
              ? '有一项关键数据正在同步，当前不需要你额外操作。'
              : 'A material data source is still syncing; no action is needed from you yet.',
          }
        : { kind: 'OUTCOME', ...(input.outcome ?? {}) };
    try {
      const created = await this.prisma.coachAssessmentCase.create({
        data: {
          userId: input.userId,
          status: needsQuestion
            ? 'WAITING_FOR_USER'
            : needsData
              ? 'WAITING_FOR_DATA'
              : input.outcome?.requiresPlanDecision
                ? 'DECISION_READY'
                : 'RESOLVED',
          triggerType: input.triggerType,
          triggerRef: input.triggerRef ?? null,
          asOf: input.assessment.asOf,
          timezone: input.assessment.timezone,
          evidenceHash: input.assessment.evidenceHash,
          dedupeKey,
          assessmentId: input.assessment.id,
          contextId: input.contextId ?? null,
          planExecutionFactHash: input.planExecutionFactHash ?? null,
          currentOutcome: json(currentOutcome),
          followUpAt: needsData
            ? new Date(now.getTime() + 6 * 3_600_000)
            : input.outcome?.followUpHours
              ? new Date(
                  now.getTime() + input.outcome.followUpHours * 3_600_000,
                )
              : null,
          expiresAt,
          ...(needsQuestion
            ? {
                questionCount: 1,
                questions: {
                  create: {
                    evidenceKind: request.kind,
                    reason: request.reason,
                    decisionImpact: request.decisionImpact,
                    question: json(request.question),
                    eventStart: new Date(
                      input.assessment.asOf.getTime() - 36 * 3_600_000,
                    ),
                    eventEnd: input.assessment.asOf,
                    expiresAt,
                  },
                },
              }
            : {
                resolvedAt:
                  needsData || input.outcome?.requiresPlanDecision ? null : now,
              }),
        },
        include: { questions: { orderBy: { createdAt: 'asc' } } },
      });
      if (created.status === 'DECISION_READY') {
        await emitCoachAssessmentDecisionRequested(this.events, {
          userId: input.userId,
          caseId: created.id,
        });
      }
      return created;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      return this.prisma.coachAssessmentCase.findFirst({
        where: {
          userId: input.userId,
          dedupeKey,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
        },
        include: { questions: { orderBy: { createdAt: 'asc' } } },
      });
    }
  }

  async open(
    userId: string,
    caseId: string,
  ): Promise<OpenCoachAssessmentCaseResult> {
    let assessmentCase = await this.queries.requireOwned(userId, caseId);
    if (!assessmentCase)
      throw new NotFoundException('Assessment case not found');
    const question = assessmentCase.questions.find(
      (item) => item.status === 'PENDING',
    );
    if (!question)
      throw new ConflictException('Assessment question is no longer pending');
    if (question.promptMessageId && assessmentCase.sessionId) {
      return {
        sessionId: assessmentCase.sessionId,
        branchId: assessmentCase.branchId,
        contextId: assessmentCase.contextId,
        planId: assessmentCase.context?.planId ?? null,
        questionMessageId: question.promptMessageId,
      };
    }
    const claimed = await this.prisma.coachAssessmentCase.updateMany({
      where: {
        id: caseId,
        userId,
        revision: assessmentCase.revision,
        status: 'WAITING_FOR_USER',
      },
      data: { status: 'ASSESSING', revision: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      assessmentCase = await this.queries.requireOwned(userId, caseId);
      if (assessmentCase?.status === 'ASSESSING') {
        throw new ConflictException('Assessment case is being opened');
      }
      const existing = assessmentCase?.questions.find(
        (item) => item.status === 'PENDING' && item.promptMessageId,
      );
      if (assessmentCase?.sessionId && existing?.promptMessageId) {
        return {
          sessionId: assessmentCase.sessionId,
          branchId: assessmentCase.branchId,
          contextId: assessmentCase.contextId,
          planId: assessmentCase.context?.planId ?? null,
          questionMessageId: existing.promptMessageId,
        };
      }
      throw new ConflictException('Assessment case changed');
    }

    try {
      const branch = assessmentCase.contextId
        ? await this.branching.openBranch({
            userId,
            contextId: assessmentCase.contextId,
            openReason: 'athlete_state_assessment',
            sourceNode: { assessmentCaseId: caseId },
          })
        : null;
      const branchId = branch?.branch.id ?? null;
      const sessionId = assessmentCase.sessionId ?? `assessment:${caseId}`;
      const questionMessageId = randomUUID();
      const runId = randomUUID();
      const attemptId = randomUUID();
      const openedAt = new Date();
      const toolCallId = `assessment-question:${question.id}`;
      const payload = {
        questions: [question.question],
        metadata: {
          source: 'athlete_state_assessment',
          assessmentCaseId: caseId,
          assessmentQuestionId: question.id,
        },
      };
      const legacyMessage: CoachAssistantMessageBody = {
        content: [
          {
            type: 'tool_use',
            id: toolCallId,
            name: 'AskUserQuestion',
            input: payload,
          },
        ],
      };
      const visibleText = String(
        (question.question as { question?: unknown })?.question ?? '',
      );
      const interaction: CoachInteractionSnapshot = {
        interactionId: `${attemptId}:question:${toolCallId}`,
        runId,
        questionMessageId,
        questionToolCallId: toolCallId,
        status: 'pending',
        revision: 1,
      };
      await this.prisma.$transaction(async (tx) => {
        await tx.aiCoachSession.upsert({
          where: { userId_id: { userId, id: sessionId } },
          create: {
            userId,
            id: sessionId,
            title: visibleText.slice(0, 80) || null,
          },
          update: {},
        });
        const session = await tx.aiCoachSession.update({
          where: { userId_id: { userId, id: sessionId } },
          data: { nextSequence: { increment: 1 } },
        });
        await tx.aiCoachMessage.create({
          data: {
            id: questionMessageId,
            userId,
            sessionId,
            role: 'ASSISTANT',
            content: visibleText,
            message: json(
              buildAssessmentQuestionStoredMessage({
                questionMessageId,
                runId,
                attemptId,
                visibleText,
                legacyMessage,
                interaction,
                startedAt: openedAt,
              }),
            ),
            sequence: session.nextSequence - 1,
          },
        });
        await tx.coachRun.create({
          data: {
            id: runId,
            userId,
            sessionId,
            branchId,
            originMessageId: `assessment-case:${caseId}`,
            status: 'awaiting_input',
            revision: 1,
            pendingInteraction: json(interaction),
          },
        });
        await tx.coachRunAttempt.create({
          data: {
            id: attemptId,
            runId,
            userId,
            requestId: `assessment-case-open:${caseId}:${question.id}`,
            requestHash: createHash('sha256').update(caseId).digest('hex'),
            messageId: questionMessageId,
            inputMessageId: `assessment-case:${caseId}`,
            // CoachRunAttempt.trigger is a shared state-machine discriminator
            // constrained by the database to start | answer | retry. Opening
            // an assessment-backed run is still the first/start attempt; the
            // requestId and ownerId preserve its Athlete State provenance.
            trigger: 'start',
            status: 'completed',
            completionReason: 'awaiting_input',
            revision: 1,
            operationId: `assessment-case:${caseId}:${question.id}`,
            ownerId: 'athlete-state-runtime',
            endedAt: new Date(),
          },
        });
        const updatedQuestion = await tx.coachAssessmentQuestion.updateMany({
          where: {
            id: question.id,
            caseId,
            status: 'PENDING',
            promptMessageId: null,
          },
          data: { promptMessageId: questionMessageId, askedAt: openedAt },
        });
        if (updatedQuestion.count !== 1) {
          throw new ConflictException('Assessment question changed');
        }
        await tx.coachAssessmentCase.update({
          where: { id: caseId },
          data: {
            sessionId,
            branchId,
            status: 'WAITING_FOR_USER',
            revision: { increment: 1 },
          },
        });
      });
      if (branchId) {
        await this.branching.appendBranchMessage({
          userId,
          branchId,
          role: 'system',
          message: {
            kind: 'athlete_state_assessment_case',
            assessmentCaseId: caseId,
            state: assessmentCase.assessment.state,
            decisionReadiness: assessmentCase.assessment.decisionReadiness,
            question: payload,
          },
        });
      }
      return {
        sessionId,
        branchId,
        contextId: assessmentCase.contextId,
        planId: assessmentCase.context?.planId ?? null,
        questionMessageId,
      };
    } catch (error) {
      await this.prisma.coachAssessmentCase.updateMany({
        where: { id: caseId, userId, status: 'ASSESSING' },
        data: { status: 'WAITING_FOR_USER', revision: { increment: 1 } },
      });
      throw error;
    }
  }

  async dismiss(userId: string, caseId: string) {
    const assessmentCase = await this.queries.requireOwned(userId, caseId);
    if (!assessmentCase)
      throw new NotFoundException('Assessment case not found');
    const now = new Date();
    const cooldownUntil = new Date(
      now.getTime() + ATHLETE_STATE_POLICY.repeatCooldownHours * 3_600_000,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.coachAssessmentQuestion.updateMany({
        where: { caseId, status: 'PENDING' },
        data: { status: 'SKIPPED', answeredAt: now },
      });
      await tx.coachAssessmentCase.updateMany({
        where: {
          id: caseId,
          userId,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          cooldownUntil,
          revision: { increment: 1 },
        },
      });
    });
    return { ok: true, cooldownUntil: cooldownUntil.toISOString() };
  }

  async persistAnswer(input: {
    userId: string;
    caseId: string;
    questionId: string;
    answerMessageId: string;
    answer: unknown;
  }) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.coachAssessmentQuestion.updateMany({
        where: {
          id: input.questionId,
          caseId: input.caseId,
          status: 'PENDING',
          expiresAt: { gt: now },
          case: {
            userId: input.userId,
            status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
            expiresAt: { gt: now },
          },
        },
        data: {
          status: 'ANSWERED',
          answer: json(input.answer),
          answerMessageId: input.answerMessageId,
          answeredAt: now,
        },
      });
      if (changed.count !== 1) return { accepted: false };
      const caseChanged = await tx.coachAssessmentCase.updateMany({
        where: {
          id: input.caseId,
          userId: input.userId,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
          expiresAt: { gt: now },
        },
        data: { status: 'ASSESSING', revision: { increment: 1 } },
      });
      if (caseChanged.count !== 1) {
        throw new ConflictException('Assessment case changed');
      }
      return { accepted: true };
    });
  }

  async advance(input: {
    userId: string;
    caseId: string;
    assessment: AthleteStateAssessment;
    result: AthleteStateAssessmentResult;
    outcome: CoachAssessmentOutcome | null;
    planExecutionFactHash: string | null;
    hasActivePlan: boolean;
    locale: string;
  }) {
    const assessmentCase = await this.queries.requireOwned(
      input.userId,
      input.caseId,
    );
    if (!assessmentCase)
      throw new NotFoundException('Assessment case not found');
    const now = new Date();
    const nextRequest = selectUnaskedRequest(
      input.result.evidenceRequests,
      assessmentCase.questions.map(
        (question: { evidenceKind: string }) => question.evidenceKind,
      ),
    );
    const canAskAgain =
      input.result.decisionReadiness === 'NEEDS_USER_INPUT' &&
      Boolean(nextRequest) &&
      assessmentCase.questionCount < ATHLETE_STATE_POLICY.questionBudget;
    const waitingForData =
      input.result.decisionReadiness === 'WAITING_FOR_SYNC';
    const safeOutcome =
      input.result.state === 'HIGH_CONCERN' && input.outcome
        ? { ...input.outcome, requiresPlanDecision: false }
        : input.outcome;
    const status = waitingForData
      ? 'WAITING_FOR_DATA'
      : canAskAgain
        ? 'WAITING_FOR_USER'
        : safeOutcome?.requiresPlanDecision && input.hasActivePlan
          ? 'DECISION_READY'
          : 'RESOLVED';
    const expiresAt = new Date(
      now.getTime() + ATHLETE_STATE_POLICY.caseMaxAgeHours * 3_600_000,
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.coachAssessmentCase.updateMany({
        where: {
          id: input.caseId,
          userId: input.userId,
          revision: assessmentCase.revision,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
        },
        data: {
          assessmentId: input.assessment.id,
          evidenceHash: input.assessment.evidenceHash,
          status,
          planExecutionFactHash: input.planExecutionFactHash,
          currentOutcome: json(
            waitingForData
              ? {
                  kind: 'WAITING_FOR_DATA',
                  title: input.locale.toLowerCase().startsWith('zh')
                    ? '正在等待状态数据'
                    : 'Waiting for state data',
                  observation: input.locale.toLowerCase().startsWith('zh')
                    ? '有一项关键数据正在同步，当前不需要你额外操作。'
                    : 'A material data source is still syncing; no action is needed from you yet.',
                }
              : canAskAgain
                ? {
                    kind: 'INQUIRY',
                    title: input.locale.toLowerCase().startsWith('zh')
                      ? '还需要确认一项信息'
                      : 'One more detail',
                    observation: input.locale.toLowerCase().startsWith('zh')
                      ? '你的回答已经纳入评估，但仍有一项信息会影响今天的建议。'
                      : 'Your answer is included, but one more fact could change today’s recommendation.',
                    reason: nextRequest?.reason,
                  }
                : { kind: 'OUTCOME', ...(safeOutcome ?? {}) },
          ),
          questionCount: canAskAgain
            ? { increment: 1 }
            : assessmentCase.questionCount,
          followUpAt: waitingForData
            ? new Date(now.getTime() + 6 * 3_600_000)
            : safeOutcome?.followUpHours
              ? new Date(now.getTime() + safeOutcome.followUpHours * 3_600_000)
              : null,
          expiresAt,
          resolvedAt: status === 'RESOLVED' ? now : null,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Assessment case changed');
      }
      if (canAskAgain && nextRequest) {
        await tx.coachAssessmentQuestion.create({
          data: {
            caseId: input.caseId,
            evidenceKind: nextRequest.kind,
            reason: nextRequest.reason,
            decisionImpact: nextRequest.decisionImpact,
            question: json(nextRequest.question),
            eventStart: new Date(
              input.assessment.asOf.getTime() - 36 * 3_600_000,
            ),
            eventEnd: input.assessment.asOf,
            expiresAt,
          },
        });
      }
    });
    if (assessmentCase.branchId) {
      await this.branching.appendBranchMessage({
        userId: input.userId,
        branchId: assessmentCase.branchId,
        role: 'system',
        message: {
          kind: 'athlete_state_assessment_update',
          assessmentCaseId: input.caseId,
          state: input.result.state,
          decisionReadiness: input.result.decisionReadiness,
          outcome: safeOutcome,
          planChangeRequiresUserConfirmation: true,
        },
      });
    }
    // A conversational Coach turn may explain the recommendation, but it is
    // not the authority that mutates a plan and is not guaranteed to draft a
    // decision. Always enter the idempotent Decision pipeline so both
    // background and interactive Cases require the same explicit approval.
    if (status === 'DECISION_READY') {
      await emitCoachAssessmentDecisionRequested(this.events, {
        userId: input.userId,
        caseId: input.caseId,
      });
    }
    return { status, outcome: safeOutcome };
  }

  async deferReassessment(userId: string, caseId: string) {
    const now = new Date();
    await this.prisma.coachAssessmentCase.updateMany({
      where: {
        id: caseId,
        userId,
        status: 'ASSESSING',
        expiresAt: { gt: now },
      },
      data: {
        status: 'WAITING_FOR_DATA',
        followUpAt: new Date(now.getTime() + 15 * 60_000),
        revision: { increment: 1 },
      },
    });
  }

  async expireLateQuestion(userId: string, caseId: string, questionId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.coachAssessmentQuestion.updateMany({
        where: { id: questionId, caseId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      await tx.coachAssessmentCase.updateMany({
        where: {
          id: caseId,
          userId,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
        },
        data: {
          status: 'EXPIRED',
          resolvedAt: now,
          followUpAt: null,
          revision: { increment: 1 },
        },
      });
    });
  }

  async assertBoundRequest(input: {
    userId: string;
    caseId: string;
    sessionId: string;
    branchId?: string | null;
  }) {
    const assessmentCase = await this.prisma.coachAssessmentCase.findFirst({
      where: { id: input.caseId, userId: input.userId },
      select: { sessionId: true, branchId: true },
    });
    if (
      !assessmentCase ||
      assessmentCase.sessionId !== input.sessionId ||
      (assessmentCase.branchId ?? null) !== (input.branchId ?? null)
    ) {
      throw new ConflictException(
        'Assessment case is not bound to this Coach session',
      );
    }
  }

  async decisionChanged(
    userId: string,
    decisionId: string,
    change: 'APPLIED' | 'REJECTED' | 'REBASE_REQUIRED' | 'SKIPPED',
  ) {
    const now = new Date();
    const completed = change === 'APPLIED' || change === 'REJECTED';
    const cooldownUntil =
      change === 'REJECTED'
        ? new Date(
            now.getTime() +
              ATHLETE_STATE_POLICY.repeatCooldownHours * 3_600_000,
          )
        : null;
    await this.prisma.coachAssessmentCase.updateMany({
      where: { userId, decisionId },
      data: {
        status: completed ? 'RESOLVED' : 'SUPERSEDED',
        resolvedAt: now,
        cooldownUntil,
        followUpAt: null,
        revision: { increment: 1 },
      },
    });
    await emitAthleteStateReassessRequested(this.events, {
      userId,
      triggerType: `DECISION_${change}`,
      triggerRef: decisionId,
    });
  }
}
