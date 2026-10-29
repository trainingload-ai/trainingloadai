import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AthleteStateAssessment } from '@prisma/client';
import { AthleteStateCommands } from '@/athlete-state/application/athlete-state-commands.service';
import { AthleteStateQueries } from '@/athlete-state/application/athlete-state-queries.service';
import { AthleteStateFeatureFlags } from '@/athlete-state/athlete-state-feature-flags.service';
import { ATHLETE_STATE_POLICY } from '@/athlete-state/athlete-state-policy';
import type { AthleteStateAssessmentResult } from '@/athlete-state/domain/athlete-state.contracts';
import {
  ATHLETE_STATE_REASSESS_REQUESTED_EVENT,
  type AthleteStateReassessRequestedEvent,
} from '@/athlete-state/athlete-state.events';
import { UserService } from '@/api/user/user.service';
import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { AthleteStateModelService } from './athlete-state-model.service';
import {
  CoachAssessmentCaseService,
  selectUnaskedRequest,
} from './coach-assessment-case.service';
import { CoachAssessmentCaseQueryService } from './coach-assessment-case-query.service';
import {
  COACH_ASSESSMENT_ANSWERED_EVENT,
  type CoachAssessmentAnsweredEvent,
} from './coach-assessment.events';

function array(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)),
      )
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function assessmentResult(
  row: AthleteStateAssessment,
): AthleteStateAssessmentResult {
  return {
    state: row.state,
    confidence: row.confidence,
    decisionReadiness: row.decisionReadiness,
    dimensions: array(row.dimensions),
    hypotheses: array(row.hypotheses),
    evidenceRequests: array(
      row.evidenceRequests,
    ) as AthleteStateAssessmentResult['evidenceRequests'],
    safetyFlags: array(row.safetyFlags),
    limitations: strings(row.limitations),
  };
}

function boundedPlanFacts(
  context: Awaited<ReturnType<PlanExecutionContextService['buildContext']>>,
) {
  const workout = (value: (typeof context.nextWorkouts)[number]) => ({
    id: value.id,
    scheduledDate: value.scheduledDate,
    sportType: value.sportType,
    status: value.status,
    name: value.name,
    plannedDurationSeconds: value.plannedDurationSeconds,
    expectedLoad: value.expectedLoad,
  });
  return {
    factHash: context.factHash,
    contextId: context.contextId,
    plan: context.plan
      ? {
          id: context.plan.id,
          title: context.plan.title,
          status: context.plan.status,
          currentWeekIndex: context.plan.currentWeekIndex,
        }
      : null,
    day: {
      date: context.day.date,
      completionState: context.day.completionState,
      plannedWorkouts: context.day.plannedWorkouts.map(workout),
    },
    tomorrow: {
      date: context.tomorrow.date,
      plannedWorkouts: context.tomorrow.plannedWorkouts.map(workout),
    },
    nextWorkouts: context.nextWorkouts.map(workout),
    recentLoad: context.recentLoad,
    activeCompetitionInfluences:
      context.competitionContext.activeInfluences.slice(0, 3),
  };
}

export function shouldModelFollowupOutcome(input: {
  result: AthleteStateAssessmentResult;
  questionCount: number;
  previousEvidenceKinds: string[];
}) {
  if (input.result.decisionReadiness === 'WAITING_FOR_SYNC') return false;
  if (input.result.decisionReadiness !== 'NEEDS_USER_INPUT') return true;
  const canAskAgain =
    input.questionCount < ATHLETE_STATE_POLICY.questionBudget &&
    Boolean(
      selectUnaskedRequest(
        input.result.evidenceRequests,
        input.previousEvidenceKinds,
      ),
    );
  return !canAskAgain;
}

@Injectable()
export class CoachAssessmentOrchestratorService {
  private readonly logger = new Logger(CoachAssessmentOrchestratorService.name);
  private readonly running = new Map<string, Promise<unknown>>();

  constructor(
    private readonly commands: AthleteStateCommands,
    private readonly queries: AthleteStateQueries,
    private readonly flags: AthleteStateFeatureFlags,
    private readonly users: UserService,
    private readonly planExecution: PlanExecutionContextService,
    private readonly model: AthleteStateModelService,
    private readonly cases: CoachAssessmentCaseService,
    private readonly caseQueries: CoachAssessmentCaseQueryService,
  ) {}

