import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import { resetCoachSidStoreForTests } from "@/app/[locale]/(main)/ai-coach/coach-sid-store";

const mocks = vi.hoisted(() => ({
  collapsed: false,
  pathname: "/",
  replace: vi.fn(),
  push: vi.fn(),
  canAccess: true,
  searchParams: new URLSearchParams(),
  aiState: "enabled",
  isDesktopSelfHost: false,
}));

vi.mock("@/hooks/use-runtime-environment", () => ({
  useRuntimeEnvironment: () => ({ isDesktopSelfHost: mocks.isDesktopSelfHost }),
}));

vi.mock("@/components/TopBar", () => ({
  TopBar: ({ settingsControl }: { settingsControl: React.ReactNode }) => (
    <div data-testid="sidebar-account-menu">{settingsControl}</div>
  ),
}));

vi.mock("@/components/notifications/NotificationDrawer", () => ({
  NotificationDrawer: () => <button>Notifications</button>,
}));

vi.mock("@/api/runtime-capabilities", () => ({
  runtimeCapabilityAvailable: (capability: { state: string } | undefined) =>
    capability === undefined || capability.state === "enabled",
  useRuntimeCapability: () => ({ state: mocks.aiState }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockCoachHistory({
      activeSid,
      heading,
      onSelectSession,
      onNewChat,
    }: {
      activeSid: string;
      heading: React.ReactNode;
      onSelectSession: (id: string) => void;
      onNewChat: () => void;
    }) {
      return (
        <div data-testid="coach-history">
          {heading}
          {activeSid}
          <button onClick={() => onSelectSession("session-124")}>
            Another chat
          </button>
          <button onClick={onNewChat}>New chat</button>
        </div>
      );
    },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      activities: "Activities",
      analysis: "Training tools",
      appName: "Trainingload.ai Personal",
      calendar: "Calendar",
      coach: "Coach",
      collapse: "Collapse sidebar",
      dashboard: "Overview",
      expand: "Expand sidebar",
      home: "Home",
      navigationLabel: "Primary navigation",
      plan: "Plan",
      resize: "Resize sidebar",
      secondaryNavigationLabel: "Secondary navigation",
      settings: "Settings",
      spaceSwitcherLabel: "Switch workspace",
      trainingSpace: "Training",
    };
    return (key: string) => labels[key] ?? key;
  },
}));

vi.mock("@/hooks/use-mobile", () => ({
  useCompactSidebarViewport: () => false,
}));

vi.mock("@/hooks/use-persisted-sidebar-collapsed", () => ({
  usePersistedSidebarCollapsed: () => ({
    collapsed: mocks.collapsed,
    toggleCollapsed: vi.fn(),
  }),
}));

vi.mock("@deployment/managed-ui", () => ({
  useAccessNavigationGuard: () => ({
    canAccess: mocks.canAccess,
    guardNavigation: vi.fn(),
    pricingOpen: false,
    setPricingOpen: vi.fn(),
  }),
  AccessOptionsDialog: () => null,
}));

beforeEach(() => {
  resetCoachSidStoreForTests();
  mocks.collapsed = false;
  mocks.pathname = "/";
  mocks.searchParams = new URLSearchParams();
  mocks.aiState = "enabled";
  mocks.isDesktopSelfHost = false;
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.canAccess = true;
  window.history.replaceState({}, "", "/");
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
});

