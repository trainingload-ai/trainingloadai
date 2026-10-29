"use client";

import { useMemo } from "react";
import { useCoachThread } from "./coach-chat-provider";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { useIsMobile } from "@/hooks/use-mobile";
import { CoachAccessExtension } from "@deployment/managed-ui";
import { cn } from "@/lib/utils";
import { fetchCoachActions, type CoachActionListItem } from "@/api/ai-coach";
import { MutationAppliedCard } from "./cards/MutationAppliedCard";
import {
  getCoachDisplayName,
  getCoachHeroTitle,
} from "./coach-chat-view-model";
import { CoachComposer, CoachPromptExamples } from "./coach-assistant-composer";
import { CoachMessageList } from "./coach-run-timeline";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { CoachThreadReceiptsProvider } from "./coach-thread-receipts";
import {
  CoachQuestionDock,
  CoachQuestionFlowProvider,
} from "./coach-question-flow";
import { CoachThinkingEnabledContext } from "./coach-thinking-context";
import {
  CoachTurnRetryContext,
  type CoachTurnRetryControls,
} from "./coach-turn-retry-context";

function MobileCoachActionsPanel() {
  const t = useTranslations("AiCoachPage");
  const queryClient = useQueryClient();
  const actionsQuery = useQuery({
    queryKey: ["ai-coach", "actions", "mobile-recent"],
    queryFn: () => fetchCoachActions({ take: 3 }),
    staleTime: 15_000,
  });
  const actions = actionsQuery.data ?? [];

  if (!actionsQuery.isLoading && actions.length === 0) return null;

  const refreshActions = () => {
    void queryClient.invalidateQueries({
      queryKey: ["ai-coach", "actions"],
    });
  };

  return (
    <section className="mb-3 rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
      <div className="flex min-h-7 items-center gap-2">
        <span className="grid size-7 place-items-center rounded-compact bg-background text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {t("recentActions")}
        </h2>
        {actionsQuery.isLoading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="mt-2 space-y-2">
          {actions.map((action: CoachActionListItem) => (
            <MutationAppliedCard
              key={action.id}
              dense
              result={{
                kind: "mutation_applied",
                ok: true,
                actionId: action.id,
                type: action.type,
                riskTier: action.riskTier,
                summary: action.summary,
                undoUntil: action.undoneAt ? null : action.undoUntil,
                payload: null,
              }}
              onUndone={refreshActions}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MobileCoachEmptyState() {
  const t = useTranslations("AiCoachPage");

  return (
    <div className="flex h-full min-h-0 flex-col justify-between pb-2 pt-1 pc:hidden">
      <CoachAccessExtension />
      <div>
        <MobileCoachActionsPanel />
        <p className="text-sm leading-5 text-muted-foreground">
          {t("emptyChatHint")}
        </p>
        <CoachPromptExamples />
      </div>
    </div>
  );
}

function CoachEmptyThread({
  thinkingEnabled,
  onThinkingEnabledChange,
}: {
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (enabled: boolean) => void;
}) {
  const t = useTranslations("AiCoachPage");
  const isMobile = useIsMobile();
  const { data: session } = useViewerSession();
  const fallbackName = t("fallbackName");
  const displayName = getCoachDisplayName({
    fallbackName,
    rawName: session?.user?.name,
  });
  const heroTitle = getCoachHeroTitle({
    displayName,
    fallbackName,
    t,
  });

  return (
    <>
      {isMobile ? <MobileCoachEmptyState /> : null}
      <div className="hidden h-full min-h-0 flex-col justify-center px-0 py-4 pc:flex sm:py-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[920px] flex-col justify-center gap-5">
          <div className="space-y-5">
            <div className="space-y-2 text-center">
              <div className="mx-auto max-w-3xl truncate text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
                {heroTitle}
              </div>
              <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                {t("heroDescription")}
              </p>
            </div>
            <CoachComposer
              variant="start"
              thinkingEnabled={thinkingEnabled}
              onThinkingEnabledChange={onThinkingEnabledChange}
            />
            <CoachPromptExamples />
          </div>
        </div>
      </div>
    </>
  );
}

export function CoachThread({
  isLoading,
  turnError,
  thinkingEnabled,
  onThinkingEnabledChange,
  onPrepareTurnRetry,
  variant = "page",
}: {
  isLoading: boolean;
  turnError: string | null;
  thinkingEnabled: boolean;
  onThinkingEnabledChange: (enabled: boolean) => void;
  onPrepareTurnRetry?: CoachTurnRetryControls["prepareRetry"];
  variant?: "page" | "embedded";
}) {
  const t = useTranslations("AiCoachPage");
  const turnRetryControls = useMemo<CoachTurnRetryControls | null>(
    () =>
      onPrepareTurnRetry
        ? { thinkingEnabled, prepareRetry: onPrepareTurnRetry }
        : null,
    [onPrepareTurnRetry, thinkingEnabled],
  );
  const isEmpty = useCoachThread((state) => state.messages.length === 0);
  const isMobile = useIsMobile();
  const embedded = variant === "embedded";

  return (
    <CoachThinkingEnabledContext.Provider value={thinkingEnabled}>
      <CoachTurnRetryContext.Provider value={turnRetryControls}>
        <CoachThreadReceiptsProvider>
          <CoachQuestionFlowProvider>
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <Conversation
                className={cn(
                  "min-h-0 flex-1 overflow-x-hidden overscroll-y-contain bg-transparent [-webkit-overflow-scrolling:touch]",
                  embedded
                    ? "overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
                    : cn(
                        "px-3 py-4 pb-safe-or-2 sm:px-5 sm:py-6",
                        isEmpty
                          ? "overflow-y-auto pc:overflow-y-hidden"
                          : "overflow-y-auto",
                      ),
                )}
              >
                <ConversationContent
                  className={cn(
                    "mx-auto flex w-full flex-col p-0",
                    embedded
                      ? "max-w-none gap-4 sm:gap-5"
                      : cn(
                          "max-w-lg gap-4 sm:max-w-[920px] sm:gap-6",
                          isEmpty && "h-full min-h-0",
                        ),
                  )}
                >
                  {isLoading ? (
                    <div
                      className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <LoaderCircle className="h-8 w-8 animate-spin" />
                      <span>{t("loadingThread")}</span>
                    </div>
                  ) : null}
                  {embedded || !isEmpty ? null : (
                    <CoachEmptyThread
                      thinkingEnabled={thinkingEnabled}
                      onThinkingEnabledChange={onThinkingEnabledChange}
                    />
                  )}
                  <CoachMessageList />
                  {turnError ? (
                    <div
                      role="alert"
                      className="rounded-md bg-neutral-100 px-3 py-2 text-sm leading-6 text-red-700 dark:bg-muted/45 dark:text-red-300"
                    >
                      {turnError}
                    </div>
                  ) : null}
                  {isMobile && !isEmpty && !embedded ? (
                    <MobileCoachActionsPanel />
                  ) : null}
                </ConversationContent>
                <ConversationScrollButton
                  aria-label={t("timeline.scrollToBottom")}
                />
              </Conversation>
              <footer
                className={cn(
                  "z-20 shrink-0 bg-background",
                  !embedded && isEmpty && "pc:hidden",
                )}
              >
                <CoachQuestionDock embedded={embedded}>
                  <CoachComposer
                    variant={embedded ? "embedded" : "footer"}
                    thinkingEnabled={thinkingEnabled}
                    onThinkingEnabledChange={onThinkingEnabledChange}
                  />
                </CoachQuestionDock>
              </footer>
            </div>
          </CoachQuestionFlowProvider>
        </CoachThreadReceiptsProvider>
      </CoachTurnRetryContext.Provider>
    </CoachThinkingEnabledContext.Provider>
  );
}

export function CoachThreadLoading() {
  const t = useTranslations("AiCoachPage");

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent px-3 py-4 sm:px-5 sm:py-6">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground sm:max-w-[920px]">
          <LoaderCircle className="h-8 w-8 animate-spin" />
          <span>{t("loadingThread")}</span>
        </div>
      </div>
      <div className="shrink-0 border-t border-border/70 bg-background/95 px-2 pb-safe-or-1 pt-2 sm:px-3">
        <div className="mx-auto h-12 w-full max-w-lg rounded-overlay border border-border/70 bg-muted/20 sm:h-[74px] sm:max-w-[920px]" />
      </div>
    </div>
  );
}
