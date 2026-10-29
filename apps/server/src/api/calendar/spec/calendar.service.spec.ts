import { CalendarService } from '../calendar.service';
import { describe, expect, it, jest } from '@jest/globals';

const asyncMock = (value: unknown) =>
  jest.fn<() => Promise<unknown>>().mockResolvedValue(value);

describe('CalendarService competition event feed', () => {
  const subscription = {
    id: 'subscription-1',
    userId: 'user-1',
    token: 'private-token',
    scope: 'TRAINING_CALENDAR',
    revokedAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
  };

  function setup(scope = 'TRAINING_CALENDAR') {
    const prisma = {
      calendarSubscription: {
        findFirst: asyncMock({ ...subscription, scope }),
        findUnique: asyncMock({ ...subscription, scope }),
        create: asyncMock({ ...subscription, scope }),
        update: asyncMock({ ...subscription, scope }),
        updateMany: asyncMock({ count: 1 }),
      },
      plan: { findMany: asyncMock([]) },
      competitionEvent: {
        findMany: asyncMock([
          {
            id: 'race-1',
            title: 'Shanghai Marathon',
            sportType: 'RUN',
            distanceMeters: 42195,
            startDate: new Date('2026-11-29T00:00:00Z'),
            endDate: null,
            startTimeMinute: null,
            timezone: null,
            importance: 'CRITICAL',
            goalType: 'TARGET_TIME',
            targetTimeSeconds: 12_600,
            location: 'Shanghai, China',
            notes: 'A-race',
            status: 'PLANNED',
            version: 3,
            updatedAt: new Date('2026-07-16T08:00:00Z'),
          },
        ]),
      },
    };
    return {
      prisma,
      service: new CalendarService(
        { findCalendarFeedPlans: async () => [] } as never,
        prisma.calendarSubscription as never,
        {
          findCalendarFeedEvents: (args: unknown) =>
            (
              prisma.competitionEvent.findMany as (
                args: unknown,
              ) => Promise<unknown>
            )(args),
        } as never,
      ),
    };
  }

  it('creates the new training-calendar scope without upgrading legacy tokens', async () => {
    const { prisma, service } = setup();
    await service.getOrCreateSubscription('user-1');
    expect(prisma.calendarSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: 'TRAINING_CALENDAR' }),
      }),
    );
  });

  it('emits a stable versioned all-day competition event', async () => {
    const { prisma, service } = setup();
    const feed = await service.buildTrainingPlanFeed('private-token');
    expect(feed).toContain('UID:competition-event-race-1@trainingload.ai');
    expect(feed).toContain('SEQUENCE:3');
    expect(feed).toContain('DTSTART;VALUE=DATE:20261129');
    expect(feed).toContain('DTEND;VALUE=DATE:20261130');
    expect(feed).toContain('STATUS:CONFIRMED');
    expect(prisma.competitionEvent.findMany).toHaveBeenCalledWith('user-1');
    expect(feed).toContain('LOCATION:Shanghai\\, China');
  });

  it('keeps legacy ACTIVE_PLAN feeds plan-only', async () => {
    const { prisma, service } = setup('ACTIVE_PLAN');
    const feed = await service.buildTrainingPlanFeed('private-token');
    expect(prisma.competitionEvent.findMany).not.toHaveBeenCalled();
    expect(feed).not.toContain('competition-event-');
  });

  it('keeps a timed race on its authoritative local date and timezone', async () => {
    const { prisma, service } = setup();
    prisma.competitionEvent.findMany.mockResolvedValue([
      {
        id: 'timed-race',
        title: 'Tokyo race',
        sportType: 'RUN',
        distanceMeters: 10000,
        startDate: new Date('2026-03-29T00:00:00Z'),
        endDate: null,
        startTimeMinute: 7 * 60 + 30,
        timezone: 'Asia/Tokyo',
        importance: 'HIGH',
        goalType: 'PERFORMANCE',
        targetTimeSeconds: null,
        location: null,
        notes: null,
        status: 'PLANNED',
        version: 1,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const feed = await service.buildTrainingPlanFeed('private-token');
    expect(feed).toContain('DTSTART;TZID=Asia/Tokyo:20260329T073000');
    expect(feed).toContain('DTEND;TZID=Asia/Tokyo:20260330T073000');
  });

  it('escapes special characters and folds UTF-8 content at 75 octets', async () => {
    const { prisma, service } = setup();
    prisma.competitionEvent.findMany.mockResolvedValue([
      {
        id: 'unicode-race',
        title: `上海，测试;赛事\\${'超长赛事名称'.repeat(12)}`,
        sportType: 'RUN',
        distanceMeters: 42195,
        startDate: new Date('2026-11-29T00:00:00Z'),
        endDate: null,
        startTimeMinute: null,
        timezone: null,
        importance: 'CRITICAL',
        goalType: 'FINISH',
        targetTimeSeconds: null,
        location: '上海, 中国;起点',
        notes: '第一行\n第二行',
        status: 'PLANNED',
        version: 1,
        updatedAt: new Date('2026-07-16T08:00:00Z'),
      },
    ]);
    const feed = await service.buildTrainingPlanFeed('private-token');
    expect(feed).toContain('LOCATION:上海\\, 中国\\;起点');
    expect(feed).toContain('\\n');
    for (const line of feed.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
