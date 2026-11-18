import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { CoachRuntimeEntryStarter } from "./coach-runtime-entry";
const entry = {
  key: "entry-1",
  intent: "plan-start",
  branchContext: { planId: "plan" },
  firstMessage: {
    id: "entry-1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Evaluate this date" }],
  },
};
describe("embedded coach entry", () => {
  it("sends one first turn under StrictMode and resumes the persisted turn on reopen", () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const chat = {
      messages: [],
      status: "ready",
      sendMessage,
    } as unknown as UseChatHelpers<CoachUiMessage>;
    const mounted = render(
      <StrictMode>
        <CoachRuntimeEntryStarter entry={entry} chat={chat} ready />
      </StrictMode>,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    mounted.unmount();
    render(
      <StrictMode>
        <CoachRuntimeEntryStarter
          entry={entry}
          chat={{ ...chat, messages: [entry.firstMessage] }}
          ready
        />
      </StrictMode>,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

import {
  reconcilePlanDecisionStates,
  serializePlanDecisionStates,
} from "./coach-plan-decision-state";
it("refreshes stale card authorization without replacing the live transcript", () => {
  const draft = {
    type: "data-coach-tool" as const,
    data: {
      toolCallId: "tool",
      name: "CoachDecisionDraft",
      input: {
        decisionType: "PLAN_START",
        decisionId: "decision",
        state: "PROPOSED",
      },
    },
  };
  const live: CoachUiMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      parts: [{ type: "text", text: "Live answer" }, draft],
    },
  ];
  const persisted: CoachUiMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      parts: [
        { type: "text", text: "Old answer" },
        {
          ...draft,
          data: {
            ...draft.data,
            input: { ...draft.data.input, state: "SUPERSEDED" },
          },
        },
      ],
    },
  ];
  const reconciled = reconcilePlanDecisionStates(
    live,
    serializePlanDecisionStates(persisted),
  );
  expect(reconciled[0].parts[0]).toEqual({ type: "text", text: "Live answer" });
  expect(reconciled[0].parts[1]).toMatchObject({
    data: { input: { state: "SUPERSEDED" } },
  });
  expect(
    reconcilePlanDecisionStates(reconciled, serializePlanDecisionStates(live)),
  ).toBe(reconciled);
});

it("does not append another first turn when the server already owns its attempt", () => {
  const sendMessage = vi.fn();
  const chat = {
    messages: [{ id: "server-user-id", role: "user", parts: [] }],
    status: "ready",
    sendMessage,
  } as unknown as UseChatHelpers<CoachUiMessage>;
  render(
    <CoachRuntimeEntryStarter
      entry={{ ...entry, resumeExisting: true }}
      chat={chat}
      ready
    />,
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

it("reconciles a committed receipt even when a live draft already has APPLIED state", () => {
  const receipt = {
    mode: "START",
    planId: "plan",
    readbackVerified: true,
    startDate: "2026-11-22",
  };
  const live: CoachUiMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      parts: [
        { type: "text", text: "Live response" },
        {
          type: "data-coach-tool",
          data: {
            name: "CoachDecisionDraft",
            toolCallId: "tool",
            input: {
              kind: "coach_decision_draft",
              decisionType: "PLAN_START",
              decisionId: "decision",
              state: "APPLIED",
              payload: { presentation: { title: "Original candidate" } },
            },
          },
        },
      ],
    },
  ];
  const persisted: CoachUiMessage[] = structuredClone(live);
  const part = persisted[0].parts[1];
  if (part.type === "data-coach-tool")
    (part.data.input as Record<string, unknown>).payload = {
      appliedReceipt: receipt,
    };
  const updated = reconcilePlanDecisionStates(
    live,
    serializePlanDecisionStates(persisted),
  );
  expect(updated[0].parts[1]).toMatchObject({
    data: {
      input: {
        state: "APPLIED",
        payload: {
          presentation: { title: "Original candidate" },
          appliedReceipt: receipt,
        },
      },
    },
  });
  expect(updated[0].parts[0]).toEqual({ type: "text", text: "Live response" });
  expect(
    reconcilePlanDecisionStates(
      updated,
      serializePlanDecisionStates(persisted),
    ),
  ).toBe(updated);
});

it("reconciles a committed SCHEDULE receipt even when a live draft already has APPLIED state", () => {
  const receipt = {
    mode: "SCHEDULE",
    planId: "plan",
    readbackVerified: true,
    startDate: "2026-11-22",
  };
  const live: CoachUiMessage[] = [
    {
      id: "assistant",
      role: "assistant",
      parts: [
        { type: "text", text: "Live response" },
        {
          type: "data-coach-tool",
          data: {
            name: "CoachDecisionDraft",
            toolCallId: "tool",
            input: {
              kind: "coach_decision_draft",
              decisionType: "PLAN_SCHEDULE",
              decisionId: "decision",
              state: "APPLIED",
              payload: { presentation: { title: "Original candidate" } },
            },
          },
        },
      ],
    },
  ];
  const persisted: CoachUiMessage[] = structuredClone(live);
  const part = persisted[0].parts[1];
  if (part.type === "data-coach-tool")
    (part.data.input as Record<string, unknown>).payload = {
      appliedReceipt: receipt,
    };
  const updated = reconcilePlanDecisionStates(
    live,
    serializePlanDecisionStates(persisted),
  );
  expect(updated[0].parts[1]).toMatchObject({
    data: {
      input: {
        state: "APPLIED",
        payload: {
          presentation: { title: "Original candidate" },
          appliedReceipt: receipt,
        },
      },
    },
  });
  expect(updated[0].parts[0]).toEqual({ type: "text", text: "Live response" });
  expect(
    reconcilePlanDecisionStates(
      updated,
      serializePlanDecisionStates(persisted),
    ),
  ).toBe(updated);
});
