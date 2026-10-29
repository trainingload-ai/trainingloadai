"use client";

import { isSupportedLocale, LOCALE_PATH_PATTERN } from "@/i18n/locales";

export const LOGIN_CALLBACK_PARAM = "callbackURL";

export const DEFAULT_AUTH_CALLBACK_PATH = "/";
export const AUTH_COMPLETE_PATH = "/auth/complete";
export const ONBOARDING_PATH = "/onboarding";
const LOCALE_PATH_RE = new RegExp(`^/(?:${LOCALE_PATH_PATTERN})(?=/|$)`);
const OPTIONAL_LOCALE_PATH_PREFIX = `(?:(?:${LOCALE_PATH_PATTERN})/)?`;
const OAUTH_CONSENT_PATH_RE = new RegExp(
  `^/${OPTIONAL_LOCALE_PATH_PREFIX}oauth/consent(?:/|$)`,
);
const NON_RETURN_PATH_RE = new RegExp(
  `^/${OPTIONAL_LOCALE_PATH_PREFIX}(?:(?:setup|login|signup|forgot-password|reset-password|onboarding)(?:/|$)|auth/complete(?:/|$))`,
);

function getOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function getLocalizedUrl(path: string, locale?: string) {
  const origin = getOrigin();
  const requestedLocale = locale?.trim();
  const safeLocale = isSupportedLocale(requestedLocale)
    ? requestedLocale
    : undefined;
  const localizedPath = `${safeLocale ? `/${safeLocale}` : ""}${path}`;

  return origin ? `${origin}${localizedPath}` : localizedPath;
}

function sanitizeCallbackPath(value: string | null | undefined) {
  if (!value?.trim() || typeof window === "undefined") {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return DEFAULT_AUTH_CALLBACK_PATH;
    }

    const path = `${url.pathname}${url.search}${url.hash}`;
    if (NON_RETURN_PATH_RE.test(url.pathname)) {
      return DEFAULT_AUTH_CALLBACK_PATH;
    }

    return path || DEFAULT_AUTH_CALLBACK_PATH;
  } catch {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }
}

function removeLocalePrefix(path: string) {
  const withoutLocale = path.replace(LOCALE_PATH_RE, "");
  return withoutLocale.startsWith("/") ? withoutLocale || "/" : "/";
}

function getPathnameFromPath(path: string) {
  try {
    return new URL(path, getOrigin() || "http://local").pathname;
  } catch {
    return DEFAULT_AUTH_CALLBACK_PATH;
  }
}

export function isOAuthConsentCallbackPath(callbackPath: string) {
  return OAUTH_CONSENT_PATH_RE.test(getPathnameFromPath(callbackPath));
}

export function getCurrentAuthCallbackPath() {
  if (typeof window === "undefined") return DEFAULT_AUTH_CALLBACK_PATH;
  return sanitizeCallbackPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

export function getLoginHrefWithCallback(
  callbackPath = getCurrentAuthCallbackPath(),
) {
  return `/login?${LOGIN_CALLBACK_PARAM}=${encodeURIComponent(
    sanitizeCallbackPath(callbackPath),
  )}`;
}

export function getSignupHrefWithCallback(
  callbackPath = getCurrentAuthCallbackPath(),
) {
  return `/signup?${LOGIN_CALLBACK_PARAM}=${encodeURIComponent(
    sanitizeCallbackPath(callbackPath),
  )}`;
}

export function getLoginCallbackPathFromLocation() {
  if (typeof window === "undefined") return DEFAULT_AUTH_CALLBACK_PATH;
  return sanitizeCallbackPath(
    new URLSearchParams(window.location.search).get(LOGIN_CALLBACK_PARAM),
  );
}

export function getLoginCallbackUrlFromLocation() {
  const origin = getOrigin();
  const path = getLoginCallbackPathFromLocation();
  return origin ? `${origin}${path}` : path;
}

export function getAuthCompleteCallbackPath(
  callbackPath = DEFAULT_AUTH_CALLBACK_PATH,
) {
  const nextPath = removeLocalePrefix(sanitizeCallbackPath(callbackPath));
  const query =
    nextPath === DEFAULT_AUTH_CALLBACK_PATH
      ? ""
      : `?next=${encodeURIComponent(nextPath)}`;

  return `${AUTH_COMPLETE_PATH}${query}`;
}

export function getAuthCompleteCallbackUrl(
  callbackPath = DEFAULT_AUTH_CALLBACK_PATH,
  locale?: string,
) {
  const callbackCompletePath = getAuthCompleteCallbackPath(callbackPath);
  const requestedLocale = locale?.trim();
  const localeQuery = isSupportedLocale(requestedLocale)
    ? `${callbackCompletePath.includes("?") ? "&" : "?"}locale=${encodeURIComponent(
        requestedLocale,
      )}`
    : "";
  return getLocalizedUrl(`${callbackCompletePath}${localeQuery}`, locale);
}

export function getAuthCompleteCallbackUrlFromLocation(locale?: string) {
  return getAuthCompleteCallbackUrl(getLoginCallbackPathFromLocation(), locale);
}

export function getLoginSuccessCallbackUrlFromLocation(locale?: string) {
  const callbackPath = getLoginCallbackPathFromLocation();
  if (isOAuthConsentCallbackPath(callbackPath)) {
    const origin = getOrigin();
    return origin ? `${origin}${callbackPath}` : callbackPath;
  }

  return getAuthCompleteCallbackUrl(callbackPath, locale);
}

/**
 * Gets the next path from the location search params
 * @returns The next path from the location search params
 */
export function getAuthCompleteNextPathFromLocation() {
  if (typeof window === "undefined") return DEFAULT_AUTH_CALLBACK_PATH;
  return removeLocalePrefix(
    sanitizeCallbackPath(
      new URLSearchParams(window.location.search).get("next"),
    ),
  );
}

export function getOnboardingPath(callbackPath = DEFAULT_AUTH_CALLBACK_PATH) {
  const nextPath = removeLocalePrefix(sanitizeCallbackPath(callbackPath));
  return nextPath === DEFAULT_AUTH_CALLBACK_PATH
    ? ONBOARDING_PATH
    : `${ONBOARDING_PATH}?next=${encodeURIComponent(nextPath)}`;
}

export function getOnboardingUrlFromLocation(locale?: string) {
  return getLocalizedUrl(
    getOnboardingPath(getLoginCallbackPathFromLocation()),
    locale,
  );
}

export function getOnboardingNextPathFromLocation() {
  if (typeof window === "undefined") return DEFAULT_AUTH_CALLBACK_PATH;
  return removeLocalePrefix(
    sanitizeCallbackPath(
      new URLSearchParams(window.location.search).get("next"),
    ),
  );
}
/**
 * Gets the locale from the location search params
 * @returns The locale from the location search params
 *
 */
export function getAuthCompleteLocaleFromLocation() {
  if (typeof window === "undefined") return undefined;
  const locale = new URLSearchParams(window.location.search).get("locale");
  return isSupportedLocale(locale ?? undefined) ? locale : undefined;
}

export function getLoginErrorCallbackUrl(locale: string) {
  const origin = getOrigin();
  const safeLocale = locale.trim() || "en";
  const loginPath = `/${safeLocale}${getLoginHrefWithCallback(
    getLoginCallbackPathFromLocation(),
  )}`;
  return origin ? `${origin}${loginPath}` : loginPath;
}
