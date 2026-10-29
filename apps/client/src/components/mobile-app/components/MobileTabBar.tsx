"use client";

import {
  CalendarDays,
  House,
  NotebookText,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  getActiveMobileTab,
  type MobileTabId,
} from "../models/mobile-route-model";
import { useUnreadNotificationCount } from "../hooks/use-unread-notification-count";
import {
  runtimeCapabilityAvailable,
  useRuntimeCapability,
} from "@/api/runtime-capabilities";

const TABS: Array<{
  id: MobileTabId;
  href: "/" | "/plan" | "/ai-coach" | "/calendar" | "/me";
  icon: typeof House;
}> = [
  { id: "today", href: "/", icon: House },
  { id: "plan", href: "/plan", icon: NotebookText },
  { id: "coach", href: "/ai-coach", icon: Sparkles },
  { id: "calendar", href: "/calendar", icon: CalendarDays },
  { id: "me", href: "/me", icon: UserRound },
];

export function MobileTabBar() {
  const pathname = usePathname();
  return <MobileTabBarContent pathname={pathname} />;
}

function MobileTabBarContent({ pathname }: { pathname: string }) {
  const activeTab = getActiveMobileTab(pathname);
  const t = useTranslations("MobileApp.tabs");
  const { count } = useUnreadNotificationCount();
  const aiAvailable = runtimeCapabilityAvailable(useRuntimeCapability("ai"));
  const tabs = aiAvailable ? TABS : TABS.filter((tab) => tab.id !== "coach");
  return (
    <div className="z-40 shrink-0 border-t border-border/70 bg-background pb-safe tablet:hidden">
      <nav
        aria-label={t("navigationLabel")}
        className="mx-auto grid h-14 max-w-xl px-safe"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map(({ id, href, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-mobile-unit font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "relative grid h-6 w-8 place-items-center rounded-full transition-colors",
                  active && "bg-brand text-brand-foreground",
                )}
                aria-hidden="true"
              >
                <Icon
                  className={cn("h-[21px] w-[21px]", active && "stroke-[2.4]")}
                />
                {id === "me" && count > 0 ? (
                  <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white ring-2 ring-background">
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </span>
              <span>{t(id)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
