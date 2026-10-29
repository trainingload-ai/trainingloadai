"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/api/notifications";
import { MarkdownProse } from "@/components/MarkdownProse";
import {
  getNotificationPreview,
  resolveNotificationDisplay,
} from "@/lib/notification-display";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { MobileGroupedList } from "./MobileGroupedList";
import { MobileSheet } from "./MobileSheet";
import { ManagedExternalExportFailureActions } from "@deployment/managed-ui";
import { isThirdPartyExportFailureNotification } from "@/lib/notification-display";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

type Tab = "all" | "unread";

function mobileLabels(locale: string) {
  if (locale === "zh" || locale === "zh-hant") {
    return {
      inbox: "收件箱",
      all: "全部",
      unread: "未读",
      markAll: "全部已读",
      markingAll: "处理中…",
      allRead: "全部已读",
      unreadCount: (count: number) => `${count} 条未读`,
      emptyAll: "暂无通知",
      emptyAllDetail: "新的训练与账户消息会显示在这里。",
      emptyUnread: "没有未读通知",
      emptyUnreadDetail: "你已经看完所有消息。",
      detail: "通知详情",
      retry: "加载失败，轻触重试",
      loadMore: "加载更多",
    };
  }
  return {
    inbox: "Inbox",
    all: "All",
    unread: "Unread",
    markAll: "Mark all read",
    markingAll: "Marking…",
    allRead: "All read",
    unreadCount: (count: number) => `${count} unread`,
    emptyAll: "No notifications",
    emptyAllDetail: "New training and account messages will appear here.",
    emptyUnread: "No unread notifications",
    emptyUnreadDetail: "You are all caught up.",
    detail: "Notification detail",
    retry: "Could not load. Tap to retry",
    loadMore: "Load more",
  };
}

