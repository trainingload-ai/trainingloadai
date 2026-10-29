"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { z } from "zod";
import {
  isCoachRunMetadata,
  isCoachRunSnapshot,
  isCoachActivity,
  isCoachInteraction,
  isCoachTextSegment,
} from "@shared/ai-coach-run-contract";
import { CoachChatProvider } from "./coach-chat-provider";
import { coachRunRequest } from "./coach-run-request";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { getLoginHrefWithCallback } from "@/lib/auth-callback";
import { useRouter } from "@/i18n/navigation";
import { notifyAiDataConsentRequiredFromResponse } from "@/lib/ai-data-consent-events";
import { apiFetchErrorFromResponse } from "@/lib/api";
import { resolveCoachVisibleErrorMessage } from "./coach-visible-error";
import type { CoachUiMessage, CoachUiDataParts } from "@/lib/ai-coach-ui-parts";
import {
  aiCoachMessagesQueryKey,
  invalidateCoachSessionLists,
} from "@/api/ai-coach";
import { allocateClientCoachSid } from "./coach-sid-model";
import {
  buildCoachSendMessagesRequestBody,
  type CoachBranchRequestContext,
} from "@/lib/ai-coach-stream";
import { queryKeys } from "@/lib/query-keys";
import { fetchAiOperation } from "@/api/ai-operations";
import {
  aiOperationRequestFingerprint,
  operationIdForRequest,
  clearPendingAiOperation,
} from "@/lib/ai-operation-recovery";
import { CoachSeedAutoStarter } from "./coach-seed-auto-starter";
import { CoachThread } from "./coach-thread";
import { readAiOperationFromSse } from "./coach-operation-event";
import {
  readStoredSessionIntent,
  readStoredThinkingEnabled,
  writeStoredSessionIntent,
  writeStoredThinkingEnabled,
} from "./coach-runtime-storage";
import { markCoachMessagesStale } from "./coach-message-cache";
import { COACH_TURN_ERROR_PART_TYPE } from "@shared/coach-turn-error";

export type CoachConversationRuntimeProps = {
  sid: string;
  initialMessages: CoachUiMessage[];
  variant?: "page" | "embedded";
  persistSid?: (sid: string) => void;
  enableUrlSeed?: boolean;
  prepareOutgoingUserMessage?: (
    message: CoachUiMessage,
    messages: CoachUiMessage[],
    trigger: "submit-message" | "regenerate-message",
  ) => CoachUiMessage;
};

