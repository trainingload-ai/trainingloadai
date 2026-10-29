import { type NotificationKind } from '@prisma/client';

export type UpdateNotificationBodyByKeyDto = {
  userId: string;
  kind: NotificationKind;
  dedupeKey: string;
  bodyMarkdown: string | null;
};

export type UpdateNotificationBodyByKeyResultDto = {
  updated: number;
};
