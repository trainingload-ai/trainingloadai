import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import { resetCoachSidStoreForTests } from "@/app/[locale]/(main)/ai-coach/coach-sid-store";

const mocks = vi.hoisted(() => ({
  collapsed: false,
  pathname: "/",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  aiState: "enabled",
}));

vi.mock("@/api/runtime-capabilities", () => ({
  runtimeCapabilityAvailable: (capability: { state: string } | undefined) =>
    capability === undefined || capability.state === "enabled",
  useRuntimeCapability: () => ({ state: mocks.aiState }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockCoachHistory({ activeSid }: { activeSid: string }) {
      return <div data-testid="coach-history">{activeSid}</div>;
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
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      activities: "Activities",
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
  mocks.replace.mockReset();
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

describe("Sidebar app spaces", () => {
  it("hides the coach workspace when the server disables AI", () => {
    mocks.aiState = "disabled";
    render(<Sidebar />);

    expect(
      screen.queryByRole("link", { name: "Coach" }),
    ).not.toBeInTheDocument();
  });

  it("shows product navigation in the training space", () => {
    render(<Sidebar />);

    expect(
      screen.getByRole("navigation", { name: "Switch workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("coach-history")).not.toBeInTheDocument();
  });

  it("stacks the workspace switcher vertically when the sidebar is collapsed", () => {
    mocks.collapsed = true;

    render(<Sidebar />);

    const switcher = screen.getByRole("navigation", {
      name: "Switch workspace",
    });
    expect(switcher.firstElementChild).toHaveClass("grid-cols-1");
    expect(screen.getByRole("link", { name: "Training" })).toHaveClass(
      "min-h-9",
    );
    expect(screen.getByRole("link", { name: "Coach" })).toHaveClass("min-h-9");
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

    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("232");
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

    fireEvent.mouseDown(separator, { button: 0, clientX: 224 });
    fireEvent.mouseMove(window, { clientX: 280 });
    fireEvent.mouseUp(window, { clientX: 280 });

    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("280");
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
    ).toHaveAttribute("aria-valuenow", "232");
    expect(window.localStorage.getItem("sidebar:width:v2")).toBe("232");
  });

  it("replaces product navigation with conversations in the coach space", () => {
    mocks.pathname = "/ai-coach";
    mocks.searchParams = new URLSearchParams("sid=session-123");

    render(<Sidebar />);

    expect(screen.getByTestId("coach-history")).toHaveTextContent(
      "session-123",
    );
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).not.toBeInTheDocument();
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

  it("opens Coach as a new chat instead of restoring the last session", () => {
    window.localStorage.setItem("ai_coach_sid", "session-123");

    render(<Sidebar />);

    const coachLink = screen.getByRole("link", { name: "Coach" });
    expect(coachLink).toHaveAttribute("href", "/ai-coach");

    fireEvent.click(coachLink);

    expect(window.localStorage.getItem("ai_coach_sid")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/ai-coach", { scroll: false });
  });
});
