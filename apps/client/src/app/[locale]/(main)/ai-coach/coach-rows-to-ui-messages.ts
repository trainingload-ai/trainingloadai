import type { CoachMessageRow } from "@/api/ai-coach";
import {
  coachPartsFromWireMessage,
  coachMetadataFromWireMessage,
  coachWireMessageHasRenderableBody,
  type CoachUiMessage,
} from "@/lib/ai-coach-ui-parts";
import { withPersistedActivityReviewAssistantSeed } from "@/lib/activity-ai-coach-context";

function rowHasRenderableText(r: CoachMessageRow): boolean {
  return coachWireMessageHasRenderableBody(r.role, r.message, r.content ?? "");
}

export function coachRowsToUiMessages(
  rows: CoachMessageRow[],
): CoachUiMessage[] {
  const messages = rows
    .filter((r) => r.role !== "system")
    .filter(rowHasRenderableText)
    .map((r) => {
      return {
        id: r.id,
        metadata: coachMetadataFromWireMessage(r.message),
        role: r.role,
        parts: coachPartsFromWireMessage(r.role, r.message, r.content ?? ""),
      };
    });
  return withPersistedActivityReviewAssistantSeed(messages);
}
