import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopWindowFrame } from "./DesktopWindowFrame";
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
  it("only offers the secondary sidebar toggle in Coach", async () => {
    mocks.desktop = true;
    mocks.pathname = "/settings";
    render(
      <DesktopWindowFrame>
        <main>content</main>
      </DesktopWindowFrame>,
    );
    await act(async () => {});
    expect(
      screen.queryByRole("button", { name: "collapse" }),
    ).not.toBeInTheDocument();
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
    expect(document.documentElement.dataset.desktopSelfHost).toBe("true");
    desktop.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.desktopSelfHost).toBeUndefined();
  });
  it("tracks native navigation availability and keeps title bar controls interactive", async () => {
    mocks.desktop = true;
    render(
      <DesktopWindowFrame>
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
    expect(screen.getByText("appName · coach")).toBeInTheDocument();
  });
});
