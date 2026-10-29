import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  resolveRequestLocale,
} from "@/lib/locale-preference";
import { shouldRewriteUnprefixedPath } from "@/lib/unprefixed-locale-routing";
import { isSensitiveDeploymentPath } from "@deployment/route-policy";

// 创建国际化中间件
const intlMiddleware = createIntlMiddleware(routing);
const UNPREFIXED_AUTH_PATHS = new Set([
  "/setup",
  "/login",
  "/signup",
  "/forgot-password",
  "/change-password",
  "/reset-password",
  "/auth/error",
  "/oauth/consent",
]);

function matchSupportedLocale(value: string | null | undefined) {
  const candidates = value?.split(/\s+/).filter(Boolean) ?? [];
  for (const candidate of candidates) {
    const exact = routing.locales.find(
      (locale) => locale.toLowerCase() === candidate.toLowerCase(),
    );
    if (exact) return exact;
  }
  return null;
}

function resolvePreferredLocale(request: NextRequest) {
  const oauthLocale = matchSupportedLocale(
    request.nextUrl.searchParams.get("ui_locales"),
  );
  return resolveRequestLocale({
    queryLocale: oauthLocale ?? request.nextUrl.searchParams.get("locale"),
    cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
}

function rewriteWithLocale(request: NextRequest) {
  const locale = resolvePreferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${request.nextUrl.pathname}`;
  const response = NextResponse.rewrite(url);
  if (isSensitiveDeploymentPath(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return response;
}

export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SELF_HOST_MODE) {
    const segments = request.nextUrl.pathname.split("/").filter(Boolean);
    const locale = routing.locales.find((item) => item === segments[0]);
    const route = locale ? segments[1] : segments[0];
    if (["login", "signup", "forgot-password", "reset-password", "change-password"].includes(route)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale ?? resolvePreferredLocale(request)}/setup`;
      return NextResponse.redirect(url, 307);
    }
  }
  if (shouldRewriteUnprefixedPath(request.nextUrl.pathname)) {
    return rewriteWithLocale(request);
  }

  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${resolvePreferredLocale(request)}`;
    return NextResponse.redirect(url, 307);
  }

  if (UNPREFIXED_AUTH_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${resolvePreferredLocale(request)}${url.pathname}`;
    return NextResponse.redirect(url, 307);
  }

  // 先处理国际化
  const response = intlMiddleware(request);

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
