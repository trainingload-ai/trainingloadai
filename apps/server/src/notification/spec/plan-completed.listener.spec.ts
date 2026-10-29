import { describe, expect, it, jest } from '@jest/globals';
import { PlanCompletedListener } from '../plan-completed.listener';
import { PlanCompletedEvent } from '@/api/plan/events/plan.events';
import { featureAccessSnapshot } from '@/access/feature-access.types';

function createListener(
  settings: Array<{ category: string; value: string }>,
  accessAllowed = true,
) {
  const prisma = {
    userSetting: {
      findMany: jest.fn(async () => settings),
    },
  };
  const notifications = {
    ensureNotification: jest.fn(async () => ({
      notificationId: 'notification-1',
      created: true,
    })),
  };
  const userService = {
    getPreferredLocale: jest.fn(async () => 'zh'),
  };
  const i18n = {
    t: jest.fn((key: string) => key),
  };
  const listener = new PlanCompletedListener(
    notifications as never,
    userService as never,
    i18n as never,
    { settings: () => prisma.userSetting } as never,
    {
      evaluate: jest.fn(async () =>
        featureAccessSnapshot({
          allowed: accessAllowed,
          reason: accessAllowed ? 'GRANTED' : 'PLAN_REQUIRED',
        }),
      ),
    } as never,
  );
  return { listener, notifications };
}

const REVIEW_EVENT = new PlanCompletedEvent(
  'user-1',
  'plan-1',
  'Base block',
  new Date('2026-07-01T00:00:00.000Z'),
  new Date('2026-07-28T00:00:00.000Z'),
  84,
  91,
  21,
  25,
  2,
  1,
  'UP',
);

describe('PlanCompletedListener', () => {
  it('publishes one structured notification when plan review access is enabled', async () => {
    const { listener, notifications } = createListener([
      { category: 'AI_PLAN', value: 'PLUS' },
      {
        category: 'AI_REVIEW_MODE',
        value: JSON.stringify({ planReview: true }),
      },
    ]);

    await listener.ensureCompletedPlanReviewNotification(REVIEW_EVENT);

    expect(notifications.ensureNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'REVIEW_DIGEST',
        dedupeKey: 'plan-review:plan-1',
        data: expect.objectContaining({
          type: 'PLAN',
          planId: 'plan-1',
          completionRate: 84,
        }),
      }),
    );
  });

  it('does not publish when plan reviews are disabled', async () => {
    const { listener, notifications } = createListener([
      { category: 'AI_PLAN', value: 'PRO' },
      {
        category: 'AI_REVIEW_MODE',
        value: JSON.stringify({ planReview: false }),
      },
    ]);

    await listener.ensureCompletedPlanReviewNotification(REVIEW_EVENT);

    expect(notifications.ensureNotification).not.toHaveBeenCalled();
  });

  it('does not trust a stale plan projection when feature access is denied', async () => {
    const { listener, notifications } = createListener(
      [
        { category: 'AI_PLAN', value: 'PLUS' },
        {
          category: 'AI_REVIEW_MODE',
          value: JSON.stringify({ planReview: true }),
        },
      ],
      false,
    );

    await listener.ensureCompletedPlanReviewNotification(REVIEW_EVENT);

    expect(notifications.ensureNotification).not.toHaveBeenCalled();
  });
});