  @OnEvent(ATHLETE_STATE_REASSESS_REQUESTED_EVENT)
  handleRequested(event: AthleteStateReassessRequestedEvent) {
    void this.runOnce(event.userId, () =>
      this.assess({
        userId: event.userId,
        triggerType: event.triggerType,
        triggerRef: event.triggerRef,
      }),
    ).catch((error) =>
      this.logger.warn(
        `Athlete State reassessment failed user=${event.userId} error=${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  @OnEvent(COACH_ASSESSMENT_ANSWERED_EVENT, { suppressErrors: false })
  async handleAnswer(event: CoachAssessmentAnsweredEvent) {
    try {
      await this.runOnce(event.userId, () =>
        this.continueAfterAnswer({
          userId: event.userId,
          caseId: event.caseId,
          questionId: event.questionId,
          promptMessageId: event.promptMessageId,
          answerMessageId: event.answerMessageId,
          reply: event.reply,
        }),
      );
    } catch (error) {
      // The answer message and structured Question answer are already durable.
      // A transient model/source failure therefore becomes a scheduled retry,
      // never a Case stranded forever in ASSESSING.
      await this.cases.deferReassessment(event.userId, event.caseId);
      throw error;
    }
  }

  async assess(input: {
    userId: string;
    triggerType: string;
    triggerRef?: string;
    scopedAnswers?: Array<Record<string, unknown>>;
    preserveCaseId?: string;
  }) {
    if (!this.flags.evidenceEnabled()) return { disabled: true };
    const [timezone, locale] = await Promise.all([
      this.users.getPreferredTimezone(input.userId),
      this.users.getPreferredLocale(input.userId),
    ]);
    const scopedAnswers =
      input.scopedAnswers ??
      (input.preserveCaseId
        ? await this.scopedAnswersForCase(input.userId, input.preserveCaseId)
        : undefined);
    const evidence = await this.commands.buildEvidence({
      userId: input.userId,
      timezone: timezone ?? 'UTC',
      scopedAnswers,
    });
    if (!this.flags.assessmentShadowEnabled()) {
      return { evidenceHash: evidence.evidenceHash, shadowDisabled: true };
    }
    let assessment = await this.queries.reusable({
      userId: input.userId,
      evidenceHash: evidence.evidenceHash,
    });
    let result: AthleteStateAssessmentResult;
    if (assessment) {
      result = assessmentResult(assessment);
    } else {
      const modeled = await this.model.assess({
        userId: input.userId,
        evidenceHash: evidence.evidenceHash,
        snapshot: evidence.modelSnapshot,
        language: locale,
      });
      result = modeled.result;
      const saved = await this.commands.saveAssessment({
        userId: input.userId,
        evidence,
        result,
        model: modeled.model,
        preserveCaseId: input.preserveCaseId,
      });
      assessment = saved.assessment;
      // Another process may have persisted the same evidence first. The Case
      // must always use the result stored with the immutable Assessment rather
      // than this worker's losing, potentially non-identical model sample.
      if (saved.reused) result = assessmentResult(saved.assessment);
    }
    if (!this.flags.caseEnabled()) return { assessment, result };

    let planContext: Awaited<
      ReturnType<PlanExecutionContextService['buildContext']>
    > | null = null;
    try {
      planContext = await this.planExecution.buildContext({
        userId: input.userId,
        surface: 'COACH_CHAT',
        timezone: timezone ?? 'UTC',
      });
    } catch (error) {
      // Athlete State is independent from plan-execution evaluation. A plan
      // read failure must not erase an otherwise valid state assessment or
      // force the model to infer that no plan exists.
      this.logger.warn(
        `Plan execution context unavailable user=${input.userId} error=${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const planFacts = planContext
      ? boundedPlanFacts(planContext)
      : {
          unavailable: true,
          reason: 'PLAN_EXECUTION_CONTEXT_UNAVAILABLE',
        };
    const hasActivePlan = Boolean(planContext?.plan);
    if (input.preserveCaseId) {
      const existingCase = await this.caseQueries.requireOwned(
        input.userId,
        input.preserveCaseId,
      );
      const shouldModelOutcome = shouldModelFollowupOutcome({
        result,
        questionCount:
          existingCase?.questionCount ?? ATHLETE_STATE_POLICY.questionBudget,
        previousEvidenceKinds:
          existingCase?.questions.map((question) => question.evidenceKind) ??
          [],
      });
      const modeledOutcome = !shouldModelOutcome
        ? null
        : (
            await this.model.outcome({
              userId: input.userId,
              caseId: input.preserveCaseId,
              assessment: result,
              planExecutionFacts: planFacts,
              hasActivePlan,
              language: locale,
            })
          ).result;
      const outcome = modeledOutcome
        ? {
            ...modeledOutcome,
            requiresPlanDecision:
              this.flags.planDecisionEnabled() &&
              modeledOutcome.requiresPlanDecision,
          }
        : null;
      await this.cases.advance({
        userId: input.userId,
        caseId: input.preserveCaseId,
        assessment,
        result,
        outcome,
        planExecutionFactHash: planContext?.factHash ?? null,
        hasActivePlan,
        locale,
      });
      return { assessment, result, outcome };
    }

    if (
      result.state === 'STABLE' &&
      result.decisionReadiness === 'SUFFICIENT'
    ) {
      return { assessment, result, case: null };
    }
    const modeledOutcome =
      result.decisionReadiness === 'NEEDS_USER_INPUT' ||
      result.decisionReadiness === 'WAITING_FOR_SYNC'
        ? null
        : (
            await this.model.outcome({
              userId: input.userId,
              caseId: assessment.id,
              assessment: result,
              planExecutionFacts: planFacts,
              hasActivePlan,
              language: locale,
            })
          ).result;
    const outcome = modeledOutcome
      ? {
          ...modeledOutcome,
          requiresPlanDecision:
            this.flags.planDecisionEnabled() &&
            modeledOutcome.requiresPlanDecision,
        }
      : null;
    const assessmentCase = await this.cases.createForAssessment({
      userId: input.userId,
      assessment,
      result,
      triggerType: input.triggerType,
      triggerRef: input.triggerRef,
      locale,
      contextId: planContext?.contextId ?? null,
      planExecutionFactHash: planContext?.factHash ?? null,
      outcome,
    });
    return { assessment, result, case: assessmentCase, outcome };
  }

  async continueAfterAnswer(input: {
    userId: string;
    caseId: string;
    questionId: string;
    promptMessageId: string;
    answerMessageId: string;
    reply: {
      kind: string;
      answers?: Record<string, string | string[]>;
      notes?: Record<string, string>;
      skippedQuestionIds?: string[];
    };
  }) {
    const assessmentCase = await this.caseQueries.requireOwned(
      input.userId,
      input.caseId,
    );
    if (!assessmentCase) return;
    const question = assessmentCase.questions.find(
      (item) =>
        item.id === input.questionId &&
        item.promptMessageId === input.promptMessageId,
    );
    if (!question) return;
    const now = new Date();
    if (question.status === 'ANSWERED') return;
    if (input.reply.kind === 'coach_question_skip') {
      await this.cases.dismiss(input.userId, input.caseId);
      return;
    }
    const scopedAnswer = {
      evidenceKind: question.evidenceKind,
      answer: {
        answers: input.reply.answers ?? {},
        notes: input.reply.notes ?? {},
        skippedQuestionIds: input.reply.skippedQuestionIds ?? [],
      },
      eventStart: question.eventStart?.toISOString() ?? null,
      eventEnd: question.eventEnd?.toISOString() ?? now.toISOString(),
    };
    const late =
      question.status === 'EXPIRED' ||
      question.status === 'SUPERSEDED' ||
      question.expiresAt <= now ||
      assessmentCase.expiresAt <= now ||
      assessmentCase.status === 'EXPIRED' ||
      assessmentCase.status === 'SUPERSEDED';
    if (late) {
      await this.cases.expireLateQuestion(
        input.userId,
        input.caseId,
        question.id,
      );
      await this.assess({
        userId: input.userId,
        triggerType: 'LATE_CASE_ANSWER',
        triggerRef: input.answerMessageId,
        scopedAnswers: [scopedAnswer],
      });
      return;
    }
    if (question.status !== 'PENDING') return;
    // The answer is committed before any new model call. This makes a retry
    // idempotent and gives Memory extraction the same durable user message.
    const persisted = await this.persistAnswer({
      userId: input.userId,
      caseId: input.caseId,
      questionId: question.id,
      answerMessageId: input.answerMessageId,
      answer: {
        answers: input.reply.answers ?? {},
        notes: input.reply.notes ?? {},
      },
    });
    if (!persisted.accepted) return;
    const scopedAnswers = assessmentCase.questions
      .filter((item) => item.status === 'ANSWERED' && item.answer)
      .map((item) => ({
        evidenceKind: item.evidenceKind,
        answer: item.answer,
        eventStart: item.eventStart?.toISOString() ?? null,
        eventEnd: item.eventEnd?.toISOString() ?? null,
      }));
    scopedAnswers.push(scopedAnswer);
    await this.assess({
      userId: input.userId,
      triggerType: 'CASE_ANSWER',
      triggerRef: input.answerMessageId,
      scopedAnswers,
      preserveCaseId: input.caseId,
    });
  }

  private persistAnswer(input: {
    userId: string;
    caseId: string;
    questionId: string;
    answerMessageId: string;
    answer: unknown;
  }) {
    return this.cases.persistAnswer(input);
  }

  private async scopedAnswersForCase(userId: string, caseId: string) {
    const assessmentCase = await this.caseQueries.requireOwned(userId, caseId);
    return assessmentCase?.questions
      .filter((item) => item.status === 'ANSWERED' && item.answer)
      .map((item) => ({
        evidenceKind: item.evidenceKind,
        answer: item.answer,
        eventStart: item.eventStart?.toISOString() ?? null,
        eventEnd: item.eventEnd?.toISOString() ?? null,
      }));
  }

  private runOnce<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const current = this.running.get(userId);
    // Serialize per athlete instead of dropping the newer trigger. In
    // particular, a structured answer must never be lost merely because a
    // health-sync or Memory invalidation assessment is already running.
    const queued = (
      current ? current.catch(() => undefined) : Promise.resolve()
    )
      .then(task)
      .finally(() => {
        if (this.running.get(userId) === queued) this.running.delete(userId);
      });
    this.running.set(userId, queued);
    return queued;
  }
}
