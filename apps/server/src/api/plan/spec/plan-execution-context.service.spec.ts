import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PlanExecutionContextService } from '../plan-execution-context.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import { UserQueryService } from '../../user/user-query.service';
import { UserIdentityRepository } from '../../user/persistence/user-identity.repository';

function date(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    hashId: 'act_10',
    activityName: 'Morning Run',
    sportType: 'RUN',
    startTime: new Date('2026-06-15T00:30:00.000Z'),
    timezone: 'Asia/Shanghai',
    timerTime: 1800,
    elapsedTime: 1810,
    distance: 5000,
    avgHeartRate: 142,
    avgPower: null,
    updatedAt: new Date('2026-06-15T01:30:00.000Z'),
    coggan: null,
    bikeScore: null,
    govss: { govss: 42 },
    swimScore: null,
    trimp: null,
    planWorkoutLinks: [],
    ...overrides,
  };
}

function workout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    planId: 'p1',
    scheduledDate: date('2026-06-15'),
    dayOffset: 0,
    sessionIndex: 1,
    sportType: 'RUN',
    status: 'DONE',
    name: 'Easy run',
    notes: 'Keep it conversational',
    text: 'work 30m hr <150bpm',
    estimatedLoad: 35,
    updatedAt: new Date('2026-06-14T12:00:00.000Z'),
    links: [],
    ...overrides,
  };
}

function createPrisma() {
  return {
    userBodyMetric: {
      findFirst: jest.fn<() => Promise<unknown>>(),
    },
    coachContext: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      findUnique: jest.fn<() => Promise<unknown>>(),
    },
    plan: {
      findFirst: jest.fn<() => Promise<unknown>>(),
    },
    planWorkout: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      findMany: jest.fn<() => Promise<unknown[]>>(),
    },
    activity: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      findMany: jest.fn<() => Promise<unknown[]>>(),
    },
    coachEvent: {
      findMany: jest.fn<() => Promise<unknown[]>>(),
    },
  };
}

function createPmc(
  slice: {
    latest?: { CTL: number; ATL: number; TSB: number } | null;
    daily?: Array<{ date: Date; dailyValue: number }>;
  } = {},
) {
  return {
    getStoredSliceAsOf: jest.fn(async () => ({
      latest: slice.latest ?? null,
      daily: slice.daily ?? [],
    })),
  };
}

function createService(
  prisma: ReturnType<typeof createPrisma>,
  options?: { pmc?: ReturnType<typeof createPmc>; competition?: object },
) {
  const activityRead = new ActivityReadService(prisma as never);
  const users = new UserQueryService(
    new UserIdentityRepository(prisma as never),
  );
  return new PlanExecutionContextService(
    prisma as never,
    (options?.pmc ?? createPmc()) as never,
    options?.competition as never,
    undefined as never,
    new PlanRepository(prisma as never),
    new PlanWorkoutRepository(prisma as never),
    new CoachContextRepository(prisma as never),
    activityRead,
    users,
  );
}

