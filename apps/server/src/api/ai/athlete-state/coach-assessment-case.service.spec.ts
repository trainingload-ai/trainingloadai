import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildAssessmentQuestionStoredMessage,
  CoachAssessmentCaseService,
} from './coach-assessment-case.service';

const assessment = {
  id: 'assessment-1',
  asOf: new Date('2026-10-12T01:00:00.000Z'),
  timezone: 'Asia/Shanghai',
  evidenceHash: 'evidence-1',
};

function result(
  readiness: 'NEEDS_USER_INPUT' | 'WAITING_FOR_SYNC' | 'SUFFICIENT',
  evidenceRequests: unknown[] = [],
) {
  return {
    state: 'UNKNOWN',
    confidence: 0.3,
    decisionReadiness: readiness,
    dimensions: [],
    hypotheses: [],
    evidenceRequests,
    safetyFlags: [],
    limitations: [],
  };
}

describe('CoachAssessmentCaseService', () => {
  const findFirst = jest.fn<(...args: any[]) => Promise<any>>();
  const create = jest.fn<(...args: any[]) => Promise<any>>();
  const caseUpdateMany = jest.fn<(...args: any[]) => Promise<any>>();
  const questionUpdateMany = jest.fn<(...args: any[]) => Promise<any>>();
  const questionCreate = jest.fn<(...args: any[]) => Promise<any>>();
  const prisma = {
    coachAssessmentCase: { findFirst, create, updateMany: caseUpdateMany },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        coachAssessmentCase: { updateMany: caseUpdateMany },
        coachAssessmentQuestion: {
          updateMany: questionUpdateMany,
          create: questionCreate,
        },
      }),
    ),
  };
  const branching = { appendBranchMessage: jest.fn() };
  const queries = {
    requireOwned: jest.fn<(...args: any[]) => Promise<any>>(),
  };
  const events = { emitAsync: jest.fn(async () => []) };
  const service = new CoachAssessmentCaseService(
    prisma as never,
    branching as never,
    queries as never,
    events as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(null);
    create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'case-1',
        ...data,
        questions: [],
      }),
    );
    caseUpdateMany.mockResolvedValue({ count: 1 });
    questionUpdateMany.mockResolvedValue({ count: 1 });
    questionCreate.mockResolvedValue({});
  });

  it('persists the run and pending interaction with an assessment Question', () => {
    const stored = buildAssessmentQuestionStoredMessage({
      questionMessageId: 'message-1',
      runId: 'run-1',
      attemptId: 'attempt-1',
      visibleText: 'How do you feel?',
      legacyMessage: {
        content: [
          {
            type: 'tool_use',
            id: 'assessment-question:question-1',
            name: 'AskUserQuestion',
            input: { questions: [] },
          },
        ],
      },
      interaction: {
        interactionId: 'attempt-1:question:assessment-question:question-1',
        runId: 'run-1',
        questionMessageId: 'message-1',
        questionToolCallId: 'assessment-question:question-1',
        status: 'pending',
        revision: 1,
      },
      startedAt: new Date('2026-10-12T01:00:00.000Z'),
    });

    expect(stored).toMatchObject({
      version: 2,
      metadata: {
        schemaVersion: 2,
        runId: 'run-1',
        attemptId: 'attempt-1',
      },
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-run',
          data: expect.objectContaining({
            status: 'awaiting_input',
            pendingInteractionId:
              'attempt-1:question:assessment-question:question-1',
          }),
        }),
        expect.objectContaining({
          type: 'data-coach-interaction',
          data: expect.objectContaining({ status: 'pending' }),
        }),
      ]),
    });
  });

  it('uses a neutral fallback when the model requests input without a valid question', async () => {
    const created = await service.createForAssessment({
      userId: 'athlete',
      assessment: assessment as never,
      result: result('NEEDS_USER_INPUT') as never,
      triggerType: 'TEST',
      locale: 'zh-CN',
    });
    expect(created?.status).toBe('WAITING_FOR_USER');
    const data = (create.mock.calls[0][0] as any).data as Record<string, any>;
    expect(data.questionCount).toBe(1);
    expect(data.questions.create.evidenceKind).toBe('RECENT_SLEEP');
    expect(data.questions.create.question.question).toContain('昨晚');
  });

  it('keeps sync-dependent evidence in WAITING_FOR_DATA with a follow-up', async () => {
    const created = await service.createForAssessment({
      userId: 'athlete',
      assessment: assessment as never,
      result: result('WAITING_FOR_SYNC') as never,
      triggerType: 'TEST',
      locale: 'en',
    });
    expect(created?.status).toBe('WAITING_FOR_DATA');
    const data = (create.mock.calls[0][0] as any).data as Record<string, any>;
    expect(data.resolvedAt).toBeNull();
    expect(data.followUpAt).toBeInstanceOf(Date);
  });

  it('does not exceed the two-question budget', async () => {
    queries.requireOwned.mockResolvedValue({
      revision: 3,
      questionCount: 2,
      branchId: null,
      questions: [],
    });
    const nextRequest = {
      kind: 'FATIGUE',
      reason: 'Could change the action.',
      decisionImpact: 'May support recovery.',
      question: {
        id: 'fatigue',
        header: 'Fatigue',
        question: 'How fatigued do you feel?',
        options: [
          { value: 'low', label: 'Low', description: 'Below usual.' },
          { value: 'high', label: 'High', description: 'Above usual.' },
        ],
      },
    };
    const advanced = await service.advance({
      userId: 'athlete',
      caseId: 'case-1',
      assessment: assessment as never,
      result: result('NEEDS_USER_INPUT', [nextRequest]) as never,
      outcome: null,
      planExecutionFactHash: null,
      hasActivePlan: true,
      locale: 'en',
    });
    expect(advanced.status).toBe('RESOLVED');
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('keeps a follow-up Case waiting when a source is still syncing', async () => {
    queries.requireOwned.mockResolvedValue({
      revision: 4,
      questionCount: 1,
      branchId: null,
      questions: [{ evidenceKind: 'RECENT_SLEEP', status: 'ANSWERED' }],
    });

    const advanced = await service.advance({
      userId: 'athlete',
      caseId: 'case-1',
      assessment: assessment as never,
      result: result('WAITING_FOR_SYNC') as never,
      outcome: null,
      planExecutionFactHash: null,
      hasActivePlan: false,
      locale: 'zh-CN',
    });

    expect(advanced.status).toBe('WAITING_FOR_DATA');
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'WAITING_FOR_DATA',
          followUpAt: expect.any(Date),
          resolvedAt: null,
          currentOutcome: expect.objectContaining({
            kind: 'WAITING_FOR_DATA',
          }),
        }),
      }),
    );
  });

  it('requests a persisted plan Decision for an interactive Case', async () => {
    queries.requireOwned.mockResolvedValue({
      revision: 4,
      questionCount: 2,
      branchId: 'branch-1',
      sessionId: 'assessment:case-1',
      questions: [],
    });

    const advanced = await service.advance({
      userId: 'athlete',
      caseId: 'case-1',
      assessment: assessment as never,
      result: {
        ...result('SUFFICIENT'),
        state: 'UNDER_RECOVERED',
      } as never,
      outcome: {
        kind: 'OUTCOME',
        action: 'REDUCE_INTENSITY',
        requiresPlanDecision: true,
      } as never,
      planExecutionFactHash: 'plan-fact-1',
      hasActivePlan: true,
      locale: 'en',
    });

    expect(advanced.status).toBe('DECISION_READY');
    expect(events.emitAsync).toHaveBeenCalledWith(
      'coach.assessment-decision.requested.v1',
      expect.objectContaining({ userId: 'athlete', caseId: 'case-1' }),
    );
  });

  it('does not ask the same evidence family under a different model label', async () => {
    queries.requireOwned.mockResolvedValue({
      revision: 4,
      questionCount: 1,
      branchId: null,
      questions: [{ evidenceKind: 'WELLNESS_CHECK', status: 'ANSWERED' }],
    });
    const duplicateRequest = {
      kind: 'RECENT_SYMPTOMS',
      reason: 'Rule out illness.',
      decisionImpact: 'May change the recommendation.',
      question: {
        id: 'recent_illness',
        header: 'Symptoms',
        question: 'Any illness symptoms?',
        options: [
          { value: 'none', label: 'None', description: 'No symptoms.' },
          { value: 'mild', label: 'Mild', description: 'Mild symptoms.' },
        ],
      },
    };

    const advanced = await service.advance({
      userId: 'athlete',
      caseId: 'case-1',
      assessment: assessment as never,
      result: result('NEEDS_USER_INPUT', [duplicateRequest]) as never,
      outcome: null,
      planExecutionFactHash: null,
      hasActivePlan: false,
      locale: 'en',
    });

    expect(advanced.status).toBe('RESOLVED');
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('uses the next distinct evidence request when the first one repeats', async () => {
    queries.requireOwned.mockResolvedValue({
      revision: 5,
      questionCount: 1,
      branchId: null,
      questions: [{ evidenceKind: 'WELLNESS_CHECK', status: 'ANSWERED' }],
    });
    const duplicateRequest = {
      kind: 'RECENT_SYMPTOMS',
      reason: 'Rule out illness.',
      decisionImpact: 'May change the recommendation.',
      question: {
        id: 'recent_illness',
        header: 'Symptoms',
        question: 'Any illness symptoms?',
        options: [],
      },
    };
    const distinctRequest = {
      kind: 'RECENT_SLEEP',
      reason: 'Sleep would reduce uncertainty.',
      decisionImpact: 'May support recovery.',
      question: {
        id: 'recent_sleep',
        header: 'Sleep',
        question: 'How did you sleep?',
        options: [],
      },
    };

    const advanced = await service.advance({
      userId: 'athlete',
      caseId: 'case-1',
      assessment: assessment as never,
      result: result('NEEDS_USER_INPUT', [
        duplicateRequest,
        distinctRequest,
      ]) as never,
      outcome: null,
      planExecutionFactHash: null,
      hasActivePlan: false,
      locale: 'en',
    });

    expect(advanced.status).toBe('WAITING_FOR_USER');
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evidenceKind: 'RECENT_SLEEP' }),
      }),
    );
  });

  it('rejects late or duplicate answers before changing the Case', async () => {
    questionUpdateMany.mockResolvedValue({ count: 0 });
    const persisted = await service.persistAnswer({
      userId: 'athlete',
      caseId: 'case-1',
      questionId: 'question-1',
      answerMessageId: 'message-1',
      answer: { answers: { fatigue: 'high' } },
    });
    expect(persisted).toEqual({ accepted: false });
    expect(caseUpdateMany).not.toHaveBeenCalled();
    expect(questionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: expect.any(Object),
          case: expect.objectContaining({
            userId: 'athlete',
            expiresAt: expect.any(Object),
          }),
        }),
      }),
    );
  });

  it('rolls back the answer when the Case changed concurrently', async () => {
    caseUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.persistAnswer({
        userId: 'athlete',
        caseId: 'case-1',
        questionId: 'question-1',
        answerMessageId: 'message-1',
        answer: { answers: { fatigue: 'high' } },
      }),
    ).rejects.toThrow('Assessment case changed');
  });

  it('schedules a retry when reassessment fails after an answer', async () => {
    await service.deferReassessment('athlete', 'case-1');
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'case-1',
          userId: 'athlete',
          status: 'ASSESSING',
        }),
        data: expect.objectContaining({
          status: 'WAITING_FOR_DATA',
          followUpAt: expect.any(Date),
        }),
      }),
    );
  });

  it('supersedes a stale Case and requests reassessment after rebase is required', async () => {
    await service.decisionChanged('athlete', 'decision-1', 'REBASE_REQUIRED');
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'athlete', decisionId: 'decision-1' },
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
    );
    expect(events.emitAsync).toHaveBeenCalled();
  });

  it('cools down the same evidence after the athlete rejects a Decision', async () => {
    await service.decisionChanged('athlete', 'decision-1', 'REJECTED');
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED',
          cooldownUntil: expect.any(Date),
          followUpAt: null,
        }),
      }),
    );
  });

  it('expires the old Question and Case before treating a late reply as fresh evidence', async () => {
    await service.expireLateQuestion('athlete', 'case-1', 'question-1');
    expect(questionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'question-1',
        caseId: 'case-1',
        status: 'PENDING',
      },
      data: { status: 'EXPIRED' },
    });
    expect(caseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });
});
