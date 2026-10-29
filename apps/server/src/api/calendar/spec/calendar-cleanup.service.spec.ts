import { describe, expect, it, jest } from '@jest/globals';
import { CalendarCleanupService } from '../calendar-cleanup.service';

describe('CalendarCleanupService', () => {
  it('deletes the user calendar subscriptions through the owned repository', async () => {
    const subscriptions = {
      deleteMany: jest.fn(async () => ({ count: 2 })),
    };
    const service = new CalendarCleanupService(subscriptions as never);
    const tx = { calendarSubscription: {} };

    await expect(service.deleteAllForUser('user-1', tx as never)).resolves.toEqual(
      { count: 2 },
    );
    expect(subscriptions.deleteMany).toHaveBeenCalledWith(
      { where: { userId: 'user-1' } },
      tx,
    );
  });
});
