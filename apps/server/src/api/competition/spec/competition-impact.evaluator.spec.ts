import { describe, expect, it, jest } from '@jest/globals';
import { CompetitionImpactEvaluator } from '../competition-impact.evaluator';

const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  buildThinkingRequestExtras: () => ({}),
  createCoachClient: () => ({ chat: { completions: { create } } }),
  getCoachModel: () => 'test-model',
  getCoachUpstreamProvider: () => 'test-provider',
  isCoachUpstreamConfigured: () => true,
}));

const input = {
  schemaVersion: 1,
  locale: 'en',
  anchorDate: '2026-07-16',
  scope: {
    type: 'PLAN_EXECUTION',
    startDate: '2026-07-01',
    endDate: '2026-08-20',
  },
  candidateSelection: {
    startDate: '2026-04-08',
    endDate: '2027-08-19',
    truncated: false,
    totalBeforeLimit: 0,
  },
  events: [],
  athlete: {
    personalizationReadiness: 'none',
    averageWeek: {
      activityCount: 0,
      activeDays: 0,
      totalDurationMin: 0,
      totalDistanceKm: 0,
      totalLoad: 0,
    },
    longestSession: null,
    recentLoad: { ctl: null, atl: null, tsb: null, dailyLoadLast7d: [] },
    dataFreshness: { latestActivityAt: null, latestPmcDate: null },
  },
} as const;

const validResult = {
  schemaVersion: 1,
  assessmentDate: '2026-07-16',
  eventAssessments: [],
  combinedImpact: {
    overallLevel: 'LOW',
    conflicts: [],
    strategySummary: 'No events.',
  },
} as const;

describe('CompetitionImpactEvaluator repair boundary', () => {
  it('makes one repair request after a validation failure', async () => {
    create.mockReset();
    create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(validResult) } }],
      });
    const validate = jest
      .fn<(value: unknown, inputValue: unknown) => unknown>()
      .mockImplementationOnce(() => {
        throw new Error('missing assessments');
      })
      .mockReturnValueOnce(validResult);
    const recordUsageEvent = jest.fn(async () => undefined);
    const evaluator = new CompetitionImpactEvaluator(
      { validate } as never,
      { recordUsageEvent } as never,
    );

    await expect(
      evaluator.evaluate(input as never, {
        userId: 'user-1',
        operationId: 'operation-1',
        kind: 'PLAN_GENERATION',
      }),
    ).resolves.toEqual(validResult);
    expect(create).toHaveBeenCalledTimes(2);
    const firstCall = create.mock.calls[0]?.[0] as {
      messages: Array<{ content?: string }>;
    };
    const secondCall = create.mock.calls[1]?.[0] as {
      messages: Array<{ content?: string }>;
    };
    expect(firstCall.messages[1]?.content).toContain(
      'Required output locale: en',
    );
    expect(firstCall.messages[0]?.content).toContain(
      'inside Trainingload.ai AI Coach',
    );
    expect(firstCall.messages[0]?.content).toContain(
      'Every athlete-facing text field',
    );
    expect(secondCall.messages.at(-1)?.content).toContain('Repair the JSON');
    expect(recordUsageEvent.mock.calls).toEqual([
      [
        expect.objectContaining({
          userId: 'user-1',
          operationId: 'operation-1',
          kind: 'PLAN_GENERATION',
          status: 'FAILED',
        }),
      ],
      [
        expect.objectContaining({
          userId: 'user-1',
          operationId: 'operation-1',
          kind: 'PLAN_GENERATION',
          status: 'SUCCESS',
        }),
      ],
    ]);
  });

  it('stops after one repair and returns a stable internal error', async () => {
    create.mockReset();
    create
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });
    const validate = jest.fn<() => unknown>(() => {
      throw new Error('still invalid');
    });
    const evaluator = new CompetitionImpactEvaluator({ validate } as never);

    await expect(evaluator.evaluate(input as never)).rejects.toThrow(
      'COMPETITION_IMPACT_INVALID_OUTPUT',
    );
    expect(create).toHaveBeenCalledTimes(2);
  });
});
