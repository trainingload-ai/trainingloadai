"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { CoachUiMessage, CoachUiPart } from "@/lib/ai-coach-ui-parts";
import {
  isCoachRunMetadata,
  type CoachRunCommand,
} from "@shared/ai-coach-run-contract";
import { cancelCoachRun } from "@/api/ai-coach";

export type CoachContent =
  | { type: "text"; text: string }
  | { type: "data"; name: string; data: unknown };
export type CoachMessageView = {
  id: string;
  role: CoachUiMessage["role"];
  content: CoachContent[];
  ui: CoachUiMessage;
  status: { type: "running" | "complete" };
};
type Snapshot = { messages: readonly CoachMessageView[]; isRunning: boolean };
type Store = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  subscribe: (fn: () => void) => () => void;
};
type Actions = {
  append: (
    message: string | { role: "user"; content: CoachContent[] },
  ) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  stop: () => Promise<void>;
};
const StateContext = createContext<Store | null>(null);
const ActionsContext = createContext<Actions | null>(null);
const MessageContext = createContext<string | null>(null);
const viewCache = new WeakMap<CoachUiMessage, CoachMessageView>();

function messageView(ui: CoachUiMessage, running: boolean): CoachMessageView {
  const cached = viewCache.get(ui);
  const type = running ? "running" : "complete";
  if (cached?.status.type === type) return cached;
  const view: CoachMessageView = {
    id: ui.id,
    role: ui.role,
    ui,
    status: { type },
    content: ui.parts.flatMap((part): CoachContent[] =>
      part.type === "text"
        ? [{ type: "text", text: part.text }]
        : part.type.startsWith("data-") && "data" in part
          ? [{ type: "data", name: part.type.slice(5), data: part.data }]
          : [],
    ),
  };
  viewCache.set(ui, view);
  return view;
}

/** UIMessage is the only message state; these are read-only views for domain cards. */
export function CoachChatProvider({
  chat,
  children,
  onStopError,
}: {
  chat: UseChatHelpers<CoachUiMessage>;
  children: ReactNode;
  onStopError: (error: Error) => void;
}) {
  const isRunning = chat.status === "submitted" || chat.status === "streaming";
  const snapshot = useMemo<Snapshot>(
    () => ({
      isRunning,
      messages: chat.messages.map((message, index) =>
        messageView(
          message,
          isRunning &&
            message.role === "assistant" &&
            index === chat.messages.length - 1,
        ),
      ),
    }),
    [chat.messages, isRunning],
  );
  const [store] = useState(() => {
    const value: Store = {
      snapshot,
      listeners: new Set(),
      subscribe: (listener) => {
        value.listeners.add(listener);
        return () => {
          value.listeners.delete(listener);
        };
      },
    };
    return value;
  }); // This store has exactly one provider lifetime, like useChat.
  useLayoutEffect(() => {
    store.snapshot = snapshot;
    store.listeners.forEach((listener) => listener());
  }, [snapshot, store]);
  const latest = useRef({ chat, onStopError });
  latest.current = { chat, onStopError };
  const actions = useMemo<Actions>(
    () => ({
      append: async (message) => {
        const current = latest.current.chat;
        if (current.status === "submitted" || current.status === "streaming")
          return;
        const parts =
          typeof message === "string"
            ? [{ type: "text" as const, text: message }]
            : message.content.map((part) =>
                part.type === "text"
                  ? part
                  : ({
                      type: `data-${part.name}`,
                      data: part.data,
                    } as CoachUiPart),
              );
        await current.sendMessage({ role: "user", parts });
      },
      retry: async (messageId) => {
        const current = latest.current.chat;
        if (current.status === "submitted" || current.status === "streaming")
          return;
        const source = current.messages.find(
          (message) => message.id === messageId,
        );
        if (!source) return;
        const requestId = crypto.randomUUID();
        if (isCoachRunMetadata(source.metadata)) {
          const runCommand: CoachRunCommand = {
            kind: "retry",
            requestId,
            runId: source.metadata.runId,
            attemptId: source.metadata.attemptId,
          };
          // SDK 6 seeds a continuation from the last assistant. An empty, hidden
          // control message starts a FRESH response; it is not sent/persisted as input.
          await current.sendMessage(
            { id: `retry:${requestId}`, role: "user", parts: [] },
            { body: { runCommand } },
          );
          current.setMessages((messages) =>
            messages.filter((message) => message.id !== `retry:${requestId}`),
          );
        } else {
          const index = current.messages.indexOf(source);
          const input = current.messages
            .slice(0, index)
            .findLast((message) => message.role === "user");
          if (input)
            await current.sendMessage({ role: "user", parts: input.parts });
        }
      },
      stop: async () => {
        const current = latest.current.chat;
        const run = current.messages
          .at(-1)
          ?.parts.find((part) => part.type === "data-coach-run");
        try {
          if (run?.type === "data-coach-run" && run.data.status === "running") {
            // Keep reading until the server publishes the durable cancelled state.
            await cancelCoachRun(run.data.runId, run.data.attemptId);
          } else await current.stop();
        } catch (error) {
          latest.current.onStopError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    }),
    [],
  );
  return (
    <StateContext.Provider value={store}>
      <ActionsContext.Provider value={actions}>
        {children}
      </ActionsContext.Provider>
    </StateContext.Provider>
  );
}

export function useCoachThread<T>(select: (state: Snapshot) => T): T {
  const store = useContext(StateContext);
  if (!store) throw new Error("CoachChatProvider is required");
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.snapshot),
    () => select(store.snapshot),
  );
}
export function useCoachActions() {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("CoachChatProvider is required");
  return actions;
}
export function useCoachMessage<T>(
  select: (message: CoachMessageView) => T,
): T {
  const id = useContext(MessageContext);
  return useCoachThread((state) => {
    const message = state.messages.find((item) => item.id === id);
    if (!message) throw new Error("CoachMessageProvider is required");
    return select(message);
  });
}
export function CoachMessageProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <MessageContext.Provider value={id}>{children}</MessageContext.Provider>
  );
}
