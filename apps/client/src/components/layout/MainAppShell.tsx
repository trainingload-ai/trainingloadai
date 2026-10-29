"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import Sidebar from "@/components/Sidebar/Sidebar";
import { MainAppFooter } from "@/components/MainAppFooter";
import SettingsBootstrap from "@/components/bootstrap/SettingsBootstrap";
import { TopBar } from "@/components/TopBar";
import { MainContentContainer } from "@/components/layout/MainContentContainer";
import { MainScrollRecovery } from "@/components/layout/MainScrollRecovery";
import { MobileNavigationHeader } from "@/components/mobile-app/components/MobileNavigationHeader";
import { MobileNavigationProvider } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobileRouteTransition } from "@/components/mobile-app/components/MobileRouteTransition";
import { MobileTabBar } from "@/components/mobile-app/components/MobileTabBar";
import { MobileTopBarContent } from "@/components/mobile-app/components/MobileTopBar";
import { MainOnboardingRedirect } from "@/components/onboarding/MainOnboardingRedirect";
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
      className="hidden h-full w-56 border-r border-sidebar-border bg-sidebar tablet:block"
      aria-hidden="true"
    />
  );
}

export function MainAppShell({ children }: { children: React.ReactNode }) {
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
      <div className="flex h-dvh-safe min-h-dvh-safe flex-col overflow-x-clip bg-background">
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-background px-4 py-2 focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
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
        <div className="hidden tablet:block">
          <TopBar />
        </div>
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
          <div className="flex min-h-0 w-full flex-1 overflow-hidden">
            <div className="shrink-0">
              <Suspense fallback={<MainSidebarFallback />}>
                <Sidebar />
              </Suspense>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <MobileTabBar />
          <MobileSidePageScrim open={mobileSidePageOpen} />
        </div>
      </div>
    </MobileNavigationProvider>
  );
}
