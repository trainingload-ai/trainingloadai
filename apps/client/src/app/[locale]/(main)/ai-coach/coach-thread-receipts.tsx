"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useCoachThread } from "./coach-chat-provider";
import {
  COACH_PLAN_DRAFT_SAVED_KIND,
  COACH_QUESTION_REPLY_KIND,
  COACH_QUESTION_SKIP_KIND,
  PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND,
  type CoachQuestionReplyToolResultPayload,
  type CoachQuestionSkipToolResultPayload,
} from "@shared/ai-coach-schema";
import { getCoachUserToolResultsFromRuntimeMessages } from "@/lib/ai-coach-ui-parts";
import { isCoachInteraction } from "@shared/ai-coach-run-contract";

type CoachQuestionReceipt =
  | CoachQuestionReplyToolResultPayload
  | CoachQuestionSkipToolResultPayload;

type CoachThreadReceiptIndex = {
  questionReplies: ReadonlyMap<string, CoachQuestionReceipt>;
  savedPlanDrafts: ReadonlySet<string>;
  appliedWorkoutAdjustments: ReadonlySet<string>;
  appliedDecisions: Set<string>;
};

const EMPTY_COACH_THREAD_RECEIPTS: CoachThreadReceiptIndex = {
  questionReplies: new Map(),
  savedPlanDrafts: new Set(),
  appliedWorkoutAdjustments: new Set(),
  appliedDecisions: new Set(),
};

const CoachThreadReceiptsContext = createContext<CoachThreadReceiptIndex>(
  EMPTY_COACH_THREAD_RECEIPTS,
);

function serializeCoachThreadReceipts(
  messages: readonly { role?: string; content?: readonly unknown[] }[],
) {
  const receipts: unknown[] = [];
  const durableQuestions = new Set<string>();
  for (const message of messages) {
    for (const part of message.content ?? []) {
      const item = part as { type?: string; name?: string; data?: unknown };
      if (message.role === "assistant" && item.name === "coach-tool") {
        const tool = item.data as {
          name?: string;
          input?: { kind?: string; decisionId?: string; result?: string };
        };
        if (
          tool?.name === "CoachDecisionApplied" &&
          tool.input?.kind === "coach_decision_apply" &&
          tool.input.result === "APPLIED" &&
          typeof tool.input.decisionId === "string"
        ) {
          receipts.push({
            kind: "decision_applied",
            decisionId: tool.input.decisionId,
          });
        }
      }
      if (item.name !== "coach-interaction" || !isCoachInteraction(item.data))
        continue;
      const data = item.data;
      durableQuestions.add(data.questionMessageId);
      if (data.status === "pending") continue;
      receipts.push({
        durable: true,
        kind:
          data.status === "skipped"
            ? COACH_QUESTION_SKIP_KIND
            : COACH_QUESTION_REPLY_KIND,
        repliesToAssistantMessageId: data.questionMessageId,
        questionToolUseId: data.questionToolCallId,
        answers: data.answers ?? {},
        notes: data.notes ?? {},
        skippedQuestionIds: data.skippedQuestionIds ?? [],
      });
    }
  }
  for (const data of getCoachUserToolResultsFromRuntimeMessages(messages)) {
    const payload = data.content;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }
    const kind = (payload as { kind?: unknown }).kind;
    const repliesTo = (payload as { repliesToAssistantMessageId?: unknown })
      .repliesToAssistantMessageId;
    if (
      typeof repliesTo === "string" &&
      durableQuestions.has(repliesTo) &&
      (kind === COACH_QUESTION_REPLY_KIND || kind === COACH_QUESTION_SKIP_KIND)
    )
      continue;
    if (
      typeof repliesTo === "string" &&
      (kind === COACH_QUESTION_REPLY_KIND ||
        kind === COACH_QUESTION_SKIP_KIND ||
        kind === COACH_PLAN_DRAFT_SAVED_KIND ||
        kind === PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND)
    ) {
      receipts.push(payload);
    }
  }
  return JSON.stringify(receipts);
}

export function useCoachThreadReceipts() {
  return useContext(CoachThreadReceiptsContext);
}

export function CoachThreadReceiptsProvider({
  children,
}: {
  children: ReactNode;
}) {
  // This selector remains stable while assistant text deltas stream, so
  // historical cards do not subscribe to every character update.
  const serializedReceipts = useCoachThread((state) =>
    serializeCoachThreadReceipts(state.messages),
  );
  const index = useMemo<CoachThreadReceiptIndex>(() => {
    const questionReplies = new Map<string, CoachQuestionReceipt>();
    const savedPlanDrafts = new Set<string>();
    const appliedWorkoutAdjustments = new Set<string>();
    const appliedDecisions = new Set<string>();
    const receipts = JSON.parse(serializedReceipts) as Array<
      Record<string, unknown>
    >;

    for (const receipt of receipts) {
      if (
        receipt.kind === "decision_applied" &&
        typeof receipt.decisionId === "string"
      ) {
        appliedDecisions.add(receipt.decisionId);
        continue;
      }
      const repliesTo = String(receipt.repliesToAssistantMessageId ?? "");
      if (!repliesTo) continue;
      if (
        receipt.kind === COACH_QUESTION_REPLY_KIND ||
        receipt.kind === COACH_QUESTION_SKIP_KIND
      ) {
        if (!receipt.durable)
          questionReplies.set(repliesTo, receipt as CoachQuestionReceipt);
        // v2 identities are stable. A provider may reuse a call ID in another attempt.
        if (typeof receipt.questionToolUseId === "string") {
          questionReplies.set(
            `${repliesTo}:${receipt.questionToolUseId}`,
            receipt as CoachQuestionReceipt,
          );
          if (!receipt.durable)
            questionReplies.set(
              receipt.questionToolUseId,
              receipt as CoachQuestionReceipt,
            );
        }
      } else if (receipt.kind === COACH_PLAN_DRAFT_SAVED_KIND) {
        savedPlanDrafts.add(repliesTo);
      } else if (receipt.kind === PLAN_WORKOUT_ADJUSTMENT_APPLIED_KIND) {
        appliedWorkoutAdjustments.add(repliesTo);
      }
    }

    return {
      questionReplies,
      savedPlanDrafts,
      appliedWorkoutAdjustments,
      appliedDecisions,
    };
  }, [serializedReceipts]);

  return (
    <CoachThreadReceiptsContext.Provider value={index}>
      {children}
    </CoachThreadReceiptsContext.Provider>
  );
}
