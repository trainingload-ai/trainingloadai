"use client";

import * as React from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/api/notifications";
import { NotificationListRow } from "@/components/notifications/NotificationListRow";
import { NotificationDetailModal } from "@/components/notifications/NotificationDetailModal";
import { MobileNotificationsPanel } from "@/components/mobile-app/components/MobileMeNotificationsPanel";
import { useMobileViewport } from "@/hooks/use-mobile";
import { queryKeys } from "@/lib/query-keys";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  useSetPageTitle(t("title"));
  const isMobile = useMobileViewport();

  if (isMobile === undefined) {
    return (
      <div className="h-[420px] animate-pulse rounded-surface bg-muted pc:hidden" />
    );
  }

  return isMobile ? <MobileNotificationsPanel /> : <DesktopNotificationsPage />;
}

function DesktopNotificationsPage() {
  const t = useTranslations("notifications");
  const publicDemo = usePublicDemo();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<"unread" | "all">("unread");
  const [detailItem, setDetailItem] = React.useState<NotificationItem | null>(
    null,
  );

  const parentRef = React.useRef<HTMLDivElement>(null);

  const infinite = useInfiniteQuery({
    queryKey: queryKeys.notifications.infinite(tab),
    queryFn: async ({ pageParam }) =>
      listNotifications({
        offset: pageParam as number,
        limit: PAGE_SIZE,
        unread: tab === "unread",
      }),
    initialPageParam: 0,
    enabled: !publicDemo.active,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      if (nextOffset < lastPage.total) return nextOffset;
      return undefined;
    },
  });

  const flatItems = React.useMemo(
    () => infinite.data?.pages.flatMap((p) => p.items) ?? [],
    [infinite.data?.pages],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,
    overscan: 8,
    measureElement:
      typeof window !== "undefined" && "HTMLElement" in window
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  React.useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (
      last.index >= flatItems.length - 3 &&
      infinite.hasNextPage &&
      !infinite.isFetchingNextPage
    ) {
      void infinite.fetchNextPage();
    }
  }, [
    virtualItems,
    flatItems.length,
    infinite.hasNextPage,
    infinite.isFetchingNextPage,
    infinite.fetchNextPage,
  ]);

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.root.notifications,
      });
    },
  });

  const onRowClick = (it: NotificationItem) => {
    if (!publicDemo.active && !it.readAt) markRead.mutate(it.id);
    setDetailItem(it);
  };

  const unreadCount = infinite.data?.pages[0]?.unreadCount ?? 0;
  const isInitialLoading = infinite.isLoading;

  const labels = {
    unread: t("tabs.unread"),
    all: t("tabs.all"),
    loading: t("loading"),
    empty: t("empty"),
    unreadBadge: t("unreadBadge"),
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")}>
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="unread" className="flex-1">
            {labels.unread}
            {unreadCount > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-mobile-caption pc:text-xs text-emerald-700 dark:text-emerald-300">
                {unreadCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            {labels.all}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="unread" className="hidden" />
        <TabsContent value="all" className="hidden" />
      </Tabs>

      <div
        ref={parentRef}
        className="min-h-0 w-full overflow-y-auto rounded-md border border-neutral-200/70 bg-white/40 dark:border-white/10 dark:bg-white/5"
        style={{
          height: "min(72dvh, calc(100dvh - 12rem))",
          maxHeight: "72dvh",
        }}
      >
        {isInitialLoading ? (
          <div className="p-4 text-sm text-muted-foreground">
            {labels.loading}
          </div>
        ) : flatItems.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {labels.empty}
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((vi) => {
              const it = flatItems[vi.index];
              if (!it) return null;
              return (
                <div
                  key={it.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full px-3 py-1.5"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <NotificationListRow
                    item={it}
                    unreadLabel={labels.unreadBadge}
                    onClick={() => onRowClick(it)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {infinite.isFetchingNextPage ? (
          <div className="border-t px-3 py-2 text-center text-mobile-caption pc:text-xs text-muted-foreground">
            {t("loadingMore")}
          </div>
        ) : null}
      </div>

      <NotificationDetailModal
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null);
        }}
        receivedLabel={t("receivedAt")}
        noBody={t("noBody")}
      />
    </div>
  );
}
