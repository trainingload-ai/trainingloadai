"use client";

import { AlertCircle, ArrowRight, KeyRound, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CoachTranscriptItem,
  CoachTranscriptMetaReason,
} from "./coach-transcript-model";

type CoachTranscriptMetaRowProps = {
  item: CoachTranscriptItem;
  onRetry?: () => void;
  retryDisabled?: boolean;
  recoveryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Extra recovery action shown before retry (e.g. switch model and retry). */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
};

function transcriptMetaTitle(
  item: CoachTranscriptItem,
  t: (key: string) => string,
): string {
  if (item.reason === "access_required") {
    return t("titleAccessRequired");
  }
  if (item.reason === "action_in_progress") {
    return t("titleActionInProgress");
  }
  if (item.reason === "settlement_pending") {
    return t("titleSettlementPending");
  }
  if (item.reason === "model_tier") {
    return t("titleModelTierUnavailable");
  }
  if (item.reason === "model_unavailable") {
    return t("titleModelUnavailable");
  }
  switch (item.type) {
    case "turn_failed":
      return t("titleTurnFailed");
    case "system":
      return t("titleSystem");
    case "error":
      return t("titleError");
  }
}

function transcriptReasonLabel(
  reason: CoachTranscriptMetaReason,
  t: (key: string) => string,
): string {
  switch (reason) {
    case "timeout":
      return t("reasonTimeout");
    case "disconnect":
      return t("reasonDisconnect");
    case "rate_limit":
      return t("reasonRateLimit");
    case "access_required":
      return t("reasonAccessRequired");
    case "action_in_progress":
      return t("reasonActionInProgress");
    case "settlement_pending":
      return t("reasonSettlementPending");
    case "model_tier":
      return t("reasonModelTierUnavailable");
    case "model_unavailable":
      return t("reasonModelUnavailable");
    case "auth":
      return t("reasonAuth");
    case "server":
      return t("reasonServer");
    case "internal":
      return t("reasonInternal");
    case "unknown":
      return t("reasonUnknown");
  }
}

export function CoachTranscriptMetaRow({
  item,
  onRetry,
  retryDisabled,
  recoveryAction,
  secondaryAction,
}: CoachTranscriptMetaRowProps) {
  const t = useTranslations("AiCoachPage.transcript");

  const title = transcriptMetaTitle(item, t);
  const reasonLabel =
    item.message?.trim() || transcriptReasonLabel(item.reason, t);

  const showRetry = item.retryable !== false && typeof onRetry === "function";
  const isAccessIssue = item.reason === "access_required";
  const Icon = isAccessIssue ? KeyRound : AlertCircle;

  return (
    <div
      className="flex justify-center px-1 sm:px-0"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex w-full min-w-0 flex-col gap-3 rounded-md bg-neutral-100 p-4 text-sm dark:bg-muted/45",
        )}
      >
        <div className="flex gap-2">
          <Icon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              isAccessIssue
                ? "text-muted-foreground"
                : "text-amber-700 dark:text-amber-400",
            )}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className={cn("font-medium text-foreground")}>{title}</div>
            <div className={cn("text-sm leading-6 text-muted-foreground")}>
              {reasonLabel}
              {item.detail ? (
                <span className="mt-1 block text-muted-foreground">
                  {item.detail}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {recoveryAction || showRetry || secondaryAction ? (
          <div className={cn("flex flex-wrap justify-end gap-2 pt-1")}>
            {recoveryAction ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 border border-neutral-900 bg-neutral-900 text-neutral-50 hover:bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                disabled={recoveryAction.disabled}
                onClick={recoveryAction.onClick}
              >
                {recoveryAction.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            ) : null}
            {showRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={retryDisabled}
                onClick={() => onRetry?.()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
