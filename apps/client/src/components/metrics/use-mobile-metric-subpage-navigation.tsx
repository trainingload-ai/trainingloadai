"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";

export function useMobileMetricSubpageNavigation({
  title,
  trailing,
  backHref,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  backHref?: string;
}) {
  const pathname = usePathname();
  useMobileNavigation({
    title,
    trailing,
    backHref: backHref ?? (pathname.startsWith("/metrics/") ? "/" : "/me"),
  });
}
