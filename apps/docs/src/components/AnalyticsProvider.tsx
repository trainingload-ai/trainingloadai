"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMarketingPageView } from "@/lib/analytics";

export function AnalyticsProvider({ locale }: { locale: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    trackMarketingPageView({
      locale,
      page_path: pathname,
    });
  }, [locale, pathname]);

  return null;
}
