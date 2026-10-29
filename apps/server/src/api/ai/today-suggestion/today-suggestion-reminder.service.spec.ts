import { TodaySuggestionReminderService } from './today-suggestion-reminder.service';

describe('TodaySuggestionReminderService', () => {
  afterEach(() => jest.useRealTimers());

  function createService(structuredResult: Record<string, unknown>) {
    const prisma = {
      aiTodaySuggestion: {
        findFirst: jest.fn(async () => ({
          locale: 'en',
          date: '2026-10-28',
          continuityHash: 'continuity-1',
          validUntil: new Date('2026-10-28T16:00:00.000Z'),
          structuredResult,
        })),
      },
      todaySuggestionEngagementState: {
        upsert: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const notifications = {
      scheduleTrainingReminder: jest.fn(async ({ visibleAt }) => ({
        notificationId: 'reminder-1',
        visibleAt,
      })),
      cancelTrainingReminder: jest.fn(async () => ({ cancelled: true })),
    };
    return {
      service: new TodaySuggestionReminderService(
        prisma as never,
        notifications as never,
      ),
      prisma,
      notifications,
    };
  }

  const baseResult = {
    version: 2,
    suggestionId: 'generation-1',
    headline: 'Move today',
    summary: 'Keep it easy.',
    primaryIntent: { type: 'OPEN_IMPORT' },
    secondaryIntents: [{ type: 'SCHEDULE_REMINDER' }],
  };

  it('derives reminder content and target intent from the persisted result', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
    const { service, notifications } = createService(baseResult);
    await expect(
      service.schedule({
        userId: 'user-1',
        generationToken: 'generation-1',
        remindAt: '2026-10-28T02:00:00.000Z',
      }),
    ).resolves.toEqual({
      reminderId: 'reminder-1',
      remindAt: '2026-10-28T02:00:00.000Z',
    });
    expect(notifications.scheduleTrainingReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Move today',
        bodyMarkdown: 'Keep it easy.',
        data: {
          generationToken: 'generation-1',
          intent: { type: 'OPEN_IMPORT' },
        },
      }),
    );
  });

  it('rejects reminders not offered by policy and invalid time windows', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
    const withoutReminder = createService({
      ...baseResult,
      secondaryIntents: [],
    });
    await expect(
      withoutReminder.service.schedule({
        userId: 'user-1',
        generationToken: 'generation-1',
        remindAt: '2026-10-28T02:00:00.000Z',
      }),
    ).rejects.toThrow('TODAY_SUGGESTION_REMINDER_NOT_OFFERED');

    const { service } = createService(baseResult);
    await expect(
      service.schedule({
        userId: 'user-1',
        generationToken: 'generation-1',
        remindAt: '2026-10-28T01:04:00.000Z',
      }),
    ).rejects.toThrow('TODAY_SUGGESTION_REMINDER_TIME_INVALID');
  });
});