export function MobileNotificationsPanel() {
  const publicDemo = usePublicDemo();
  const locale = useLocale();
  const t = useTranslations("notifications");
  const labels = mobileLabels(locale);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const queryKey = useMemo(
    () => [...queryKeys.root.notifications, "mobile", tab, limit],
    [limit, tab],
  );
  const notifications = useQuery({
    queryKey,
    queryFn: () =>
      listNotifications({ offset: 0, limit, unread: tab === "unread" }),
    enabled: !publicDemo.active,
  });
  const items = notifications.data?.items ?? [];
  const total = notifications.data?.total ?? 0;
  const unreadCount = notifications.data?.unreadCount ?? 0;

  const refreshNotifications = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.root.notifications });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refreshNotifications,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refreshNotifications,
  });

  const openNotification = (item: NotificationItem) => {
    setSelected(
      item.readAt ? item : { ...item, readAt: new Date().toISOString() },
    );
    if (!publicDemo.active && !item.readAt) markRead.mutate(item.id);
  };

  const inboxStatus =
    unreadCount > 0
      ? labels.unreadCount(unreadCount)
      : total > 0
        ? labels.allRead
        : t("empty");
  const selectedDisplay = selected
    ? resolveNotificationDisplay(selected, t)
    : null;

  return (
    <>
      <div className="space-y-2 px-1">
        <div className="flex min-h-7 items-center justify-between gap-3">
          <h2 className="text-mobile-caption font-medium text-muted-foreground">
            {labels.inbox}
          </h2>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="truncate text-mobile-caption text-muted-foreground">
              {inboxStatus}
            </span>
            {unreadCount > 0 && !publicDemo.active ? (
              <button
                type="button"
                disabled={markAll.isPending}
                onClick={() => markAll.mutate()}
                className="min-h-8 rounded-full bg-emerald-500/10 px-3 text-mobile-control font-semibold text-emerald-600 disabled:opacity-55"
              >
                {markAll.isPending ? labels.markingAll : labels.markAll}
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid h-8 grid-cols-2 rounded-lg bg-muted p-0.5 text-mobile-caption">
          {(["all", "unread"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTab(value);
                setLimit(20);
              }}
              className={cn(
                "rounded-xs",
                tab === value && "bg-background font-medium shadow-sm",
              )}
            >
              {labels[value]}
            </button>
          ))}
        </div>
      </div>

      <MobileGroupedList className="mt-3">
        {notifications.isLoading ? (
          <div className="h-[410px] overflow-hidden">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex min-h-[82px] animate-pulse items-center border-b border-border/60 px-4 last:border-0"
              >
                <span className="mr-3 size-2.5 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded-xs bg-muted" />
                  <div className="h-4 w-3/5 rounded-xs bg-muted" />
                  <div className="h-3 w-4/5 rounded-xs bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.isError ? (
          <button
            type="button"
            onClick={() => void notifications.refetch()}
            className="h-[410px] w-full px-6 text-center text-mobile-control text-red-500"
          >
            {labels.retry}
          </button>
        ) : items.length ? (
          <div>
            {items.map((item) => {
              const display = resolveNotificationDisplay(item, t);
              const unread = !item.readAt;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNotification(item)}
                  className="flex min-h-[82px] w-full items-center border-b border-border/60 bg-card px-4 text-left last:border-0 active:bg-muted/65"
                >
                  <span className="mr-3 grid size-2.5 shrink-0 place-items-center">
                    {unread ? (
                      <span className="size-2.5 rounded-full bg-emerald-500" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 py-3">
                    <span className="flex items-center gap-2 text-mobile-caption">
                      <span
                        className={cn(
                          "truncate font-medium",
                          unread ? "text-emerald-600" : "text-muted-foreground",
                        )}
                      >
                        {display.eyebrow}
                      </span>
                      <span className="text-border">·</span>
                      <time
                        className="truncate text-muted-foreground"
                        dateTime={item.createdAt}
                      >
                        {new Intl.DateTimeFormat(locale, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(item.createdAt))}
                      </time>
                    </span>
                    <span
                      className={cn(
                        "mt-1 block truncate text-mobile-subtitle",
                        unread
                          ? "font-semibold"
                          : "font-medium text-foreground/75",
                      )}
                    >
                      {display.title}
                    </span>
                    <span className="mt-1 block truncate text-mobile-caption leading-[18px] text-muted-foreground">
                      {display.preview ??
                        getNotificationPreview(display.bodyMarkdown)}
                    </span>
                  </span>
                  <ChevronRight
                    className="ml-2 size-[13px] shrink-0 text-muted-foreground/45"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
            {items.length < total ? (
              <button
                type="button"
                disabled={notifications.isFetching}
                onClick={() => setLimit((value) => value + 20)}
                className="min-h-[50px] w-full text-mobile-control font-medium text-muted-foreground disabled:opacity-55"
              >
                {notifications.isFetching ? t("loadingMore") : labels.loadMore}
              </button>
            ) : (
              <div className="h-2" />
            )}
          </div>
        ) : (
          <div className="flex h-[410px] flex-col items-center justify-center px-6 text-center">
            <p className="text-mobile-headline font-semibold">
              {tab === "unread" ? labels.emptyUnread : labels.emptyAll}
            </p>
            <p className="mt-2 text-mobile-control leading-5 text-muted-foreground">
              {tab === "unread"
                ? labels.emptyUnreadDetail
                : labels.emptyAllDetail}
            </p>
          </div>
        )}
      </MobileGroupedList>

      <MobileSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        backgroundVariant="grouped"
        fullScreen
        title={labels.detail}
      >
        {selected && selectedDisplay ? (
          <article className="pb-8">
            <div className="border-b border-border/60 pb-4">
              <div className="flex items-center gap-2 text-mobile-caption text-muted-foreground">
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600">
                  {selectedDisplay.eyebrow}
                </span>
                <span>·</span>
                <time dateTime={selected.createdAt}>
                  {t("receivedAt")}{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selected.createdAt))}
                </time>
              </div>
              <h2 className="mt-3 text-[22px] font-semibold leading-7">
                {selectedDisplay.title}
              </h2>
            </div>
            <div className="py-4">
              {selectedDisplay.bodyMarkdown?.trim() ? (
                <MarkdownProse markdown={selectedDisplay.bodyMarkdown} />
              ) : (
                <p className="text-mobile-control text-muted-foreground">
                  {t("noBody")}
                </p>
              )}
            </div>
            {isThirdPartyExportFailureNotification(selected) ? (
              <div className="border-t border-border/60 pt-4">
                <ManagedExternalExportFailureActions
                  item={selected}
                  onResolved={() => setSelected(null)}
                />
              </div>
            ) : null}
          </article>
        ) : null}
      </MobileSheet>
    </>
  );
}
