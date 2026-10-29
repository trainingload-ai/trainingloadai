"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth";
import {
  identify,
  isAnalyticsEnabled,
  resetAnalytics,
  track,
  trackPageView,
} from "@/lib/analytics";
import {
  APP_SESSION_STARTED_EVENT,
  buildAppSessionStartedProperties,
  buildSignUpAttribution,
  claimAppSessionStart,
  rememberSignUpAttribution,
} from "@/lib/app-entry-analytics";
import { isPublicDemoBrowser } from "@/public-demo/public-demo-runtime";

type AppEntrySnapshot = {
  pathname: string;
  searchParams: URLSearchParams;
  referrer: string;
  origin: string;
};

export function AnalyticsProvider() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const identifiedUserIdRef = useRef<string | null>(null);
  const appEntryRef = useRef<AppEntrySnapshot | null>(null);
  const trackedPagePathRef = useRef<string | null>(null);
  const suppressAnalytics = isPublicDemoBrowser();

  useEffect(() => {
    if (suppressAnalytics || appEntryRef.current || !pathname) return;

    const snapshot = {
      pathname,
      searchParams: new URLSearchParams(searchParams.toString()),
      referrer: document.referrer,
      origin: window.location.origin,
    };
    appEntryRef.current = snapshot;

    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = undefined;
    }
    rememberSignUpAttribution(
      buildSignUpAttribution(
        buildAppSessionStartedProperties({
          ...snapshot,
          authenticated: Boolean(session?.user?.id),
        }),
      ),
      storage,
    );
  }, [pathname, searchParams, session?.user?.id, suppressAnalytics]);

  useEffect(() => {
    if (suppressAnalytics || !pathname) return;
    if (trackedPagePathRef.current === pathname) return;
    trackedPagePathRef.current = pathname;

    const searchKeys = Array.from(searchParams.keys()).sort();
    trackPageView({
      locale,
      page_path: pathname,
      page_search_keys: searchKeys.length > 0 ? searchKeys : undefined,
    });
  }, [locale, pathname, searchParams, suppressAnalytics]);

  useEffect(() => {
    if (suppressAnalytics || isPending) return;

    const userId = session?.user?.id;
    if (userId) {
      identify(userId, {
        locale,
      });
      identifiedUserIdRef.current = userId;
      return;
    }

    if (identifiedUserIdRef.current) {
      resetAnalytics();
      identifiedUserIdRef.current = null;
    }
  }, [isPending, locale, session?.user?.id, suppressAnalytics]);

  useEffect(() => {
    if (
      suppressAnalytics ||
      isPending ||
      !isAnalyticsEnabled() ||
      !appEntryRef.current
    )
      return;

    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = undefined;
    }
    if (!claimAppSessionStart(storage)) return;

    track(
      APP_SESSION_STARTED_EVENT,
      buildAppSessionStartedProperties({
        ...appEntryRef.current,
        authenticated: Boolean(session?.user?.id),
      }),
    );
  }, [isPending, session?.user?.id, suppressAnalytics]);

  return null;
}
