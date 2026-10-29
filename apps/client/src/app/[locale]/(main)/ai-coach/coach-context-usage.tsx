"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextUsageBar,
} from "@/components/ai-elements/context";
import type { CoachContextWindowData } from "@/lib/ai-coach-ui-parts";

export function CoachContextUsage({
  context,
  compact = false,
}: {
  context: CoachContextWindowData | null;
  compact?: boolean;
}) {
  const t = useTranslations("AiCoachPage.status.contextWindow");
  const locale = useLocale();
  const titleId = useId();
  const descriptionId = useId();
  const percent = context
    ? `~${Math.round((context.usedInputTokens / context.inputBudgetTokens) * 100)}%`
    : null;
  const format = (value: number) =>
    new Intl.NumberFormat(locale).format(Math.round(value));
  const remaining = context
    ? Math.max(0, context.inputBudgetTokens - context.usedInputTokens)
    : 0;
  return (
    <Context
      usedTokens={context?.usedInputTokens ?? 0}
      maxTokens={context?.inputBudgetTokens ?? 0}
    >
      <ContextTrigger
        aria-label={percent ? t("ariaActive", { percent }) : t("ariaIdle")}
        data-coach-context-trigger
        className={compact ? "h-8 px-1.5 text-xs" : "h-6 px-1 text-[11px]"}
      >
        {percent
          ? compact
            ? percent
            : t("trigger", { percent })
          : t("titleIdle")}
      </ContextTrigger>
      <ContextContent
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-coach-context-panel
      >
        <ContextContentHeader>
          <div className="flex items-center justify-between gap-3 text-sm">
            <h3 id={titleId} className="font-medium">
              {t("titleIdle")}
            </h3>
            {percent && (
              <span className="tabular-nums text-muted-foreground">
                {percent}
              </span>
            )}
          </div>
          {context && (
            <ContextUsageBar
              aria-label={t("inputBudget")}
              aria-valuetext={percent ?? undefined}
            />
          )}
        </ContextContentHeader>
        <ContextContentBody>
          {context ? (
            <>
              <dl className="space-y-2">
                {(
                  [
                    ["usedInput", context.usedInputTokens],
                    ["inputBudget", context.inputBudgetTokens],
                    ["remaining", remaining],
                    ["reservedOutput", context.reservedOutputTokens],
                    ["totalWindow", context.maxContextTokens],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t(key)}</dt>
                    <dd className="tabular-nums">
                      {key === "usedInput" ? "~" : ""}
                      {format(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              {context.compressed && (
                <p className="rounded-sm bg-muted/60 px-2 py-1.5 leading-5">
                  {t("compressed", { count: context.compactedMessages })}
                </p>
              )}
              {context.usedInputTokens >= context.compressionThresholdTokens &&
                context.compressionThresholdTokens > 0 && (
                  <p className="text-muted-foreground leading-5">
                    {t("nearLimit")}
                  </p>
                )}
            </>
          ) : (
            <p className="text-muted-foreground leading-5">
              {t("idleDescription")}
            </p>
          )}
        </ContextContentBody>
        <ContextContentFooter id={descriptionId}>
          {t("estimateHint")}
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}
