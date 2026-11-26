"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SidebarToggleIcon } from "@/components/layout/SidebarToggleIcon";
import { getTrainingSection } from "@/components/Sidebar/training-navigation";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";
import { useWorkspaceSidebarCollapsed } from "@/hooks/use-workspace-sidebar-collapsed";
import { SIDEBAR_COLLAPSED_WIDTH } from "@/hooks/use-persisted-sidebar-width";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  DesktopNavigationState,
  DesktopRuntimeBridge,
} from "@/lib/runtime-environment";

const draggable = { WebkitAppRegion: "drag" } as CSSProperties;
const interactive = { WebkitAppRegion: "no-drag" } as CSSProperties;
const macOSWindowControlsInset = 88;
const TitleBarOutletContext = createContext<
  ((node: HTMLDivElement | null) => void) | null
>(null);
const initialState: DesktopNavigationState = {
  canGoBack: false,
  canGoForward: false,
  title: "Trainingload.ai",
  isFullScreen: false,
};

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const { desktop, isDesktopSelfHost } = useRuntimeEnvironment();
  const chrome = isDesktopSelfHost ? desktop?.windowChrome : undefined;
  const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
  const [navigation, setNavigation] = useState(initialState);
  useEffect(() => {
    if (!isDesktopSelfHost) return;
    document.documentElement.dataset.desktopSelfHost = "true";
    return () => {
      delete document.documentElement.dataset.desktopSelfHost;
    };
  }, [isDesktopSelfHost]);
  useEffect(() => {
    if (!chrome) return;
    let active = true;
    void chrome.getState().then((state) => {
      if (active) setNavigation(state);
    });
    const unsubscribe = chrome.subscribe(setNavigation);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chrome]);

  if (!chrome) return children;
  const titleBar = (
    <DesktopTitleBar
      chrome={chrome}
      navigation={navigation}
      workspace={outlet !== null}
    />
  );
  return (
    <TitleBarOutletContext.Provider value={setOutlet}>
      <div
        className="desktop-frame flex h-dvh flex-col overflow-hidden bg-background text-foreground"
        data-full-screen={navigation.isFullScreen}
      >
        {outlet ? createPortal(titleBar, outlet) : titleBar}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </TitleBarOutletContext.Provider>
  );
}

export function DesktopWorkspaceTitleBar() {
  const attach = useContext(TitleBarOutletContext);
  return <div ref={attach} className="shrink-0" />;
}

function DesktopTitleBar({
  chrome,
  navigation,
  workspace,
}: {
  chrome: NonNullable<DesktopRuntimeBridge["windowChrome"]>;
  navigation: DesktopNavigationState;
  workspace: boolean;
}) {
  const t = useTranslations("desktopChrome");
  const sidebarT = useTranslations("sidebar");
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useWorkspaceSidebarCollapsed();
  const route = pathname.split("/")[1] ?? "";
  const section =
    route === "ai-coach"
      ? "coach"
      : route === "settings"
        ? "settings"
        : getTrainingSection(route);
  const title = section
    ? sidebarT(section)
    : navigation.title.replace(/^Trainingload\.ai(?: Personal)?/, t("appName"));
  const sidebarToggleLabel = collapsed ? sidebarT("expand") : sidebarT("collapse");

  const windowInset = navigation.isFullScreen ? 0 : macOSWindowControlsInset;
  const paddingLeft = workspace
    ? collapsed
      ? Math.max(12, windowInset - SIDEBAR_COLLAPSED_WIDTH)
      : 12
    : windowInset || 16;

  return (
    <header
      className={cn(
        "desktop-titlebar flex h-10 shrink-0 select-none items-center gap-3 pr-4",
        workspace && "transition-[padding-left] duration-350 ease-in-out motion-reduce:transition-none",
      )}
      style={{ ...draggable, paddingLeft }}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) void chrome.zoom();
      }}
    >
      <nav
        className="flex shrink-0 items-center gap-0.5"
        style={interactive}
        aria-label={t("navigation")}
      >
        {workspace ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-compact"
              className="text-muted-foreground"
              aria-label={sidebarToggleLabel}
              title={sidebarToggleLabel}
              aria-controls="workspace-sidebar"
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            >
              <SidebarToggleIcon collapsed={collapsed} />
            </Button>
            <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border/60" />
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-compact"
          className="text-muted-foreground"
          aria-label={t("back")}
          title={t("back")}
          disabled={!navigation.canGoBack}
          onClick={() => void chrome.navigate("back")}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-compact"
          className="text-muted-foreground"
          aria-label={t("forward")}
          title={t("forward")}
          disabled={!navigation.canGoForward}
          onClick={() => void chrome.navigate("forward")}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
      </nav>
      <span className="pointer-events-none min-w-0 truncate text-sm font-medium text-foreground">
        {title}
      </span>
    </header>
  );
}
