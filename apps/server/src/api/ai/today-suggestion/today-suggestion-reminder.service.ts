import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TodaySuggestionReminderResult,
  TodaySuggestionV2,
} from '@shared/ai-today-suggestion-contract';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';

function parseV2(value: unknown): TodaySuggestionV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return row.version === 2 && typeof row.suggestionId === 'string'
    ? (row as unknown as TodaySuggestionV2)
    : null;
}

@Injectable()
export class TodaySuggestionReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDomainService,
  ) {}

  async schedule(args: {
    userId: string;
    generationToken: string;
    remindAt: string;
  }): Promise<TodaySuggestionReminderResult> {
    const suggestion = await this.prisma.aiTodaySuggestion.findFirst({
      where: {
        userId: args.userId,
        generationToken: args.generationToken,
        validUntil: { gt: new Date() },
      },
    });
    if (!suggestion) throw new NotFoundException('TODAY_SUGGESTION_NOT_FOUND');
    const result = parseV2(suggestion.structuredResult);
    if (!result)
      throw new NotFoundException('TODAY_SUGGESTION_RESULT_NOT_FOUND');
    const reminderOffered = [
      result.primaryIntent,
      ...result.secondaryIntents,
    ].some((intent) => intent?.type === 'SCHEDULE_REMINDER');
    if (!reminderOffered) {
      throw new UnprocessableEntityException(
        'TODAY_SUGGESTION_REMINDER_NOT_OFFERED',
      );
    }
    const remindAt = new Date(args.remindAt);
    const minimum = Date.now() + 5 * 60_000;
    if (
      Number.isNaN(remindAt.getTime()) ||
      remindAt.getTime() < minimum ||
      !suggestion.validUntil ||
      remindAt.getTime() >= suggestion.validUntil.getTime()
    ) {
      throw new UnprocessableEntityException(
        'TODAY_SUGGESTION_REMINDER_TIME_INVALID',
      );
    }
    const targetIntent =
      result.primaryIntent?.type === 'SCHEDULE_REMINDER'
        ? (result.secondaryIntents.find(
            (intent) => intent.type !== 'SCHEDULE_REMINDER',
          ) ?? null)
        : result.primaryIntent;
    const scheduled = await this.notifications.scheduleTrainingReminder({
      userId: args.userId,
      generationToken: args.generationToken,
      title: result.headline,
      bodyMarkdown: result.summary,
      visibleAt: remindAt,
      data: JSON.parse(
        JSON.stringify({
          generationToken: args.generationToken,
          intent: targetIntent,
        }),
      ) as Prisma.InputJsonValue,
    });
    await this.prisma.todaySuggestionEngagementState.upsert({
      where: { userId: args.userId },
      create: {
        userId: args.userId,
        generationToken: args.generationToken,
        continuityHash: suggestion.continuityHash,
        suggestionDate: suggestion.date,
        reminderId: scheduled.notificationId,
      },
      update: { reminderId: scheduled.notificationId },
    });
    return {
      reminderId: scheduled.notificationId,
      remindAt: scheduled.visibleAt.toISOString(),
    };
  }

  async cancel(args: { userId: string; generationToken: string }) {
    const suggestion = await this.prisma.aiTodaySuggestion.findFirst({
      where: { userId: args.userId, generationToken: args.generationToken },
      select: { id: true },
    });
    if (!suggestion) throw new NotFoundException('TODAY_SUGGESTION_NOT_FOUND');
    const result = await this.notifications.cancelTrainingReminder(args);
    await this.prisma.todaySuggestionEngagementState.updateMany({
      where: { userId: args.userId, generationToken: args.generationToken },
      data: { reminderId: null },
    });
    return result;
  }
}
