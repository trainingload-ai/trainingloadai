"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Resizable } from "re-resizable";
import { Settings as SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import ThemeLogo from "@/components/ui/ThemeLogo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";
import { useWorkspaceSidebarCollapsed } from "@/hooks/use-workspace-sidebar-collapsed";
import { TopBar } from "@/components/TopBar";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import {
  AccessOptionsDialog,
  useAccessNavigationGuard,
} from "@deployment/managed-ui";
import {
  COACH_SPACE_HREF,
  clearLastCoachSession,
} from "@/lib/app-space-memory";
import { useCoachSid } from "@/app/[locale]/(main)/ai-coach/use-coach-sid";
import {
  readSidFromLocationSearch,
  resolveActiveCoachSid,
} from "@/app/[locale]/(main)/ai-coach/coach-sid-model";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH_LIMITS,
  usePersistedSidebarWidth,
} from "@/hooks/use-persisted-sidebar-width";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";
import { getTrainingSection, TRAINING_LINKS } from "./training-navigation";

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

const COMPACT_LAYOUT_WIDTH = 128;

function CoachHistoryListSkeleton() {
  return (
    <div className="min-h-0 flex-1 space-y-1 px-2 py-2" aria-hidden="true">
      <div className="h-7 animate-pulse rounded-md bg-muted/55" />
      <div className="h-3 w-14 animate-pulse rounded-xs bg-muted/55" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-7 animate-pulse rounded-md bg-muted/35" />
      ))}
    </div>
  );
}

