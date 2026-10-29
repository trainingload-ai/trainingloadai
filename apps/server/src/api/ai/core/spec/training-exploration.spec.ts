import { describe, expect, it, jest } from '@jest/globals';
import { queryTrainingExploration } from '../training-exploration';
import { assertExplorationQuery } from '../training-exploration-validation';
import { buildZoneDistribution } from '../training-zone-distribution';
import {
  buildPlanExecutionPanels,
  plannedStepTotal,
} from '@/api/plan/application/plan-execution-chart';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import {
  combineExplorationAxes,
  separateExplorationAxes,
  explorationDomain,
  explorationGeometry,
  formatExplorationValue,
} from '@shared/training-chart-model';
import type {
  ExplorationPanel,
  ExplorationQuery,
} from '@shared/training-exploration';
import type { AiToolContext } from '../tool.types';

const range = { from: '2026-09-01', to: '2026-09-26' };
describe('Training exploration', () => {
  it('keeps independent heart-rate and pace scales on a shared X axis and can split them back', () => {
    const left: ExplorationPanel = {
      id: 'hr',
      view: 'LINE',
      x: { kind: 'ELAPSED_TIME' },
      y: { kind: 'NUMBER', measure: 'HEART_RATE', unit: 'bpm' },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 140 },
            { x: 20, y: 160 },
          ],
        },
      ],
    };
    const right: ExplorationPanel = {
      ...left,
      id: 'pace',
      y: { kind: 'NUMBER', measure: 'PACE', unit: 's/km', reverse: true },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 420 },
            { x: 20, y: 300 },
          ],
        },
      ],
    };
    const combined = combineExplorationAxes([left, right]);
    const g = explorationGeometry(combined[0], 400);
    expect(g.yd[1]).toBeLessThan(200);
    expect(g.axes[1].ticks.every((v) => v >= 250)).toBe(true);
    expect(g.series[0].points[1].px).toBe(g.series[1].points[1].px);
    expect(g.series[1].points[1].py!).toBeLessThan(g.series[1].points[0].py!);
    expect(separateExplorationAxes(combined).map((p) => p.y.unit)).toEqual([
      'bpm',
      's/km',
    ]);
  });
  it('supports three independent axes and shares scales only for compatible units', () => {
    const p: ExplorationPanel = {
      id: 'hr',
      view: 'LINE',
      x: { kind: 'ELAPSED_TIME' },
      y: { kind: 'NUMBER', measure: 'HEART_RATE', unit: 'bpm' },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 140 },
            { x: 10, y: 160 },
          ],
        },
      ],
    };
    const pace: ExplorationPanel = {
      ...p,
      id: 'pace',
      y: { kind: 'NUMBER', measure: 'PACE', unit: 's/km', reverse: true },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 420 },
            { x: 10, y: 360 },
          ],
        },
      ],
    };
    const elevation: ExplorationPanel = {
      ...p,
      id: 'alt',
      y: { kind: 'NUMBER', measure: 'ELEVATION', unit: 'm' },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 20 },
            { x: 10, y: 30 },
          ],
        },
      ],
    };
    const combined = combineExplorationAxes([p, pace, elevation]);
    const g = explorationGeometry(combined[0], 500);
    expect(g.axes).toHaveLength(3);
    expect(g.axes.map((a) => a.axis.unit)).toEqual(['bpm', 's/km', 'm']);
    expect(g.axes[0].domain[1]).toBeLessThan(g.axes[1].domain[0]);
    expect(g.series[0].points[1].px).toBe(g.series[2].points[1].px);
    expect(new Set(g.series.map((s) => s.color)).size).toBe(3);
    expect(separateExplorationAxes(combined).map((p) => p.y.measure)).toEqual([
      'HEART_RATE',
      'PACE',
      'ELEVATION',
    ]);
    const hrReference: ExplorationPanel = {
      ...p,
      id: 'lthr',
      y: { ...p.y, measure: 'LTHR' },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 175 },
            { x: 10, y: 175 },
          ],
        },
      ],
    };
    const same = combineExplorationAxes([p, hrReference])[0];
    expect(same.extraY).toEqual([]);
    expect(explorationGeometry(same, 400).axes[0].domain[1]).toBeGreaterThan(
      175,
    );
    expect(separateExplorationAxes([same])).toHaveLength(2);
    expect(() =>
      assertExplorationQuery({
        source: 'ACTIVITY_SERIES',
        activityHashIds: ['a'],
        measures: ['HEART_RATE', 'PACE', 'ELEVATION'],
        axisLayout: 'OVERLAY',
      }),
    ).not.toThrow();
    expect(() =>
      assertExplorationQuery({
        source: 'ACTIVITY_SERIES',
        activityHashIds: ['a'],
        measures: ['HEART_RATE'],
        axisLayout: 'OVERLAY',
      }),
    ).toThrow();
  });
  it('pairs body and fitness histories only on recorded same-day buckets', async () => {
    const trainingAggregate = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({
        query: { metricSource: 'ESTIMATED' },
        rows: [
          { label: '2026-09-01', values: { WEIGHT: 73, VO2_MAX: 45 } },
          { label: '2026-09-02', values: { WEIGHT: 72 } },
        ],
        truncated: false,
        coverage: {},
      });
    const ctx = {
      session: { user: { id: 'owner' } },
      lang: 'zh',
      userService: { getPreferredTimezone: async () => 'UTC' },
      coachTools: { trainingAggregate },
    } as unknown as AiToolContext;
    const result = await queryTrainingExploration(ctx, {
      source: 'RELATIONSHIP',
      relationshipBasis: 'METRIC_HISTORY',
      ...range,
      measures: ['WEIGHT', 'VO2_MAX'],
    });
    expect(result.panels[0].series[0].points).toEqual([
      { x: 73, y: 45, label: '2026-09-01' },
    ]);
    expect(result.provenance.missingCount).toBe(1);
    expect(result.notes).toContain('HISTORY_PAIRS');
  });
  it('rejects invalid dates, too-wide scopes, mixed query scopes and unsupported measures', () => {
    const q: ExplorationQuery = {
      source: 'PLAN_EXECUTION',
      ...range,
      measures: ['LOAD'],
    };
    expect(() => assertExplorationQuery(q)).not.toThrow();
    for (const delta of [
      { from: '2026-02-30' },
      { from: '2024-01-01' },
      { activityHashIds: ['a'] },
      { measures: ['HEART_RATE'] },
    ])
      expect(() =>
        assertExplorationQuery({ ...q, ...delta } as ExplorationQuery),
      ).toThrow();
    expect(() =>
      assertExplorationQuery({
        source: 'ACTIVITY_SERIES',
        activityHashIds: ['a', 'b', 'c', 'd'],
        measures: ['HEART_RATE'],
      }),
    ).toThrow();
  });
  it('uses true numeric positions, shared scales, inverse pace, and null path breaks', () => {
    const p: ExplorationPanel = {
      id: 'p',
      view: 'LINE',
      x: { kind: 'ELAPSED_TIME' },
      y: { kind: 'NUMBER', unit: 's/km', reverse: true },
      series: [
        {
          id: 'a',
          points: [
            { x: 0, y: 300 },
            { x: 10, y: null },
            { x: 90, y: 360 },
          ],
        },
        { id: 'b', points: [{ x: 10, y: 400 }] },
      ],
    };
    const g = explorationGeometry(p, 600);
    expect(g.x(90) - g.x(0)).toBeCloseTo(9 * (g.x(10) - g.x(0)));
    expect(g.y(300)).toBeLessThan(g.y(400));
    expect(g.series[0].paths).toHaveLength(2);
    expect(g.yd[1]).toBeGreaterThan(400);
    expect(formatExplorationValue(303, p.y)).toBe('5:03');
    expect(
      explorationDomain({ ...p, view: 'BAR', y: { kind: 'NUMBER' } }, 'y')[0],
    ).toBe(0);
  });
  it('never merges different recorded boundaries or sports and excludes missing zones', () => {
    const zone = (max: number) => ({
      order: 1,
      name: 'Z1',
      min: 0,
      max,
      duration: 600,
    });
    const a = {
      hashId: 'a',
      startTime: new Date('2026-09-10'),
      sportType: 'RUN',
      activityZones: [zone(120)],
    };
    const result = buildZoneDistribution(
      [
        a,
        { ...a, hashId: 'b', activityZones: [zone(130)] },
        { ...a, hashId: 'c', sportType: 'CYCLING' },
        { ...a, hashId: 'd', activityZones: [] },
      ],
      {
        source: 'ZONE_DISTRIBUTION',
        ...range,
        zoneType: 'HEART_RATE',
        zoneUnit: 'PERCENT',
      },
      'UTC',
    );
    expect(result.panels).toHaveLength(3);
    expect(result.missing).toBe(1);
    expect(result.split).toBe(true);
    expect(result.panels.every((p) => p.series[0].points[0].y === 100)).toBe(
      true,
    );
  });
  it('retains null actual values and aggregates only complete buckets', () => {
    const p = buildPlanExecutionPanels(
      [
        {
          id: '1',
          date: '2026-09-01',
          name: 'run',
          planned: { DURATION_MIN: 30 },
          actual: { DURATION_MIN: 28 },
        },
        {
          id: '2',
          date: '2026-09-01',
          name: 'run',
          planned: { DURATION_MIN: 20 },
          actual: { DURATION_MIN: null },
        },
      ],
      {
        source: 'PLAN_EXECUTION',
        ...range,
        measures: ['DURATION_MIN'],
        groupBy: 'DAY',
      },
      (d) => d,
    )[0];
    expect(p.series[0].points[0].y).toBe(50);
    expect(p.series[1].points[0]).toMatchObject({ y: null, coverage: 0.5 });
  });
  it('includes repeat counts but does not present partial time prescriptions as complete', () => {
    const repeat = {
      id: 'r',
      parentId: null,
      stepType: 'REPEAT',
      durationType: 'REPEAT_COUNT',
      durationValue: 4,
      durationUnit: 'COUNT',
    };
    const work = {
      id: 'w',
      parentId: 'r',
      stepType: 'WORK',
      durationType: 'TIME',
      durationValue: 60,
      durationUnit: 'SECONDS',
    };
    expect(plannedStepTotal([repeat, work], 'DURATION_MIN')).toBe(4);
    expect(
      plannedStepTotal(
        [repeat, { ...work, durationType: 'DISTANCE', durationUnit: 'METERS' }],
        'DURATION_MIN',
      ),
    ).toBeNull();
  });
  it('reads owned ready activity pairs with user timezone boundaries and no writes', async () => {
    const findMany = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([
        {
          hashId: 'a',
          activityName: 'Run',
          sportType: 'RUN',
          startTime: new Date('2026-09-01'),
          avgSpeed: 3,
          avgHeartRate: 150,
        },
        {
          hashId: 'b',
          activityName: 'Run',
          sportType: 'RUN',
          startTime: new Date('2026-09-02'),
          avgSpeed: null,
          avgHeartRate: 170,
        },
      ]);
    const ctx = {
      session: { user: { id: 'owner' } },
      lang: 'zh',
      userService: { getPreferredTimezone: async () => 'America/Los_Angeles' },
      activities: { findMany },
    } as unknown as AiToolContext;
    const result = await queryTrainingExploration(ctx, {
      source: 'RELATIONSHIP',
      ...range,
      measures: ['SPEED', 'HEART_RATE'],
    });
    expect(result.panels[0].series[0].points).toEqual([
      expect.objectContaining({ x: 10.8, y: 150 }),
    ]);
    expect(result.provenance).toMatchObject({
      matchedCount: 2,
      missingCount: 1,
    });
    const args = findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      take: 1001,
      where: {
        AND: expect.arrayContaining([
          expect.objectContaining({
            userId: 'owner',
            OR: [
              {
                startTime: expect.objectContaining({
                  gte: new Date('2026-09-01T07:00:00.000Z'),
                }),
              },
            ],
          }),
        ]),
      },
    });
    expect(result.notes).toContain('NOT_CAUSAL');
  });
  it('requires owned PRIMARY links; follows the same actual-load readout as PMC', async () => {
    const findMany = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([
        {
          id: 'w',
          scheduledDate: new Date('2026-09-26'),
          name: 'run',
          plannedDurationSeconds: 1800,
          estimatedLoad: 40,
          steps: [],
          links: [{ activity: { id: 7, timerTime: 1680, distance: 4000 } }],
        },
      ]);
    const batchGetActualLoad = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(new Map([[7, { actualLoad: 35 }]]));
    const service = new PlanQueryService(
      {} as never,
      {} as never,
      { findMany } as never,
      {} as never,
      {} as never,
      { batchGetActualLoad } as never,
    );
    const result = await service.readExecutionChart('owner', {
      source: 'PLAN_EXECUTION',
      ...range,
      measures: ['LOAD', 'DURATION_MIN'],
    });
    expect(result.rows[0].actual).toMatchObject({ LOAD: 35, DURATION_MIN: 28 });
    expect(batchGetActualLoad).toHaveBeenCalledWith([7]);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'owner', status: { not: 'MOVED' } },
      include: {
        links: {
          where: {
            role: 'PRIMARY',
            unlinkedAt: null,
            activity: { AND: expect.arrayContaining([{ userId: 'owner' }]) },
          },
        },
      },
    });
  });
});
