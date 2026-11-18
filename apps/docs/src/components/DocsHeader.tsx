"use client";

import { ChevronDown, Menu, PanelLeft, Search, X } from "lucide-react";
import { useSidebar } from "fumadocs-ui/contexts/sidebar";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { HeaderLocaleSwitcher } from "@/components/HeaderLocaleSwitcher";
import { useHeaderDisclosure } from "@/hooks/use-header-disclosure";
import { Button } from "@/components/ui/button";
import { localePrefix } from "@/lib/locale-url";
import {
  persistLocalePreference,
  type DocsLocale,
} from "@/lib/locale-preference";
import { buildLocalePathname, LOCALE_OPTIONS } from "@/lib/locale-options";
import { publicDemoDestination } from "@/lib/public-demo-url";

export function DocsHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const { setOpenSearch } = useSearchContext();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tNav = useTranslations("nav");
  const tHeader = useTranslations("header");
  const tCommon = useTranslations("commonLinks");
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const langParam = params?.lang;
  const lang =
    typeof langParam === "string"
      ? langParam
      : Array.isArray(langParam)
        ? langParam[0]
        : "en";
  const prefix = localePrefix(lang);
  const demo = publicDemoDestination(lang);
  const currentLocale =
    LOCALE_OPTIONS.find((option) => option.key === lang) ?? LOCALE_OPTIONS[0];
  const navItems = [
    { href: `${prefix}/docs`, label: tNav("docs"), exact: true },
    {
      href: `${prefix}/docs/workflow`,
      label: tNav("docsWorkflow"),
    },
    { href: `${prefix}/docs/metrics`, label: tNav("metrics") },
    {
      href: `${prefix}/docs/guide/ai-coach`,
      label: tNav("aiPlans"),
    },
    { href: `${prefix}/docs/mcp`, label: "MCP" },
  ];

  const isActive = (href: string, exact = false) =>
    mounted &&
    (exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`));

  const buildLangHref = (targetLang: DocsLocale) => {
    const nextPath = buildLocalePathname(pathname, targetLang);
    const query = searchParams.toString();
    return query ? `${nextPath}?${query}` : nextPath;
  };

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setLanguagesOpen(false);
  }, []);
  useHeaderDisclosure({
    open: menuOpen,
    close: closeMenu,
    headerRef,
    triggerRef: menuTriggerRef,
  });

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <nav
        aria-label={tNav("docs")}
        className="mx-auto flex min-h-14 max-w-[1440px] items-center gap-3 px-4 lg:gap-4 lg:px-6"
      >
        <Link
          href={`${prefix}/docs`}
          className="flex shrink-0 items-center gap-3"
        >
          <Image
            src="/LOGO_LIGHT.svg"
            alt="Trainingload.ai"
            width={120}
            height={16}
            className="hidden h-auto w-[120px] dark:block"
          />
          <Image
            src="/LOGO_DARK.svg"
            alt="Trainingload.ai"
            width={120}
            height={16}
            className="block h-auto w-[120px] dark:hidden"
          />
          <span className="hidden border-l border-border pl-3 text-sm font-medium text-muted-foreground sm:inline">
            {tNav("docs")}
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-compact px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <HeaderLocaleSwitcher
            lang={lang}
            pathname={pathname}
            query={searchParams.toString()}
          />
          <ThemeSwitcher groupLabel={tHeader("theme")} />
          <a
            href={demo.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center rounded-compact border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Demo
          </a>
          <a
            href={`https://app.trainingload.ai/${lang}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center rounded-compact bg-foreground px-3 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tCommon("openApp")}
          </a>
        </div>

        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={tHeader("searchDocs")}
            onClick={() => {
              closeMenu();
              setSidebarOpen(false);
              setOpenSearch(true);
            }}
          >
            <Search aria-hidden="true" />
          </Button>
          <ThemeSwitcher groupLabel={tHeader("theme")} />
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={tHeader("openDocsMenu")}
            aria-controls="nd-sidebar-mobile"
            aria-expanded={sidebarOpen}
            onClick={() => {
              closeMenu();
              setSidebarOpen(!sidebarOpen);
            }}
            className="md:hidden"
          >
            <PanelLeft aria-hidden="true" />
          </Button>
          <button
            type="button"
            ref={menuTriggerRef}
            aria-expanded={menuOpen}
            aria-controls="docs-mobile-menu"
            aria-label={tHeader("openMainMenu")}
            onClick={() => {
              setSidebarOpen(false);
              setMenuOpen((open) => !open);
            }}
            className="inline-flex size-9 items-center justify-center rounded-compact text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id="docs-mobile-menu"
          className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-border bg-background px-4 py-3 lg:hidden"
        >
          <div className="grid gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={[
                  "rounded-compact px-3 py-2.5 text-sm font-medium",
                  isActive(item.href, item.exact)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <a
              href={demo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-compact border border-border text-sm font-medium"
            >
              Demo
            </a>
            <a
              href={`https://app.trainingload.ai/${lang}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-compact bg-foreground text-sm font-semibold text-background"
            >
              {tCommon("openApp")}
            </a>
          </div>

          <button
            type="button"
            aria-expanded={languagesOpen}
            aria-controls="docs-mobile-languages"
            onClick={() => setLanguagesOpen((open) => !open)}
            className="mt-3 flex min-h-10 w-full items-center justify-between rounded-compact border border-border px-3 text-sm font-medium"
          >
            {currentLocale.label}
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform motion-reduce:transition-none ${languagesOpen ? "rotate-180" : ""}`}
            />
          </button>
          {languagesOpen ? (
            <div
              id="docs-mobile-languages"
              className="mt-2 grid grid-cols-2 gap-1"
            >
              {LOCALE_OPTIONS.map((option) => (
                <Link
                  key={option.key}
                  href={buildLangHref(option.key)}
                  prefetch={false}
                  onClick={() => {
                    persistLocalePreference(option.key);
                    closeMenu();
                  }}
                  className={[
                    "rounded-compact px-3 py-2 text-sm",
                    option.key === lang
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  ].join(" ")}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
