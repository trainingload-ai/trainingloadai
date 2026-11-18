import { planActiveTool } from '../planActive.tool';
import { planRecentTool } from '../planRecent.tool';
import { planByIdTool } from '../planById.tool';
import { planDayViewTool } from '../planDayView.tool';
import { healthSummaryTool } from '../healthSummary.tool';
import { CoachToolsService } from '../../coach-tools.service';
import { buildPmcTrainingDataset } from '../../training-analytics';
import { queryTrainingExploration } from '../../training-exploration';

const calendar = { date: '2026-11-18', timezone: 'Asia/Shanghai' };
const service = () =>
  new CoachToolsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

afterEach(() => jest.useRealTimers());

describe.each([
  calendar,
  { date: '2026-11-17', timezone: 'America/Los_Angeles' },
])('plan tools in $timezone', (calendar) => {
  it.each([
    ['active', planActiveTool, {}, 'asOf'],
    ['recent', planRecentTool, {}, 'asOf'],
    ['by id', planByIdTool, { planId: 'p1' }, 'asOf'],
    ['day view', planDayViewTool, {}, 'date'],
  ] as const)(
    '%s uses the factual local day unless an explicit date is requested',
    async (_name, tool, input, key) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-17T20:00:00Z'));
      const ctx = {
        session: { user: { id: 'u1' } },
        currentTurnCalendar: calendar,
        planQuery: { findCoachPlanSnapshot: async () => null },
      } as never;
      const implicit = await tool.execute(ctx, input as never);
      expect((implicit as any)[key]).toBe(calendar.date);
      const explicit = await tool.execute(ctx, {
        ...input,
        [key]: '2026-11-16',
      } as never);
      expect((explicit as any)[key]).toBe('2026-11-16');
    },
  );
});

it('keeps health reads on the same day while preserving an explicit historical date', async () => {
  const getOverview = jest.fn(async (_id, _days, endDate) => ({ endDate }));
  const ctx = {
    session: { user: { id: 'u1' } },
    currentTurnCalendar: calendar,
    healthData: { getOverview },
  } as never;
  expect(await healthSummaryTool.execute(ctx, {})).toEqual({
    endDate: '2026-11-18',
  });
  expect(
    await healthSummaryTool.execute(ctx, { endDate: '2026-11-15' }),
  ).toEqual({ endDate: '2026-11-15' });
});

it.each([
  [null, 'Asia/Shanghai', '2026-11-18', '+08:00'],
  ['America/Los_Angeles', 'America/Los_Angeles', '2026-11-17', '-08:00'],
] as const)(
  'resolves time.current with preferred timezone %s before the saved hint',
  async (profile, zone, date, offset) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T20:00:00Z'));
    const output = await service().currentTime({
      session: { user: { id: 'u1' } },
      userService: { getPreferredTimezone: async () => profile },
      currentTurnCalendar: calendar,
    } as never);
    expect(output.athleteTimezone).toBe(zone);
    expect(output.athleteLocalToday).toBe(date);
    expect(output.user.date).toBe(date);
    expect(output.user.offset).toBe(offset);
    expect(output.userTimezone).toBe(profile);
  },
);

it('uses the saved zone for activity aggregation when no preferred timezone exists', async () => {
  const findMany = jest.fn(async () => []);
  const output = await service().trainingAggregate(
    {
      session: { user: { id: 'u1' } },
      userService: { getPreferredTimezone: async () => null },
      currentTurnCalendar: calendar,
      activities: { findMany },
    } as never,
    {
      source: 'ACTIVITIES',
      from: '2026-11-18',
      to: '2026-11-18',
      measures: ['DISTANCE_KM'],
      groupBy: 'DAY',
    } as never,
  );
  expect(output.timezone).toBe('Asia/Shanghai');
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            startTime: {
              gte: new Date('2026-11-17T16:00:00Z'),
              lte: new Date('2026-11-18T15:59:59.999Z'),
            },
          }),
        ]),
      }),
    }),
  );
});

it('reads PMC date keys without including the following calendar day', async () => {
  const records = [
    { date: new Date('2026-11-18T00:00:00Z'), dailyValue: 40 },
    { date: new Date('2026-11-19T00:00:00Z'), dailyValue: 90 },
  ];
  const output = await service().trainingAggregate(
    {
      session: { user: { id: 'u1' } },
      userService: { getPreferredTimezone: async () => null },
      currentTurnCalendar: {
        date: '2026-11-18',
        timezone: 'America/Los_Angeles',
      },
      pmc: {
        listRange: async (_id: string, from: Date, to: Date) =>
          records.filter((row) => row.date >= from && row.date <= to),
      },
    } as never,
    {
      source: 'PMC',
      from: '2026-11-18',
      to: '2026-11-18',
      measures: ['DAILY_LOAD'],
      groupBy: 'DAY',
    },
  );
  expect(output.rows).toMatchObject([
    { key: '2026-11-18', values: { DAILY_LOAD: 40 } },
  ]);
});

it.each([
  ['DAY', '2026-11-02'],
  ['WEEK', '2026-11-02'],
  ['MONTH', '2026-11'],
] as const)(
  'keeps PMC %s buckets on their stored calendar date',
  (groupBy, key) => {
    const output = buildPmcTrainingDataset({
      timezone: 'America/Los_Angeles',
      query: {
        source: 'PMC',
        from: '2026-11-02',
        to: '2026-11-02',
        groupBy,
        measures: ['DAILY_LOAD'],
      },
      records: [
        { date: new Date('2026-11-02T00:00:00Z'), dailyValue: 40 },
      ] as never,
    });
    expect(output.rows).toMatchObject([{ key, values: { DAILY_LOAD: 40 } }]);
  },
);

it('uses the same calendar for the exploration branch of training aggregation', async () => {
  const findMany = jest.fn(async () => []);
  const output = await queryTrainingExploration(
    {
      session: { user: { id: 'u1' } },
      lang: 'zh',
      userService: { getPreferredTimezone: async () => null },
      currentTurnCalendar: calendar,
      activities: { findMany },
    } as never,
    {
      source: 'ZONE_DISTRIBUTION',
      from: '2026-11-18',
      to: '2026-11-18',
      zoneType: 'HEART_RATE',
      zoneUnit: 'PERCENT',
    },
  );
  expect(output.provenance.timezone).toBe('Asia/Shanghai');
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: [
              {
                startTime: {
                  gte: new Date('2026-11-17T16:00:00Z'),
                  lt: new Date('2026-11-18T16:00:00Z'),
                },
              },
            ],
          }),
        ]),
      }),
    }),
  );
});
