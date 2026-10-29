import { Prisma, type NotificationKind } from '@prisma/client';

export type EnsureNotificationDto = {
  userId: string;
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  bodyMarkdown?: string | null;
  data?: Prisma.InputJsonValue | null;
  digestId?: string | null;
};

export type EnsureNotificationResultDto = {
  notificationId: string;
  created: boolean;
};
