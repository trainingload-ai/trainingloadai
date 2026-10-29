import { describe, expect, it, jest } from '@jest/globals';
import { AiPlanExecutionAdviceService } from '../ai-plan-execution-advice.service';
import {
  shouldUseDeterministicPlanAdvice,
  validatePlanExecutionAdviceGrounding,
} from '../plan-execution-advice-grounding';
import { createAiFallbackI18n } from './ai-fallback-i18n.test-util';

const noCompetitionTuesday = {
  hasActivePlan: false,
  currentPlanWeekIndex: null,
  hasActiveCompetitionInfluence: false,
  completedWorkoutCount: 0,
  recordedActivityCount: 0,
  recentActivityDayPeriod: null,
  currentWeekElapsedDays: 2,
  currentWeekComparison: 'WEEK_TO_DATE_VS_FULL_PREVIOUS_WEEK' as const,
};

describe('plan execution advice grounding', () => {
  it('returns the supplied server fallback without cache, usage, or upstream AI when consent is off', async () => {
    const aiService = { generateTrainingAdviceSnippet: jest.fn() };
    const aiUsage = { getUsageSummary: jest.fn(), recordUsageEvent: jest.fn() };
    const prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
    const planExecutionContext = {
      buildContext: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ factHash: 'fact-1' }),
    };
    const service = new AiPlanExecutionAdviceService(
      aiService as never,
      aiUsage as never,
      prisma as never,
      planExecutionContext as never,
      createAiFallbackI18n(),
      {
        evaluate: jest.fn(async () => ({
          schemaVersion: 1,
          features: {
            'ai.planAdvice': { allowed: true, reason: 'GRANTED' },
          },
        })),
      } as never,
    );

    const result = await service.generatePlanExecutionAdvice({
      userId: 'user-without-consent',
      locale: 'zh',
      allowAi: false,
      body: {
        fallbackSummary: '当前计划按今日安排执行，完成后及时记录训练。',
        fallbackTags: ['进行中'],
      },
    });

    expect(result).toEqual({
      summary: '当前计划按今日安排执行，完成后及时记录训练。',
      tags: ['进行中'],
      source: 'fallback',
      shouldRefresh: false,
      generatedAt: null,
      factHash: 'fact-1',
    });
    expect(aiUsage.getUsageSummary).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(aiService.generateTrainingAdviceSnippet).not.toHaveBeenCalled();
  });

  it('uses deterministic copy for the plan sidebar without an active plan', () => {
    expect(
      shouldUseDeterministicPlanAdvice('PLAN_SIDEBAR', noCompetitionTuesday),
    ).toBe(true);
  });

  it('rejects a competition phase claim without an active event influence', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '当前处于比赛期，今天建议轻松训练。',
        tags: ['比赛期'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'UNSUPPORTED_COMPETITION_PHASE' });
  });

  it('rejects a numbered plan week that conflicts with the authoritative current week', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '本周负荷较低，但处于基础期第1周，循序渐进即可。',
        tags: ['基础期'],
        grounding: {
          ...noCompetitionTuesday,
          hasActivePlan: true,
          currentPlanWeekIndex: 2,
        },
      }),
    ).toEqual({ valid: false, reason: 'CURRENT_PLAN_WEEK_CONFLICT' });
  });

  it('accepts the authoritative current plan week in Arabic or Chinese wording', () => {
    const grounding = {
      ...noCompetitionTuesday,
      hasActivePlan: true,
      currentPlanWeekIndex: 2,
    };
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '当前是第 2/8 周，今天按计划完成稳态跑。',
        tags: ['第二周'],
        grounding,
      }),
    ).toEqual({ valid: true, reason: null });
  });

  it('rejects an invented numbered week when there is no active plan', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: 'You are in week 1, so keep the run easy.',
        tags: [],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'CURRENT_PLAN_WEEK_CONFLICT' });
  });

  it('rejects a load-drop claim while the current week is incomplete', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '本周训练负荷骤降至 0，上周为 153。',
        tags: ['负荷管理'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'INCOMPLETE_WEEK_DROP_CLAIM' });
  });

  it('rejects comparing an incomplete current week as lower than the previous full week', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '本周负荷仅24，较上周140明显偏低。',
        tags: ['低负荷'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'INCOMPLETE_WEEK_DROP_CLAIM' });
  });

  it('allows week-to-date wording without an unsupported phase claim', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary:
          '本周截至目前记录负荷为 0；如近期有训练，请检查活动是否已上传。',
        tags: ['数据同步'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: true, reason: null });
  });

  it('allows an event phase claim when an active influence supports it', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '当前处于比赛阶段，请优先遵守赛事日约束。',
        tags: ['比赛期'],
        grounding: {
          ...noCompetitionTuesday,
          hasActiveCompetitionInfluence: true,
        },
      }),
    ).toEqual({ valid: true, reason: null });
  });

  it('rejects a completed-workout claim when no workout status is DONE', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '今早跑已完成，接下来优先恢复。',
        tags: ['恢复'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'UNSUPPORTED_WORKOUT_COMPLETION' });
  });

  it('allows a completed activity claim when an activity is recorded today', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '今天下午轻松跑已完成，接下来优先恢复。',
        tags: ['恢复'],
        grounding: {
          ...noCompetitionTuesday,
          recordedActivityCount: 1,
          recentActivityDayPeriod: 'afternoon',
        },
      }),
    ).toEqual({ valid: true, reason: null });
  });

  it('accepts a measured activity claim when an activity is recorded today', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '今天下午已轻松跑30分钟，接下来优先恢复。',
        tags: ['恢复'],
        grounding: {
          ...noCompetitionTuesday,
          recordedActivityCount: 1,
          recentActivityDayPeriod: 'afternoon',
        },
      }),
    ).toEqual({ valid: true, reason: null });
  });

  it('rejects a measured activity claim when no activity is recorded', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '今天下午已轻松跑30分钟，接下来优先恢复。',
        tags: ['恢复'],
        grounding: noCompetitionTuesday,
      }),
    ).toEqual({ valid: false, reason: 'UNSUPPORTED_WORKOUT_COMPLETION' });
  });

  it('still rejects a planned-workout completion claim when only an activity is recorded', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '今天的计划课次已完成，接下来优先恢复。',
        tags: ['恢复'],
        grounding: {
          ...noCompetitionTuesday,
          recordedActivityCount: 1,
        },
      }),
    ).toEqual({ valid: false, reason: 'UNSUPPORTED_WORKOUT_COMPLETION' });
  });

  it('rejects morning wording for an afternoon activity', () => {
    expect(
      validatePlanExecutionAdviceGrounding({
        summary: '晨跑活动已经上传，今天注意恢复。',
        tags: ['活动记录'],
        grounding: {
          ...noCompetitionTuesday,
          completedWorkoutCount: 1,
          recentActivityDayPeriod: 'afternoon',
        },
      }),
    ).toEqual({ valid: false, reason: 'ACTIVITY_DAY_PERIOD_CONFLICT' });
  });
});
