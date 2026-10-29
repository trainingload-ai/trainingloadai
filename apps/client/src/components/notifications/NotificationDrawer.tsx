"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  listNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/api/notifications";
import { NotificationDetailModal } from "@/components/notifications/NotificationDetailModal";
import {
  NotificationListRow,
  NotificationUnreadDot,
} from "@/components/notifications/NotificationListRow";
import { queryKeys } from "@/lib/query-keys";

function SheetBody(props: {
  title: string;
  tab: "unread" | "all";
  setTab: (v: "unread" | "all") => void;
  unreadCount: number;
  items: NotificationItem[];
  loading: boolean;
  onClickItem: (it: NotificationItem) => void;
  labels: {
    unread: string;
    all: string;
    loading: string;
    empty: string;
    unreadBadge: string;
  };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-5 pb-3">
        <SheetHeader className="space-y-1">
          <SheetTitle>{props.title}</SheetTitle>
        </SheetHeader>
        <div className="mt-3">
          <Tabs value={props.tab} onValueChange={(v) => props.setTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="unread" className="flex-1">
                {props.labels.unread}
                {props.unreadCount > 0 ? (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-mobile-caption pc:text-xs text-emerald-700 dark:text-emerald-300">
                    {props.unreadCount}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1">
                {props.labels.all}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="unread" />
            <TabsContent value="all" />
          </Tabs>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t p-4 pt-3">
        {props.loading ? (
          <div className="text-sm text-muted-foreground">
            {props.labels.loading}
          </div>
        ) : props.items.length ? (
          <div className="space-y-2">
            {props.items.map((it) => (
              <NotificationListRow
                key={it.id}
                item={it}
                unreadLabel={props.labels.unreadBadge}
                onClick={() => props.onClickItem(it)}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {props.labels.empty}
          </div>
        )}
      </div>
    </div>
  );
}

/** 桌面端右侧 Sheet；移动端请使用 `/notifications` 全屏列表页 */
export function NotificationDrawer() {
  const t = useTranslations("topBar");
  const tN = useTranslations("notifications");
  const queryClient = useQueryClient();
  const { data: session, isPending } = useViewerSession();
  const publicDemo = usePublicDemo();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"unread" | "all">("unread");
  const [detailItem, setDetailItem] = React.useState<NotificationItem | null>(
    null,
  );

  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: ({ signal }) =>
      listNotifications({ unread: true, limit: 50, offset: 0, signal }),
    enabled:
      !publicDemo.active &&
      !!session &&
      !isPending &&
      !!open &&
      tab === "unread",
  });

  const allQuery = useQuery({
    queryKey: queryKeys.notifications.listAll(),
    queryFn: ({ signal }) =>
      listNotifications({ limit: 50, offset: 0, signal }),
    enabled:
      !publicDemo.active && !!session && !isPending && !!open && tab === "all",
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.notifications.summary(),
    queryFn: ({ signal }) => listNotifications({ limit: 1, offset: 0, signal }),
    refetchInterval: publicDemo.active ? false : 60_000,
    enabled: !publicDemo.active && !!session && !isPending,
  });

  const unreadCount = summaryQuery.data?.unreadCount ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.root.notifications,
      });
    },
  });

  const items =
    tab === "unread"
      ? (unreadQuery.data?.items ?? [])
      : (allQuery.data?.items ?? []);
  const loading = tab === "unread" ? unreadQuery.isLoading : allQuery.isLoading;

  const labels = {
    unread: tN("tabs.unread"),
    all: tN("tabs.all"),
    loading: tN("loading"),
    empty: tN("empty"),
    unreadBadge: tN("unreadBadge"),
  };

  const onClickItem = (it: NotificationItem) => {
    if (!publicDemo.active && !it.readAt) markRead.mutate(it.id);
    setDetailItem(it);
  };

  const onListOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setDetailItem(null);
    }
    if (v) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.root.notifications,
      });
    }
  };

  return (
    <>
      <NotificationDetailModal
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(v) => {
          if (!v) setDetailItem(null);
        }}
        receivedLabel={tN("receivedAt")}
        noBody={tN("noBody")}
      />
      <Sheet open={open} onOpenChange={onListOpenChange}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={tN("title")}
          >
            <NotificationUnreadDot show={unreadCount > 0} />
            <Bell className="h-4 w-4 text-foreground" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="flex h-dvh w-[420px] max-w-[92vw] flex-col overflow-hidden p-0"
        >
          <SheetBody
            title={t("notifications") ?? tN("title")}
            tab={tab}
            setTab={setTab}
            unreadCount={unreadCount}
            items={items}
            loading={loading}
            onClickItem={onClickItem}
            labels={labels}
          />
          <SheetDescription className="sr-only">
            {t("notifications") ?? tN("title")}
          </SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  );
}
