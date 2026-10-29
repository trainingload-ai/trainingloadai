"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Wrench } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";
import { authClient } from "@/lib/auth";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import ThemeLogo from "./ui/ThemeLogo";
import { getBaseUrl } from "@/lib/config";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { ChangeThemeButton } from "@/components/change-theme-button";
import LocaleSwitcher from "@/components/locale-switcher";
import {
  DeploymentUnauthenticatedAccountAction,
  ManagedAccountMenuItem,
  DeploymentAccountBadge,
} from "@deployment/managed-ui";
import { localeNativeLabel, routing } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import { persistLocalePreference } from "@/lib/locale-preference";
import {
  localeNavigationHref,
  localeNavigationQuery,
  replaceBrowserLocation,
} from "@/lib/locale-navigation";
import { useSelfHostSessionPolicy } from "@/api/self-host-bootstrap";

type TopBarProps = {
  unauthenticatedHref?: string;
  reloadOnLocaleChange?: boolean;
};

function TopBarComponent({
  unauthenticatedHref,
  reloadOnLocaleChange = false,
}: TopBarProps) {
  const { data: session, isPending } = useViewerSession();
  const publicDemo = usePublicDemo();
  const [hydrated, setHydrated] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] =
    React.useState(false);
  const [desktopAccountMenuOpen, setDesktopAccountMenuOpen] =
    React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const locale = useLocale();
  const [, startTransition] = React.useTransition();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const t = useTranslations("topBar");
  const tCompetition = useTranslations("CompetitionEvents");
  const tSettings = useTranslations("settings");
  const tSettingsPage = useTranslations("SettingsPage");
  const tPublicDemo = useGuestAccessText();
  const { canSignOut } = useSelfHostSessionPolicy();
  const showSessionPending = !hydrated || isPending;
  const isAuthRoute = [
    "/setup",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ].includes(pathname ?? "");

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    setMobileAccountMenuOpen(false);
    setDesktopAccountMenuOpen(false);
  }, [pathname]);

  const onSignOutClick = async () => {
    if (publicDemo.active || signingOut) return;
    setSigningOut(true);
    await queryClient.cancelQueries();
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => window.location.replace(`/${locale}/login`),
        },
      });
    } finally {
      setSigningOut(false);
    }
  };

  const onLocaleSelect = (nextLocale: Locale) => {
    persistLocalePreference(nextLocale);
    if (reloadOnLocaleChange) {
      replaceBrowserLocation(
        localeNavigationHref(nextLocale, pathname, window.location.search),
      );
      return;
    }
    startTransition(() => {
      router.replace(
        {
          pathname,
          // @ts-expect-error -- The current route params match the current pathname.
          params,
          query: localeNavigationQuery(window.location.search),
        },
        { locale: nextLocale },
      );
    });
  };

  const renderAccountMenuContent = () => (
    <DropdownMenuContent align="end" className="w-56">
      <ManagedAccountMenuItem />
      <Link href="/analysis" passHref>
        <DropdownMenuItem className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span>{t("tools")}</span>
        </DropdownMenuItem>
      </Link>
      <DropdownMenuSeparator />
      <Link href="/account" passHref>
        <DropdownMenuItem>{t("account")}</DropdownMenuItem>
      </Link>
      <Link href="/competitions" passHref>
        <DropdownMenuItem>{tCompetition("page.title")}</DropdownMenuItem>
      </Link>
      <Link href="/pace/best-distance" passHref>
        <DropdownMenuItem>{t("bestDistance")}</DropdownMenuItem>
      </Link>
      <DropdownMenuSeparator />
      <Link href="/settings" passHref>
        <DropdownMenuItem>{tSettingsPage("settings")}</DropdownMenuItem>
      </Link>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{tSettings("theme")}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            {tSettings("light")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            {tSettings("dark")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            {tSettings("system")}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{tSettings("language")}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {routing.locales.map((cur) => (
            <DropdownMenuItem
              key={cur}
              onClick={() => onLocaleSelect(cur)}
              className={cur === locale ? "font-medium" : undefined}
            >
              {localeNativeLabel(cur)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {canSignOut ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={publicDemo.active || signingOut}
            title={
              publicDemo.active ? tPublicDemo("readOnlyAction") : undefined
            }
            onClick={onSignOutClick}
          >
            {t("signOut")}
          </DropdownMenuItem>
        </>
      ) : null}
    </DropdownMenuContent>
  );

  return (
    <>
      <div className="relative flex h-12 w-full items-center border-b border-border bg-background px-safe-or-3 pt-safe-or-1 pc:hidden">
        <Link
          href={hydrated && session ? "/" : getBaseUrl()}
          className="absolute left-1/2 flex -translate-x-1/2 items-center"
          aria-label="Trainingload.ai"
        >
          <ThemeLogo width={104} height={19} />
        </Link>
        <div className="relative z-10 ml-auto flex h-9 min-w-20 items-center justify-end">
          {showSessionPending ? (
            <Skeleton className="h-8 w-8 rounded-full" />
          ) : session ? (
            <DropdownMenu
              open={mobileAccountMenuOpen}
              onOpenChange={setMobileAccountMenuOpen}
            >
              <DropdownMenuTrigger
                className="flex h-9 w-auto items-center justify-center gap-1 rounded-full px-1.5"
                variant="ghost"
                size="icon"
                aria-label={t("account")}
              >
                <DeploymentAccountBadge compact />
                <User className="h-5 w-5" />
              </DropdownMenuTrigger>
              {renderAccountMenuContent()}
            </DropdownMenu>
          ) : isAuthRoute ? null : (
            <DeploymentUnauthenticatedAccountAction
              href={unauthenticatedHref}
              mobile
            />
          )}
        </div>
      </div>

      <div className="hidden w-full items-center justify-center border-b border-border bg-background py-2 pl-safe-or-6 pr-safe-or-3 pt-safe-or-2 pc:flex">
        <div className="max-w-[1400px] mx-auto my-0 flex items-center justify-between flex-1">
          <div className="hidden pc:flex items-center space-x-4">
            <Link href={hydrated && session ? "/" : getBaseUrl()}>
              <ThemeLogo width={120} height={22} />
            </Link>
          </div>
          <div className="flex items-center space-x-2">
            <div className="hidden items-center gap-1 pc:flex">
              <ChangeThemeButton
                labels={{
                  trigger: tSettings("theme"),
                  light: tSettings("light"),
                  dark: tSettings("dark"),
                  system: tSettings("system"),
                }}
              />
              <LocaleSwitcher
                ariaLabel={tSettings("language")}
                reloadOnLocaleChange={reloadOnLocaleChange}
              />
            </div>
            {/* Notifications（桌面端 Sheet） */}
            {!showSessionPending && session && !signingOut ? (
              <div className="block">
                <NotificationDrawer />
              </div>
            ) : null}
            {showSessionPending ? (
              <Skeleton className="w-20 h-4 mr-2" />
            ) : session ? (
              <div className="flex items-center gap-1.5">
                <DropdownMenu
                  open={desktopAccountMenuOpen}
                  onOpenChange={setDesktopAccountMenuOpen}
                >
                  <DropdownMenuTrigger
                    className="flex items-center gap-1.5 text-mobile-caption pc:text-xs font-medium px-2 py-0"
                    variant="ghost"
                    size="xs"
                  >
                    <User className="w-4 h-4" />
                    <span className="hidden pc:inline">
                      {session?.user.name}
                    </span>
                  </DropdownMenuTrigger>
                  {renderAccountMenuContent()}
                </DropdownMenu>
                <DeploymentAccountBadge />
              </div>
            ) : isAuthRoute ? null : (
              <DeploymentUnauthenticatedAccountAction
                href={unauthenticatedHref}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const TopBar = React.memo(TopBarComponent);
