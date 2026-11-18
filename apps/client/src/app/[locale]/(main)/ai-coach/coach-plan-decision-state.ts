import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";

type DecisionState = { decisionId: string; state: string };
function startDecision(
  part: CoachUiMessage["parts"][number],
): DecisionState | null {
  if (
    part.type !== "data-coach-tool" ||
    part.data.name !== "CoachDecisionDraft"
  )
    return null;
  const input = part.data.input as Record<string, unknown> | null;
  return input?.decisionType === "PLAN_START" &&
    typeof input.decisionId === "string" &&
    typeof input.state === "string"
    ? { decisionId: input.decisionId, state: input.state }
    : null;
}

export function serializePlanDecisionStates(
  messages: CoachUiMessage[],
): string {
  return JSON.stringify(
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const state = startDecision(part);
        return state ? [state] : [];
      }),
    ),
  );
}

/** Reconcile authoritative card states without replacing live SSE text or run state. */
export function reconcilePlanDecisionStates(
  messages: CoachUiMessage[],
  serialized: string,
): CoachUiMessage[] {
  const states = new Map(
    (JSON.parse(serialized) as DecisionState[]).map((item) => [
      item.decisionId,
      item.state,
    ]),
  );
  let changed = false;
  const updated = messages.map((message) => {
    let messageChanged = false;
    const parts = message.parts.map((part) => {
      const current = startDecision(part);
      const state = current && states.get(current.decisionId);
      if (
        !current ||
        !state ||
        state === current.state ||
        ["APPLIED", "SUPERSEDED", "REJECTED"].includes(current.state) ||
        part.type !== "data-coach-tool"
      )
        return part;
      messageChanged = true;
      changed = true;
      return {
        ...part,
        data: {
          ...part.data,
          input: { ...(part.data.input as Record<string, unknown>), state },
        },
      };
    });
    return messageChanged ? { ...message, parts } : message;
  });
  return changed ? updated : messages;
}
