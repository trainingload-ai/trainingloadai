import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavigationHeader } from "./MobileNavigationHeader";

const navigationState = vi.hoisted(() => ({
  pathname: "/calendar",
  registered: null as { title?: string } | null,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("./MobileNavigationProvider", () => ({
  useRegisteredMobileNavigation: () => navigationState.registered,
}));

vi.mock("@/components/ui/ThemeLogo", () => ({
  default: () => <span data-testid="theme-logo">Trainingload.ai</span>,
}));

vi.mock("../hooks/use-unread-notification-count", () => ({
  useUnreadNotificationCount: () => ({ count: 0 }),
}));

describe("MobileNavigationHeader", () => {
  beforeEach(() => {
    navigationState.pathname = "/calendar";
    navigationState.registered = null;
  });

  it("delegates the visual frame to MobileTopBar", () => {
    render(<MobileNavigationHeader />);

    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-mobile-top-bar");
    expect(header).toHaveAttribute("data-placement", "screen");
  });

  it("reserves the shared frame while the AI coach actions register", () => {
    navigationState.pathname = "/ai-coach";

    render(<MobileNavigationHeader />);

    expect(screen.getByRole("banner")).toHaveAttribute("data-mobile-top-bar");
  });

  it("shows the logo on a top-level page without an explicit title", () => {
    render(<MobileNavigationHeader />);

    expect(screen.getByTestId("theme-logo")).toBeVisible();
  });

  it("keeps an explicit page title instead of the logo", () => {
    navigationState.registered = { title: "Training metrics" };

    render(<MobileNavigationHeader />);

    expect(screen.getByText("Training metrics")).toBeVisible();
    expect(screen.queryByTestId("theme-logo")).not.toBeInTheDocument();
  });
});
