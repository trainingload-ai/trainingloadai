import { CoachActionRiskTier, CoachActionType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { validateAiToolInput, type AiToolContext } from '../tool.types';
import { userFitnessMetricMutationTool } from '../tools/mutationUserFitnessMetric.tool';

function context() {
  const tx = {};
  const userService = {
    getPreferredTimezone: jest.fn(async () => 'America/Los_Angeles'),
    listRecordedFitnessMetricSports: jest.fn(async () => []),
    replaceManualFitnessMetricsForDialog: jest.fn(async () => ({
      afterCommit: async () => undefined,
    })),
  };
  const activities = {
    countReadyActivitiesBySportSince: jest.fn(async () => []),
  };
  const coachActions = {
    run: jest.fn(async (input: any) => {
      const result = await input.exec(tx);
      return {
        actionId: 'action-ftp',
        type: input.type,
        riskTier: input.riskTier,
        summary: result.summary,
        undoUntil: null,
        payloadForUi: result.payloadForUi,
        createdAt: new Date('2026-10-13T04:00:00.000Z'),
      };
    }),
  };
  const ctx = {
    session: { user: { id: 'athlete-1' } },
    userService,
    activities,
    coachActions,
    currentTurnStartedAt: new Date('2026-10-13T04:00:00.000Z'),
    currentUserPrompt: '请更新我的骑行 FTP。',
    currentToolCallId: 'tool-call-ftp',
    sid: 'session-1',
    lang: 'zh',
    i18n: { t: jest.fn((key: string) => key) },
    signal: new AbortController().signal,
  } as unknown as AiToolContext;
  return { ctx, tx, userService, activities, coachActions };
}

describe('mutation_user_fitness_metric', () => {
  it('requires an explicit sport for FTP instead of guessing from context', async () => {
    await expect(
      validateAiToolInput(userFitnessMetricMutationTool, context().ctx, {
        metricType: 'FTP',
        value: 280,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MISSING_SPORT_TYPE',
    });
  });

  it('rejects a model-inferred sport when server evidence is ambiguous', async () => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = '请把我的 FTP 更新为 295 W。';
    fixture.activities.countReadyActivitiesBySportSince.mockResolvedValue([
      { sportType: 'CYCLING', count: 6 },
      { sportType: 'RUN', count: 5 },
    ]);
    await expect(
      validateAiToolInput(userFitnessMetricMutationTool, fixture.ctx, {
        metricType: 'FTP',
        value: 295,
        sportType: 'CYCLING',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MISSING_SPORT_EVIDENCE',
    });
  });

  it('uses the only recorded metric sport when the user omits sport', async () => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = '请把我的 FTP 更新为 295 W。';
    fixture.userService.listRecordedFitnessMetricSports.mockResolvedValue([
      'CYCLING',
    ]);

    await expect(
      validateAiToolInput(userFitnessMetricMutationTool, fixture.ctx, {
        metricType: 'FTP',
        value: 295,
        sportType: 'CYCLING',
      }),
    ).resolves.toEqual({ ok: true });
    expect(
      fixture.activities.countReadyActivitiesBySportSince,
    ).not.toHaveBeenCalled();
  });

  it('uses a strongly dominant recent sport when no unique metric track exists', async () => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = '请把我的 FTP 更新为 295 W。';
    fixture.activities.countReadyActivitiesBySportSince.mockResolvedValue([
      { sportType: 'CYCLING', count: 12 },
      { sportType: 'RUN', count: 2 },
      { sportType: 'SWIM', count: 1 },
    ]);

    await expect(
      validateAiToolInput(userFitnessMetricMutationTool, fixture.ctx, {
        metricType: 'FTP',
        value: 295,
        sportType: 'CYCLING',
      }),
    ).resolves.toEqual({ ok: true });
    expect(
      fixture.activities.countReadyActivitiesBySportSince,
    ).toHaveBeenCalledWith('athlete-1', new Date('2026-07-15T04:00:00.000Z'), [
      'RUN',
      'CYCLING',
      'SWIM',
    ]);
  });

  it.each([
    {
      name: '样本少于 5 次',
      counts: [{ sportType: 'CYCLING', count: 4 }],
    },
    {
      name: '主项占比不足 80%',
      counts: [
        { sportType: 'CYCLING', count: 8 },
        { sportType: 'RUN', count: 3 },
      ],
    },
  ])('asks instead of inferring when $name', async ({ counts }) => {
    const fixture = context();
    fixture.ctx.currentUserPrompt = '请把我的 FTP 更新为 295 W。';
    fixture.activities.countReadyActivitiesBySportSince.mockResolvedValue(
      counts,
    );

    await expect(
      validateAiToolInput(userFitnessMetricMutationTool, fixture.ctx, {
        metricType: 'FTP',
        value: 295,
        sportType: 'CYCLING',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MISSING_SPORT_EVIDENCE',
    });
  });

  it.each(['2026-02-30', '2026-10-13'])(
    'rejects invalid or future athlete-local effective date %s',
    async (effectiveDate) => {
      await expect(
        validateAiToolInput(userFitnessMetricMutationTool, context().ctx, {
          metricType: 'FTP',
          value: 280,
          sportType: 'CYCLING',
          effectiveDate,
        }),
      ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    },
  );

  it('uses athlete-local today and preserves prior manual history', async () => {
    const fixture = context();
    await expect(
      userFitnessMetricMutationTool.execute(fixture.ctx, {
        metricType: 'FTP',
        value: 280,
        sportType: 'CYCLING',
      }),
    ).resolves.toMatchObject({
      kind: 'mutation_applied',
      actionId: 'action-ftp',
      type: CoachActionType.USER_THRESHOLD_UPDATE,
      riskTier: CoachActionRiskTier.HIGH,
      payload: {
        metricType: 'FTP',
        sportType: 'CYCLING',
        value: 280,
        effectiveDate: '2026-10-12',
      },
    });
    expect(
      fixture.userService.replaceManualFitnessMetricsForDialog,
    ).toHaveBeenCalledWith({
      userId: 'athlete-1',
      type: 'FTP',
      sportType: 'CYCLING',
      metrics: [
        {
          effectiveDate: '2026-10-12',
          value: '280',
        },
      ],
      preserveOtherDates: true,
      tx: fixture.tx,
    });
  });
});
