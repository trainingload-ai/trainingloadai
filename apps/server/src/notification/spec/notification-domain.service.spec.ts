import { describe, expect, it, jest } from '@jest/globals';
import { type NotificationKind } from '@prisma/client';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { NotificationDomainService } from '../notification-domain.service';
import { NotificationRepository } from '../persistence/notification.repository';

describe('NotificationDomainService', () => {
  const kind: NotificationKind = 'REVIEW_DIGEST';

  function createService() {
    const prisma = {
      notification: {
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        count: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
      $transaction: jest.fn(async (queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    };

    return {
      prisma,
      service: new NotificationDomainService(
        new NotificationRepository(prisma as never),
      ),
    };
  }

  it('returns an existing notification without creating a duplicate', async () => {
    const { prisma, service } = createService();
    prisma.notification.findUnique.mockResolvedValueOnce({ id: 'notif-1' });

    await expect(
      service.ensureNotification({
        userId: 'user-1',
        kind,
        dedupeKey: ' digest-1 ',
        title: 'Ready',
      }),
    ).resolves.toEqual({ notificationId: 'notif-1', created: false });

    expect(prisma.notification.findUnique).toHaveBeenCalledWith({
      where: {
        userId_kind_dedupeKey: {
          userId: 'user-1',
          kind,
          dedupeKey: 'digest-1',
        },
      },
      select: { id: true },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates a notification with optional payload fields when no existing row is found', async () => {
    const { prisma, service } = createService();
    prisma.notification.findUnique.mockResolvedValueOnce(null);
    prisma.notification.create.mockResolvedValueOnce({ id: 'notif-2' });

    await expect(
      service.ensureNotification({
        userId: 'user-1',
        kind,
        dedupeKey: 'digest-2',
        title: 'Digest ready',
        bodyMarkdown: 'Body',
        data: { digest: true },
        digestId: 'digest-id',
      }),
    ).resolves.toEqual({ notificationId: 'notif-2', created: true });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        kind,
        dedupeKey: 'digest-2',
        title: 'Digest ready',
        bodyMarkdown: 'Body',
        data: { digest: true },
        digestId: 'digest-id',
      },
      select: { id: true },
    });
  });

  it('recovers from unique constraint races by returning the concurrently created row', async () => {
    const { prisma, service } = createService();
    prisma.notification.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'notif-race' });
    prisma.notification.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.ensureNotification({
        userId: 'user-1',
        kind,
        dedupeKey: 'digest-race',
        title: 'Race',
      }),
    ).resolves.toEqual({ notificationId: 'notif-race', created: false });

    expect(prisma.notification.findUnique).toHaveBeenCalledTimes(2);
  });

  it('throws when dedupeKey is blank', async () => {
    const { prisma, service } = createService();

    await expect(
      service.ensureNotification({
        userId: 'user-1',
        kind,
        dedupeKey: '   ',
        title: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(BusinessException);

    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('updates body markdown by dedupe key and ignores blank keys', async () => {
    const { prisma, service } = createService();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 2 });

    await expect(
      service.updateBodyMarkdownByKey({
        userId: 'user-1',
        kind,
        dedupeKey: ' digest ',
        bodyMarkdown: null,
      }),
    ).resolves.toEqual({ updated: 2 });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', kind, dedupeKey: 'digest' },
      data: { bodyMarkdown: undefined },
    });

    await expect(
      service.updateBodyMarkdownByKey({
        userId: 'user-1',
        kind,
        dedupeKey: '',
        bodyMarkdown: 'Body',
      }),
    ).resolves.toEqual({ updated: 0 });
  });

  it('updates review digest notification bodies by digestId', async () => {
    const { prisma, service } = createService();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.updateBodyMarkdownByDigestId('digest-1', 'Updated'),
    ).resolves.toEqual({ count: 1 });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { digestId: 'digest-1', kind: 'REVIEW_DIGEST' },
      data: { bodyMarkdown: 'Updated' },
    });
  });

  it('marks unread notifications as read by dedupe key prefix', async () => {
    const { prisma, service } = createService();
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 2 });

    await expect(
      service.markReadByDedupePrefix({
        userId: 'user-1',
        kind,
        dedupeKeyPrefix: ' strava-export-failed:42: ',
      }),
    ).resolves.toEqual({ updated: 2 });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        kind,
        dedupeKey: { startsWith: 'strava-export-failed:42:' },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('lists and counts only visible, non-cancelled notifications', async () => {
    const { prisma, service } = createService();
    prisma.notification.findMany.mockResolvedValueOnce([]);
    prisma.notification.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await service.list({ userId: 'user-1', unread: true });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          visibleAt: { lte: expect.any(Date) },
          cancelledAt: null,
          readAt: null,
        }),
      }),
    );
    expect(prisma.notification.count).toHaveBeenLastCalledWith({
      where: {
        userId: 'user-1',
        readAt: null,
        visibleAt: { lte: expect.any(Date) },
        cancelledAt: null,
      },
    });
  });

  it('reschedules one reminder per generation through its dedupe key', async () => {
    const { prisma, service } = createService();
    const visibleAt = new Date('2026-10-28T09:00:00.000Z');
    prisma.notification.upsert.mockResolvedValueOnce({
      id: 'reminder-1',
      visibleAt,
    });

    await expect(
      service.scheduleTrainingReminder({
        userId: 'user-1',
        generationToken: 'generation-1',
        title: 'Easy run',
        bodyMarkdown: 'Start easy.',
        visibleAt,
        data: { intent: { type: 'OPEN_TODAY_WORKOUT' } },
      }),
    ).resolves.toEqual({ notificationId: 'reminder-1', visibleAt });

    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_kind_dedupeKey: {
            userId: 'user-1',
            kind: 'TRAINING_REMINDER',
            dedupeKey: 'today-suggestion:generation-1',
          },
        },
        update: expect.objectContaining({
          visibleAt,
          cancelledAt: null,
          readAt: null,
        }),
      }),
    );
  });
});
