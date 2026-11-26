"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";

import Sidebar from "@/components/Sidebar/Sidebar";
import { MainAppFooter } from "@/components/MainAppFooter";
import SettingsBootstrap from "@/components/bootstrap/SettingsBootstrap";
import { Button } from "@/components/ui/button";
import { useWorkspaceSidebarCollapsed } from "@/hooks/use-workspace-sidebar-collapsed";
import { useMobileViewport } from "@/hooks/use-mobile";
import { SIDEBAR_WIDTH_LIMITS } from "@/hooks/use-persisted-sidebar-width";
import { MainContentContainer } from "@/components/layout/MainContentContainer";
import { DesktopWorkspaceTitleBar } from "@/components/layout/DesktopWindowFrame";
import { MainScrollRecovery } from "@/components/layout/MainScrollRecovery";
import { SidebarToggleIcon } from "@/components/layout/SidebarToggleIcon";
import { MobileNavigationHeader } from "@/components/mobile-app/components/MobileNavigationHeader";
import { MobileNavigationProvider } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobileRouteTransition } from "@/components/mobile-app/components/MobileRouteTransition";
import { MobileTabBar } from "@/components/mobile-app/components/MobileTabBar";
import { MobileTopBarContent } from "@/components/mobile-app/components/MobileTopBar";
import { MainOnboardingRedirect } from "@/components/onboarding/MainOnboardingRedirect";
import { PersonalFocusSync } from "@/components/third-party/personal-focus-sync";
import {
  MOBILE_SIDE_PAGE_EVENT,
  MOBILE_SIDE_PAGE_OFFSET,
  MOBILE_SIDE_PAGE_TRANSITION,
  MobileSidePageScrim,
} from "@/components/mobile-app/components/MobilePushSidePage";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

function MainSidebarFallback() {
  return (
    <div
      className="hidden h-full tablet:block"
      style={{ width: SIDEBAR_WIDTH_LIMITS.default }}
      aria-hidden="true"
    />
  );
}

function getBrowserNavigation() {
  return (
    window as Window & {
      navigation?: EventTarget & { canGoBack: boolean; canGoForward: boolean };
    }
  ).navigation;
}

function subscribeToNavigation(callback: () => void) {
  const navigation = getBrowserNavigation();
  navigation?.addEventListener("currententrychange", callback);
  return () => navigation?.removeEventListener("currententrychange", callback);
}

function WorkspaceToolbar() {
  const { collapsed, toggleCollapsed } = useWorkspaceSidebarCollapsed();
  const t = useTranslations("sidebar");
  const desktopT = useTranslations("desktopChrome");
  const canGoBack = useSyncExternalStore(
    subscribeToNavigation,
    () => getBrowserNavigation()?.canGoBack ?? false,
    () => false,
  );
  const canGoForward = useSyncExternalStore(
    subscribeToNavigation,
    () => getBrowserNavigation()?.canGoForward ?? false,
    () => false,
  );
  const label = collapsed ? t("expand") : t("collapse");

  return (
    <nav
      aria-label={desktopT("navigation")}
      className="hidden h-9 shrink-0 items-center gap-0.5 border-b border-border/45 px-1.5 tablet:flex"
    >
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={label}
        title={label}
        aria-controls="workspace-sidebar"
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
      >
        <SidebarToggleIcon collapsed={collapsed} />
      </Button>
      <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border/60" />
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={desktopT("back")}
        title={desktopT("back")}
        disabled={!canGoBack}
        onClick={() => window.history.back()}
      >
        <ArrowLeft aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={desktopT("forward")}
        title={desktopT("forward")}
        disabled={!canGoForward}
        onClick={() => window.history.forward()}
      >
        <ArrowRight aria-hidden="true" />
      </Button>
    </nav>
  );
}

