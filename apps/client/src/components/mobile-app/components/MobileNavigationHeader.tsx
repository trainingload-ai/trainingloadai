"use client";

import { Bell, ChevronLeft, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getRouteRoot, isMobileTabRoot } from "../models/mobile-route-model";
import { useRegisteredMobileNavigation } from "./MobileNavigationProvider";
import { useUnreadNotificationCount } from "../hooks/use-unread-notification-count";
import { MOBILE_PLAN_LIBRARY_HREF } from "@/lib/plan-navigation";
import ThemeLogo from "@/components/ui/ThemeLogo";
import { MobileTopBar, MobileTopBarAction } from "./MobileTopBar";

const TITLES: Record<string, string> = {
  "": "today",
  plan: "plan",
  plans: "plans",
  "ai-coach": "coach",
  coach: "coach",
  calendar: "calendar",
  day: "day",
  me: "me",
  activities: "activities",
  map: "map",
  dashboard: "dashboard",
  metrics: "metrics",
  pmc: "pmc",
  power: "power",
  "heart-rate": "heartRate",
  pace: "pace",
  notifications: "notifications",
  usage: "usage",
  analysis: "analysis",
  account: "account",
  settings: "settings",
  competitions: "competitions",
};
function fallback(root: string) {
  return root === "day"
    ? "/calendar"
    : root === "plans"
      ? "/plan"
      : root === "ai-coach"
        ? "/ai-coach"
        : "/me";
}

export function MobileNavigationHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("MobileApp");
  const registered = useRegisteredMobileNavigation();
  const { count } = useUnreadNotificationCount();
  const root = getRouteRoot(pathname);
  if (registered?.hidden) return null;
  const isRoot = isMobileTabRoot(pathname);
  const fallbackTitle = t(`titles.${TITLES[root] ?? "default"}`);
  const title =
    registered?.title ??
    (isRoot ? <ThemeLogo width={120} height={24} /> : fallbackTitle);
  const leading =
    registered?.leading ??
    (!isRoot ? (
      <MobileTopBarAction
        onClick={() =>
          window.history.length > 1
            ? router.back()
            : router.replace((registered?.backHref ?? fallback(root)) as never)
        }
        aria-label={t("actions.back")}
        edge="leading"
      >
        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      </MobileTopBarAction>
    ) : null);
  let trailing = registered?.trailing;
  if (!trailing && root === "plan")
    trailing = (
      <MobileTopBarAction asChild edge="trailing">
        <Link
          href={MOBILE_PLAN_LIBRARY_HREF}
          aria-label={t("actions.openPlanLibrary")}
        >
          <Library className="h-5 w-5" aria-hidden="true" />
        </Link>
      </MobileTopBarAction>
    );
  if (!trailing && root === "me")
    trailing = (
      <MobileTopBarAction asChild edge="trailing">
        <Link
          href="/notifications"
          aria-label={t("actions.openNotifications", { count })}
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white ring-2 ring-background">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Link>
      </MobileTopBarAction>
    );
  return (
    <MobileTopBar
      title={title}
      subtitle={registered?.subtitle}
      leading={leading}
      trailing={trailing}
    />
  );
}
