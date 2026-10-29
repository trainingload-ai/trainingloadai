"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useMobileViewport } from "@/hooks/use-mobile";
import { MOBILE_PLAN_LIBRARY_HREF } from "@/lib/plan-navigation";

const PlansDesktopPage = dynamic(() => import("./PlansDesktopPage"), {
  loading: PlansViewportSkeleton,
});

function PlansViewportSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-2"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="h-80 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
        <div className="h-48 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45" />
      </div>
    </div>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const mobileViewport = useMobileViewport();

  useEffect(() => {
    if (mobileViewport === true) router.replace(MOBILE_PLAN_LIBRARY_HREF);
  }, [mobileViewport, router]);

  if (mobileViewport !== false) return <PlansViewportSkeleton />;
  return <PlansDesktopPage />;
}
