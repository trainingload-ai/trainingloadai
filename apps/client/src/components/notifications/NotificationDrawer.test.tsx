import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationDrawer } from "./NotificationDrawer";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1" } }, isPending: false }),
  },
}));

vi.mock("@/api/notifications", () => ({
  listNotifications: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    unreadCount: 0,
  }),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/components/notifications/NotificationDetailModal", () => ({
  NotificationDetailModal: () => null,
}));

vi.mock("@/components/notifications/NotificationListRow", () => ({
  NotificationListRow: () => null,
  NotificationUnreadDot: () => null,
}));

describe("NotificationDrawer", () => {
  it("keeps the header fixed and gives the notification list its own scroll viewport", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationDrawer />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "notifications:title" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass(
      "flex",
      "h-dvh",
      "flex-col",
      "overflow-hidden",
    );

    const scrollViewport = dialog.querySelector(".overflow-y-auto");
    expect(scrollViewport).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
  });
});
