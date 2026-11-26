import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopWindowFrame, DesktopWorkspaceTitleBar } from "./DesktopWindowFrame";
import type { DesktopNavigationState } from "@/lib/runtime-environment";

const mocks = vi.hoisted(() => ({
  desktop: false,
  pathname: "/ai-coach",
  toggle: vi.fn(),
  back: vi.fn(),
  zoom: vi.fn(),
  unsubscribe: vi.fn(),
}));
let listener: (state: DesktopNavigationState) => void;
const state: DesktopNavigationState = {
  canGoBack: false,
  canGoForward: false,
  title: "Trainingload.ai",
  isFullScreen: false,
};
vi.mock("@/hooks/use-runtime-environment", () => ({
  useRuntimeEnvironment: () => ({
    isDesktopSelfHost: mocks.desktop,
    desktop: mocks.desktop ? { windowChrome: chrome } : null,
  }),
}));
const chrome = {
  getState: vi.fn(async () => state),
  navigate: mocks.back,
  zoom: mocks.zoom,
  subscribe: (callback: typeof listener) => {
    listener = callback;
    return mocks.unsubscribe;
  },
};
vi.mock("@/hooks/use-mobile", () => ({
  useCompactSidebarViewport: () => false,
}));
vi.mock("@/hooks/use-persisted-sidebar-collapsed", () => ({
  usePersistedSidebarCollapsed: () => ({
    collapsed: false,
    toggleCollapsed: mocks.toggle,
  }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
beforeEach(() => {
  mocks.desktop = false;
  mocks.pathname = "/ai-coach";
  vi.clearAllMocks();
});

describe("desktop window frame", () => {
  it("connects the native toggle to the workspace sidebar across training pages", async () => {
    mocks.desktop = true;
    mocks.pathname = "/settings";
    render(
      <DesktopWindowFrame>
        <div id="workspace-sidebar" />
        <section aria-label="workspace content">
          <DesktopWorkspaceTitleBar />
        </section>
        <main>content</main>
      </DesktopWindowFrame>,
    );
    await act(async () => {});
    const navigation = screen.getByRole("navigation", { name: "navigation" });
    expect(screen.getByRole("region", { name: "workspace content" })).toContainElement(navigation);
    const toggle = within(navigation).getByRole("button", { name: "collapse" });
    expect(within(navigation).getAllByRole("button")[0]).toBe(toggle);
    expect(toggle).toHaveAttribute("aria-controls", "workspace-sidebar");
  });
  it("leaves browser shells unchanged and enables native chrome only for Electron self-host", async () => {
    const web = render(
      <DesktopWindowFrame>
        <main>content</main>
      </DesktopWindowFrame>,
    );
    expect(screen.queryByRole("banner")).toBeNull();
    expect(document.documentElement.dataset.desktopSelfHost).toBeUndefined();
    web.unmount();
    mocks.desktop = true;
    const desktop = render(
      <DesktopWindowFrame>
        <main>content</main>
      </DesktopWindowFrame>,
    );
    await act(async () => {});
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "collapse" })).toBeNull();
    expect(document.documentElement.dataset.desktopSelfHost).toBe("true");
    desktop.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.desktopSelfHost).toBeUndefined();
  });
  it("tracks native navigation availability and keeps title bar controls interactive", async () => {
    mocks.desktop = true;
    render(
      <DesktopWindowFrame>
        <DesktopWorkspaceTitleBar />
        <main>content</main>
      </DesktopWindowFrame>,
    );
    await act(async () => {});
    expect(screen.getByRole("button", { name: "back" })).toBeDisabled();
    act(() => listener({ ...state, canGoBack: true, title: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(mocks.back).toHaveBeenCalledWith("back");
    fireEvent.click(screen.getByRole("button", { name: "collapse" }));
    expect(mocks.toggle).toHaveBeenCalledOnce();
    fireEvent.doubleClick(screen.getByRole("banner"));
    expect(mocks.zoom).toHaveBeenCalledOnce();
    expect(screen.getByText("coach")).toBeInTheDocument();
  });
  it("updates the title using the same section as the sidebar", async () => {
    mocks.desktop = true;
    mocks.pathname = "/calendar";
    const frame = () => (
      <DesktopWindowFrame>
        <main>content</main>
      </DesktopWindowFrame>
    );
    const { rerender } = render(frame());
    await act(async () => {});
    expect(within(screen.getByRole("banner")).getByText("calendar")).toBeVisible();
    mocks.pathname = "/plans/example";
    rerender(frame());
    expect(within(screen.getByRole("banner")).getByText("plan")).toBeVisible();
    mocks.pathname = "/sign-in";
    rerender(frame());
    expect(within(screen.getByRole("banner")).getByText("appName")).toBeVisible();
  });
});
