"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { updatePreferredLocale } from "@/api/settings";
import { isSupportedLocale } from "@/i18n/routing";
import { useStore } from "@/lib/store";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useViewerSession } from "@/public-demo/use-viewer-session";

// Load user settings (units, power units, theme, etc.) when entering the main application area
// This component should be mounted in (main)/layout.tsx to ensure it is initialized only once in the main area.
export default function SettingsBootstrap() {
  const { loadSettings } = useStore();
  const locale = useLocale();
  const { data: session, isPending: sessionPending } = useViewerSession();
  const publicDemo = usePublicDemo();
  const initializedRef = useRef(false);
  const syncedLocaleRef = useRef<string | null>(null);

  useEffect(() => {
    if (publicDemo.loading || initializedRef.current) return;
    initializedRef.current = true;
    if (publicDemo.active) return;
    // Load user settings into the global store and log errors for fault tolerance
    loadSettings().catch((err) => {
      console.error("Failed to load settings on bootstrap:", err);
    });
  }, [loadSettings, publicDemo.active, publicDemo.loading]);

  useEffect(() => {
    if (
      publicDemo.active ||
      sessionPending ||
      !session?.user?.id ||
      !isSupportedLocale(locale)
    )
      return;

    const syncKey = `${session.user.id}:${locale}`;
    if (syncedLocaleRef.current === syncKey) return;
    syncedLocaleRef.current = syncKey;

    void updatePreferredLocale(locale).catch((err) => {
      syncedLocaleRef.current = null;
      console.error("Failed to sync preferred locale on bootstrap:", err);
    });
  }, [locale, publicDemo.active, session?.user?.id, sessionPending]);

  return null;
}
