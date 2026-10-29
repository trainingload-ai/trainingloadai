import { describe, expect, it, jest } from '@jest/globals';
import { ReviewDigestContextService } from '../review-digest-context.service';

function createFixture() {
  const execution = {
    plan: {
      id: 'plan-1',
      title: '8 周打好基础',
      goal: '稳定完成 5K',
      status: 'ACTIVE',
      startDate: '2026-08-24',
      endDate: '2026-10-18',
      periodWeeks: 8,
      currentWeekIndex: 2,
      currentDayIndex: 3,
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  };
  const planExecution = {
    buildContext: jest.fn(async () => execution),
  };
  const coachReviewContext = {
    build: jest.fn(async () => ({
      meta: {
        reviewedFrom: '2026-09-01',
        reviewedThrough: '2026-09-01',
      },
      reviewWindowSummary: {
        planned: 1,
        done: 1,
        skipped: 0,
        moved: 0,
        incomplete: 0,
        plannedLoad: 35,
        actualLoad: 38,
        extraActivities: 0,
        sportBreakdown: { RUN: { workouts: 1, activities: 1 } },
      },
      recent7Days: [
        {
          date: '2026-08-31',
          plannedWorkouts: [],
          activities: [],
          pmc: { dailyLoad: 0, ctl: 20, atl: 20, tsb: 0 },
        },
        {
          date: '2026-09-01',
          plannedWorkouts: [
            {
              id: 'workout-secret',
              weekIndex: 2,
              dayIndex: 2,
              sportType: 'RUN',
              status: 'DONE',
              name: '轻松跑',
              plannedDurationSeconds: 1800,
              plannedSessionRpe: 4,
              expectedLoad: 35,
              linkedActivityIds: [42],
            },
          ],
          activities: [
            {
              id: 42,
              hashId: 'activity-secret',
              title: 'Morning Run',
              sportType: 'RUN',
              durationMinutes: 31,
              distanceKm: 5.1,
              load: 38,
              sessionRpe: 4,
              linkedWorkoutId: 'workout-secret',
            },
          ],
          pmc: { dailyLoad: 38, ctl: 21, atl: 23, tsb: -2 },
        },
      ],
      loadSnapshot: {
        ctl: 21,
        atl: 23,
        tsb: -2,
        currentWeekLoad: 38,
        previousWeekLoad: 105,
        dailyLoadLast7d: [0, 30, 0, 37, 0, 0, 38],
        restDaysLast14d: 8,
      },
      upcoming: [
        {
          id: 'next-secret',
          date: '2026-09-02',
          weekIndex: 2,
          dayIndex: 3,
          sportType: 'RUN',
          status: 'PLANNED',
          name: '受控稳定跑',
          plannedDurationSeconds: 1800,
          plannedSessionRpe: 5,
          expectedLoad: 40,
        },
      ],
      competitionContext: {
        upcomingEvents: [],
        activeInfluences: [],
      },
      dataQuality: {
        missing: [],
        hasActivityDetails: true,
        hasPmcTrend: true,
        hasAthleteProfile: true,
      },
    })),
  };
  return {
    service: new ReviewDigestContextService(
      planExecution as never,
      coachReviewContext as never,
    ),
    planExecution,
    coachReviewContext,
  };
}

describe('ReviewDigestContextService', () => {
  it('anchors a daily digest to the reviewed local day and strips internal ids', async () => {
    const { service, planExecution } = createFixture();
    const context = await service.build({
      userId: 'user-1',
      type: 'DAILY',
      lang: 'zh',
      timezone: 'Asia/Shanghai',
      periodStart: new Date('2026-08-31T16:00:00.000Z'),
      periodEnd: new Date('2026-09-01T16:00:00.000Z'),
    });

    expect(planExecution.buildContext).toHaveBeenCalledWith(
      expect.objectContaining({ anchorDate: '2026-09-01' }),
    );
    expect(context).toMatchObject({
      plan: { currentWeekIndex: 2 },
      reviewWindow: { from: '2026-09-01', through: '2026-09-01' },
      recentDays: [
        {
          date: '2026-09-01',
          plannedWorkouts: [{ linkedActivityCount: 1 }],
          activities: [{ linkedToPlan: true }],
        },
      ],
      upcoming: [{ name: '受控稳定跑' }],
    });
    expect(JSON.stringify(context)).not.toContain('workout-secret');
    expect(JSON.stringify(context)).not.toContain('activity-secret');
  });

  it('returns null when there is no active plan', async () => {
    const { service, planExecution, coachReviewContext } = createFixture();
    planExecution.buildContext.mockResolvedValueOnce({ plan: null } as never);

    await expect(
      service.build({
        userId: 'user-1',
        type: 'MONTHLY',
        lang: 'zh',
        timezone: 'Asia/Shanghai',
        periodStart: new Date('2026-08-31T16:00:00.000Z'),
        periodEnd: new Date('2026-09-30T16:00:00.000Z'),
      }),
    ).resolves.toBeNull();
    expect(coachReviewContext.build).not.toHaveBeenCalled();
  });
});