export function MainAppShell({ children }: { children: React.ReactNode }) {
  const { isDesktopSelfHost, desktop } = useRuntimeEnvironment();
  const usesDesktopTitleBar = isDesktopSelfHost && Boolean(desktop?.windowChrome);
  const isMobileViewport = useMobileViewport();
  const usesDesktopWorkspaceTitleBar = usesDesktopTitleBar && isMobileViewport === false;
  const [mobileSidePageOpen, setMobileSidePageOpen] = useState(false);
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const locale = useLocale();

  useEffect(() => {
    const handleSidePage = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setMobileSidePageOpen(Boolean(detail?.open));
    };
    window.addEventListener(MOBILE_SIDE_PAGE_EVENT, handleSidePage);
    return () =>
      window.removeEventListener(MOBILE_SIDE_PAGE_EVENT, handleSidePage);
  }, []);

  return (
    <MobileNavigationProvider>
      {/* 新用户 onboarding 跳转 */}
      <MainOnboardingRedirect />
      <PersonalFocusSync />
      <div
        className={cn(
          "flex flex-col overflow-x-clip bg-background",
          usesDesktopTitleBar
            ? "h-full min-h-0"
            : "h-dvh-safe min-h-dvh-safe",
        )}
      >
        <a
          href="#main-content"
          className={cn(
            "sr-only z-[100] rounded-md bg-background px-4 py-2 focus:not-sr-only focus:absolute focus:left-2",
            usesDesktopTitleBar ? "focus:top-10" : "focus:top-2",
          )}
        >
          Skip to content
        </a>
        <SettingsBootstrap />
        <MainScrollRecovery />
        {publicDemo.active && !publicDemo.loading ? (
          <div
            role="status"
            className="flex min-h-10 items-center justify-center gap-3 border-b border-border bg-muted px-4 py-2 text-center text-sm text-foreground"
          >
            <span>{demoText("banner")}</span>
            <a
              href={`${process.env.NEXT_PUBLIC_APP_URL || "https://app.trainingload.ai"}/${locale}/signup`}
              className="shrink-0 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {demoText("createAccount")}
            </a>
          </div>
        ) : null}
        <div
          className={cn(
            "relative flex min-h-0 w-full flex-1 flex-col transition-transform motion-reduce:transition-none pc:contents",
            MOBILE_SIDE_PAGE_TRANSITION,
          )}
          style={{
            transform: mobileSidePageOpen
              ? `translate3d(${MOBILE_SIDE_PAGE_OFFSET}, 0, 0)`
              : undefined,
          }}
        >
          <MobileNavigationHeader />
          <div
            className={cn(
              "flex min-h-0 w-full flex-1 overflow-hidden tablet:bg-muted/75 dark:tablet:bg-muted/65",
              isDesktopSelfHost && "desktop-workspace-row",
            )}
          >
            <div
              id="workspace-sidebar"
              className={cn(
                "hidden shrink-0 tablet:block",
                usesDesktopWorkspaceTitleBar && "desktop-workspace-sidebar",
              )}
            >
              <Suspense fallback={<MainSidebarFallback />}>
                <Sidebar />
              </Suspense>
            </div>
            <div
              className={
                usesDesktopWorkspaceTitleBar
                  ? "flex min-h-0 min-w-0 flex-1 flex-col"
                  : "contents"
              }
            >
              {usesDesktopWorkspaceTitleBar ? <DesktopWorkspaceTitleBar /> : null}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background tablet:my-1.5 tablet:me-1.5 tablet:rounded-surface tablet:border tablet:border-border/45">
                {!usesDesktopTitleBar ? <WorkspaceToolbar /> : null}
                <MobileTopBarContent
                  id="main-content"
                  tabIndex={-1}
                  className={publicDemo.active ? "overscroll-y-auto" : undefined}
                >
                  <MobileRouteTransition>
                    <MainContentContainer>{children}</MainContentContainer>
                  </MobileRouteTransition>
                </MobileTopBarContent>
                <MainAppFooter />
              </div>
            </div>
          </div>
          <MobileTabBar />
          <MobileSidePageScrim open={mobileSidePageOpen} />
        </div>
      </div>
    </MobileNavigationProvider>
  );
}
