import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "./MobileTabBar";

let pathname = "/";
const mocks = vi.hoisted(() => ({ aiState: "enabled" }));

vi.mock("@/api/runtime-capabilities", () => ({
  runtimeCapabilityAvailable: (capability: { state: string } | undefined) =>
    capability === undefined || capability.state === "enabled",
  useRuntimeCapability: () => ({ state: mocks.aiState }),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
  Link: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../hooks/use-unread-notification-count", () => ({
  useUnreadNotificationCount: () => ({ count: 12, isLoading: false }),
}));

describe("MobileTabBar", () => {
  beforeEach(() => {
    pathname = "/";
    mocks.aiState = "enabled";
  });

  it("removes the coach destination when AI is disabled", () => {
    mocks.aiState = "disabled";
    render(<MobileTabBar />);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/plan", "/calendar", "/me"]);
  });

  it("renders the five mobile destinations in product order", () => {
    render(<MobileTabBar />);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/plan", "/ai-coach", "/calendar", "/me"]);
  });

  it("maps secondary routes to Me and caps the unread badge", () => {
    pathname = "/activities";
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: /me/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("9+")).toBeVisible();
  });

  it("keeps the tab bar on metric subpages and marks Today active", () => {
    pathname = "/metrics/power";
    render(<MobileTabBar />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /today/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
