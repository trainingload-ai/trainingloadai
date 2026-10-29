import { isSupportedLocale } from "@/i18n/locales";
import { getApiBaseUrl } from "./config";
import type { ApiFetchError } from "./api-error";

export const AUTH_EXPIRED_FLASH_KEY = "trainingload:auth-expired";
export const AUTH_EXPIRED_TOAST_ID = "auth-session-expired";

const AUTH_ROUTE_SEGMENTS = new Set([
  "setup",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "change-password",
  "auth",
  "oauth",
]);
const SIGN_OUT_TIMEOUT_MS = 1_500;
const NEVER_SETTLES = new Promise<never>(() => undefined);

type AuthFailureRuntime = {
  canHandle: () => boolean;
  markSessionExpired: () => void;
  signOut: () => Promise<void>;
  getLoginPath: () => string;
  replace: (path: string) => void;
};

export function createAuthFailureCoordinator(runtime: AuthFailureRuntime) {
  let authFailurePromise: Promise<never> | undefined;

  return {
    getPending() {
      return authFailurePromise;
    },

    handle(error: ApiFetchError): Promise<never> {
      if (!runtime.canHandle()) return Promise.reject(error);
      if (authFailurePromise) return authFailurePromise;

      const pending = (async () => {
        try {
          runtime.markSessionExpired();
        } catch {
          // Storage is optional; it must never block sign-out or redirect.
        }
        try {
          await runtime.signOut();
        } catch {
          // The session is already unusable; redirect even if cleanup fails.
        }
        runtime.replace(runtime.getLoginPath());

        // Keep request consumers pending until the full-page navigation unloads
        // this document. Otherwise every caller may catch the same 401 and toast.
        return NEVER_SETTLES;
      })();
      authFailurePromise = pending;
      // 登录页不接管 401。其他页面统一处理认证失败，并由 NEVER_SETTLES
      // 吸收并发 401，避免重复登出、跳转和 Toast。
      void pending.catch(() => {
        if (authFailurePromise === pending) authFailurePromise = undefined;
      });

      return authFailurePromise;
    },
  };
}

function getClientLocale() {
  if (typeof window === "undefined") return "en";
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(firstSegment) ? firstSegment : "en";
}

export function isAuthOrPublicPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] && isSupportedLocale(segments[0])) segments.shift();
  const first = segments[0];
  return Boolean(first && AUTH_ROUTE_SEGMENTS.has(first));
}

function isAuthRoute() {
  if (typeof window === "undefined") return true;
  return isAuthOrPublicPath(window.location.pathname);
}

async function bestEffortSignOutAuthSession() {
  if (typeof window === "undefined") return;

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    SIGN_OUT_TIMEOUT_MS,
  );
  try {
    await fetch(`${getApiBaseUrl()}/auth/sign-out`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function markSessionExpired() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_EXPIRED_FLASH_KEY, "1");
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

function getLoginPath() {
  if (typeof window === "undefined") return "/en/login";
  const callbackPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/${getClientLocale()}/login?callbackURL=${encodeURIComponent(
    callbackPath,
  )}`;
}

const authFailureCoordinator = createAuthFailureCoordinator({
  canHandle: () => typeof window !== "undefined" && !isAuthRoute(),
  markSessionExpired,
  signOut: bestEffortSignOutAuthSession,
  getLoginPath,
  replace: (path) => window.location.replace(path),
});

export function handleUnauthorized(error: ApiFetchError): Promise<never> {
  return authFailureCoordinator.handle(error);
}

export function getPendingAuthFailure() {
  return authFailureCoordinator.getPending();
}

export function isAuthFailureInProgress() {
  return Boolean(getPendingAuthFailure());
}

export function consumeAuthExpiredFlash() {
  if (typeof window === "undefined") return false;
  try {
    const wasExpired =
      window.sessionStorage.getItem(AUTH_EXPIRED_FLASH_KEY) === "1";
    window.sessionStorage.removeItem(AUTH_EXPIRED_FLASH_KEY);
    return wasExpired;
  } catch {
    return false;
  }
}
