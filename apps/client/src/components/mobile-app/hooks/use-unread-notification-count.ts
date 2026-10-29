"use client";

import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "@/api/notifications";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { queryKeys } from "@/lib/query-keys";

export function useUnreadNotificationCount() {
  const { data: session, isPending } = useViewerSession();
  const publicDemo = usePublicDemo();
  const query = useQuery({
    queryKey: queryKeys.notifications.summary(),
    queryFn: () => listNotifications({ limit: 1, offset: 0 }),
    enabled: Boolean(session) && !isPending && !publicDemo.active,
    staleTime: 30_000,
    refetchInterval: publicDemo.active ? false : 60_000,
  });
  return {
    count: query.data?.unreadCount ?? 0,
    isLoading: !publicDemo.active && (isPending || query.isLoading),
  };
}
