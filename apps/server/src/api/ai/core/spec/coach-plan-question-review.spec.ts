import { describe, expect, it, jest } from '@jest/globals';
import type { AskUserQuestionItem } from '@shared/ai-coach-schema';
import {
  changedPlanQuestionEvidence,
  reviewPlanQuestionsBeforeDelivery,
  type PlanQuestionReview,
} from '../coach-plan-question-review';
import type { CoachQueryYield } from '../coach-query-yield';
import type { AiToolContext } from '../tool.types';
import { askUserQuestionTool } from '../tools/askUserQuestion.tool';
import { planSuitabilityAssessTool } from '../tools/planSuitabilityAssess.tool';
import { presentCoachPlanDraftTool } from '../tools/presentCoachPlanDraft.tool';

const options = [
  { value: 'one', label: 'Option one', description: 'First option' },
  { value: 'two', label: 'Option two', description: 'Second option' },
];
const baseline = {
  id: 'baseline',
  header: 'Running baseline',
  question: 'How much have you been running recently?',
  options,
};
const days = {
  id: 'days',
  header: 'Preferred days',
  question: 'Which days would you like to run?',
  options,
};
const success = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
} as const;

function context(): AiToolContext {
  return {
    activeSkillName: 'plan-builder',
    planSuitability: {},
    rollingPlanDraft: true,
    planQuestionReview: { questions: [baseline, days] },
  } as AiToolContext;
}

const assessment = {
  goalSummary: 'Run consistently',
  constraints: {
    intent: 'FITNESS_BUILD' as const,
    periodWeeks: 1,
    maxTrainingDaysPerWeek: 3,
    maxDailyMinutes: 40,
    requiredSports: ['RUN' as const],
    strengthPreference: 'AUTO' as const,
  },
  evidence: [
    {
      source: 'TRAINING_BASELINE' as const,
      summary: 'Three runs per week over the last month',
    },
  ],
};
const answered = {
  id: baseline.id,
  outcome: 'ANSWERED' as const,
  reason: 'Recent synced runs establish the current baseline.',
};
const kept = {
  id: days.id,
  outcome: 'KEEP' as const,
  reason: 'Recent workouts do not establish a preferred future schedule.',
};

function questionEvent(questions: AskUserQuestionItem[]): CoachQueryYield {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'question',
          name: 'AskUserQuestion',
          input: { questions, metadata: { skill: 'plan-builder' } },
        },
      ],
    },
  };
}
async function* events(...items: CoachQueryYield[]) {
  yield* items;
}
async function collect(stream: AsyncIterable<CoachQueryYield>) {
  const result: CoachQueryYield[] = [];
  for await (const event of stream) result.push(event);
  return result;
}

