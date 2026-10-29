import { describe, expect, it, jest } from '@jest/globals';
import { CoachReviewContextService } from '../coach-review-context.service';

describe('CoachReviewContextService', () => {
  it('assembles recent activities, daily PMC, profiles, and full upcoming workouts', async () => {
    const service = new CoachReviewContextService(
      {
        findReviewWindowWorkouts: jest.fn(async () => [
          {
            id: 'w-old',
            scheduledDate: new Date('2026-08-25T00:00:00.000Z'),
            dayOffset: 6,
            sessionIndex: 1,
            sportType: 'RUN',
            status: 'DONE',
            name: 'Easy run',
            notes: 'Run easily.',
            text: 'work 20m',
            structureKind: 'ENDURANCE',
            dslVersion: 1,
            plannedDurationSeconds: 1200,
            plannedSessionRpe: 4,
            estimatedLoad: 21,
            links: [],
          },
        ]),
      } as never,
      {
        findMany: jest.fn(async () => [
          {
            id: 1,
            hashId: 'activity-1',
            activityName: 'Night run',
            sportType: 'RUN',
            startTime: new Date('2026-08-25T13:34:00.000Z'),
            timezone: 'Asia/Shanghai',
            timerTime: 1200,
            elapsedTime: 1220,
            distance: 2180,
            sessionRpe: 6,
            avgHeartRate: 148,
            avgPower: null,
            planWorkoutLinks: [],
          },
        ]),
      } as never,
      {
        batchGetActualLoad: jest.fn(
          async () => new Map([[1, { actualLoad: 26.9 }]]),
        ),
      } as never,
      {
        getStoredSliceAsOf: jest.fn(async () => ({
          latest: { CTL: 40, ATL: 44, TSB: -4 },
          daily: [
            {
              date: new Date('2026-08-25T00:00:00.000Z'),
              dailyValue: 26.9,
              CTL: 40,
              ATL: 44,
              TSB: -4,
            },
          ],
        })),
      } as never,
      {
        getComposedUserProfile: jest.fn(async () => ({
          maxHeartRate: 190,
          lthr: 172,
          tp: 4,
        })),
      } as never,
      {
        get: jest.fn(() => ({
          parseText: jest.fn((text: string) => text),
          summarize: jest.fn(() => ({
            kind: 'ENDURANCE',
            durationSeconds: 1200,
            stepCount: 1,
            hardSession: false,
          })),
        })),
      } as never,
    );
    const result = await service.build({
      userId: 'user-1',
      lang: 'zh',
      scale: 'daily',
      periodStart: new Date('2026-08-25T00:00:00.000Z'),
      periodEnd: new Date('2026-08-26T00:00:00.000Z'),
      context: {
        anchor: {
          anchorDate: '2026-08-25',
          timezone: 'Asia/Shanghai',
        },
        plan: {
          id: 'plan-1',
          title: '5K Base',
          goal: '5K',
          status: 'ACTIVE',
        },
        tomorrow: {
          plannedWorkouts: [
            {
              id: 'w-next',
              scheduledDate: '2026-08-26',
              weekIndex: 2,
              dayIndex: 3,
              sessionIndex: 1,
              sportType: 'RUN',
              status: 'PLANNED',
              name: 'Controlled run',
              notes: 'Run steadily.',
              text: 'work 20m',
              structureKind: 'ENDURANCE',
              dslVersion: 1,
              plannedDurationSeconds: 1200,
              plannedSessionRpe: null,
              expectedLoad: 21.4,
              linkedActivities: [],
            },
          ],
        },
        nextWorkouts: [],
        recentLoad: {
          ctl: 40,
          atl: 44,
          tsb: -4,
          currentWeekLoad: 50,
          previousWeekLoad: 80,
          dailyLoadLast7d: [],
          restDaysLast14d: 5,
        },
        competitionContext: { status: 'UNAVAILABLE' },
        recentEvents: [],
      } as never,
    });

    expect(result.recent7Days.at(-1)).toMatchObject({
      date: '2026-08-25',
      pmc: { dailyLoad: 26.9, ctl: 40, atl: 44, tsb: -4 },
      activities: [
        expect.objectContaining({
          hashId: 'activity-1',
          dayPeriod: 'evening',
          sessionRpe: 6,
          load: 26.9,
        }),
      ],
    });
    expect(result.upcoming[0]).toMatchObject({
      id: 'w-next',
      text: 'work 20m',
      summary: { durationSeconds: 1200, hardSession: false },
    });
    expect(result.athlete.sportProfiles[0]).toMatchObject({
      sportType: 'RUN',
      maxHeartRate: 190,
      lthr: 172,
    });
    expect(result.meta).toMatchObject({
      reviewedThrough: '2026-08-25',
      athleteToday: '2026-08-26',
      timezone: 'Asia/Shanghai',
    });
    expect(result.reviewFactHash).toHaveLength(64);
  });

  it.each([
    ['America/Los_Angeles', '2026-08-26T07:00:00.000Z'],
    ['Europe/London', '2026-08-25T23:00:00.000Z'],
    ['Pacific/Kiritimati', '2026-08-25T10:00:00.000Z'],
    ['Pacific/Honolulu', '2026-08-26T10:00:00.000Z'],
  ])(
    'sets athleteToday from periodEnd in %s',
    async (timezone, periodEndIso) => {
      const service = new CoachReviewContextService(
        { findReviewWindowWorkouts: jest.fn(async () => []) } as never,
        { findMany: jest.fn(async () => []) } as never,
        { batchGetActualLoad: jest.fn(async () => new Map()) } as never,
        {
          getStoredSliceAsOf: jest.fn(async () => ({ latest: null, daily: [] })),
        } as never,
        { getComposedUserProfile: jest.fn(async () => null) } as never,
        { get: jest.fn() } as never,
      );

      const result = await service.build({
        userId: 'user-1',
        lang: 'en',
        scale: 'daily',
        periodStart: new Date('2026-08-25T00:00:00.000Z'),
        periodEnd: new Date(periodEndIso),
        context: {
          anchor: { anchorDate: '2026-08-25', timezone },
          plan: { id: 'plan-1', title: 'Base', status: 'ACTIVE' },
          tomorrow: { plannedWorkouts: [] },
          nextWorkouts: [],
          recentLoad: {},
          competitionContext: { status: 'UNAVAILABLE' },
          recentEvents: [],
        } as never,
      });

      expect(result.meta.athleteToday).toBe('2026-08-26');
      expect(result.meta.timezone).toBe(timezone);
      expect(result.meta.reviewedThrough).toBe('2026-08-25');
    },
  );
});
