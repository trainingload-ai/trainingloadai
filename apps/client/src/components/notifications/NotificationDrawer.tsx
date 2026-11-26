"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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

function NotificationList(props: {
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
    <Tabs
      value={props.tab}
      onValueChange={(value) => {
        if (value === "unread" || value === "all") props.setTab(value);
      }}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <div className="shrink-0 px-5 pt-5 pb-3">
        <DialogHeader className="text-start">
          <h2 className="text-lg leading-none font-semibold">{props.title}</h2>
        </DialogHeader>
        <TabsList className="mt-3 w-full">
          <TabsTrigger value="unread" className="flex-1">
            {props.labels.unread}
            {props.unreadCount > 0 ? (
              <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                {props.unreadCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1">
            {props.labels.all}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value={props.tab}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/40 px-5 py-3"
      >
        {props.loading ? (
          <div role="status" className="space-y-2">
            <span className="sr-only">{props.labels.loading}</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                key={index}
                className="h-24 w-full"
                aria-hidden="true"
              />
            ))}
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
          <p className="py-6 text-center text-sm text-muted-foreground">
            {props.labels.empty}
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}

/** Desktop notification dialog. The mobile notification list uses /notifications. */
export function NotificationDrawer({
  placement = "header",
}: { placement?: "header" | "rail" } = {}) {
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
      <Dialog open={open} onOpenChange={onListOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "text-muted-foreground hover:text-foreground",
              placement === "rail" && "desktop-rail-control",
            )}
            aria-label={tN("title")}
          >
            <span className="relative inline-flex size-4" aria-hidden="true">
              <Bell className="size-4" />
              <NotificationUnreadDot show={unreadCount > 0} />
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent
          aria-label={tN("title")}
          aria-labelledby={undefined}
          aria-describedby={undefined}
          className="flex h-[min(80dvh,50rem)] flex-col gap-0 overflow-hidden p-0 tablet:inset-x-auto tablet:bottom-auto tablet:left-1/2 tablet:top-1/2 tablet:w-[calc(100%-2rem)] tablet:max-w-[42rem] tablet:-translate-x-1/2 tablet:-translate-y-1/2 tablet:rounded-overlay tablet:border pc:max-w-[42rem] pc:p-0"
        >
          <NotificationList
            title={tN("title")}
            tab={tab}
            setTab={setTab}
            unreadCount={unreadCount}
            items={items}
            loading={loading}
            onClickItem={onClickItem}
            labels={labels}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
