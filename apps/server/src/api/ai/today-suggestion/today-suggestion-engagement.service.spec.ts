import { TodaySuggestionEngagementService } from './today-suggestion-engagement.service';

describe('TodaySuggestionEngagementService', () => {
  function harness() {
    let state: Record<string, any> | null = {
      userId: 'user-1',
      generationToken: 'generation-1',
      continuityHash: 'continuity-1',
      suggestionDate: '2026-10-28',
      firstPresentedAt: null,
      lastPresentedAt: null,
      resolvedAt: null,
      resolution: null,
      selectedIntent: null,
      unresolvedStreak: 0,
      quietUntil: null,
      workoutId: null,
      workoutActionId: null,
      reminderId: null,
    };
    const table = {
      findUnique: jest.fn(async () => (state ? { ...state } : null)),
      upsert: jest.fn(async ({ create, update }) => {
        state = state ? { ...state, ...update } : { ...create };
        return { ...state };
      }),
      update: jest.fn(async ({ data }) => {
        state = { ...state, ...data };
        return { ...state };
      }),
    };
    const cancelFutureTrainingReminderById = jest.fn(async () => ({
      cancelled: true,
    }));
    const notifications = { cancelFutureTrainingReminderById };
    const prisma = {
      todaySuggestionEngagementState: table,
      aiTodaySuggestion: {
        findFirst: jest.fn(async () => ({
          date: '2026-10-28',
          continuityHash: 'continuity-1',
          validUntil: new Date('2026-10-28T16:00:00.000Z'),
          structuredResult: {
            primaryIntent: { type: 'OPEN_IMPORT' },
            secondaryIntents: [{ type: 'SCHEDULE_REMINDER' }],
          },
        })),
      },
      $transaction: jest.fn(async (callback) =>
        callback({
          todaySuggestionEngagementState: table,
        }),
      ),
    };
    return {
      service: new TodaySuggestionEngagementService(
        prisma as never,
        notifications as never,
      ),
      prisma,
      table,
      cancelFutureTrainingReminderById,
      getState: () => state,
      setState: (next: Record<string, any>) => {
        state = next;
      },
    };
  }

  afterEach(() => jest.useRealTimers());

  it('records PRESENTED idempotently without counting page refreshes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
    const { service, getState } = harness();
    await service.recordInteraction({
      userId: 'user-1',
      generationToken: 'generation-1',
      input: { kind: 'PRESENTED' },
    });
    const first = getState()?.firstPresentedAt;

    jest.setSystemTime(new Date('2026-10-28T01:05:00.000Z'));
    await service.recordInteraction({
      userId: 'user-1',
      generationToken: 'generation-1',
      input: { kind: 'PRESENTED' },
    });

    expect(getState()?.firstPresentedAt).toEqual(first);
    expect(getState()?.lastPresentedAt).toEqual(
      new Date('2026-10-28T01:05:00.000Z'),
    );
    expect(getState()?.unresolvedStreak).toBe(0);
  });

  it('increments continuity only after a prior suggestion was actually presented', async () => {
    const { service, table, setState } = harness();
    setState({
      userId: 'user-1',
      generationToken: 'old',
      continuityHash: 'same',
      firstPresentedAt: null,
      resolvedAt: null,
      unresolvedStreak: 2,
    });
    await service.rollover({
      userId: 'user-1',
      generationToken: 'new-1',
      continuityHash: 'same',
      suggestionDate: '2026-10-29',
    });
    expect(table.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ unresolvedStreak: 0 }),
      }),
    );

    setState({
      userId: 'user-1',
      generationToken: 'old',
      continuityHash: 'same',
      firstPresentedAt: new Date(),
      resolvedAt: null,
      unresolvedStreak: 0,
      quietUntil: null,
    });
    await service.rollover({
      userId: 'user-1',
      generationToken: 'new-2',
      continuityHash: 'same',
      suggestionDate: '2026-10-30',
    });
    expect(table.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ unresolvedStreak: 1 }),
      }),
    );
  });

  it('cancels a future reminder when a new generation supersedes it', async () => {
    const { service, table, cancelFutureTrainingReminderById, setState } =
      harness();
    setState({
      userId: 'user-1',
      generationToken: 'old',
      continuityHash: 'old-facts',
      reminderId: 'reminder-1',
      firstPresentedAt: new Date(),
      resolvedAt: null,
      unresolvedStreak: 0,
    });

    await service.rollover({
      userId: 'user-1',
      generationToken: 'new',
      continuityHash: 'new-facts',
      suggestionDate: '2026-10-29',
    });

    expect(cancelFutureTrainingReminderById).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'reminder-1',
        userId: 'user-1',
      }),
      expect.any(Object),
    );
    expect(table.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ reminderId: null }),
      }),
    );
  });

  it('rejects forged selected intents that were not delivered', async () => {
    const { service } = harness();
    await expect(
      service.recordInteraction({
        userId: 'user-1',
        generationToken: 'generation-1',
        input: { kind: 'INTENT_SELECTED', intentType: 'OPEN_DECISION' },
      }),
    ).rejects.toThrow('TODAY_SUGGESTION_INTENT_NOT_OFFERED');
  });

  it('sets a quiet period for explicit rest and later feedback', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
    const { service, getState } = harness();
    await service.recordInteraction({
      userId: 'user-1',
      generationToken: 'generation-1',
      input: { kind: 'FEEDBACK', feedback: 'REST_TODAY' },
    });
    expect(getState()?.resolution).toBe('FEEDBACK:REST_TODAY');
    expect(getState()?.quietUntil).toEqual(
      new Date('2026-10-28T16:00:00.000Z'),
    );
  });
});
