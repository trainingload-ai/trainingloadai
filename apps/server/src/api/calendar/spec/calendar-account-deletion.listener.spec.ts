import { describe, expect, it, jest } from '@jest/globals';
import { ACCOUNT_DELETION_REQUESTED_EVENT } from '@/api/user/events/account-deletion.events';
import { CalendarAccountDeletionListener } from '../calendar-account-deletion.listener';

describe('CalendarAccountDeletionListener', () => {
  it('deletes calendar subscriptions through CalendarService after account deletion is requested', async () => {
    const calendar = {
      deleteAllForUser: jest.fn(async () => ({ count: 1 })),
    };
    const listener = new CalendarAccountDeletionListener(calendar as never);

    await listener.handle({ userId: 'user-1' });

    expect(calendar.deleteAllForUser).toHaveBeenCalledWith('user-1');
    expect(ACCOUNT_DELETION_REQUESTED_EVENT).toBe(
      'account.deletion.requested',
    );
  });
});
