import { describe, expect, it, jest } from '@jest/globals';
import type { AiToolContext } from '../../tool.types';
import { presentTrainingVisualizationTool } from '../presentTrainingVisualization.tool';
import { trainingAnalysisQueryProperties } from '../trainingAggregate.tool';
import { isTrainingVisualizationV2 } from '@shared/training-exploration';
import { buildActivityChartSeries } from '@/api/activity/activity-chart-series';
import { CoachToolsService } from '../../coach-tools.service';

jest.mock('@/api/activity/activity.service', () => ({
  ActivityService: class {},
}));
jest.mock('@/api/pace/pace.service', () => ({ PaceService: class {} }));

describe('present_training_visualization', () => {
  it('routes metric charts through the authenticated history query without reading PMC', async () => {
    const findMany = jest.fn(async () => [
      { id: 'latest', recordedAt: new Date('2026-09-26T00:00:00Z'), value: 45 },
      {
        id: 'earlier',
        recordedAt: new Date('2026-09-01T00:00:00Z'),
        value: 43,
      },
    ]);
    const listRange = jest.fn();
    const coachTools = new CoachToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const ctx = {
      session: { user: { id: 'signed-in-athlete' } },
      userService: {
        getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai'),
      },
      users: { fitnessMetrics: () => ({ findMany }) },
      pmc: { listRange },
      coachTools,
      i18n: { t: (key: string) => key },
    } as unknown as AiToolContext;
    const input = {
      source: 'METRICS' as const,
      measures: ['VO2_MAX' as const],
      from: '2026-08-28',
      to: '2026-09-26',
      groupBy: 'DAY' as const,
      sportTypes: ['RUN'],
      title: '最大摄氧量',
      intent: 'TREND' as const,
    };
    const card = await presentTrainingVisualizationTool.execute(ctx, input);
    expect(card).toMatchObject({
      view: 'LINE',
      series: [{ key: 'VO2_MAX', unit: 'ml/kg/min' }],
      provenance: {
        source: 'METRICS',
        metricSource: 'ESTIMATED',
        sportTypes: [],
      },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'signed-in-athlete',
          sport: 'UNKNOWN',
          source: 'ESTIMATED',
        }),
      }),
    );
    expect(listRange).not.toHaveBeenCalled();
    await expect(
      presentTrainingVisualizationTool.execute(
        { ...ctx, session: null },
        input,
      ),
    ).rejects.toThrow();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(trainingAnalysisQueryProperties.source.enum).toContain('METRICS');
    expect(trainingAnalysisQueryProperties.measures.items.enum).toContain(
      'HEIGHT',
    );
  });

  it('uses authenticated activity evidence for multi-axis cards and ignores injected points', async () => {
    const q = {
      source: 'ACTIVITY_SERIES' as const,
      activityHashIds: ['actual-id'],
      measures: ['HEART_RATE' as const, 'PACE' as const, 'ELEVATION' as const],
      axisLayout: 'OVERLAY' as const,
      intent: 'COMPARISON' as const,
    };
    const start = new Date('2026-09-26T00:00:00Z');
    const evidence = buildActivityChartSeries(
      Array.from({ length: 20 }, (_, i) => ({
        time: new Date(+start + i * 1000).toISOString(),
        heartRate: 140,
        speed: 3,
        altitude: 50,
      })),
      {
        hashId: 'actual-id',
        activityName: 'Run',
        sportType: 'RUN',
        startTime: start,
        elapsedTime: 19,
      },
      q,
    );
    const chart = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ ...evidence, sportType: 'RUN', truncated: false });
    const ctx = {
      session: { user: { id: 'signed-in-athlete' } },
      lang: 'zh',
      userService: { getPreferredTimezone: async () => 'Asia/Shanghai' },
      activitySeries: { chart },
    } as unknown as AiToolContext;
    const output = await presentTrainingVisualizationTool.execute(ctx, {
      ...q,
      series: [{ points: [{ x: 1, y: 999 }] }],
    } as never);
    expect(chart).toHaveBeenCalledWith(
      'signed-in-athlete',
      'actual-id',
      expect.objectContaining({ axisLayout: 'OVERLAY' }),
      'Asia/Shanghai',
    );
    expect(isTrainingVisualizationV2(output)).toBe(true);
    if (output.schemaVersion !== 2)
      throw new Error('Expected numeric-axis chart');
    expect(output.panels[0].extraY).toHaveLength(2);
    expect(output.panels[0].series[0].points.every((p) => p.y === 140)).toBe(
      true,
    );
    expect(output.notes).toContain('MULTI_AXES');
  });

  it('accepts semantic query fields but no model-supplied chart rows', () => {
    expect(
      presentTrainingVisualizationTool.parameters.properties,
    ).not.toHaveProperty('rows');
    expect(
      presentTrainingVisualizationTool.parameters.properties,
    ).not.toHaveProperty('series');
    expect(
      presentTrainingVisualizationTool.parameters.properties,
    ).toHaveProperty('measures');
  });

  it('renders only the dataset returned by the server query', async () => {
    const trainingAggregate = jest.fn(async () => ({
      kind: 'training_dataset' as const,
      schemaVersion: 1 as const,
      query: {
        source: 'ACTIVITIES' as const,
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: 'WEEK' as const,
        measures: ['ACTIVITY_COUNT' as const],
      },
      timezone: 'Asia/Shanghai',
      rows: [
        {
          key: '2026-09-07',
          label: '2026-09-07',
          values: { ACTIVITY_COUNT: 4 },
        },
        {
          key: '2026-09-14',
          label: '2026-09-14',
          values: { ACTIVITY_COUNT: 5 },
        },
      ],
      summary: { ACTIVITY_COUNT: 9, matchedActivityCount: 9 },
      coverage: { ACTIVITY_COUNT: 1 },
      complete: true,
      truncated: false,
      fingerprint: 'server-owned',
    }));
    const ctx = {
      lang: 'zh',
      coachTools: { trainingAggregate },
    } as unknown as AiToolContext;

    const result = await presentTrainingVisualizationTool.execute(ctx, {
      source: 'ACTIVITIES',
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: 'WEEK',
      measures: ['ACTIVITY_COUNT'],
      intent: 'TREND',
      preferredView: 'LINE',
      title: '每周运动次数',
      rows: [{ label: '伪造', ACTIVITY_COUNT: 999 }],
    } as never);

    expect(trainingAggregate).toHaveBeenCalledTimes(1);
    if (result.schemaVersion !== 1) throw new Error('Expected V1 statistics');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].values.ACTIVITY_COUNT).toBe(4);
    expect(result.provenance.fingerprint).toBe('server-owned');
    expect(result.title).toBe('每周运动次数');
  });
});
