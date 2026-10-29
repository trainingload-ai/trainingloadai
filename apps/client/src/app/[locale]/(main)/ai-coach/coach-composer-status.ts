import type {
  CoachContextWindowData,
  CoachStatusData,
  CoachToolProgressData,
} from "@/lib/ai-coach-ui-parts";

function isContext(value: unknown): value is CoachContextWindowData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    [
      "maxContextTokens",
      "reservedOutputTokens",
      "inputBudgetTokens",
      "usedInputTokens",
      "compressionThresholdTokens",
      "compactedMessages",
    ].every(
      (key) =>
        typeof data[key] === "number" &&
        Number.isFinite(data[key]) &&
        data[key] >= 0,
    ) &&
    (data.inputBudgetTokens as number) > 0 &&
    typeof data.compressed === "boolean"
  );
}

export function readCoachStatusSnapshot(
  messages: readonly { role?: string; content?: readonly unknown[] }[],
) {
  const snapshot: {
    status: CoachStatusData | null;
    toolProgress: CoachToolProgressData | null;
    contextWindow: CoachContextWindowData | null;
  } = { status: null, toolProgress: null, contextWindow: null };
  let latestAssistant = true;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (const value of [...(message.content ?? [])].reverse()) {
      if (!value || typeof value !== "object") continue;
      const part = value as { type?: string; name?: string; data?: unknown };
      if (part.type !== "data") continue;
      if (latestAssistant && !snapshot.status && part.name === "coach-status")
        snapshot.status = part.data as CoachStatusData;
      if (
        latestAssistant &&
        !snapshot.toolProgress &&
        part.name === "coach-tool-progress"
      )
        snapshot.toolProgress = part.data as CoachToolProgressData;
      if (
        !snapshot.contextWindow &&
        part.name === "coach-context-window" &&
        isContext(part.data)
      )
        snapshot.contextWindow = part.data;
    }
    // Retain the most recent context estimate while a new attempt starts.
    // Old execution statuses must not leak into that new attempt.
    if (snapshot.contextWindow) break;
    latestAssistant = false;
  }
  return snapshot;
}
