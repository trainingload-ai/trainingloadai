"use client";

import { apiFetch } from "@/lib/api";

export type NotificationItem = {
  id: string;
  /** 服务端枚举；用于客户端按类型选择 i18n 文案 */
  kind: string;
  title: string;
  bodyMarkdown?: string | null;
  data?: unknown;
  readAt?: string | null;
  createdAt: string;
  digestId?: string | null;
};

export type ListNotificationsResponse = {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  offset: number;
  limit: number;
};

export async function listNotifications(args?: {
  offset?: number;
  limit?: number;
  unread?: boolean;
  signal?: AbortSignal;
}): Promise<ListNotificationsResponse> {
  const qs = new URLSearchParams();
  if (args?.offset != null) qs.set("offset", String(args.offset));
  if (args?.limit != null) qs.set("limit", String(args.limit));
  if (args?.unread) qs.set("unread", "1");
  const q = qs.toString();
  try {
    const res = await apiFetch<ListNotificationsResponse>(
      `/notifications${q ? `?${q}` : ""}`,
      { signal: args?.signal },
    );
    return (res ?? {
      items: [],
      total: 0,
      unreadCount: 0,
      offset: 0,
      limit: 20,
    }) as ListNotificationsResponse;
  } catch (e) {
    // When not authenticated, treat as no notifications.
    if (e instanceof Error && /Unauthorized/i.test(e.message)) {
      return { items: [], total: 0, unreadCount: 0, offset: 0, limit: 20 };
    }
    throw e;
  }
}

export async function markNotificationRead(id: string): Promise<{ updated: number }> {
  const nid = String(id ?? "").trim();
  const res = await apiFetch<{ updated: number }>(`/notifications/${encodeURIComponent(nid)}/read`, {
    method: "POST",
  });
  return (res ?? { updated: 0 }) as { updated: number };
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const res = await apiFetch<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  });
  return (res ?? { updated: 0 }) as { updated: number };
}
