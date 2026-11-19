import { isCalendarPlanDecisionType } from "@shared/plan-proposal-receipt";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";

type DecisionState = {
  decisionId: string;
  state: string;
  appliedReceipt?: unknown;
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export { getRestoredPlanDecisionApply as getRestoredStartDecisionApply } from "@shared/plan-proposal-receipt";
function startDecision(
  part: CoachUiMessage["parts"][number],
): DecisionState | null {
  if (
    part.type !== "data-coach-tool" ||
    part.data.name !== "CoachDecisionDraft"
  )
    return null;
  const input = part.data.input as Record<string, unknown> | null;
  return input &&
    isCalendarPlanDecisionType(input.decisionType) &&
    typeof input.decisionId === "string" &&
    typeof input.state === "string"
    ? {
        decisionId: input.decisionId,
        state: input.state,
        ...(input.state === "APPLIED" && record(input.payload)?.appliedReceipt
          ? { appliedReceipt: record(input.payload)!.appliedReceipt }
          : {}),
      }
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
      item,
    ]),
  );
  let changed = false;
  const updated = messages.map((message) => {
    let messageChanged = false;
    const parts = message.parts.map((part) => {
      const current = startDecision(part);
      const incoming = current && states.get(current.decisionId);
      if (
        !current ||
        !incoming ||
        part.type !== "data-coach-tool" ||
        ["SUPERSEDED", "REJECTED"].includes(current.state) ||
        (current.state === "APPLIED" && incoming.state !== "APPLIED")
      )
        return part;
      const payload = record(
        (part.data.input as Record<string, unknown>).payload,
      );
      const receiptChanged =
        incoming.appliedReceipt !== undefined &&
        JSON.stringify(incoming.appliedReceipt) !==
          JSON.stringify(payload?.appliedReceipt);
      if (current.state === incoming.state && !receiptChanged) return part;
      messageChanged = true;
      changed = true;
      return {
        ...part,
        data: {
          ...part.data,
          input: {
            ...(part.data.input as Record<string, unknown>),
            state: incoming.state,
            ...(incoming.appliedReceipt !== undefined
              ? {
                  payload: {
                    ...payload,
                    appliedReceipt: incoming.appliedReceipt,
                  },
                }
              : {}),
          },
        },
      };
    });
    return messageChanged ? { ...message, parts } : message;
  });
  return changed ? updated : messages;
}