describe("workspace sidebar", () => {
  it.each([false, true])(
    "keeps training links, account and chats together in the workspace (native: %s)",
    (native) => {
      mocks.isDesktopSelfHost = native;
      render(<Sidebar />);
      const navigation = screen.getByRole("navigation", {
        name: "Primary navigation",
      });
      expect(
        [...navigation.querySelectorAll("a")].map((link) => link.textContent),
      ).toEqual(["Home", "Plan", "Calendar", "Activities", "Overview"]);
      expect(screen.getByTestId("sidebar-account-menu")).toBeInTheDocument();
      expect(screen.getByTestId("coach-history")).toBeInTheDocument();
    },
  );

  it("shows only the Coach access entry when membership is required", () => {
    mocks.canAccess = false;
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Coach" })).toBeInTheDocument();
    expect(screen.queryByTestId("coach-history")).not.toBeInTheDocument();
  });

  it("hides the coach workspace in web mode when the server disables AI", () => {
    mocks.aiState = "disabled";
    render(<Sidebar />);
    expect(
      screen.queryByRole("link", { name: "Coach" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Coach setup entry in the native app when AI is not configured", () => {
    mocks.isDesktopSelfHost = true;
    mocks.aiState = "disabled";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Coach" })).toBeInTheDocument();
    expect(screen.queryByTestId("coach-history")).not.toBeInTheDocument();
  });

  it("keeps named navigation icons when collapsed", () => {
    mocks.collapsed = true;
    render(<Sidebar />);
    expect(
      screen.getByRole("link", { name: "Home" }).closest("aside"),
    ).toHaveStyle({ width: "48px" });
    expect(screen.getByRole("link", { name: "Coach" })).toBeInTheDocument();
    expect(screen.queryByTestId("coach-history")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Plan selected throughout the official-plan route tree", () => {
    mocks.pathname = "/plans/templates/finish-5k";

    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("resizes the training sidebar with the keyboard and persists it", () => {
    render(<Sidebar />);

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize sidebar" }),
      { key: "ArrowRight" },
    );

    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("212");
  });

  it("persists the width after dragging the resize handle", () => {
    render(<Sidebar />);

    const separator = screen.getByRole("separator", {
      name: "Resize sidebar",
    });
    const sidebar = separator.closest("aside");
    expect(sidebar).not.toBeNull();
    Object.defineProperty(sidebar, "offsetWidth", {
      configurable: true,
      get: () => Number.parseFloat(sidebar?.style.width || "0"),
    });

    fireEvent.mouseDown(separator, { button: 0, clientX: 204 });
    fireEvent.mouseMove(window, { clientX: 260 });
    fireEvent.mouseUp(window, { clientX: 260 });

    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("260");
  });

  it("keeps the same width when switching from training to coach", () => {
    const { rerender } = render(<Sidebar />);

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize sidebar" }),
      { key: "ArrowRight" },
    );

    mocks.pathname = "/ai-coach";
    rerender(<Sidebar />);

    expect(
      screen.getByRole("separator", { name: "Resize sidebar" }),
    ).toHaveAttribute("aria-valuenow", "212");
    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("212");
  });

  it("keeps the training navigation available in Coach", () => {
    mocks.pathname = "/ai-coach";
    mocks.searchParams = new URLSearchParams("sid=session-123");

    render(<Sidebar />);

    expect(screen.getByTestId("coach-history")).toHaveTextContent(
      "session-123",
    );
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("highlights the address-bar sid when searchParams has not caught up", () => {
    mocks.pathname = "/ai-coach";
    mocks.searchParams = new URLSearchParams();
    window.history.replaceState({}, "", "/ai-coach?sid=session-123");

    render(<Sidebar />);

    expect(screen.getByTestId("coach-history")).toHaveTextContent(
      "session-123",
    );
  });

  it("opens chats from a training page without carrying unrelated query parameters", () => {
    mocks.pathname = "/calendar";
    mocks.searchParams = new URLSearchParams("date=2026-11-22");
    render(<Sidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Another chat" }));
    expect(mocks.push).toHaveBeenCalledWith("/ai-coach?sid=session-124");
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/ai-coach");
  });

  it("leaves the current session open when clicking the Coach heading", () => {
    mocks.pathname = "/ai-coach";
    mocks.searchParams = new URLSearchParams("sid=session-123");
    render(<Sidebar />);
    fireEvent.click(screen.getByRole("link", { name: "Coach" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Coach" }).querySelector("svg"),
    ).toBeNull();
    expect(screen.getByTestId("coach-history")).toHaveTextContent(
      "session-123",
    );
  });
});
