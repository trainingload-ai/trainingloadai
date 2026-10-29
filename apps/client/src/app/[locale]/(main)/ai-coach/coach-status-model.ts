"use client";

import type { CoachWireMessage } from "@/lib/ai-coach-stream";

export type CoachStreamPhase = "model" | "tool_run";

export type CoachContextWindowState = Extract<
  CoachWireMessage,
  { type: "system"; subtype: "context_window" }
>;

export type CoachStatusState = {
  streamPhase: CoachStreamPhase | null;
  activeToolName: string | null;
  contextWindow: CoachContextWindowState | null;
};

export type CoachStatusViewState = CoachStatusState & {
  isStreaming: boolean;
};

export const INITIAL_COACH_STATUS_STATE: CoachStatusState = {
  streamPhase: null,
  activeToolName: null,
  contextWindow: null,
};

export type CoachStatusAction =
  | { type: "event"; event: CoachWireMessage }
  | { type: "reset"; clearContextWindow?: boolean };

export function reduceCoachStatusState(
  state: CoachStatusState,
  action: CoachStatusAction,
): CoachStatusState {
  if (action.type === "reset") {
    return {
      streamPhase: null,
      activeToolName: null,
      contextWindow: action.clearContextWindow ? null : state.contextWindow,
    };
  }

  const { event } = action;
  switch (event.type) {
    case "system":
      if (event.subtype === "context_window") {
        return {
          ...state,
          contextWindow: event,
        };
      }
      if (event.subtype === "status") {
        if (
          event.status === "running" ||
          event.status === "model" ||
          event.status === "tool_run"
        ) {
          return {
            ...state,
            streamPhase:
              event.status === "tool_run"
                ? "tool_run"
                : "model",
            activeToolName:
              event.status === "tool_run" ? state.activeToolName : null,
          };
        }
        return state;
      }
      return state;
    case "stream_event":
      if (event.event.type !== "phase") return state;
      return {
        ...state,
        streamPhase: event.event.phase,
        activeToolName:
          event.event.phase === "model" ? null : state.activeToolName,
      };
    case "tool_progress":
      if (event.status === "start") {
        return {
          ...state,
          activeToolName: event.tool_name,
        };
      }
      if (event.status === "end") {
        return {
          ...state,
          activeToolName: null,
        };
      }
      if (event.status === "done") {
        return {
          ...state,
          activeToolName: null,
        };
      }
      return state;
    case "result":
      return {
        ...state,
        streamPhase: null,
        activeToolName: null,
      };
    default:
      return state;
  }
}

export function toCoachStatusViewState(
  state: CoachStatusState,
  isStreaming: boolean,
): CoachStatusViewState {
  return {
    ...state,
    isStreaming,
  };
}