describe('plan question review', () => {
  it('reassesses the original set and delivers only the still-needed preference with its original wording and options', async () => {
    const ctx = context();
    const review = {
      ...assessment,
      status: 'NEEDS_INPUT' as const,
      missingFacts: [{ key: days.id, reason: kept.reason }],
      questionReview: [answered, kept],
    };
    expect(
      await planSuitabilityAssessTool.validateInput!(ctx, {
        ...review,
        questionReview: [answered],
      }),
    ).toMatchObject({ ok: false, code: 'PLAN_QUESTION_REVIEW_REQUIRED' });
    expect(await planSuitabilityAssessTool.validateInput!(ctx, review)).toEqual(
      { ok: true },
    );
    await planSuitabilityAssessTool.execute(ctx, review);
    const generated = {
      questions: [
        {
          ...days,
          question: 'Changed wording',
          options: [...options].reverse(),
        },
      ],
    };
    expect(await askUserQuestionTool.validateInput!(ctx, generated)).toEqual({
      ok: true,
    });
    const delivered = await askUserQuestionTool.execute(ctx, generated);

    const stale = questionEvent([baseline, days]);
    const firstUsage = {
      type: 'model_usage',
      usage: {},
      model: 'first',
      status: 'SUCCESS',
    } as const;
    const updated = questionEvent(delivered.questions);
    const refresh = jest.fn(async () => ({
      stream: events(updated, success),
      review: ctx.planQuestionReview!,
    }));
    await expect(
      collect(
        reviewPlanQuestionsBeforeDelivery({
          stream: events(stale, firstUsage, success),
          canReview: () => true,
          refresh,
        }),
      ),
    ).resolves.toEqual([firstUsage, updated, success]);
    expect(delivered.questions).toEqual([days]);
    expect(refresh).toHaveBeenCalledWith([baseline, days]);
  });

  it('can replace a question only under its original identifier, and excludes questions resolved by facts', async () => {
    const ctx = context();
    const review = ctx.planQuestionReview as PlanQuestionReview;
    review.decisions = [
      answered,
      {
        id: days.id,
        outcome: 'REPLACE',
        reason: 'The athlete is unavailable on Sundays.',
      },
    ];
    expect(
      await askUserQuestionTool.validateInput!(ctx, {
        questions: [baseline, days],
      }),
    ).toMatchObject({ ok: false, code: 'PLAN_QUESTION_REVIEW_REQUIRED' });
    const revised = { ...days, question: 'Which weekdays are available now?' };
    expect(
      await askUserQuestionTool.validateInput!(ctx, { questions: [revised] }),
    ).toEqual({ ok: true });
    expect(
      (await askUserQuestionTool.execute(ctx, { questions: [revised] }))
        .questions,
    ).toEqual([revised]);
  });

  it('continues the original generation without a new card when the latest facts answer all questions', async () => {
    const ctx = context();
    const ready = {
      ...assessment,
      status: 'READY' as const,
      blueprint: {
        designSummary: 'Build consistency',
        sports: ['RUN' as const],
        weeklyTrainingDays: { min: 2, max: 3 },
        longestPlannedSessionMinutes: 35,
        phases: [
          {
            name: 'Base',
            startWeek: 1,
            endWeek: 1,
            purpose: 'Aerobic training',
          },
        ],
      },
      questionReview: [answered, kept],
    };
    expect(
      await planSuitabilityAssessTool.validateInput!(ctx, ready),
    ).toMatchObject({ ok: false, code: 'PLAN_QUESTION_REVIEW_REQUIRED' });
    expect(
      await presentCoachPlanDraftTool.validateInput!(ctx, {} as never),
    ).toMatchObject({ ok: false, code: 'PLAN_QUESTION_REVIEW_REQUIRED' });
    const resolved = {
      ...ready,
      questionReview: [
        answered,
        {
          ...kept,
          outcome: 'ANSWERED' as const,
          reason:
            'The athlete explicitly confirmed Mondays and Thursdays for this plan.',
        },
      ],
    };
    expect(
      await planSuitabilityAssessTool.validateInput!(ctx, resolved),
    ).toEqual({ ok: true });
    await planSuitabilityAssessTool.execute(ctx, resolved);
    expect(ctx.planSuitability?.latest?.status).toBe('READY');

    const draft: CoachQueryYield = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'draft',
            name: 'PresentCoachPlanDraft',
            input: {},
          },
        ],
      },
    };
    await expect(
      collect(
        reviewPlanQuestionsBeforeDelivery({
          stream: events(questionEvent([baseline, days]), success),
          canReview: () => true,
          refresh: async () => ({
            stream: events(draft, success),
            review: ctx.planQuestionReview!,
          }),
        }),
      ),
    ).resolves.toEqual([draft, success]);
  });

  it('publishes the original question when facts are stable or the turn already made a write', async () => {
    const original = questionEvent([days]);
    const refresh = jest.fn(async () => null);
    await expect(
      collect(
        reviewPlanQuestionsBeforeDelivery({
          stream: events(original, success),
          canReview: () => true,
          refresh,
        }),
      ),
    ).resolves.toEqual([original, success]);
    expect(refresh).toHaveBeenCalledTimes(1);
    await expect(
      collect(
        reviewPlanQuestionsBeforeDelivery({
          stream: events(original, success),
          canReview: () => false,
          refresh,
        }),
      ),
    ).resolves.toEqual([original, success]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('preserves the original card when the model never completes the review contract', async () => {
    const original = questionEvent([days]);
    const incomplete = {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Invalid model response',
    } as const;
    await expect(
      collect(
        reviewPlanQuestionsBeforeDelivery({
          stream: events(original, success),
          canReview: () => true,
          refresh: async () => ({
            stream: events(incomplete),
            review: { questions: [days] },
          }),
        }),
      ),
    ).resolves.toEqual([original, success]);
  });

  it('tracks new evidence independently of memory extraction status and time-varying scores', () => {
    const original = {
      date: '2026-11-20',
      timezone: 'UTC',
      status: 'AVAILABLE',
      revision: 'first',
      training: { activityRevision: 'recent-runs' },
      health: null,
      memory: { semanticRevision: 'memory-v1', items: [{ directImpact: 0.8 }] },
      limitations: ['USER_REPORT_EXTRACTION_PENDING_OR_FAILED'],
    } as unknown as Parameters<typeof changedPlanQuestionEvidence>[0];
    expect(
      changedPlanQuestionEvidence(original, {
        ...original,
        revision: 'second',
        limitations: [],
      }),
    ).toEqual([]);
    expect(
      changedPlanQuestionEvidence(original, {
        ...original,
        training: { activityRevision: 'new-running-activity' },
      } as typeof original),
    ).toEqual(['training']);
  });
});
