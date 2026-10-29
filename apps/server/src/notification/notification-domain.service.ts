import { Injectable } from '@nestjs/common';
import { type NotificationKind, type Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type {
  EnsureNotificationDto,
  EnsureNotificationResultDto,
} from './dto/ensure-notification.dto';
import type {
  UpdateNotificationBodyByKeyDto,
  UpdateNotificationBodyByKeyResultDto,
} from './dto/update-notification-body.dto';
import { NotificationRepository } from './persistence/notification.repository';

@Injectable()
export class NotificationDomainService {
  constructor(private readonly notifications: NotificationRepository) {}

  /**
   * 强幂等创建通知：基于 (userId, kind, dedupeKey) 唯一约束。
   * - 若已存在则返回已有通知 id
   * - 若不存在则创建并返回新通知 id
   */
  async ensureNotification(
    args: EnsureNotificationDto,
    tx?: Prisma.TransactionClient,
  ): Promise<EnsureNotificationResultDto> {
    const dedupeKey = String(args.dedupeKey ?? '').trim();
    if (!dedupeKey) {
      const i18n = I18nContext.current();
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          i18n?.t('common.error.notification_dedupe_key_required', {
            lang: i18n.lang,
          }) ?? 'dedupeKey is required',
      });
    }

    const where = {
      userId_kind_dedupeKey: {
        userId: args.userId,
        kind: args.kind,
        dedupeKey,
      },
    } as Prisma.NotificationWhereUniqueInput;

    if (tx) {
      const existing = await this.notifications.findUnique(
        { where, select: { id: true } },
        tx,
      );
      const row = await this.notifications.upsert(
        {
          where,
          update: {},
          create: {
            userId: args.userId,
            kind: args.kind,
            dedupeKey,
            title: args.title,
            bodyMarkdown: args.bodyMarkdown ?? undefined,
            data: args.data ?? undefined,
            digestId: args.digestId ?? undefined,
          },
          select: { id: true },
        },
        tx,
      );
      return { notificationId: row.id, created: !existing };
    }

    const existing = await this.notifications.findUnique({
      where,
      select: { id: true },
    });
    if (existing?.id) return { notificationId: existing.id, created: false };

    try {
      const row = await this.notifications.create({
        data: {
          userId: args.userId,
          kind: args.kind,
          dedupeKey,
          title: args.title,
          bodyMarkdown: args.bodyMarkdown ?? undefined,
          data: args.data ?? undefined,
          digestId: args.digestId ?? undefined,
        } satisfies Prisma.NotificationUncheckedCreateInput,
        select: { id: true },
      });
      return { notificationId: row.id, created: true };
    } catch (e) {
      // 并发下可能同时 create，依赖唯一约束兜底；冲突则读取既有记录返回。
      const code =
        typeof e === 'object' && e && 'code' in e
          ? (e as { code?: unknown }).code
          : null;
      if (code === 'P2002') {
        const row = await this.notifications.findUnique({
          where,
          select: { id: true },
        });
        if (row?.id) return { notificationId: row.id, created: false };
      }
      throw e;
    }
  }

  /**
   * 通过 (userId, kind, dedupeKey) 更新通知正文（不要求通知一定存在）。
   */
  async updateBodyMarkdownByKey(
    args: UpdateNotificationBodyByKeyDto,
  ): Promise<UpdateNotificationBodyByKeyResultDto> {
    const dedupeKey = String(args.dedupeKey ?? '').trim();
    if (!dedupeKey) return { updated: 0 };
    const row = await this.notifications.updateMany({
      where: { userId: args.userId, kind: args.kind, dedupeKey },
      data: { bodyMarkdown: args.bodyMarkdown ?? undefined },
    });
    return { updated: row.count };
  }

  async updateBodyMarkdownByDigestId(digestId: string, bodyMarkdown: string) {
    return this.notifications.updateMany({
      where: { digestId, kind: 'REVIEW_DIGEST' },
      data: { bodyMarkdown },
    });
  }

  async markReadByDedupePrefix(args: {
    userId: string;
    kind: NotificationKind;
    dedupeKeyPrefix: string;
  }) {
    const prefix = String(args.dedupeKeyPrefix ?? '').trim();
    if (!prefix) return { updated: 0 };
    const row = await this.notifications.updateMany({
      where: {
        userId: args.userId,
        kind: args.kind,
        dedupeKey: { startsWith: prefix },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: row.count };
  }

  countCreatedBetween(start: Date, end: Date) {
    return this.notifications.count({
      where: { createdAt: { gte: start, lt: end } },
    });
  }

  async list(args: {
    userId: string;
    offset?: number;
    limit?: number;
    unread?: boolean;
  }) {
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)));
    const now = new Date();
    const where = {
      userId: args.userId,
      visibleAt: { lte: now },
      cancelledAt: null,
      ...(args.unread ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await this.notifications.transaction([
      this.notifications.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          kind: true,
          title: true,
          bodyMarkdown: true,
          data: true,
          readAt: true,
          createdAt: true,
          digestId: true,
        },
      }),
      this.notifications.count({ where }),
      this.notifications.count({
        where: {
          userId: args.userId,
          readAt: null,
          visibleAt: { lte: now },
          cancelledAt: null,
        },
      }),
    ]);
    return { items, total, unreadCount, offset, limit };
  }

  async markRead(args: { userId: string; id: string }) {
    const row = await this.notifications.updateMany({
      where: {
        id: args.id,
        userId: args.userId,
        readAt: null,
        visibleAt: { lte: new Date() },
        cancelledAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: row.count };
  }

  async markAllRead(args: { userId: string }) {
    const row = await this.notifications.updateMany({
      where: {
        userId: args.userId,
        readAt: null,
        visibleAt: { lte: new Date() },
        cancelledAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: row.count };
  }

  async scheduleTrainingReminder(args: {
    userId: string;
    generationToken: string;
    title: string;
    bodyMarkdown: string;
    visibleAt: Date;
    data: Prisma.InputJsonValue;
  }) {
    const dedupeKey = `today-suggestion:${args.generationToken}`;
    const row = await this.notifications.upsert({
      where: {
        userId_kind_dedupeKey: {
          userId: args.userId,
          kind: 'TRAINING_REMINDER',
          dedupeKey,
        },
      },
      create: {
        userId: args.userId,
        kind: 'TRAINING_REMINDER',
        dedupeKey,
        title: args.title,
        bodyMarkdown: args.bodyMarkdown,
        data: args.data,
        visibleAt: args.visibleAt,
      },
      update: {
        title: args.title,
        bodyMarkdown: args.bodyMarkdown,
        data: args.data,
        visibleAt: args.visibleAt,
        cancelledAt: null,
        readAt: null,
      },
      select: { id: true, visibleAt: true },
    });
    return { notificationId: row.id, visibleAt: row.visibleAt };
  }

  async cancelTrainingReminder(args: {
    userId: string;
    generationToken: string;
  }) {
    const row = await this.notifications.updateMany({
      where: {
        userId: args.userId,
        kind: 'TRAINING_REMINDER',
        dedupeKey: `today-suggestion:${args.generationToken}`,
        cancelledAt: null,
      },
      data: { cancelledAt: new Date() },
    });
    return { cancelled: row.count > 0 };
  }

  async cancelFutureTrainingReminderById(
    args: { userId: string; notificationId: string; now: Date },
    tx: Prisma.TransactionClient,
  ) {
    const row = await this.notifications.updateMany(
      {
        where: {
          id: args.notificationId,
          userId: args.userId,
          kind: 'TRAINING_REMINDER',
          cancelledAt: null,
          visibleAt: { gt: args.now },
        },
        data: { cancelledAt: args.now },
      },
      tx,
    );
    return { cancelled: row.count > 0 };
  }
}
