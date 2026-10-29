"use client";
import { fitnessNotificationTarget } from "@shared/fitness-assessment";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/api/notifications";
import { MarkdownProse } from "@/components/MarkdownProse";
import {
  isThirdPartyExportFailureNotification,
  resolveNotificationDisplay,
  type NotificationTone,
} from "@/lib/notification-display";
import { cn } from "@/lib/utils";
import { clockIntlOptions } from "@/lib/time-format";
import { useStore } from "@/lib/store";
import { ManagedExternalExportFailureActions } from "@deployment/managed-ui";

const toneStyles: Record<
  NotificationTone,
  {
    iconWrap: string;
    icon: string;
    chip: string;
    Icon: LucideIcon;
  }
> = {
  success: {
    iconWrap: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  warning: {
    iconWrap: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    icon: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-500/12 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  insight: {
    iconWrap: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    icon: "text-sky-700 dark:text-sky-300",
    chip: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    Icon: Sparkles,
  },
  neutral: {
    iconWrap: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300",
    icon: "text-neutral-700 dark:text-neutral-300",
    chip: "bg-neutral-500/10 text-neutral-700 dark:bg-white/10 dark:text-neutral-300",
    Icon: Bell,
  },
};

function formatNotificationTime(
  iso: string,
  locale: string,
  timeFormat: string,
) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...clockIntlOptions(timeFormat),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function NotificationDetailModal(props: {
  item: NotificationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivedLabel: string;
  noBody: string;
}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("notifications");
  const fitnessT = useTranslations("AiCoachPage.fitnessAssessment");
  const { timeFormat } = useStore();
  const item = props.item;
  const created = item
    ? formatNotificationTime(item.createdAt, locale, timeFormat)
    : "";
  const resolved = item ? resolveNotificationDisplay(item, t) : null;
  const body = resolved ? (resolved.bodyMarkdown ?? "").trim() : "";
  const titleText = resolved?.title ?? "";
  const tone = toneStyles[resolved?.tone ?? "neutral"];
  const Icon = tone.Icon;
  const fitnessTarget = fitnessNotificationTarget(item);
  const reviewSid =
    item?.kind === "REVIEW_DIGEST" && item.digestId
      ? `review-digest-${item.digestId}`
      : (fitnessTarget?.sid ?? null);
  const openReview = () => {
    if (!reviewSid) return;
    props.onOpenChange(false);
    router.push(
      `/${locale}/ai-coach?sid=${encodeURIComponent(reviewSid)}${fitnessTarget?.branchId ? `&branchId=${encodeURIComponent(fitnessTarget.branchId)}` : ""}`,
    );
  };

  return (
    <ResponsiveModal open={props.open} onOpenChange={props.onOpenChange}>
      <ResponsiveModalContent className="flex min-h-0 max-h-[min(85dvh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {item && resolved ? (
          <>
            <header className="shrink-0 border-b border-border/60 px-4 pb-3.5 pt-4 pr-12">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-mobile-caption pc:text-[11px] leading-4 text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-mobile-caption pc:text-[11px] font-medium",
                    tone.chip,
                  )}
                >
                  <Icon className={cn("h-3 w-3", tone.icon)} aria-hidden />
                  {resolved.eyebrow}
                </span>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <time dateTime={item.createdAt}>
                  {props.receivedLabel} {created}
                </time>
              </div>

              <ResponsiveModalHeader className="mt-2 space-y-0 text-left">
                <ResponsiveModalTitle className="line-clamp-3 text-sm font-semibold leading-snug tracking-tight text-foreground">
                  {titleText}
                </ResponsiveModalTitle>
                <ResponsiveModalDescription
                  id="responsive-modal-description"
                  className="sr-only"
                >
                  {props.receivedLabel} {created}
                </ResponsiveModalDescription>
              </ResponsiveModalHeader>

              {resolved.summary.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {resolved.summary.map((summary) => (
                    <span
                      key={`${summary.label}:${summary.value}`}
                      className={cn(
                        "inline-flex h-6 max-w-full items-center gap-1 rounded-md px-2 text-mobile-caption pc:text-[11px] font-medium",
                        toneStyles[summary.tone ?? "neutral"].chip,
                      )}
                    >
                      <span className="truncate text-muted-foreground">
                        {summary.label}
                      </span>
                      <span className="truncate">{summary.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {body ? (
                <MarkdownProse markdown={body} />
              ) : (
                <p className="text-sm text-muted-foreground">{props.noBody}</p>
              )}
            </div>

            {reviewSid ? (
              <footer className="shrink-0 border-t border-border/60 px-4 py-3">
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={openReview}
                >
                  {fitnessTarget ? fitnessT("openAssessment") : t("openReview")}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </footer>
            ) : item && isThirdPartyExportFailureNotification(item) ? (
              <footer className="shrink-0 border-t border-border/60 px-4 py-3">
                <ManagedExternalExportFailureActions
                  item={item}
                  onResolved={() => props.onOpenChange(false)}
                />
              </footer>
            ) : null}
          </>
        ) : null}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
