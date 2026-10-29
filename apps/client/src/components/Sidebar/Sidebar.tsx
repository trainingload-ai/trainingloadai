"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Resizable } from "re-resizable";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
  House,
  ListChecks,
  NotebookText,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePersistedSidebarCollapsed } from "@/hooks/use-persisted-sidebar-collapsed";
import { useCompactSidebarViewport } from "@/hooks/use-mobile";
import {
  AccessOptionsDialog,
  useAccessNavigationGuard,
} from "@deployment/managed-ui";
import {
  COACH_SPACE_HREF,
  clearLastCoachSession,
  readLastProductRoute,
  rememberLastProductRoute,
} from "@/lib/app-space-memory";
import { useCoachSid } from "@/app/[locale]/(main)/ai-coach/use-coach-sid";
import {
  readSidFromLocationSearch,
  resolveActiveCoachSid,
} from "@/app/[locale]/(main)/ai-coach/coach-sid-model";
import {
  SIDEBAR_WIDTH_LIMITS,
  usePersistedSidebarWidth,
} from "@/hooks/use-persisted-sidebar-width";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";

const CoachSidebarHistoryList = dynamic(
  () =>
    import("@/app/[locale]/(main)/ai-coach/coach-history-panel").then(
      (module) => module.CoachSidebarHistoryList,
    ),
  {
    ssr: false,
    loading: () => <CoachHistoryListSkeleton />,
  },
);

function firstRouteSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

