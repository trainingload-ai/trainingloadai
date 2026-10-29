import { Injectable } from '@nestjs/common';
import { AiCoachMessageRole, AiCoachSessionType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { buildStoredCoachUiMessageEnvelope } from './core/coach-history-messages';
import {
  serializePublicDemoText,
  type PublicDemoLocalizedText,
} from '@/public-demo/public-demo-localized-text';

export type CuratedCoachConversation = {
  id: string;
  lang: string;
  title: PublicDemoLocalizedText;
  occurredAt: Date;
  messages: Array<{
    role: 'USER' | 'ASSISTANT';
    content: PublicDemoLocalizedText;
  }>;
};

/** AI capability-owned write API for pre-reviewed, non-model conversations. */
@Injectable()
export class CuratedCoachConversationWriterService {
  constructor(private readonly prisma: PrismaService) {}

  async replacePublicDemoConversations(args: {
    userId: string;
    conversations: CuratedCoachConversation[];
  }): Promise<{ sessionCount: number; messageCount: number }> {
    const ids = new Set<string>();
    for (const conversation of args.conversations) {
      if (!conversation.id.startsWith('demo-') || conversation.id.length > 64) {
        throw new Error(
          `invalid curated Demo conversation id: ${conversation.id}`,
        );
      }
      if (ids.has(conversation.id)) {
        throw new Error(
          `duplicate curated Demo conversation id: ${conversation.id}`,
        );
      }
      ids.add(conversation.id);
      if (
        !conversation.title.zh.trim() ||
        !conversation.title.en.trim() ||
        conversation.messages.length < 2
      ) {
        throw new Error(
          `incomplete curated Demo conversation: ${conversation.id}`,
        );
      }
      if (
        !conversation.messages.some(
          (message) =>
            message.role === 'USER' &&
            message.content.zh.trim() &&
            message.content.en.trim(),
        ) ||
        !conversation.messages.some(
          (message) =>
            message.role === 'ASSISTANT' &&
            message.content.zh.trim() &&
            message.content.en.trim(),
        )
      ) {
        throw new Error(
          `curated Demo conversation lacks a full turn: ${conversation.id}`,
        );
      }
    }

    let messageCount = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.aiCoachSession.deleteMany({
        where: { userId: args.userId, id: { startsWith: 'demo-' } },
      });
      for (const conversation of args.conversations) {
        await tx.aiCoachSession.create({
          data: {
            userId: args.userId,
            id: conversation.id,
            type: AiCoachSessionType.CHAT,
            lang: conversation.lang,
            title: serializePublicDemoText(conversation.title),
            nextSequence: conversation.messages.length + 1,
            createdAt: conversation.occurredAt,
            updatedAt: conversation.occurredAt,
          },
        });
        for (const [index, message] of conversation.messages.entries()) {
          const role =
            message.role === 'USER'
              ? AiCoachMessageRole.USER
              : AiCoachMessageRole.ASSISTANT;
          const roleName = message.role === 'USER' ? 'user' : 'assistant';
          const content = serializePublicDemoText(message.content);
          await tx.aiCoachMessage.create({
            data: {
              userId: args.userId,
              sessionId: conversation.id,
              role,
              content,
              message: buildStoredCoachUiMessageEnvelope({
                role: roleName,
                content,
                message: null,
              }) as unknown as Prisma.InputJsonValue,
              sequence: index + 1,
              createdAt: new Date(
                conversation.occurredAt.getTime() + index * 60_000,
              ),
            },
          });
          messageCount += 1;
        }
      }
    });
    return { sessionCount: args.conversations.length, messageCount };
  }
}
