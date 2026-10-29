import type { PrismaService } from '@/prisma/prisma.service';
import { parseCoachQuestionReplyLikeToolResultPayload } from '@shared/ai-coach-schema';
import { getStoredCoachLegacyMessage } from './coach-history-messages';

/** Resolve the stable tool id as well as legacy database message references. */
export async function loadReferencedCoachQuestion(
  prisma: PrismaService,
  context: {
    userId: string;
    sessionId: string;
    branchId?: string | null;
    now: Date;
  },
  rawReply: unknown,
) {
  const parsed = parseCoachQuestionReplyLikeToolResultPayload(rawReply);
  if (!parsed.ok) return null;
  const reply = parsed.data;
  const toolMatch = reply.questionToolUseId
    ? [
        {
          type: 'tool_use',
          id: reply.questionToolUseId,
          name: 'AskUserQuestion',
        },
      ]
    : null;
  let body: unknown;
  if (context.branchId) {
    const row = await prisma.coachBranchMessage.findFirst({
      where: {
        branchId: context.branchId,
        branch: { context: { userId: context.userId } },
        role: 'assistant',
        createdAt: { lt: context.now },
        OR: [
          { id: reply.repliesToAssistantMessageId },
          ...(toolMatch
            ? [{ content: { path: ['content'], array_contains: toolMatch } }]
            : []),
        ],
      },
      select: { content: true },
    });
    body = row?.content;
  }
  if (!body) {
    const row = await prisma.aiCoachMessage.findFirst({
      where: {
        userId: context.userId,
        sessionId: context.sessionId,
        role: 'ASSISTANT',
        createdAt: { lt: context.now },
        OR: [
          { id: reply.repliesToAssistantMessageId },
          ...(toolMatch
            ? [
                {
                  message: {
                    path: ['legacyMessage', 'content'],
                    array_contains: toolMatch,
                  },
                },
                { message: { path: ['content'], array_contains: toolMatch } },
              ]
            : []),
        ],
      },
      select: { message: true },
    });
    body = row ? getStoredCoachLegacyMessage(row.message) : undefined;
  }
  const blocks = (
    body as
      | {
          content?: Array<{
            id?: string;
            name?: string;
            input?: { metadata?: { branchId?: string | null; skill?: string } };
          }>;
        }
      | undefined
  )?.content;
  if (!Array.isArray(blocks)) return null;
  const question = blocks.find(
    (block) =>
      block.name === 'AskUserQuestion' &&
      (!reply.questionToolUseId || block.id === reply.questionToolUseId) &&
      (block.input?.metadata?.branchId ?? null) === (context.branchId ?? null),
  );
  return question?.input ?? null;
}