function CoachHistoryListSkeleton() {
  return (
    <div className="min-h-0 flex-1 space-y-2 px-3 py-3" aria-hidden="true">
      <div className="h-9 animate-pulse rounded-md bg-muted/55" />
      <div className="h-3 w-14 animate-pulse rounded-xs bg-muted/55" />
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-md bg-muted/35" />
      ))}
    </div>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sid, applySid, clearCoachSidFromUrl, openNewCoachChat } =
    useCoachSid();
  const route = firstRouteSegment(pathname);
  const isCoachSpace = route === "ai-coach";
  const activeSid = resolveActiveCoachSid({
    searchParamsSid: searchParams.get("sid") ?? "",
    storeSid: sid,
    locationSid: readSidFromLocationSearch(),
  });
  const t = useTranslations("sidebar");
  const compactViewport = useCompactSidebarViewport();
  const compactMode = compactViewport ?? true;
  const { collapsed, toggleCollapsed } = usePersistedSidebarCollapsed({
    mode: compactMode ? "compact" : "wide",
    defaultCollapsed: compactMode,
  });
  const { setWidth: setSidebarWidth, width: sidebarWidth } =
    usePersistedSidebarWidth();
  const productSidebarCollapsed = !isCoachSpace && collapsed;
  const vipGate = useAccessNavigationGuard();
  const aiAvailable = runtimeCapabilityAvailable(useRuntimeCapability("ai"));
  const [lastProductHref, setLastProductHref] = React.useState("/");
  const [isResizing, setIsResizing] = React.useState(false);

  React.useEffect(() => {
    if (isCoachSpace) {
      setLastProductHref(readLastProductRoute());
      return;
    }

    rememberLastProductRoute(pathname);
    setLastProductHref(pathname);
  }, [isCoachSpace, pathname]);

  React.useEffect(() => {
    if (!isResizing) return;

    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [isResizing]);

  const active = (key: string) =>
    key === "home"
      ? route === ""
      : key === "plan"
        ? ["plan", "plans"].includes(route)
        : key === "settings"
          ? ["settings", "account"].includes(route)
          : route === key;

  const selectCoachSession = React.useCallback(
    (nextSid: string) => {
      applySid(nextSid);
    },
    [applySid],
  );

  const startNewCoachConversation = React.useCallback(() => {
    clearLastCoachSession();
    clearCoachSidFromUrl();
  }, [clearCoachSidFromUrl]);

  const openCoachSpace = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      vipGate.guardNavigation(event, COACH_SPACE_HREF);
      if (event.defaultPrevented) return;
      const modifiedClick =
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey;
      if (modifiedClick) return;
      event.preventDefault();
      clearLastCoachSession();
      openNewCoachChat();
    },
    [openNewCoachChat, vipGate.guardNavigation],
  );

  const openFullCoachHistory = React.useCallback(() => {
    const next = new URLSearchParams();
    next.set("view", "history");
    if (activeSid) next.set("sid", activeSid);
    router.replace(`/ai-coach?${next.toString()}`, { scroll: false });
  }, [activeSid, router]);

  const handleCoachSessionDeleted = React.useCallback(
    (deletedSid: string) => {
      if (deletedSid !== activeSid) return;
      clearLastCoachSession();
      clearCoachSidFromUrl();
    },
    [activeSid, clearCoachSidFromUrl],
  );

  return (
    <Resizable
      as="aside"
      size={{
        width: productSidebarCollapsed ? 64 : sidebarWidth,
        height: "100%",
      }}
      minWidth={productSidebarCollapsed ? 64 : SIDEBAR_WIDTH_LIMITS.min}
      maxWidth={productSidebarCollapsed ? 64 : SIDEBAR_WIDTH_LIMITS.max}
      enable={
        productSidebarCollapsed
          ? false
          : {
              right: true,
            }
      }
      handleClasses={{
        right:
          "group/resize touch-none outline-none focus-visible:outline-none",
      }}
      handleStyles={{
        right: {
          cursor: "col-resize",
          right: -7,
          width: 14,
          zIndex: 40,
        },
      }}
      handleComponent={{
        right: productSidebarCollapsed ? (
          <span />
        ) : (
          <SidebarResizeHandle
            currentWidth={sidebarWidth}
            isResizing={isResizing}
            label={t("resize")}
            maxWidth={SIDEBAR_WIDTH_LIMITS.max}
            minWidth={SIDEBAR_WIDTH_LIMITS.min}
            onCommit={setSidebarWidth}
          />
        ),
      }}
      onResizeStart={() => {
        setIsResizing(true);
      }}
      onResizeStop={(_event, _direction, elementRef) => {
        setIsResizing(false);
        const inlineWidth = Number.parseFloat(elementRef.style.width);
        setSidebarWidth(
          Number.isFinite(inlineWidth)
            ? inlineWidth
            : elementRef.getBoundingClientRect().width,
        );
      }}
      className={cn(
        "relative hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground tablet:flex",
        isResizing
          ? "transition-none"
          : "transition-[width] duration-200 motion-reduce:transition-none",
      )}
    >
      <TooltipProvider delayDuration={180}>
        <SidebarSpaceSwitcher
          coachHref={COACH_SPACE_HREF}
          collapsed={productSidebarCollapsed}
          isCoachSpace={isCoachSpace}
          productHref={lastProductHref}
          onCoachClick={openCoachSpace}
          showCoach={aiAvailable}
        />

        {isCoachSpace ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <CoachSidebarHistoryList
              activeSid={activeSid}
              onNewChat={startNewCoachConversation}
              onSelectSession={selectCoachSession}
              onSessionDeleted={handleCoachSessionDeleted}
              onViewAll={openFullCoachHistory}
            />
            <nav
              aria-label={t("secondaryNavigationLabel")}
              className="shrink-0 border-t border-border/70 p-3"
            >
              <SidebarLink
                href="/settings"
                label={t("settings")}
                icon={<SettingsIcon />}
                active={false}
                collapsed={false}
              />
            </nav>
          </div>
        ) : (
          <>
            <nav
              aria-label={t("navigationLabel")}
              className="flex flex-col gap-1 px-3 py-2"
            >
              <SidebarLink
                href="/"
                label={t("home")}
                icon={<House />}
                active={active("home")}
                collapsed={productSidebarCollapsed}
              />
              <SidebarLink
                href="/plan"
                label={t("plan")}
                icon={<NotebookText />}
                active={active("plan")}
                collapsed={productSidebarCollapsed}
              />
              <SidebarLink
                href="/calendar"
                label={t("calendar")}
                icon={<CalendarDays />}
                active={active("calendar")}
                collapsed={productSidebarCollapsed}
              />
              <SidebarLink
                href="/activities"
                label={t("activities")}
                icon={<ListChecks />}
                active={active("activities")}
                collapsed={productSidebarCollapsed}
              />
              <SidebarLink
                href="/dashboard"
                label={t("dashboard")}
                icon={<Gauge />}
                active={active("dashboard")}
                collapsed={productSidebarCollapsed}
              />
            </nav>
            <nav
              aria-label={t("secondaryNavigationLabel")}
              className="mt-auto px-3 pb-1"
            >
              <SidebarLink
                href="/settings"
                label={t("settings")}
                icon={<SettingsIcon />}
                active={active("settings")}
                collapsed={productSidebarCollapsed}
              />
            </nav>
            <div className="p-3 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-muted-foreground"
                onClick={toggleCollapsed}
                aria-label={
                  productSidebarCollapsed ? t("expand") : t("collapse")
                }
              >
                {productSidebarCollapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </TooltipProvider>

      <AccessOptionsDialog
        open={vipGate.pricingOpen}
        onOpenChange={vipGate.setPricingOpen}
      />
    </Resizable>
  );
}

function SidebarResizeHandle({
  currentWidth,
  isResizing,
  label,
  maxWidth,
  minWidth,
  onCommit,
}: {
  currentWidth: number;
  isResizing: boolean;
  label: string;
  maxWidth: number;
  minWidth: number;
  onCommit: (width: number) => void;
}) {
  const clampWidth = React.useCallback(
    (width: number) =>
      Math.min(maxWidth, Math.max(minWidth, Math.round(width))),
    [maxWidth, minWidth],
  );

  const resizeFromKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    let nextWidth: number | null = null;

    if (event.key === "ArrowLeft") nextWidth = currentWidth - step;
    if (event.key === "ArrowRight") nextWidth = currentWidth + step;
    if (event.key === "Home") nextWidth = minWidth;
    if (event.key === "End") nextWidth = maxWidth;
    if (nextWidth === null) return;

    event.preventDefault();
    const clampedWidth = clampWidth(nextWidth);
    onCommit(clampedWidth);
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={maxWidth}
      aria-valuemin={minWidth}
      aria-valuenow={currentWidth}
      tabIndex={0}
      className="relative flex h-full w-full cursor-col-resize items-center justify-center outline-none"
      onKeyDown={resizeFromKeyboard}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-sm bg-brand/0 transition-colors duration-150 group-hover/resize:bg-brand/15 group-focus-within/resize:bg-brand/15",
          isResizing && "bg-brand/20",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-[background-color,width] duration-150 group-hover/resize:w-0.5 group-hover/resize:bg-brand group-focus-within/resize:w-0.5 group-focus-within/resize:bg-brand",
          isResizing && "w-0.5 bg-brand",
        )}
      />
    </div>
  );
}

