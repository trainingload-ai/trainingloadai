import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import { i18n } from "@/lib/i18n";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { LOCALE_COOKIE_NAME } from "@/lib/locale-preference";
import {
  isMachineReadableMarkdownPath,
  publicHtmlPathFromMarkdown,
} from "@/lib/public-html-url";

const DEFAULT_LOCALE = i18n.defaultLanguage;
const LOCALES = new Set<string>(i18n.languages);
const INTERNAL_LOCALE_REWRITE_HEADER =
  "x-trainingload-internal-locale-rewrite";

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get("purpose") === "prefetch" ||
    request.headers.has("next-router-prefetch")
  );
}

function getPreferredLocale(request: NextRequest): string | null {
  const locale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  return locale && LOCALES.has(locale) ? locale : null;
}

function rewriteToInternalLocale(request: NextRequest, url: URL) {
  const headers = new Headers(request.headers);
  headers.set(INTERNAL_LOCALE_REWRITE_HEADER, "1");

  return NextResponse.rewrite(url, {
    request: { headers },
  });
}

const i18nMiddleware = createI18nMiddleware({
  ...i18n,
  format: (locale, path) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    // Match next-intl's `localePrefix: "as-needed"` behavior:
    // - Default locale uses no prefix: "/docs"
    // - Other locales use a prefix: "/zh/docs"
    return locale === DEFAULT_LOCALE ? normalized : `/${locale}${normalized}`;
  },
});

export default function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const { pathname } = request.nextUrl;
  const isPrefetch = isPrefetchRequest(request);
  const withXRobotsTag = (res: Response, value?: string) => {
    if (value) res.headers.set("X-Robots-Tag", value);
    return res;
  };

  // Next may pass an internal rewrite through the proxy a second time. Let the
  // rewritten /en/* request reach the App Router instead of canonicalizing it
  // back to the public URL and creating a self-redirect loop.
  if (request.headers.get(INTERNAL_LOCALE_REWRITE_HEADER) === "1") {
    return withXRobotsTag(NextResponse.next());
  }

  // Keep "/" as the public URL while serving default locale content.
  if (pathname === "/") {
    const preferredLocale = getPreferredLocale(request);
    if (preferredLocale && preferredLocale !== DEFAULT_LOCALE && !isPrefetch) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}`;
      return withXRobotsTag(NextResponse.redirect(url, 307));
    }

    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}`;
    return withXRobotsTag(rewriteToInternalLocale(request, url));
  }

  // Redirect "/en/..." -> "/..." to keep default locale unprefixed.
  if (
    pathname === `/${DEFAULT_LOCALE}` ||
    pathname.startsWith(`/${DEFAULT_LOCALE}/`)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(`/${DEFAULT_LOCALE}`, "") || "/";
    // Permanent redirect so crawlers consolidate /en/* into canonical unprefixed URLs.
    return withXRobotsTag(NextResponse.redirect(url, 308));
  }

  // Collapse malformed double-locale URLs left by older localized links.
  // Example: "/zh/en/docs/..." -> "/docs/..." and
  // "/zh/zh/docs/..." -> "/zh/docs/...".
  {
    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0];
    const second = segments[1];
    if (first && second && LOCALES.has(first) && LOCALES.has(second)) {
      const url = request.nextUrl.clone();
      const rest = segments.slice(2).join("/");
      const prefix = second === DEFAULT_LOCALE ? "" : `/${second}`;
      url.pathname = `${prefix}${rest ? `/${rest}` : "/"}`;
      return withXRobotsTag(NextResponse.redirect(url, 308));
    }
  }

  if (/\.[^/]+$/.test(pathname)) {
    const htmlPath = publicHtmlPathFromMarkdown(pathname);
    if (htmlPath) {
      const url = request.nextUrl.clone();
      url.pathname = htmlPath;
      return withXRobotsTag(NextResponse.redirect(url, 308));
    }

    if (isMachineReadableMarkdownPath(pathname)) {
      return withXRobotsTag(NextResponse.next(), "noindex, follow");
    }

    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0];
    if (first && LOCALES.has(first) && segments.length > 1) {
      const url = request.nextUrl.clone();
      url.pathname = `/${segments.slice(1).join("/")}`;
      return withXRobotsTag(NextResponse.rewrite(url));
    }

    return withXRobotsTag(NextResponse.next());
  }

  // For any non-prefixed path, internally serve default locale while keeping the public URL.
  // Example: "/docs/metrics" -> rewrite to "/en/docs/metrics"
  {
    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0];
    const hasLocalePrefix = first ? LOCALES.has(first) : false;
    if (!hasLocalePrefix) {
      const preferredLocale = getPreferredLocale(request);
      if (
        preferredLocale &&
        preferredLocale !== DEFAULT_LOCALE &&
        !isPrefetch
      ) {
        const url = request.nextUrl.clone();
        url.pathname = `/${preferredLocale}${pathname}`;
        return withXRobotsTag(NextResponse.redirect(url, 307));
      }

      const url = request.nextUrl.clone();
      url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
      return withXRobotsTag(rewriteToInternalLocale(request, url));
    }
  }

  // i18n middleware may return a promise depending on implementation.
  // Keep our proxy sync-friendly by ensuring we always return a Response.
  const maybe = i18nMiddleware(request, event) as unknown;
  if (maybe instanceof Promise) {
    return maybe.then((r) => (r ? withXRobotsTag(r as Response) : r));
  }
  return maybe ? withXRobotsTag(maybe as Response) : maybe;
}

export const config = {
  matcher: ["/((?!api|monitoring|_next/static|_next/image|favicon.ico).*)"],
};
