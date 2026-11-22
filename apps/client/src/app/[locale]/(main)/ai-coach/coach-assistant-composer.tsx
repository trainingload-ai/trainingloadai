"use client";

import { useSearchParams } from "next/navigation";
import {
  PMC_COACH_SEARCH_KEYS,
  pmcSelectionFromSearch,
} from "@/lib/pmc-coach-context";
import type { PmcProjectionSelection } from "@shared/pmc-projection";

import { useGuestAccessText } from "@deployment/managed-ui";

import { useEffect, useMemo, useState, useRef } from "react";
import { useCoachThread, useCoachActions } from "./coach-chat-provider";
import {
  PromptInput,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { ArrowUp, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CoachContextUsage } from "./coach-context-usage";
import { readCoachStatusSnapshot } from "./coach-composer-status";
import {
  COACH_PROMPT_EXAMPLE_LIMIT,
  getCoachPromptExamples,
  sampleCoachPromptExamples,
} from "./coach-chat-view-model";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function CoachComposerContext() {
  const context = useCoachThread(
    (state) => readCoachStatusSnapshot(state.messages).contextWindow,
  );
  return <CoachContextUsage context={context} compact />;
}

export function CoachComposer({
  variant = "footer",
  thinkingEnabled = false,
  onThinkingEnabledChange,
}: {
  variant?: "footer" | "start" | "embedded";
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
}) {
  const t = useTranslations("AiCoachPage");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const demoReadOnly = publicDemo.active;
  const isRunning = useCoachThread((state) => state.isRunning);
  const actions = useCoachActions();
  const [draft, setDraft] = useState("");
  const searchParams = useSearchParams();
  const forecastText = useTranslations("VdotForecast");
  useEffect(() => {
    const metricInquiry =
      searchParams?.get("metricQuestion") === "vo2Max" ||
      searchParams?.get("vdotQuestion") === "1";
    if (!metricInquiry) return;
    setDraft((previous) => previous || forecastText("coachPrompt"));
    const next = new URL(window.location.href);
    next.searchParams.delete("vdotQuestion");
    next.searchParams.delete("metricQuestion");
    window.history.replaceState(
      window.history.state,
      "",
      `${next.pathname}${next.search}${next.hash}`,
    );
  }, [forecastText, searchParams]);
  const pmcText = useTranslations("PmcProjection");
  const [pmcSelection, setPmcSelection] =
    useState<PmcProjectionSelection | null>(null);
  const consumedPmc = useRef(false);
  useEffect(() => {
    if (consumedPmc.current || !searchParams) return;
    const selection = pmcSelectionFromSearch(searchParams);
    if (!selection) return;
    consumedPmc.current = true;
    if (!draft.trim()) {
      setDraft(
        pmcText("coachPrompt", {
          scope: pmcText(`scopes.${selection.scope}`),
          scenario: pmcText(`scenarios.${selection.scenario}`),
        }),
      );
      setPmcSelection(selection);
    }
    const next = new URL(window.location.href);
    for (const key of PMC_COACH_SEARCH_KEYS) next.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      "",
      `${next.pathname}${next.search}${next.hash}`,
    );
  }, [draft, pmcText, searchParams]);
  const isStart = variant === "start";
  const isEmbedded = variant === "embedded";
  const modelPurposeLabel = thinkingEnabled
    ? t("composer.deepMode")
    : t("composer.standardMode");

  const composerAction = isRunning ? (
    <Button
      type="button"
      size="icon-sm"
      className="relative z-10 shrink-0 rounded-full"
      aria-label={t("actions.stop")}
      title={t("actions.stop")}
      onClick={() => void actions.stop()}
    >
      <Square className="!size-3" fill="currentColor" aria-hidden="true" />
    </Button>
  ) : (
    <Button
      type="submit"
      size="icon-sm"
      className="relative z-10 shrink-0 rounded-full"
      disabled={demoReadOnly || !draft.trim()}
      aria-label={t("actions.send")}
      title={t("actions.send")}
    >
      <ArrowUp aria-hidden="true" />
    </Button>
  );

  return (
    <div
      className={cn(
        isStart
          ? "mx-auto w-full max-w-3xl"
          : isEmbedded
            ? "mx-auto w-full max-w-none px-3 pb-3 pt-2"
            : "mx-auto w-full max-w-lg px-2 pb-safe-or-1 pt-2 sm:max-w-[920px] sm:px-3",
        !isStart && !isEmbedded && "desktop-coach-composer",
      )}
    >
      <PromptInput
        onSubmit={({ text }) => {
          if (!demoReadOnly && !isRunning && text.trim()) {
            setDraft("");
            void actions.append(
              pmcSelection
                ? {
                    role: "user",
                    content: [
                      { type: "text", text },
                      {
                        type: "data",
                        name: "coach-user-tool-result",
                        data: {
                          toolUseId: "client:pmc_projection_context",
                          content: pmcSelection,
                        },
                      },
                    ],
                  }
                : text,
            );
            setPmcSelection(null);
          }
        }}
        className={cn(
          "rounded-overlay border-0 bg-neutral-100 pc:rounded-surface shadow-none dark:bg-muted/45 focus-within:ring-1 focus-within:ring-ring/30",
          "px-3 py-2 sm:p-2",
        )}
      >
        {isStart ? (
          <div className="flex items-end gap-2 sm:block">
            <PromptInputTextarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={demoReadOnly}
              aria-label={t("composer.placeholder")}
              rows={1}
              placeholder={
                demoReadOnly
                  ? demoText("aiReadOnly")
                  : t("composer.placeholder")
              }
              className="max-h-28 min-h-6 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-1 text-base leading-6 text-foreground shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground sm:min-h-[72px] sm:w-full sm:p-0 sm:text-sm"
            />
            <div className="flex shrink-0 items-end justify-end gap-3 sm:items-center sm:border-t sm:border-border/45 sm:pt-1 sm:justify-between">
              <div className="hidden flex-1 text-mobile-caption pc:text-xs text-muted-foreground sm:block">
                {t("composer.hint")}
              </div>
              <div className="hidden sm:block">
                <CoachComposerContext />
              </div>
              <label
                className="hidden h-8 min-w-max shrink-0 items-center gap-1.5 text-mobile-caption pc:text-xs font-medium leading-none text-muted-foreground sm:flex"
                title={t("composer.modelPurposeHint")}
              >
                <Switch
                  checked={thinkingEnabled}
                  onCheckedChange={onThinkingEnabledChange}
                  disabled={demoReadOnly || isRunning}
                  aria-label={modelPurposeLabel}
                  className="shrink-0"
                />
                <span className="whitespace-nowrap">{modelPurposeLabel}</span>
              </label>
              {composerAction}
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2 sm:flex-col sm:gap-3">
            <PromptInputTextarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={demoReadOnly}
              aria-label={t("composer.placeholder")}
              rows={1}
              placeholder={
                demoReadOnly ? demoText("aiReadOnly") : t("chatPlaceholder")
              }
              className="max-h-28 min-h-6 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-1 text-base leading-6 text-foreground shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground sm:max-h-[200px] sm:w-full sm:p-1 sm:text-sm"
            />
            <div className="flex min-w-0 shrink-0 items-end gap-2 sm:w-full sm:flex-row sm:justify-end">
              <CoachComposerContext />
              <label
                className="hidden h-8 min-w-max shrink-0 items-center gap-1.5 text-mobile-caption pc:text-xs font-medium leading-none text-muted-foreground sm:flex"
                title={t("composer.modelPurposeHint")}
              >
                <Switch
                  checked={thinkingEnabled}
                  onCheckedChange={onThinkingEnabledChange}
                  disabled={demoReadOnly || isRunning}
                  aria-label={modelPurposeLabel}
                  className="shrink-0"
                />
                <span className="hidden whitespace-nowrap sm:inline">
                  {modelPurposeLabel}
                </span>
              </label>
              {composerAction}
            </div>
          </div>
        )}
      </PromptInput>
    </div>
  );
}