export function CoachRuntimeProvider({
  sid,
  initialMessages,
  variant = "page",
  persistSid,
  enableUrlSeed = true,
  prepareOutgoingUserMessage,
}: CoachConversationRuntimeProps) {
  const locale = useLocale();
  const t = useTranslations("AiCoachPage");
  const operationErrorT = useTranslations("AiOperationErrors");
  const turnErrorT = useTranslations("CoachTurnErrors");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useViewerSession();
  const [creatingSession, setCreatingSession] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const sidRef = useRef(sid);
  const sidOverrideRef = useRef<string | null>(null);
  const pendingApplySidRef = useRef<string | null>(null);
  const persistSidRef = useRef(persistSid);
  const prepareOutgoingUserMessageRef = useRef(prepareOutgoingUserMessage);
  const sessionUserIdRef = useRef<string | undefined>(session?.user?.id);
  const thinkingEnabledRef = useRef(thinkingEnabled);
  const intentOverrideRef = useRef<string | null>(null);
  const branchContextRef = useRef<CoachBranchRequestContext | null>(null);
  const operationPollAbortRef = useRef<AbortController | null>(null);
  // The server streamed an inline failure part for the current turn; the card
  // in the transcript is the error state, so skip the banner and toast.
  const inlineTurnErrorRef = useRef(false);
  const chatRef = useRef<UseChatHelpers<CoachUiMessage> | null>(null);
  const mountedRef = useRef(false);

  persistSidRef.current = persistSid;
  prepareOutgoingUserMessageRef.current = prepareOutgoingUserMessage;

  useEffect(() => {
    sidRef.current = sid;
  }, [sid]);

  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id;
  }, [session?.user?.id]);

  useEffect(() => {
    thinkingEnabledRef.current = thinkingEnabled;
  }, [thinkingEnabled]);

  useEffect(
    () => () => {
      operationPollAbortRef.current?.abort();
      operationPollAbortRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const storedThinkingEnabled = readStoredThinkingEnabled();
    thinkingEnabledRef.current = storedThinkingEnabled;
    setThinkingEnabled(storedThinkingEnabled);
  }, []);

  const updateThinkingEnabled = useCallback((enabled: boolean) => {
    // Keep the ref in sync immediately: a retry may build its request in the
    // same tick, before the effect above runs.
    thinkingEnabledRef.current = enabled;
    setThinkingEnabled(enabled);
    writeStoredThinkingEnabled(enabled);
  }, []);

  const prepareTurnRetry = useCallback(
    (options?: { thinkingEnabled?: boolean }) => {
      const currentSid = sidRef.current;
      // The failed action is terminal on the server; a retry must not reuse
      // its idempotency key (it would replay the failure instead of running).
      if (currentSid) clearPendingAiOperation("COACH_SESSION", currentSid);
      setTurnError(null);
      if (typeof options?.thinkingEnabled === "boolean") {
        updateThinkingEnabled(options.thinkingEnabled);
      }
    },
    [updateThinkingEnabled],
  );

  const rememberPendingSid = useCallback((nextSid: string) => {
    if (!persistSidRef.current) return;
    pendingApplySidRef.current = nextSid;
  }, []);

  const ensureSessionForSend = useCallback(async () => {
    const current = sidOverrideRef.current || sidRef.current;
    // An existing conversation is already represented by the current URL and
    // mounted runtime. Re-applying the same sid after every response performs
    // a same-route navigation that can recreate the runtime and discard the
    // assistant message that just arrived over SSE.
    if (current) return current;
    if (!sessionUserIdRef.current) {
      return "";
    }

    setCreatingSession(true);
    try {
      // 先只在客户端分配 sid；会话行由首条用户消息 upsert。
      // 若先 POST 空壳，模型/积分失败会留下 title 为空、nextSequence=1 的孤儿会话。
      const nextSid = allocateClientCoachSid();
      sidOverrideRef.current = nextSid;
      sidRef.current = nextSid;
      rememberPendingSid(nextSid);
      return nextSid;
    } finally {
      setCreatingSession(false);
    }
  }, [rememberPendingSid]);

  const transport = useMemo(() => {
    return new DefaultChatTransport<CoachUiMessage>({
      api: "/api/ai-coach-v2",
      credentials: "include",
      prepareSendMessagesRequest: ({
        id,
        messages,
        trigger,
        messageId,
        body,
      }) => {
        const typedMessages = messages as CoachUiMessage[];
        const last = typedMessages[typedMessages.length - 1];
        const preparedLast =
          last && prepareOutgoingUserMessageRef.current
            ? prepareOutgoingUserMessageRef.current(
                last,
                typedMessages,
                trigger,
              )
            : last;
        const requestMessages =
          last && preparedLast && preparedLast !== last
            ? [...typedMessages.slice(0, -1), preparedLast]
            : typedMessages;
        return {
          body: buildCoachSendMessagesRequestBody({
            id,
            messages: requestMessages,
            trigger,
            messageId,
            body: { ...body, ...coachRunRequest(typedMessages, body) },
          }),
        };
      },
      fetch: async (input, init) => {
        setTurnError(null);
        inlineTurnErrorRef.current = false;
        const activeSid = await ensureSessionForSend();
        if (!activeSid) {
          return new Response("Unauthorized", { status: 401 });
        }
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
          window.location.origin,
        );
        url.searchParams.set("lang", locale);
        const sessionSid = sidRef.current || activeSid;
        url.searchParams.set("sid", sessionSid);
        const intentOverride =
          intentOverrideRef.current?.trim() ||
          readStoredSessionIntent(sessionSid);
        const branchContext = branchContextRef.current;
        if (intentOverride) {
          url.searchParams.set("intent", intentOverride);
          intentOverrideRef.current = intentOverride;
        }
        if (branchContext?.branchId) {
          url.searchParams.set("branchId", branchContext.branchId);
        } else {
          if (branchContext?.contextId) {
            url.searchParams.set("contextId", branchContext.contextId);
          }
          if (branchContext?.planId) {
            url.searchParams.set("planId", branchContext.planId);
          }
          if (branchContext?.openReason) {
            url.searchParams.set("openReason", branchContext.openReason);
          }
        }
        url.searchParams.set(
          "purpose",
          thinkingEnabledRef.current ? "REASONING" : "DEFAULT",
        );
        const requestedPurpose = thinkingEnabledRef.current
          ? "REASONING"
          : "DEFAULT";
        const headers = new Headers(init?.headers);
        let requestBody: Record<string, unknown> | null = null;
        if (init?.body && typeof init.body === "string") {
          try {
            requestBody = JSON.parse(init.body) as Record<string, unknown>;
          } catch {
            // Keep the original chat request body if it is not JSON.
          }
        }
        if (requestBody && branchContext?.sourceNode !== undefined) {
          requestBody.sourceNode = branchContext.sourceNode;
        }
        if (requestBody && branchContext?.caseId) {
          requestBody.caseId = branchContext.caseId;
        }
        const requestFingerprint = aiOperationRequestFingerprint({
          sid: sessionSid,
          purpose: requestedPurpose,
          trigger: requestBody?.trigger,
          messageId: requestBody?.messageId,
          message: requestBody?.message,
          runCommand: requestBody?.runCommand,
          branchId: branchContext?.branchId ?? null,
          contextId: branchContext?.contextId ?? null,
          planId: branchContext?.planId ?? null,
          caseId: branchContext?.caseId ?? null,
        });
        const operationId = operationIdForRequest({
          kind: "COACH_SESSION",
          entityId: sessionSid,
          requestFingerprint,
        });
        headers.set("Idempotency-Key", operationId);
        if (requestBody) requestBody.operationId = operationId;
        init = {
          ...init,
          headers,
          ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
        };
        try {
          const response = await fetch(url, init);
          if (!response.ok) {
            await notifyAiDataConsentRequiredFromResponse(response);
            try {
              const apiError = await apiFetchErrorFromResponse(
                response.clone(),
                true,
              );
              if (apiError.errorCode) {
                return new Response(apiError.errorCode, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: { "content-type": "text/plain; charset=utf-8" },
                });
              }
            } catch {
              // Let the assistant runtime handle the original response.
            }
          } else {
            void response
              .clone()
              .text()
              .then(async (raw) => {
                let operation = readAiOperationFromSse(raw);
                if (!operation) return;
                const currentOperationId =
                  operation.operationId || operationId;
                if (
                  operation.status === "STARTED" ||
                  operation.status === "RUNNING"
                ) {
                  operationPollAbortRef.current?.abort();
                  const pollController = new AbortController();
                  operationPollAbortRef.current = pollController;
                  while (!pollController.signal.aborted) {
                    await new Promise((resolve) => setTimeout(resolve, 1_500));
                    try {
                      operation = await fetchAiOperation(
                        currentOperationId,
                        pollController.signal,
                      );
                    } catch {
                      continue;
                    }
                    if (
                      operation.status === "STARTED" ||
                      operation.status === "RUNNING"
                    ) {
                      continue;
                    }
                    break;
                  }
                }
                if (
                  operation.status === "COMPLETED" ||
                  operation.status === "FAILED" ||
                  operation.status === "ABANDONED"
                ) {
                  clearPendingAiOperation(
                    "COACH_SESSION",
                    sessionSid,
                    currentOperationId,
                  );
                  void markCoachMessagesStale(queryClient, sessionSid);
                }
              })
              .catch(() => undefined);
          }
          return response;
        } finally {
          sidOverrideRef.current = null;
          const persistedSid = sidRef.current || activeSid;
          const persistedIntent = intentOverrideRef.current?.trim();
          if (persistedSid && persistedIntent) {
            writeStoredSessionIntent(persistedSid, persistedIntent);
          }
          intentOverrideRef.current = persistedSid
            ? readStoredSessionIntent(persistedSid)
            : null;
          branchContextRef.current = null;
        }
      },
    });
  }, [ensureSessionForSend, locale, queryClient, t]);

  const chatId = useRef(sid || "__new__");
  const runtime = useChat<CoachUiMessage>({
    id: chatId.current,
    messages: initialMessages,
    transport,
    messageMetadataSchema: z.custom(isCoachRunMetadata).optional(),
    dataPartSchemas: {
      "coach-run": z.custom(isCoachRunSnapshot),
      "coach-activity": z.custom(isCoachActivity),
      "coach-interaction": z.custom(isCoachInteraction),
      "coach-text-segment": z.custom(isCoachTextSegment),
      // Existing business cards retain their domain-specific input validators.
      "coach-tool": z.custom<CoachUiDataParts["coach-tool"]>(),
      "coach-user-tool-result":
        z.custom<CoachUiDataParts["coach-user-tool-result"]>(),
      "coach-status": z.custom<CoachUiDataParts["coach-status"]>(),
      "coach-tool-progress":
        z.custom<CoachUiDataParts["coach-tool-progress"]>(),
      "coach-context-window":
        z.custom<CoachUiDataParts["coach-context-window"]>(),
      "coach-branch-opened":
        z.custom<CoachUiDataParts["coach-branch-opened"]>(),
      "coach-turn-error": z.custom<CoachUiDataParts["coach-turn-error"]>(),
      "coach-operation": z.custom<CoachUiDataParts["coach-operation"]>(),
    },
    onData: (part) => {
      if (part.type !== COACH_TURN_ERROR_PART_TYPE) return;
      inlineTurnErrorRef.current = true;
      const currentSid = sidRef.current;
      if (currentSid) clearPendingAiOperation("COACH_SESSION", currentSid);
    },
    onError: (err) => {
      const pendingSid = pendingApplySidRef.current;
      pendingApplySidRef.current = null;
      if (pendingSid) {
        // USER 已在准入前落库；失败后仍粘同一 sid，便于刷新/重试恢复「你好」。
        persistSidRef.current?.(pendingSid);
        void queryClient.invalidateQueries({
          queryKey: aiCoachMessagesQueryKey(pendingSid),
        });
        invalidateCoachSessionLists(queryClient);
      }
      if (err.name === "AbortError") return;
      if (err.message === "Unauthorized") {
        router.push(getLoginHrefWithCallback());
        return;
      }
      if (inlineTurnErrorRef.current) {
        inlineTurnErrorRef.current = false;
        return;
      }
      const visibleError = resolveCoachVisibleErrorMessage(err, {
        operation: operationErrorT,
        turn: turnErrorT,
        transcript: (key) => t(`transcript.${key}`),
      });
      setTurnError(visibleError);
      toast.error(visibleError);
    },
    onFinish: ({ isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) {
        // This is a local presentation of a lost connection, not a fabricated
        // completion. Reopening obtains the producer's authoritative snapshot.
        const endedAt = new Date().toISOString();
        chatRef.current?.setMessages((messages) =>
          messages.map((message, index) =>
            index !== messages.length - 1
              ? message
              : {
                  ...message,
                  parts: message.parts.map((part) => {
                    if (
                      part.type === "data-coach-run" &&
                      part.data.status === "running"
                    )
                      return {
                        ...part,
                        data: {
                          ...part.data,
                          status: "interrupted" as const,
                          endedAt,
                          executionMs:
                            part.data.previousExecutionMs +
                            Math.max(
                              0,
                              Date.parse(endedAt) -
                                Date.parse(part.data.startedAt),
                            ),
                        },
                      };
                    if (
                      part.type === "data-coach-activity" &&
                      ["running", "queued"].includes(part.data.status)
                    )
                      return {
                        ...part,
                        data: {
                          ...part.data,
                          status: "interrupted" as const,
                          endedAt,
                        },
                      };
                    return part;
                  }),
                },
          ),
        );
      }
      invalidateCoachSessionLists(queryClient);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ai.usageSummary(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ai.usageEvents(),
      });
      const pendingSid = pendingApplySidRef.current;
      if (pendingSid) {
        pendingApplySidRef.current = null;
        persistSidRef.current?.(pendingSid);
      }
      const currentSid = sidRef.current;
      if (currentSid) {
        // The current turn is owned by the in-memory SSE runtime. Persistence
        // is history/refresh state only, so never refetch or remount the live
        // transcript at turn completion.
        void markCoachMessagesStale(queryClient, currentSid);
      }
    },
  });

  chatRef.current = runtime;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // StrictMode immediately remounts effects; do not abort seed sends then.
      queueMicrotask(() => {
        if (!mountedRef.current) void chatRef.current?.stop();
      });
    };
  }, []);

  return (
    <CoachChatProvider
      chat={runtime}
      onStopError={(error) => toast.error(error.message)}
    >
      {enableUrlSeed ? (
        <CoachSeedAutoStarter
          intentOverrideRef={intentOverrideRef}
          branchContextRef={branchContextRef}
        />
      ) : null}
      <CoachThread
        isLoading={creatingSession}
        turnError={turnError}
        thinkingEnabled={thinkingEnabled}
        onThinkingEnabledChange={updateThinkingEnabled}
        onPrepareTurnRetry={prepareTurnRetry}
        variant={variant}
      />
    </CoachChatProvider>
  );
}
