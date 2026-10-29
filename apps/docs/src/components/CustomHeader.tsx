"use client";

import { Menu, X, Globe, ChevronDown } from "lucide-react";
import { SiDiscord, SiX } from "@icons-pack/react-simple-icons";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ReleaseBanner } from "./ReleaseBanner";
// import { BlackFridayBanner } from "./BlackFridayBanner";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { localePrefix } from "@/lib/locale-url";
import {
  persistLocalePreference,
  type DocsLocale,
} from "@/lib/locale-preference";
import { buildLocalePathname, LOCALE_OPTIONS } from "@/lib/locale-options";
import type { NewUserGiftValues } from "@/lib/offer-content";

const DISCORD_INVITE_URL = "https://discord.gg/m3asfGU7G";
const X_PROFILE_URL = "https://x.com/trainingloadai";

function SocialLinks() {
  return (
    <>
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Discord"
        title="Discord"
        className="inline-flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SiDiscord aria-hidden="true" className="size-[18px]" />
      </a>
      <a
        href={X_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="X"
        title="X"
        className="inline-flex size-9 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SiX aria-hidden="true" className="size-4" />
      </a>
    </>
  );
}

function HeaderLocaleDropdownItem({
  href,
  active,
  locale,
  children,
}: {
  href: string;
  active: boolean;
  locale: DocsLocale;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={() => persistLocalePreference(locale)}
      className={[
        "rounded-compact px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "dark:focus-visible:ring-ring/70 dark:focus-visible:ring-offset-background",
        active
          ? "bg-brand-soft font-semibold text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function HeaderLocaleDropdown({
  lang,
  buildLangHref,
}: {
  lang: string;
  buildLangHref: (targetLang: string) => string;
}) {
  const current =
    LOCALE_OPTIONS.find((opt) => opt.key === lang)?.shortLabel ?? "EN";

  return (
    <div className="relative group">
      <button
        type="button"
        aria-haspopup="menu"
        className="flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Globe className="h-3.5 w-3.5" />
        {current}
        <ChevronDown className="h-3 w-3 opacity-50 group-hover:rotate-180 group-focus-within:rotate-180 transition-transform" />
      </button>
      <div className="invisible absolute right-0 top-full z-30 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="flex w-40 flex-col gap-1 overflow-hidden rounded-surface border border-border bg-popover p-1.5 shadow-md">
          {LOCALE_OPTIONS.map((opt) => (
            <HeaderLocaleDropdownItem
              key={opt.key}
              href={buildLangHref(opt.key)}
              active={lang === opt.key}
              locale={opt.key}
            >
              {opt.label}
            </HeaderLocaleDropdownItem>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomHeader({
  heightCssVariable,
  newUserGift,
}: {
  heightCssVariable?: `--${string}`;
  newUserGift?: NewUserGiftValues;
} = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileLanguagesOpen, setMobileLanguagesOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const tNav = useTranslations("nav");
  const tHeader = useTranslations("header");
  const tPlan = useTranslations("runningPlanPages.labels");
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const langParam = params?.lang;
  const lang =
    typeof langParam === "string"
      ? langParam
      : Array.isArray(langParam)
        ? langParam[0]
        : "en";

  const prefix = localePrefix(lang);
  const blogHref = `${prefix}/blog`;
  const isActivePath = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const desktopNavClass = (href: string, accent = false) => {
    const active = isActivePath(href);

    return [
      "rounded-control px-2.5 py-2 text-sm transition-colors",
      active
        ? accent
          ? "bg-brand font-semibold text-brand-foreground"
          : "bg-secondary font-semibold text-foreground"
        : accent
          ? "font-semibold text-foreground hover:bg-brand-soft"
          : "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
    ].join(" ");
  };
  const mobileNavClass = (href: string, accent = false) => {
    const active = isActivePath(href);

    return [
      "block rounded-compact px-3 py-2 text-base font-medium transition-colors",
      active
        ? accent
          ? "bg-brand text-brand-foreground"
          : "bg-secondary text-foreground"
        : accent
          ? "font-semibold text-foreground hover:bg-brand-soft"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    ].join(" ");
  };

  useEffect(() => {
    if (!heightCssVariable || !headerRef.current) return;

    const root = document.documentElement;
    const header = headerRef.current;
    const updateHeight = () => {
      root.style.setProperty(heightCssVariable, `${header.offsetHeight}px`);
    };
    const observer = new ResizeObserver(updateHeight);

    updateHeight();
    observer.observe(header);

    return () => {
      observer.disconnect();
      root.style.removeProperty(heightCssVariable);
    };
  }, [heightCssVariable]);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobileLanguagesOpen(false);
  };
  const currentLocale =
    LOCALE_OPTIONS.find((option) => option.key === lang) ?? LOCALE_OPTIONS[0];

  const buildLangHref = (targetLang: string) => {
    const locale = LOCALE_OPTIONS.find((option) => option.key === targetLang);
    const nextPath = locale
      ? buildLocalePathname(pathname, locale.key)
      : buildLocalePathname(pathname, "en");
    const qs = searchParams.toString();
    return qs ? `${nextPath}?${qs}` : nextPath;
  };

  return (
    <header
      ref={headerRef}
      className="client-demo-radius sticky top-0 z-50 w-full border-b border-border/80 bg-card/95 backdrop-blur-md"
    >
      {/* <BlackFridayBanner /> */}
      <nav
        className="relative z-20 mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Global"
      >
        {/* Logo */}
        <div className="flex items-center">
          <Link href={`${prefix}/`} className="flex items-center">
            {/* Light Mode Logo */}
            <Image
              src="/LOGO_LIGHT.svg"
              alt="Trainingload.ai"
              width={120}
              height={16}
              style={{ width: 120, height: "auto" }}
              className="hidden dark:block"
            />
            {/* Dark Mode Logo */}
            <Image
              src="/LOGO_DARK.svg"
              alt="Trainingload.ai"
              width={120}
              height={16}
              style={{ width: 120, height: "auto" }}
              className="block dark:hidden"
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-center">
          <div className="flex items-center gap-1">
            <Link
              href={`${prefix}/plan`}
              aria-current={isActivePath(`${prefix}/plan`) ? "page" : undefined}
              className={desktopNavClass(`${prefix}/plan`)}
            >
              {tPlan("plans")}
            </Link>
            <Link
              href={`${prefix}/ai-coach`}
              aria-current={
                isActivePath(`${prefix}/ai-coach`) ? "page" : undefined
              }
              className={desktopNavClass(`${prefix}/ai-coach`)}
            >
              {tNav("aiPlans")}
            </Link>
            <Link
              href={`${prefix}/training-load`}
              aria-current={
                isActivePath(`${prefix}/training-load`) ? "page" : undefined
              }
              className={desktopNavClass(`${prefix}/training-load`)}
            >
              {tNav("trainingLoad")}
            </Link>
            <Link
              href={`${prefix}/tools`}
              aria-current={
                isActivePath(`${prefix}/tools`) ? "page" : undefined
              }
              className={desktopNavClass(`${prefix}/tools`)}
            >
              {tNav("tools")}
            </Link>
            <Link
              href={`${prefix}/free-ai-workout-review`}
              aria-current={
                isActivePath(`${prefix}/free-ai-workout-review`)
                  ? "page"
                  : undefined
              }
              className={desktopNavClass(
                `${prefix}/free-ai-workout-review`,
                true,
              )}
            >
              {tNav("freeAiReview")}
            </Link>
            <Link
              href={`${prefix}/pricing`}
              aria-current={
                isActivePath(`${prefix}/pricing`) ? "page" : undefined
              }
              className={desktopNavClass(`${prefix}/pricing`)}
            >
              {tNav("pricing")}
            </Link>

            <Link
              href={`${prefix}/docs`}
              aria-current={isActivePath(`${prefix}/docs`) ? "page" : undefined}
              className={desktopNavClass(`${prefix}/docs`)}
            >
              {tNav("docs")}
            </Link>
          </div>
        </div>

        {/* Right side - Icons and Login */}
        <div className="hidden lg:flex lg:items-center lg:gap-x-1.5">
          <HeaderLocaleDropdown lang={lang} buildLangHref={buildLangHref} />

          <SocialLinks />

          {/* Theme Switcher */}
          <ThemeSwitcher />

          {/* Login Button */}
          <a
            href={`https://app.trainingload.ai/${lang}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer rounded-control bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {tHeader("login")}
          </a>
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-1 lg:hidden">
          <SocialLinks />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-control p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setMobileMenuOpen((open) => {
                if (open) setMobileLanguagesOpen(false);
                return !open;
              });
            }}
          >
            <span className="sr-only">{tHeader("openMainMenu")}</span>
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </nav>

      {newUserGift ? (
        <ReleaseBanner
          lang={lang}
          className="relative z-10"
          newUserGift={newUserGift}
        />
      ) : null}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="max-h-[calc(100dvh-var(--docs-global-header-height,7.5rem))] overflow-y-auto overscroll-contain bg-background lg:hidden">
          <div className="space-y-1 px-4 pb-4 pt-2">
            <Link
              href={`${prefix}/plan`}
              aria-current={isActivePath(`${prefix}/plan`) ? "page" : undefined}
              className={mobileNavClass(`${prefix}/plan`)}
              onClick={closeMobileMenu}
            >
              {tPlan("plans")}
            </Link>
            <Link
              href={`${prefix}/ai-coach`}
              aria-current={
                isActivePath(`${prefix}/ai-coach`) ? "page" : undefined
              }
              className={mobileNavClass(`${prefix}/ai-coach`)}
              onClick={closeMobileMenu}
            >
              {tNav("aiPlans")}
            </Link>
            <Link
              href={`${prefix}/training-load`}
              aria-current={
                isActivePath(`${prefix}/training-load`) ? "page" : undefined
              }
              className={mobileNavClass(`${prefix}/training-load`)}
              onClick={closeMobileMenu}
            >
              {tNav("trainingLoad")}
            </Link>
            <Link
              href={`${prefix}/tools`}
              aria-current={
                isActivePath(`${prefix}/tools`) ? "page" : undefined
              }
              className={mobileNavClass(`${prefix}/tools`)}
              onClick={closeMobileMenu}
            >
              {tNav("tools")}
            </Link>
            <Link
              href={`${prefix}/free-ai-workout-review`}
              aria-current={
                isActivePath(`${prefix}/free-ai-workout-review`)
                  ? "page"
                  : undefined
              }
              className={mobileNavClass(
                `${prefix}/free-ai-workout-review`,
                true,
              )}
              onClick={closeMobileMenu}
            >
              {tNav("freeAiReview")}
            </Link>
            <Link
              href={`${prefix}/pricing`}
              aria-current={
                isActivePath(`${prefix}/pricing`) ? "page" : undefined
              }
              className={mobileNavClass(`${prefix}/pricing`)}
              onClick={closeMobileMenu}
            >
              {tNav("pricing")}
            </Link>
            <Link
              href={`${prefix}/docs`}
              aria-current={isActivePath(`${prefix}/docs`) ? "page" : undefined}
              className={mobileNavClass(`${prefix}/docs`)}
              onClick={closeMobileMenu}
            >
              {tNav("docs")}
            </Link>
            <Link
              href={blogHref}
              aria-current={isActivePath(blogHref) ? "page" : undefined}
              className={mobileNavClass(blogHref)}
              onClick={closeMobileMenu}
            >
              {tNav("blog")}
            </Link>
            <div className="mt-2 space-y-4 border-t border-border px-3 pt-4">
              <a
                href={`https://app.trainingload.ai/${lang}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 w-full items-center justify-center rounded-control bg-brand px-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {tHeader("login")}
              </a>

              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {tHeader("theme")}
                </p>
                <ThemeSwitcher
                  variant="labeled"
                  groupLabel={tHeader("theme")}
                  lightLabel={tHeader("themeLight")}
                  darkLabel={tHeader("themeDark")}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {tHeader("language")}
                </p>
                <button
                  type="button"
                  aria-expanded={mobileLanguagesOpen}
                  aria-controls="mobile-language-options"
                  onClick={() => setMobileLanguagesOpen((open) => !open)}
                  className="flex min-h-10 w-full items-center justify-between rounded-compact bg-secondary px-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:text-white"
                >
                  <span>{currentLocale.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 opacity-50 transition-transform motion-reduce:transition-none ${
                      mobileLanguagesOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {mobileLanguagesOpen ? (
                  <div
                    id="mobile-language-options"
                    className="grid grid-cols-2 gap-1"
                  >
                    {LOCALE_OPTIONS.map((opt) => {
                      const active = lang === opt.key;

                      return (
                        <Link
                          key={opt.key}
                          href={buildLangHref(opt.key)}
                          prefetch={false}
                          aria-current={active ? "true" : undefined}
                          onClick={() => persistLocalePreference(opt.key)}
                          className={[
                            "flex min-h-10 items-center rounded-compact px-3 text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                            active
                              ? "bg-secondary font-semibold text-neutral-950 dark:text-white"
                              : "text-neutral-600 hover:bg-secondary/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white",
                          ].join(" ")}
                        >
                          {opt.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