describe('PlanExecutionContextService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T02:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    { anchorDate: '2026-08-24', week: 1, day: 1 },
    { anchorDate: '2026-08-30', week: 1, day: 7 },
    { anchorDate: '2026-08-31', week: 2, day: 1 },
    { anchorDate: '2026-09-06', week: 2, day: 7 },
    { anchorDate: '2026-09-07', week: 3, day: 1 },
    { anchorDate: '2026-10-18', week: 8, day: 7 },
    { anchorDate: '2026-08-23', week: null, day: null },
    { anchorDate: '2026-10-19', week: null, day: null },
  ])(
    'derives plan progress for $anchorDate from the calendar instead of stored indices',
    async ({ anchorDate, week, day }) => {
      const prisma = createPrisma();
      prisma.userBodyMetric.findFirst.mockResolvedValue({
        value: 'Asia/Shanghai',
      });
      const plan = {
        id: 'p1',
        title: '8-week 5K base plan',
        status: 'ACTIVE',
        startDate: date('2026-08-24'),
        endDate: date('2026-10-18'),
        periodWeeks: 8,
        currentWeekIndex: 1,
        currentDayIndex: 1,
      };
      prisma.plan.findFirst.mockResolvedValue(plan);
      prisma.coachContext.findUnique.mockResolvedValue(null);
      prisma.planWorkout.findMany.mockResolvedValue([]);
      prisma.activity.findMany.mockResolvedValue([]);
      const service = createService(prisma);
      const input = {
        userId: 'u1',
        surface: 'HOME_TODAY' as const,
        anchorDate,
      };

      const context = await service.buildContext(input);

      expect(context.plan).toMatchObject({
        currentWeekIndex: week,
        currentDayIndex: day,
      });
      // Repairing or changing stale persisted indices must not change the facts.
      prisma.plan.findFirst.mockResolvedValue({
        ...plan,
        currentWeekIndex: 5,
        currentDayIndex: 4,
      });
      expect((await service.buildContext(input)).factHash).toBe(
        context.factHash,
      );
    },
  );

  it.each([
    { timezone: 'Asia/Shanghai', anchorDate: '2026-09-07', week: 3, day: 1 },
    {
      timezone: 'America/Los_Angeles',
      anchorDate: '2026-09-06',
      week: 2,
      day: 7,
    },
  ])(
    'advances the plan week using the local calendar in $timezone',
    async ({ timezone, anchorDate, week, day }) => {
      jest.setSystemTime(new Date('2026-09-06T16:30:00.000Z'));
      const prisma = createPrisma();
      prisma.userBodyMetric.findFirst.mockResolvedValue({ value: timezone });
      prisma.plan.findFirst.mockResolvedValue({
        id: 'p1',
        title: '8-week 5K base plan',
        status: 'ACTIVE',
        startDate: date('2026-08-24'),
        endDate: date('2026-10-18'),
        periodWeeks: 8,
        currentWeekIndex: 1,
        currentDayIndex: 1,
      });
      prisma.coachContext.findUnique.mockResolvedValue(null);
      prisma.planWorkout.findMany.mockResolvedValue([]);
      prisma.activity.findMany.mockResolvedValue([]);

      const context = await createService(prisma).buildContext({
        userId: 'u1',
        surface: 'HOME_TODAY',
      });

      expect(context.anchor.anchorDate).toBe(anchorDate);
      expect(context.plan).toMatchObject({
        currentWeekIndex: week,
        currentDayIndex: day,
      });
    },
  );

  it('builds a plan-aware home context with today, tomorrow, links, and load', async () => {
    const prisma = createPrisma();
    const linkedActivity = activity({
      id: 11,
      hashId: 'act_linked',
      planWorkoutLinks: [
        {
          source: 'AUTO',
          role: 'PRIMARY',
          unlinkedAt: null,
          planWorkout: { id: 'w1', planId: 'p1' },
        },
      ],
    });
    const extraActivity = activity({
      id: 12,
      hashId: 'act_extra',
      activityName: 'Extra jog',
      startTime: new Date('2026-06-15T06:25:42.000Z'),
      timezone: 'Asia/Shanghai',
      planWorkoutLinks: [],
    });

    prisma.userBodyMetric.findFirst.mockResolvedValue({
      value: 'Asia/Shanghai',
    });
    prisma.plan.findFirst
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({
        id: 'p1',
        title: '10K Plan',
        goal: '10K',
        status: 'ACTIVE',
        startDate: date('2026-06-15'),
        endDate: date('2026-07-12'),
        periodWeeks: 4,
        currentWeekIndex: 1,
        currentDayIndex: 1,
        updatedAt: new Date('2026-06-14T00:00:00.000Z'),
      });
    prisma.coachContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      headEventSeq: 3,
    });
    prisma.planWorkout.findMany.mockResolvedValue([
      workout({ links: [{ activity: linkedActivity }] }),
      workout({
        id: 'w2',
        scheduledDate: date('2026-06-16'),
        dayOffset: 1,
        status: 'PLANNED',
        name: 'Intervals',
        text: 'repeat 4 { work 30s recovery 1m }',
        links: [],
      }),
    ]);
    prisma.activity.findMany.mockResolvedValue([linkedActivity, extraActivity]);
    prisma.coachEvent.findMany.mockResolvedValue([
      {
        seq: 3,
        type: 'WORKOUT_COMPLETED',
        occurredAt: new Date('2026-06-15T01:00:00.000Z'),
        payload: { workoutId: 'w1' },
      },
    ]);

    const service = createService(prisma, {
      pmc: createPmc({
        latest: { CTL: 42.4, ATL: 51.2, TSB: -8.8 },
        daily: [
          { date: date('2026-06-15'), dailyValue: 42 },
          { date: date('2026-06-14'), dailyValue: 10 },
        ],
      }),
    });
    const ctx = await service.buildContext({
      userId: 'u1',
      surface: 'HOME_TODAY',
      timezone: 'America/Los_Angeles',
    });

    expect(ctx.contextId).toBe('ctx1');
    expect(ctx.anchor).toMatchObject({
      anchorDate: '2026-06-15',
      planId: 'p1',
      timezone: 'Asia/Shanghai',
    });
    expect(ctx.day.completionState).toBe('COMPLETED');
    expect(ctx.day.plannedWorkouts).toHaveLength(1);
    expect(ctx.tomorrow.plannedWorkouts[0]).toMatchObject({
      id: 'w2',
      name: 'Intervals',
    });
    expect(ctx.day.linkedActivities).toHaveLength(1);
    expect(ctx.day.unlinkedActivities).toHaveLength(1);
    expect(ctx.day.unlinkedActivities[0]).toMatchObject({
      id: 12,
      timezone: 'Asia/Shanghai',
      localDate: '2026-06-15',
      localStartTime: '14:25',
      localHour: 14,
      dayPeriod: 'afternoon',
    });
    expect(ctx.recentLoad).toMatchObject({ ctl: 42, atl: 51, tsb: -9 });
    expect(ctx.factHash).toHaveLength(64);
  });

  it('resolves an activity anchor through its linked plan workout', async () => {
    const prisma = createPrisma();
    const linkedActivity = activity({
      id: 21,
      hashId: 'act_21',
      startTime: new Date('2026-06-16T23:30:00.000Z'),
      timezone: 'Asia/Shanghai',
      planWorkoutLinks: [
        {
          source: 'MANUAL',
          role: 'PRIMARY',
          unlinkedAt: null,
          planWorkout: {
            id: 'w_linked',
            planId: 'p_linked',
            scheduledDate: date('2026-06-17'),
          },
        },
      ],
    });

    prisma.userBodyMetric.findFirst.mockResolvedValue(null);
    prisma.activity.findFirst.mockResolvedValue(linkedActivity);
    prisma.plan.findFirst.mockResolvedValue({
      id: 'p_linked',
      title: 'Linked Plan',
      goal: null,
      status: 'ACTIVE',
      startDate: date('2026-06-10'),
      endDate: date('2026-07-10'),
      periodWeeks: 4,
      currentWeekIndex: 2,
      currentDayIndex: 3,
      updatedAt: new Date('2026-06-15T00:00:00.000Z'),
    });
    prisma.coachContext.findUnique.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([
      workout({
        id: 'w_linked',
        planId: 'p_linked',
        scheduledDate: date('2026-06-17'),
        links: [{ activity: linkedActivity }],
      }),
    ]);
    prisma.activity.findMany.mockResolvedValue([linkedActivity]);

    const service = createService(prisma);
    const ctx = await service.buildContext({
      userId: 'u1',
      surface: 'ACTIVITY',
      activityId: 'act_21',
    });

    expect(ctx.anchor).toMatchObject({
      planId: 'p_linked',
      planWorkoutId: 'w_linked',
      activityId: 21,
      anchorDate: '2026-06-17',
    });
    expect(ctx.currentWorkout?.id).toBe('w_linked');
    expect(ctx.linkedActivity?.id).toBe(21);
  });

  it('keeps fact hash stable across presentation surfaces for the same facts', async () => {
    const createNoPlanService = () => {
      const prisma = createPrisma();
      prisma.userBodyMetric.findFirst.mockResolvedValue({
        value: 'Asia/Shanghai',
      });
      prisma.plan.findFirst.mockResolvedValue(null);
      prisma.activity.findMany.mockResolvedValue([]);
      return createService(prisma);
    };

    const homeCtx = await createNoPlanService().buildContext({
      userId: 'u1',
      surface: 'HOME_TODAY',
      anchorDate: '2026-06-15',
      sourceNode: { component: 'home' },
    });
    const dayCtx = await createNoPlanService().buildContext({
      userId: 'u1',
      surface: 'DAY',
      anchorDate: '2026-06-15',
      sourceNode: { component: 'day' },
    });

    expect(homeCtx.anchor.surface).toBe('HOME_TODAY');
    expect(dayCtx.anchor.surface).toBe('DAY');
    expect(homeCtx.factHash).toBe(dayCtx.factHash);
  });

  it('uses a valid device timezone only when the profile timezone is unavailable', async () => {
    const build = async (profileTimezone: string | null) => {
      const prisma = createPrisma();
      prisma.userBodyMetric.findFirst.mockResolvedValue(
        profileTimezone ? { value: profileTimezone } : null,
      );
      prisma.plan.findFirst.mockResolvedValue(null);
      prisma.activity.findMany.mockResolvedValue([]);
      return createService(prisma).buildContext({
        userId: 'u1',
        surface: 'HOME_TODAY',
        anchorDate: '2026-06-15',
        timezone: 'America/Los_Angeles',
      });
    };

    await expect(build('Asia/Shanghai')).resolves.toMatchObject({
      anchor: { timezone: 'Asia/Shanghai' },
    });
    await expect(build(null)).resolves.toMatchObject({
      anchor: { timezone: 'America/Los_Angeles' },
    });
    await expect(build('invalid/profile-zone')).resolves.toMatchObject({
      anchor: { timezone: 'America/Los_Angeles' },
    });
  });

  it('includes authoritative event facts and changes factHash when the assessment input changes', async () => {
    const build = async (inputHash: string, version: number) => {
      const prisma = createPrisma();
      prisma.userBodyMetric.findFirst.mockResolvedValue({
        value: 'Asia/Shanghai',
      });
      prisma.plan.findFirst.mockResolvedValue(null);
      prisma.activity.findMany.mockResolvedValue([]);
      const competitionImpactService = {
        resolveForContext: jest.fn(async () => ({
          assessmentId: `assessment-${version}`,
          status: 'SUCCESS',
          inputHash,
          assessedAt: '2026-06-15T00:00:00.000Z',
          events: [
            {
              id: 'race-1',
              version,
              title: 'Shanghai Marathon',
              startDate: '2026-06-22',
              endDate: null,
              sportType: 'RUN',
              importance: 'CRITICAL',
              distanceMeters: 42195,
            },
          ],
          result: {
            eventAssessments: [
              {
                eventId: 'race-1',
                relevant: true,
                confidence: 0.88,
                currentImpactLevel: 'HIGH',
                influenceWindow: {
                  startDate: '2026-06-01',
                  endDate: '2026-06-29',
                },
                phases: [
                  {
                    type: 'TAPER',
                    startDate: '2026-06-15',
                    endDate: '2026-06-21',
                  },
                ],
                constraints: [],
                reasoningSummary: 'Protect the taper.',
              },
            ],
            combinedImpact: { conflicts: [] },
          },
        })),
      };
      return createService(prisma, {
        competition: competitionImpactService,
      }).buildContext({
        userId: 'u1',
        surface: 'HOME_TODAY',
        anchorDate: '2026-06-15',
      });
    };

    const first = await build('facts-v1', 1);
    const second = await build('facts-v2', 2);
    expect(first.competitionContext.activeInfluences[0]).toMatchObject({
      eventTitle: 'Shanghai Marathon',
      eventDistanceMeters: 42195,
      athleteImportance: 'CRITICAL',
      daysFromAnchor: 7,
      impactLevel: 'HIGH',
      phase: 'TAPER',
    });
    expect(first.factHash).not.toBe(second.factHash);
  });

  it('marks an active plan rest day with unlinked activity as extra activity', async () => {
    const prisma = createPrisma();
    const extraActivity = activity({
      id: 31,
      hashId: 'act_extra_rest_day',
      startTime: new Date('2026-06-15T04:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      activityName: 'Unplanned ride',
      sportType: 'CYCLING',
      coggan: { bikeStress: 58 },
      govss: null,
      planWorkoutLinks: [],
    });

    prisma.userBodyMetric.findFirst.mockResolvedValue({
      value: 'Asia/Shanghai',
    });
    prisma.plan.findFirst
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({
        id: 'p1',
        title: 'Base Plan',
        goal: null,
        status: 'ACTIVE',
        startDate: date('2026-06-01'),
        endDate: date('2026-06-28'),
        periodWeeks: 4,
        currentWeekIndex: 3,
        currentDayIndex: 1,
        updatedAt: new Date('2026-06-14T00:00:00.000Z'),
      });
    prisma.coachContext.findUnique.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([extraActivity]);

    const service = createService(prisma);
    const ctx = await service.buildContext({
      userId: 'u1',
      surface: 'HOME_TODAY',
      anchorDate: '2026-06-15',
    });

    expect(ctx.plan?.id).toBe('p1');
    expect(ctx.day.plannedWorkouts).toHaveLength(0);
    expect(ctx.day.unlinkedActivities).toHaveLength(1);
    expect(ctx.day.unlinkedActivities[0]).toMatchObject({
      id: 31,
      title: 'Unplanned ride',
      load: 58,
      localDate: '2026-06-15',
    });
    expect(ctx.day.completionState).toBe('EXTRA_ACTIVITY');
    expect(ctx.currentWorkout).toBeNull();
  });

  it('marks an active plan day without workouts or activity as a rest day', async () => {
    const prisma = createPrisma();
    prisma.userBodyMetric.findFirst.mockResolvedValue({
      value: 'Asia/Shanghai',
    });
    prisma.plan.findFirst
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({
        id: 'p1',
        title: 'Base Plan',
        goal: null,
        status: 'ACTIVE',
        startDate: date('2026-06-01'),
        endDate: date('2026-06-28'),
        periodWeeks: 4,
        currentWeekIndex: 3,
        currentDayIndex: 1,
        updatedAt: new Date('2026-06-14T00:00:00.000Z'),
      });
    prisma.coachContext.findUnique.mockResolvedValue(null);
    prisma.planWorkout.findMany.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([]);

    const service = createService(prisma);
    const ctx = await service.buildContext({
      userId: 'u1',
      surface: 'HOME_TODAY',
      anchorDate: '2026-06-15',
    });

    expect(ctx.day.completionState).toBe('REST_DAY');
    expect(ctx.day.linkedActivities).toHaveLength(0);
    expect(ctx.day.unlinkedActivities).toHaveLength(0);
    expect(ctx.tomorrow.date).toBe('2026-06-16');
  });

  it('resolves a plan workout anchor into the current workout and anchor date', async () => {
    const prisma = createPrisma();
    prisma.userBodyMetric.findFirst.mockResolvedValue({
      value: 'Asia/Shanghai',
    });
    prisma.planWorkout.findFirst.mockResolvedValue({
      id: 'w_anchor',
      planId: 'p1',
      scheduledDate: date('2026-06-18'),
    });
    prisma.plan.findFirst.mockResolvedValue({
      id: 'p1',
      title: 'Anchor Plan',
      goal: 'Marathon',
      status: 'ACTIVE',
      startDate: date('2026-06-01'),
      endDate: date('2026-08-23'),
      periodWeeks: 12,
      currentWeekIndex: 3,
      currentDayIndex: 4,
      updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    });
    prisma.coachContext.findUnique.mockResolvedValue({
      id: 'ctx1',
      headEventSeq: 9,
    });
    prisma.planWorkout.findMany.mockResolvedValue([
      workout({
        id: 'w_anchor',
        planId: 'p1',
        scheduledDate: date('2026-06-18'),
        dayOffset: 17,
        sessionIndex: 2,
        status: 'PLANNED',
        name: 'Tempo run',
        estimatedLoad: 62.4,
      }),
      workout({
        id: 'w_next',
        planId: 'p1',
        scheduledDate: date('2026-06-19'),
        dayOffset: 18,
        status: 'PLANNED',
        name: 'Recovery run',
      }),
    ]);
    prisma.activity.findMany.mockResolvedValue([]);
    prisma.coachEvent.findMany.mockResolvedValue([]);

    const service = createService(prisma);
    const ctx = await service.buildContext({
      userId: 'u1',
      surface: 'WORKOUT',
      planWorkoutId: 'w_anchor',
    });

    expect(ctx.anchor).toMatchObject({
      anchorDate: '2026-06-18',
      planId: 'p1',
      planWorkoutId: 'w_anchor',
    });
    expect(ctx.contextId).toBe('ctx1');
    expect(ctx.contextHeadEventSeq).toBe(9);
    expect(ctx.currentWorkout).toMatchObject({
      id: 'w_anchor',
      weekIndex: 3,
      dayIndex: 4,
      sessionIndex: 2,
      expectedLoad: 62.4,
    });
    expect(ctx.nextWorkouts[0]).toMatchObject({
      id: 'w_next',
      scheduledDate: '2026-06-19',
    });
  });
});
