"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActivityId } from "@/hooks/useActivityId";
import { useAiAnalysisStream } from "@/hooks/useAiAnalysis";
import { fetchActivityAiReview } from "@/api/activity";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAiDataConsent } from "@/api/ai-data-consent";
import { featureAllowed, useFeatureAccess } from "@/api/feature-access";
import { queryKeys } from "@/lib/query-keys";
import { ManagedActivityReviewAccessPrompt } from "@deployment/managed-ui";
import { AiDataConsentPrompt } from "@/components/ai-consent/AiDataConsentPrompt";
import {
  ActivityCoachDialogBody,
  preloadActivityCoachConversation,
} from "./activity-coach-dialog-body";

function pickLocalizedMarkdown(raw: string, locale: string) {
  if (!raw) return "";
  try {
    // 缓存结果可能是 { zh, en } JSON；流式过程中解析失败时保留原文展示。
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const zh = typeof obj.zh === "string" ? obj.zh : undefined;
      const en = typeof obj.en === "string" ? obj.en : undefined;
      return locale === "zh" ? (zh ?? en ?? raw) : (en ?? zh ?? raw);
    }
  } catch {
    /* 流式过程中可能尚未构成完整 JSON，直接展示原文 */
  }
  return raw;
}

function toPreviewText(markdown: string) {
  if (!markdown) return "";
  // 卡片预览只需要纯文本摘要，完整 Markdown 作为对话里的首条助手消息。
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AIAnalysis = () => {
  const t = useTranslations("AIAnalysis");
  const queryClient = useQueryClient();
  const activityId = useActivityId();
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "zh";
  const access = useFeatureAccess();
  const consent = useAiDataConsent();
  const accessLoading = access.isLoading || consent.isLoading;
  const hasReviewAccess = featureAllowed(
    access.data,
    "ai.activityReview",
  );
  const hasAiDataConsent = consent.data?.granted === true;

  const reviewQuery = useQuery({
    queryKey: queryKeys.activity.aiReview(activityId, lang),
    queryFn: () => fetchActivityAiReview(activityId!, lang),
    enabled: Boolean(activityId) && hasAiDataConsent,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || d.found !== true) return false;
      const st = d.status;
      if (st === "PENDING" || st === "RUNNING") return 3000;
      return false;
    },
  });

  const review = reviewQuery.data;
  const hasStoredMarkdown =
    review?.found === true && Boolean((review.markdown ?? "").trim());

  const workerPending =
    review?.found === true &&
    (review.status === "PENDING" || review.status === "RUNNING") &&
    !hasStoredMarkdown;

  const reviewSettled = !accessLoading && !reviewQuery.isLoading;
  const streamEnabled =
    Boolean(activityId) &&
    hasReviewAccess &&
    hasAiDataConsent &&
    reviewSettled &&
    !hasStoredMarkdown &&
    !workerPending &&
    !reviewQuery.isError;

  const {
    data: aiInfo,
    isLoading: aiInfoLoading,
    error,
    isDone: streamDone,
    operation,
  } = useAiAnalysisStream(activityId ?? "", true, 0, streamEnabled);

  const reviewMarkdown =
    reviewQuery.data?.found === true
      ? (reviewQuery.data.markdown ?? "").trim()
      : "";

  useEffect(() => {
    if (streamEnabled && streamDone) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activity.aiReview(activityId, lang),
      });
    }
  }, [streamEnabled, streamDone, queryClient, activityId, lang]);

  useEffect(() => {
    if (operation?.status === "COMPLETED") {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activity.aiReview(activityId, lang),
      });
    }
  }, [activityId, lang, operation?.status, queryClient]);

  const markdownBody = useMemo(
    () => pickLocalizedMarkdown(aiInfo || reviewMarkdown, lang),
    [aiInfo, reviewMarkdown, lang],
  );

  const previewText = useMemo(
    () => toPreviewText(markdownBody),
    [markdownBody],
  );
  const hasContent = Boolean(previewText.trim());
  const loadingCombined =
    accessLoading ||
    reviewQuery.isLoading ||
    (streamEnabled && aiInfoLoading && !hasContent) ||
    Boolean(workerPending && !hasContent);
  const reviewFailed =
    !hasContent &&
    !loadingCombined &&
    (reviewQuery.isError || Boolean(error) || (streamEnabled && streamDone));
  const showFreeUpsell =
    !accessLoading && !hasReviewAccess && !hasContent && !loadingCombined;

  const handleCardClick = () => {
    if (loadingCombined && !markdownBody) {
      toast.info(t("analyzing"));
      return;
    }
    setOpen(true);
  };

  const analyzingPulse = (
    <div className="flex min-h-[72px] w-full flex-1 items-center justify-center text-center">
      <p className="animate-pulse text-sm text-muted-foreground">
        {t("analyzing")}
      </p>
    </div>
  );

  return (
    <div className="min-h-0 min-w-0">
      {!accessLoading && !hasAiDataConsent ? (
        <AiDataConsentPrompt
          className="mx-auto w-full max-w-md"
          source="ACCOUNT_SETTINGS"
          variant="compact"
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:min-h-0">
          {showFreeUpsell ? (
            <ManagedActivityReviewAccessPrompt />
          ) : reviewFailed ? (
            <p className="text-mobile-caption pc:text-xs text-muted-foreground">
              {error instanceof Error ? error.message : t("analysisFailed")}
            </p>
          ) : hasContent ? (
            <button
              type="button"
              onClick={handleCardClick}
              onMouseEnter={preloadActivityCoachConversation}
              onFocus={preloadActivityCoachConversation}
              className="group flex min-h-[96px] w-full min-w-0 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative max-h-[72px] min-h-0 flex-1 overflow-hidden">
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:my-1.5 prose-p:leading-6 prose-headings:my-1.5 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground dark:prose-strong:text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdownBody}
                  </ReactMarkdown>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-neutral-50 via-neutral-50/90 to-transparent dark:from-[#151817] dark:via-[#151817]/90" />
              </div>
              <div className="mt-1.5 flex items-center justify-between pt-1.5 text-mobile-caption font-medium text-[#3f8067] pc:text-xs dark:text-[#91c9af]">
                <span>{t("expand")} ›</span>
              </div>
            </button>
          ) : (
            analyzingPulse
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 pc:h-[min(86vh,780px)] pc:max-w-[800px] pc:p-0">
              <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-14 text-left pc:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <Sparkles
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <DialogTitle className="text-sm font-semibold leading-5">
                    {t("aiDetailedAnalysis")}
                  </DialogTitle>
                  <span className="text-[10px] font-normal tracking-[0.2px] text-muted-foreground/65">
                    · {t("generated")}
                  </span>
                </div>
                <DialogDescription className="sr-only">
                  {t("description")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {open && activityId && markdownBody ? (
                  <ActivityCoachDialogBody
                    activityId={activityId}
                    markdown={markdownBody}
                  />
                ) : null}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
};

export default AIAnalysis;
