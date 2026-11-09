"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";
import { usePersistedSidebarCollapsed } from "@/hooks/use-persisted-sidebar-collapsed";
import { usePersistedSidebarWidth } from "@/hooks/use-persisted-sidebar-width";
import { Button } from "@/components/ui/button";
import type { DesktopNavigationState } from "@/lib/runtime-environment";

const draggable = { WebkitAppRegion: "drag" } as CSSProperties;
const interactive = { WebkitAppRegion: "no-drag" } as CSSProperties;
const initialState: DesktopNavigationState = {
  canGoBack: false,
  canGoForward: false,
  title: "Trainingload.ai",
  isFullScreen: false,
};

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const { desktop, isDesktopSelfHost } = useRuntimeEnvironment();
  const chrome = isDesktopSelfHost ? desktop?.windowChrome : undefined;
  useEffect(() => {
    if (!isDesktopSelfHost) return;
    document.documentElement.dataset.desktopSelfHost = "true";
    return () => {
      delete document.documentElement.dataset.desktopSelfHost;
    };
  }, [isDesktopSelfHost]);
  if (!chrome) return children;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <DesktopTitleBar chrome={chrome} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function DesktopTitleBar({
  chrome,
}: {
  chrome: NonNullable<
    ReturnType<typeof useRuntimeEnvironment>["desktop"]
  >["windowChrome"];
}) {
  const t = useTranslations("desktopChrome");
  const sidebarT = useTranslations("sidebar");
  const pathname = usePathname();
  const [navigation, setNavigation] = useState(initialState);
  const { collapsed, toggleCollapsed } = usePersistedSidebarCollapsed({
    mode: "desktop-coach",
    defaultCollapsed: false,
  });
  const sidebarAvailable = pathname === "/ai-coach";
  const { width: sidebarWidth } = usePersistedSidebarWidth();

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

  return (
    <header
      aria-label={t("navigation")}
      className="desktop-titlebar flex h-10 shrink-0 items-center gap-3 pr-4"
      style={{ ...draggable, paddingLeft: navigation.isFullScreen ? 16 : 88 }}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) void chrome?.zoom();
      }}
    >
      <nav
        className="flex items-center gap-1"
        style={{
          ...interactive,
          minWidth:
            sidebarAvailable && !collapsed
              ? Math.max(108, sidebarWidth - 48)
              : undefined,
        }}
        aria-label={t("navigation")}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={t("back")}
          title={t("back")}
          disabled={!navigation.canGoBack}
          onClick={() => void chrome?.navigate("back")}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={t("forward")}
          title={t("forward")}
          disabled={!navigation.canGoForward}
          onClick={() => void chrome?.navigate("forward")}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
        {sidebarAvailable ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={collapsed ? sidebarT("expand") : sidebarT("collapse")}
            title={collapsed ? sidebarT("expand") : sidebarT("collapse")}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <PanelLeft aria-hidden="true" />
          </Button>
        ) : null}
      </nav>
      <span className="pointer-events-none min-w-0 flex-1 truncate border-l border-border pl-4 text-sm font-medium text-foreground">
        {pathname === "/ai-coach"
          ? `${t("appName")} · ${sidebarT("coach")}`
          : navigation.title.replace(/^Trainingload\.ai(?: Personal)?/, t("appName"))}
      </span>
    </header>
  );
}
