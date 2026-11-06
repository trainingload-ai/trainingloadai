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
    row: "border-[hsl(var(--emerald-500)/0.2)] bg-[hsl(var(--emerald-50)/0.8)] hover:bg-[hsl(var(--emerald-50))] dark:border-[hsl(var(--emerald-400)/0.25)] dark:bg-[hsl(var(--emerald-400)/0.1)] dark:hover:bg-[hsl(var(--emerald-400)/0.15)]",
    iconWrap:
      "bg-[hsl(var(--emerald-500)/0.1)] text-[hsl(var(--emerald-700))] dark:text-[hsl(var(--emerald-300))]",
    icon: "text-[hsl(var(--emerald-700))] dark:text-[hsl(var(--emerald-300))]",
    chip: "bg-[hsl(var(--emerald-500)/0.1)] text-[hsl(var(--emerald-700))] dark:bg-[hsl(var(--emerald-500)/0.15)] dark:text-[hsl(var(--emerald-300))]",
    Icon: CheckCircle2,
  },
  warning: {
    row: "border-[hsl(var(--amber-500)/0.25)] bg-[hsl(var(--amber-50)/0.85)] hover:bg-[hsl(var(--amber-50))] dark:border-[hsl(var(--amber-400)/0.25)] dark:bg-[hsl(var(--amber-400)/0.1)] dark:hover:bg-[hsl(var(--amber-400)/0.15)]",
    iconWrap:
      "bg-[hsl(var(--amber-500)/0.12)] text-[hsl(var(--amber-700))] dark:text-[hsl(var(--amber-300))]",
    icon: "text-[hsl(var(--amber-700))] dark:text-[hsl(var(--amber-300))]",
    chip: "bg-[hsl(var(--amber-500)/0.12)] text-[hsl(var(--amber-800))] dark:bg-[hsl(var(--amber-500)/0.15)] dark:text-[hsl(var(--amber-300))]",
    Icon: AlertTriangle,
  },
  insight: {
    row: "border-[hsl(var(--sky-500)/0.2)] bg-[hsl(var(--sky-50)/0.8)] hover:bg-[hsl(var(--sky-50))] dark:border-[hsl(var(--sky-400)/0.25)] dark:bg-[hsl(var(--sky-400)/0.1)] dark:hover:bg-[hsl(var(--sky-400)/0.15)]",
    iconWrap:
      "bg-[hsl(var(--sky-500)/0.1)] text-[hsl(var(--sky-700))] dark:text-[hsl(var(--sky-300))]",
    icon: "text-[hsl(var(--sky-700))] dark:text-[hsl(var(--sky-300))]",
    chip: "bg-[hsl(var(--sky-500)/0.1)] text-[hsl(var(--sky-700))] dark:bg-[hsl(var(--sky-500)/0.15)] dark:text-[hsl(var(--sky-300))]",
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
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--emerald-500))]" />
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
                  className="hidden rounded-full bg-[hsl(var(--emerald-500)/0.1)] px-1.5 py-0 text-mobile-unit pc:text-[10px] text-[hsl(var(--emerald-700))] dark:bg-[hsl(var(--emerald-500)/0.15)] dark:text-[hsl(var(--emerald-300))] sm:inline-flex"
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