export function CoachPromptExamples() {
  const t = useTranslations("AiCoachPage");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const thread = useCoachActions()!;
  const prompts = useMemo(() => getCoachPromptExamples(t), [t]);
  const [visiblePrompts, setVisiblePrompts] = useState(() =>
    prompts.slice(0, COACH_PROMPT_EXAMPLE_LIMIT),
  );

  useEffect(() => {
    setVisiblePrompts(sampleCoachPromptExamples(prompts));
  }, [prompts]);

  return (
    <>
      <div className="mt-3 space-y-2 pc:hidden">
        {visiblePrompts.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="w-full rounded-surface border border-border/60 bg-neutral-100 px-3 py-2.5 text-left text-sm leading-5 text-foreground active:bg-neutral-200 dark:bg-muted/45 dark:active:bg-muted"
            disabled={publicDemo.active}
            title={publicDemo.active ? demoText("readOnlyAction") : undefined}
            onClick={() => {
              if (!publicDemo.active) thread.append(prompt);
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="hidden space-y-3 border-0 bg-transparent p-0 pt-2 shadow-none pc:block">
        <div className="text-center text-sm font-medium text-foreground">
          {t("examplesTitle")}
        </div>
        <div className="flex flex-wrap justify-center gap-2 border-0 bg-transparent p-0 shadow-none">
          {visiblePrompts.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="compact"
              variant="secondary"
              className="whitespace-nowrap border-0 bg-neutral-100 px-3 shadow-none transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
              disabled={publicDemo.active}
              title={publicDemo.active ? demoText("readOnlyAction") : undefined}
              onClick={() => {
                if (!publicDemo.active) thread.append(prompt);
              }}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
