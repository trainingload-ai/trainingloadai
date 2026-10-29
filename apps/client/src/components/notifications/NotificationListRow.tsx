"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Bell, CheckCircle2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/api/notifications";
import {
  getNotificationPreview,
  resolveNotificationDisplay,
  type NotificationTone,
} from "@/lib/notification-display";
import { clockIntlOptions } from "@/lib/time-format";
import { useStore } from "@/lib/store";

const toneStyles: Record<
  NotificationTone,
  {
    row: string;
    iconWrap: string;
    icon: string;
    chip: string;
    Icon: LucideIcon;
  }
> = {
  success: {
    row: "border-emerald-500/20 bg-emerald-50/80 hover:bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/15",
    iconWrap: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  warning: {
    row: "border-amber-500/25 bg-amber-50/85 hover:bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/10 dark:hover:bg-amber-400/15",
    iconWrap: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    icon: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-500/12 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  insight: {
    row: "border-sky-500/20 bg-sky-50/80 hover:bg-sky-50 dark:border-sky-400/25 dark:bg-sky-400/10 dark:hover:bg-sky-400/15",
    iconWrap: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    icon: "text-sky-700 dark:text-sky-300",
    chip: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    Icon: Sparkles,
  },
  neutral: {
    row: "border-neutral-200/70 bg-white/75 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/7",
    iconWrap: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300",
    icon: "text-neutral-700 dark:text-neutral-300",
    chip: "bg-neutral-500/10 text-neutral-700 dark:bg-white/10 dark:text-neutral-300",
    Icon: Bell,
  },
};

function formatCompactNotificationTime(
  iso: string,
  locale: string,
  timeFormat: string,
) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...clockIntlOptions(timeFormat),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function NotificationUnreadDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="pointer-events-none absolute -left-0.5 -top-0.5 z-[1] h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-background"
      aria-hidden
    />
  );
}

export function NotificationListRow({
  item,
  onClick,
  unreadLabel,
}: {
  item: NotificationItem;
  onClick: () => void;
  unreadLabel: string;
}) {
  const locale = useLocale();
  const t = useTranslations("notifications");
  const { timeFormat } = useStore();
  const display = resolveNotificationDisplay(item, t);
  const { title, bodyMarkdown } = display;
  const preview = display.preview ?? getNotificationPreview(bodyMarkdown);
  const time = formatCompactNotificationTime(
    item.createdAt,
    locale,
    timeFormat,
  );
  const isUnread = !item.readAt;
  const tone = toneStyles[display.tone];
  const Icon = tone.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-lg border px-3 py-3 text-left transition-colors",
        isUnread ? tone.row : toneStyles.neutral.row,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            isUnread ? tone.iconWrap : toneStyles.neutral.iconWrap,
          )}
          aria-hidden
        >
          <Icon
            className={cn(
              "h-4 w-4",
              isUnread ? tone.icon : toneStyles.neutral.icon,
            )}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-mobile-caption pc:text-[11px] font-medium uppercase text-muted-foreground">
                  {display.eyebrow}
                </span>
                {isUnread ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                ) : null}
              </div>
              <div
                className={cn(
                  "mt-0.5 line-clamp-2 text-sm leading-snug",
                  isUnread ? "font-semibold" : "font-medium",
                )}
              >
                {title}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="whitespace-nowrap text-mobile-caption pc:text-[11px] text-muted-foreground">
                {time}
              </span>
              {isUnread ? (
                <Badge
                  variant="secondary"
                  className="hidden rounded-full bg-emerald-500/10 px-1.5 py-0 text-mobile-unit pc:text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 sm:inline-flex"
                >
                  {unreadLabel}
                </Badge>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="mt-1.5 line-clamp-2 text-mobile-caption pc:text-xs leading-relaxed text-muted-foreground">
              {preview}
            </div>
          ) : null}

          {display.summary.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {display.summary.map((summary) => (
                <span
                  key={`${summary.label}:${summary.value}`}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-md px-2 text-mobile-caption pc:text-[11px] font-medium",
                    toneStyles[summary.tone ?? "neutral"].chip,
                  )}
                >
                  <span className="text-muted-foreground">{summary.label}</span>
                  <span>{summary.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
