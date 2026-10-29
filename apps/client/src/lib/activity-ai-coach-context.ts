import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { getCoachUserToolResultParts } from "@/lib/ai-coach-ui-parts";
import type { CoachUserMessageBody } from "@/lib/ai-coach-stream";

export const ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID =
  "client:activity_ai_analysis_context";

export const ACTIVITY_COACH_SID_PREFIX = "actrev-";
export const ACTIVITY_COACH_SID_MAX_CHARS = 64;
export const ACTIVITY_REVIEW_ASSISTANT_MESSAGE_PREFIX = "activity-review:";

const MAX_ANALYSIS_CONTEXT_CHARS = 16_000;
const SAFE_ACTIVITY_ID = /^[A-Za-z0-9_-]+$/;

export function activityCoachSessionId(activityId: string): string {
  const id = activityId.trim();
  const candidate = `${ACTIVITY_COACH_SID_PREFIX}${id}`;
  if (
    id.length > 0 &&
    candidate.length <= ACTIVITY_COACH_SID_MAX_CHARS &&
    SAFE_ACTIVITY_ID.test(id)
  ) {
    return candidate;
  }
  return `${ACTIVITY_COACH_SID_PREFIX}${fnv1aHex(id || "activity")}`;
}

export function activityReviewAssistantMessageId(activityId: string): string {
  return `${ACTIVITY_REVIEW_ASSISTANT_MESSAGE_PREFIX}${activityId.trim()}`;
}

export function buildActivityAiCoachMessage({
  activityId,
  analysisMarkdown,
  prompt,
}: {
  activityId: string;
  analysisMarkdown: string;
  prompt: string;
}): CoachUserMessageBody {
  const normalizedAnalysis = analysisMarkdown.trim();
  const clippedAnalysis = normalizedAnalysis.slice(0, MAX_ANALYSIS_CONTEXT_CHARS);

  return {
    content: [
      { type: "text", text: prompt.trim() },
      {
        type: "tool_result",
        tool_use_id: ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
        content: {
          kind: "activity_ai_analysis_context",
          version: 1,
          activityId: activityId.trim(),
          analysisMarkdown: clippedAnalysis,
          truncated: clippedAnalysis.length < normalizedAnalysis.length,
        },
      },
    ],
  };
}

export function buildActivityReviewAssistantMessage({
  activityId,
  markdown,
}: {
  activityId: string;
  markdown: string;
}): CoachUiMessage | null {
  const text = markdown.trim();
  if (!activityId.trim() || !text) return null;
  return {
    id: activityReviewAssistantMessageId(activityId),
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

export function withActivityReviewAssistantSeed(
  messages: CoachUiMessage[],
  args: { activityId: string; markdown: string },
): CoachUiMessage[] {
  const seed = buildActivityReviewAssistantMessage(args);
  const seedId = activityReviewAssistantMessageId(args.activityId);
  const withoutSeed = messages.filter((message) => message.id !== seedId);
  return seed ? [seed, ...withoutSeed] : withoutSeed;
}

export function withPersistedActivityReviewAssistantSeed(
  messages: CoachUiMessage[],
): CoachUiMessage[] {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const contextPart = getCoachUserToolResultParts(message).find(
      (part) => part.toolUseId === ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
    );
    const context = asRecord(contextPart?.content);
    if (context?.kind !== "activity_ai_analysis_context") continue;
    const activityId =
      typeof context.activityId === "string" ? context.activityId.trim() : "";
    const markdown =
      typeof context.analysisMarkdown === "string"
        ? context.analysisMarkdown.trim()
        : "";
    if (!activityId || !markdown) continue;
    return withActivityReviewAssistantSeed(messages, {
      activityId,
      markdown,
    });
  }
  return messages;
}

export function shouldAttachActivityCoachContext(args: {
  trigger: "submit-message" | "regenerate-message";
  messages: Array<{ role?: string }>;
  serverHadUserTurn: boolean;
}): boolean {
  if (args.trigger !== "submit-message") return false;
  if (args.serverHadUserTurn) return false;
  const last = args.messages[args.messages.length - 1];
  if (last?.role !== "user") return false;
  return args.messages.filter((message) => message.role === "user").length === 1;
}

export function attachActivityCoachContextToUserMessage(
  message: CoachUiMessage,
  args: { activityId: string; analysisMarkdown: string },
): CoachUiMessage {
  if (message.role !== "user") return message;
  const alreadyAttached = getCoachUserToolResultParts(message).some(
    (part) => part.toolUseId === ACTIVITY_AI_ANALYSIS_CONTEXT_TOOL_USE_ID,
  );
  if (alreadyAttached) return message;

  const prompt = textFromUiMessage(message);
  const structured = buildActivityAiCoachMessage({
    activityId: args.activityId,
    analysisMarkdown: args.analysisMarkdown,
    prompt,
  });
  const toolBlock = structured.content.find(
    (block) => block.type === "tool_result",
  );
  if (!toolBlock || toolBlock.type !== "tool_result") return message;

  return {
    ...message,
    parts: [
      ...(message.parts ?? []),
      {
        type: "data-coach-user-tool-result",
        id: toolBlock.tool_use_id,
        data: {
          toolUseId: toolBlock.tool_use_id,
          content: toolBlock.content,
        },
      },
    ],
  };
}

function textFromUiMessage(message: CoachUiMessage): string {
  return (message.parts ?? [])
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