function DesktopSidebar() {
  const { isDesktopSelfHost } = useRuntimeEnvironment();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sid, applySid, openNewCoachChat } = useCoachSid();
  const route = pathname.split("/")[1] ?? "";
  const trainingSection = getTrainingSection(route);
  const isCoachSpace = route === "ai-coach";
  const activeSid = isCoachSpace
    ? resolveActiveCoachSid({
        searchParamsSid: searchParams.get("sid") ?? "",
        storeSid: sid,
        locationSid: readSidFromLocationSearch(),
      })
    : "";
  const t = useTranslations("sidebar");
  const { collapsed } = useWorkspaceSidebarCollapsed();
  const { setWidth: setSidebarWidth, width: sidebarWidth } =
    usePersistedSidebarWidth();
  const vipGate = useAccessNavigationGuard();
  const aiAvailable = runtimeCapabilityAvailable(useRuntimeCapability("ai"));
  const [isResizing, setIsResizing] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [compactLayout, setCompactLayout] = React.useState(collapsed);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setCompactLayout(width < COMPACT_LAYOUT_WIDTH);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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

  const startNewCoachConversation = () => {
    clearLastCoachSession();
    if (isCoachSpace) {
      openNewCoachChat();
    } else {
      router.push(COACH_SPACE_HREF);
    }
  };

  const coachNav = (
    <Link
      href={COACH_SPACE_HREF}
      aria-current={isCoachSpace ? "page" : undefined}
      className={cn(
        "flex h-7 min-w-0 items-center rounded-control px-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        compactLayout && "justify-center px-0 text-xs",
      )}
      title={t("coach")}
      onClick={(event) => {
        vipGate.guardNavigation(event, COACH_SPACE_HREF);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if (isCoachSpace) {
          event.preventDefault();
        } else {
          clearLastCoachSession();
        }
      }}
    >
      <span className="truncate">{t("coach")}</span>
    </Link>
  );

  return (
    <Resizable
      as="aside"
      size={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth,
        height: "100%",
      }}
      minWidth={isResizing ? SIDEBAR_WIDTH_LIMITS.min : SIDEBAR_COLLAPSED_WIDTH}
      maxWidth={SIDEBAR_WIDTH_LIMITS.max}
      enable={!collapsed && { right: true }}
      handleClasses={{
        right:
          "group/resize touch-none outline-none focus-visible:outline-none",
      }}
      handleStyles={{
        right: {
          cursor: "col-resize",
          right: -5,
          top: 42,
          height: "calc(100% - 82px)",
          width: 10,
          zIndex: 40,
        },
      }}
      handleComponent={{
        right: collapsed ? undefined : (
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
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={(_event, _direction, element) => {
        setIsResizing(false);
        const width = Number.parseFloat(element.style.width);
        setSidebarWidth(
          Number.isFinite(width)
            ? width
            : element.getBoundingClientRect().width,
        );
      }}
      className={cn(
        "relative hidden shrink-0 flex-col py-1.5 text-sidebar-foreground tablet:flex",
        isResizing
          ? "transition-none"
          : "transition-[width] duration-350 ease-in-out motion-reduce:transition-none",
      )}
    >
      <div
        ref={contentRef}
        data-sidebar-collapsed={collapsed}
        className="group/workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <TooltipProvider delayDuration={180}>
          <div className="flex h-9 shrink-0 items-center px-2 pb-0.5">
            <div
              aria-hidden={collapsed || undefined}
              className={cn(
                "min-w-0 flex-1 overflow-hidden transition-opacity duration-250 motion-reduce:transition-none",
                collapsed ? "opacity-0" : "delay-75",
              )}
            >
              <div className="ms-1.5 w-[106px]">
                <ThemeLogo width={106} height={20} />
              </div>
            </div>
            <NotificationDrawer />
          </div>
          <nav
            aria-label={t("navigationLabel")}
            className="grid shrink-0 gap-0.5 px-1.5 pb-3"
          >
            {TRAINING_LINKS.map(({ key, href, Icon }) => (
              <SidebarLink
                key={key}
                href={href}
                label={t(key)}
                icon={<Icon />}
                active={key === trainingSection}
                collapsed={collapsed}
              />
            ))}
          </nav>
          {aiAvailable || isDesktopSelfHost ? (
            <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-1">
              {compactLayout || !aiAvailable || !vipGate.canAccess ? (
                <div className={cn("px-1.5", compactLayout && "w-12")}>{coachNav}</div>
              ) : (
                <div
                  inert={collapsed}
                  className={cn(
                    "flex min-h-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0",
                    collapsed && "opacity-0",
                  )}
                >
                  <CoachSidebarHistoryList
                    activeSid={activeSid}
                    heading={coachNav}
                    onNewChat={startNewCoachConversation}
                    onSelectSession={(nextSid) => {
                      if (isCoachSpace) {
                        applySid(nextSid);
                      } else {
                        router.push(
                          `${COACH_SPACE_HREF}?${new URLSearchParams({ sid: nextSid })}`,
                        );
                      }
                    }}
                    onSessionDeleted={(deletedSid) => {
                      if (deletedSid === activeSid) startNewCoachConversation();
                    }}
                    onViewAll={() => {
                      const next = new URLSearchParams({ view: "history" });
                      if (activeSid) next.set("sid", activeSid);
                      router.push(`${COACH_SPACE_HREF}?${next}`, {
                        scroll: false,
                      });
                    }}
                  />
                </div>
              )}
            </div>
          ) : null}
          <div className={cn(
            "mt-auto shrink-0 border-t border-sidebar-border/60 px-1.5 pt-1",
            compactLayout && "w-12",
          )}>
            <TopBar
              placement="workspace"
              collapsed={compactLayout}
              settingsControl={
                <nav
                  aria-label={t("secondaryNavigationLabel")}
                  className={compactLayout ? "w-8" : "min-w-0 flex-1"}
                >
                  <SidebarLink
                    href="/settings"
                    label={t("settings")}
                    icon={<SettingsIcon />}
                    active={route === "settings" || route === "account"}
                    collapsed={collapsed}
                  />
                </nav>
              }
            />
          </div>
        </TooltipProvider>
      </div>
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
      className="group/handle relative flex h-full w-full cursor-col-resize items-center justify-center outline-none"
      onKeyDown={resizeFromKeyboard}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent group-hover/resize:bg-brand/75 group-focus-visible/handle:bg-brand/85",
          isResizing && "bg-brand",
        )}
      />
    </div>
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
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  if (!collapsed && tooltipOpen) setTooltipOpen(false);

  const preventExpandedTooltip = collapsed
    ? undefined
    : (event: React.SyntheticEvent) => event.preventDefault();
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-0 touch-manipulation items-center overflow-hidden rounded-control text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-background font-semibold text-sidebar-foreground"
          : "text-muted-foreground hover:bg-background/70 hover:text-sidebar-foreground",
      )}
    >
      <span className="grid w-9 max-w-full shrink-0 place-items-center">
        {React.cloneElement(icon, {
          className: "size-4 shrink-0",
          "aria-hidden": true,
        })}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "min-w-0 truncate pe-1 transition-opacity duration-250 motion-reduce:transition-none",
          collapsed ? "opacity-0" : "delay-75",
        )}
      >
        {label}
      </span>
    </Link>
  );

  return (
    <Tooltip
      open={collapsed && tooltipOpen}
      onOpenChange={(open) => setTooltipOpen(collapsed && open)}
    >
      <TooltipTrigger
        asChild
        onFocus={preventExpandedTooltip}
        onPointerMove={preventExpandedTooltip}
      >
        {link}
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

export default React.memo(DesktopSidebar);