function SidebarSpaceSwitcher({
  coachHref,
  collapsed,
  isCoachSpace,
  productHref,
  onCoachClick,
  showCoach,
}: {
  coachHref: string;
  collapsed: boolean;
  isCoachSpace: boolean;
  productHref: string;
  onCoachClick: React.MouseEventHandler<HTMLAnchorElement>;
  showCoach: boolean;
}) {
  const t = useTranslations("sidebar");

  return (
    <nav
      aria-label={t("spaceSwitcherLabel")}
      className={cn("shrink-0", collapsed ? "p-2" : "p-3 pb-1")}
    >
      <div
        className={cn(
          "grid gap-1 rounded-control bg-muted p-1",
          collapsed || !showCoach ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        <SidebarSpaceLink
          active={!isCoachSpace}
          collapsed={collapsed}
          href={productHref}
          icon={<House />}
          label={t("trainingSpace")}
        />
        {showCoach ? (
          <SidebarSpaceLink
            active={isCoachSpace}
            collapsed={collapsed}
            href={coachHref}
            icon={<Sparkles />}
            label={t("coach")}
            onClick={onCoachClick}
          />
        ) : null}
      </div>
    </nav>
  );
}

function SidebarSpaceLink({
  active,
  collapsed,
  href,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  href: string;
  icon: React.ReactElement<{
    className?: string;
    "aria-hidden"?: boolean;
  }>;
  label: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-compact text-mobile-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pc:text-xs",
        collapsed ? "min-h-9 px-0" : "min-h-8 px-2",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
      )}
    >
      {React.cloneElement(icon, {
        className: "h-3.5 w-3.5 shrink-0",
        "aria-hidden": true,
      })}
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ReactElement<{
    className?: string;
    "aria-hidden"?: boolean;
  }>;
  active: boolean;
  collapsed: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        "flex h-9 touch-manipulation items-center gap-2 rounded-compact px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed && "justify-center",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground",
      )}
    >
      {React.cloneElement(icon, {
        className: "size-[18px]",
        "aria-hidden": true,
      })}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default React.memo(DesktopSidebar);
