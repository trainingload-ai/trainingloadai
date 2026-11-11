import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  TodaySuggestionFeedback,
  TodaySuggestionInteractionInput,
} from '@shared/ai-today-suggestion-contract';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { isTodaySuggestionFeedback } from '@shared/ai-today-suggestion-contract';
import { todaySuggestionValidUntil } from './today-suggestion-time';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';

type InteractionArgs = {
  userId: string;
  generationToken: string;
  input: TodaySuggestionInteractionInput;
};

function offeredIntentTypes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new Set<string>();
  }
  const row = value as Record<string, unknown>;
  const primary =
    row.primaryIntent && typeof row.primaryIntent === 'object'
      ? String((row.primaryIntent as Record<string, unknown>).type ?? '')
      : '';
  const secondary = Array.isArray(row.secondaryIntents)
    ? row.secondaryIntents.map((intent) =>
        intent && typeof intent === 'object'
          ? String((intent as Record<string, unknown>).type ?? '')
          : '',
      )
    : [];
  return new Set([primary, ...secondary].filter(Boolean));
}

@Injectable()
export class TodaySuggestionEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDomainService,
  ) {}

  async feedbackForDate(userId: string, date: string) {
    const state = await this.prisma.todaySuggestionEngagementState.findUnique({
      where: { userId },
    });
    const feedback = state?.resolution?.startsWith('FEEDBACK:')
      ? state.resolution.slice('FEEDBACK:'.length)
      : null;
    if (
      state?.suggestionDate !== date ||
      !state.resolvedAt ||
      !isTodaySuggestionFeedback(feedback) ||
      (feedback === 'DATA_PENDING' &&
        state.quietUntil &&
        state.quietUntil.getTime() <= Date.now())
    )
      return null;
    return {
      feedback,
      recordedAt: state.resolvedAt.toISOString(),
      quietUntil: state.quietUntil?.toISOString() ?? null,
    };
  }

  async rollover(args: {
    userId: string;
    generationToken: string;
    continuityHash: string;
    suggestionDate: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(
        tx,
        `today-advice-feedback:${args.userId}`,
      );
      const current = await tx.todaySuggestionEngagementState.findUnique({
        where: { userId: args.userId },
      });
      if (current?.generationToken === args.generationToken) return current;
      if (current && current.suggestionDate > args.suggestionDate)
        return current;
      const continuesUnresolved = Boolean(
        current?.firstPresentedAt &&
        !current.resolvedAt &&
        current.continuityHash === args.continuityHash,
      );
      const preserveFeedback =
        current?.suggestionDate === args.suggestionDate &&
        current?.resolution?.startsWith('FEEDBACK:');
      if (current?.reminderId) {
        const now = new Date();
        await this.notifications.cancelFutureTrainingReminderById(
          {
            notificationId: current.reminderId,
            userId: args.userId,
            now,
          },
          tx,
        );
      }
      return tx.todaySuggestionEngagementState.upsert({
        where: { userId: args.userId },
        create: {
          userId: args.userId,
          generationToken: args.generationToken,
          continuityHash: args.continuityHash,
          suggestionDate: args.suggestionDate,
        },
        update: {
          generationToken: args.generationToken,
          continuityHash: args.continuityHash,
          suggestionDate: args.suggestionDate,
          firstPresentedAt: null,
          lastPresentedAt: null,
          resolvedAt: preserveFeedback ? current.resolvedAt : null,
          resolution: preserveFeedback ? current.resolution : null,
          selectedIntent: null,
          quietUntil:
            preserveFeedback || continuesUnresolved
              ? current?.quietUntil
              : null,
          unresolvedStreak: continuesUnresolved
            ? Math.min(2, (current?.unresolvedStreak ?? 0) + 1)
            : 0,
          workoutId: continuesUnresolved ? current?.workoutId : null,
          workoutActionId: continuesUnresolved
            ? current?.workoutActionId
            : null,
          reminderId: null,
        },
      });
    });
  }

  async recordInteraction(args: InteractionArgs) {
    try {
      return await this.recordCurrentInteraction(args);
    } catch (error) {
      // A newer generation may replace the engagement after the read.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('TODAY_SUGGESTION_NOT_FOUND');
      }
      throw error;
    }
  }

  private async recordCurrentInteraction(args: InteractionArgs) {
    const suggestion = await this.prisma.aiTodaySuggestion.findFirst({
      where: {
        userId: args.userId,
        generationToken: args.generationToken,
        validUntil: { gt: new Date() },
      },
      select: {
        date: true,
        continuityHash: true,
        validUntil: true,
        structuredResult: true,
        keyContext: true,
      },
    });
    if (!suggestion) throw new NotFoundException('TODAY_SUGGESTION_NOT_FOUND');
    const now = new Date();
    if (args.input.kind === 'PRESENTED') {
      const current =
        await this.prisma.todaySuggestionEngagementState.findUnique({
          where: { userId: args.userId },
          select: { firstPresentedAt: true },
        });
      const state = await this.prisma.todaySuggestionEngagementState.update({
        where: { userId: args.userId, generationToken: args.generationToken },
        data: {
          firstPresentedAt: current?.firstPresentedAt ?? now,
          lastPresentedAt: now,
        },
      });
      return this.publicState(state);
    }
    if (args.input.kind === 'INTENT_SELECTED') {
      if (
        !offeredIntentTypes(suggestion.structuredResult).has(
          args.input.intentType,
        )
      ) {
        throw new NotFoundException('TODAY_SUGGESTION_INTENT_NOT_OFFERED');
      }
      const current =
        await this.prisma.todaySuggestionEngagementState.findUnique({
          where: { userId: args.userId },
        });
      const preserveFeedback = current?.resolution?.startsWith('FEEDBACK:');
      const state = await this.prisma.todaySuggestionEngagementState.update({
        where: { userId: args.userId, generationToken: args.generationToken },
        data: {
          selectedIntent: args.input.intentType,
          resolvedAt: preserveFeedback ? current.resolvedAt : now,
          resolution: preserveFeedback
            ? current.resolution
            : `INTENT:${args.input.intentType}`,
        },
      });
      return this.publicState(state);
    }
    const quietUntil = this.feedbackQuietUntil(
      args.input.feedback,
      todaySuggestionValidUntil(
        suggestion.date,
        this.storedTimezone(suggestion.keyContext),
      ),
      now,
    );
    const state = await this.prisma.todaySuggestionEngagementState.update({
      where: { userId: args.userId, generationToken: args.generationToken },
      data: {
        resolvedAt: now,
        resolution: `FEEDBACK:${args.input.feedback}`,
        quietUntil,
      },
    });
    return this.publicState(state);
  }

  private feedbackQuietUntil(
    feedback: TodaySuggestionFeedback,
    validUntil: Date | null,
    now: Date,
  ) {
    if (feedback === 'REST_TODAY' || feedback === 'LATER') {
      return validUntil ?? new Date(now.getTime() + 12 * 60 * 60_000);
    }
    if (feedback === 'DATA_PENDING') {
      return new Date(now.getTime() + 2 * 60 * 60_000);
    }
    return null;
  }

  private storedTimezone(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const timezone = (value as Record<string, unknown>).timezone;
    return typeof timezone === 'string' ? timezone : null;
  }

  private publicState(state: {
    generationToken: string | null;
    firstPresentedAt: Date | null;
    lastPresentedAt: Date | null;
    resolvedAt: Date | null;
    resolution: string | null;
    selectedIntent: string | null;
    unresolvedStreak: number;
    quietUntil: Date | null;
  }) {
    return {
      generationToken: state.generationToken,
      firstPresentedAt: state.firstPresentedAt,
      lastPresentedAt: state.lastPresentedAt,
      resolvedAt: state.resolvedAt,
      resolution: state.resolution,
      selectedIntent: state.selectedIntent,
      unresolvedStreak: state.unresolvedStreak,
      quietUntil: state.quietUntil,
    };
  }
}
