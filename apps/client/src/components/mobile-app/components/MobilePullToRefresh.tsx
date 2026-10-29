"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode, TouchEvent } from "react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";

const REFRESH_THRESHOLD = 48;
const MAX_PULL_DISTANCE = 72;
const MIN_REFRESH_ANIMATION_MS = 650;

export function MobilePullToRefresh({
  children,
  onRefresh,
  className,
}: {
  children: ReactNode;
  onRefresh: () => Promise<unknown>;
  className?: string;
}) {
  const t = useTranslations("V2ActivitiesPage.feed");
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const enabled =
    typeof window !== "undefined" &&
    window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const scrollTop =
      event.currentTarget.closest("main")?.scrollTop ?? window.scrollY;
    if (!enabled || scrollTop > 0 || refreshing) return;
    startY.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (startY.current == null) return;
    const currentY = event.touches[0]?.clientY;
    if (currentY == null) return;
    const nextDistance = Math.min(
      MAX_PULL_DISTANCE,
      Math.max(0, (currentY - startY.current) * 0.45),
    );
    distanceRef.current = nextDistance;
    setDistance(nextDistance);
  }

  function resetPull() {
    startY.current = null;
    distanceRef.current = 0;
    setDistance(0);
  }

  async function handleTouchEnd() {
    startY.current = null;
    if (distanceRef.current < REFRESH_THRESHOLD) {
      resetPull();
      return;
    }
    setRefreshing(true);
    distanceRef.current = REFRESH_THRESHOLD;
    setDistance(REFRESH_THRESHOLD);
    const startedAt = Date.now();
    try {
      await onRefresh();
    } finally {
      const remaining = MIN_REFRESH_ANIMATION_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      setRefreshing(false);
      resetPull();
    }
  }

  const ready = !refreshing && distance >= REFRESH_THRESHOLD;
  const indicatorVisible = refreshing || distance > 0;
  const releaseLabel = t("releaseToRefresh");
  const releaseCharacters = Array.from(releaseLabel);
  const pullProgress = Math.max(
    0,
    Math.min(1, distance / REFRESH_THRESHOLD),
  );
  const visibleReleaseLabelLength = ready
    ? releaseCharacters.length
    : Math.floor(pullProgress * releaseCharacters.length);
  const visibleLabel = refreshing
    ? t("refreshing")
    : releaseCharacters.slice(0, visibleReleaseLabelLength).join("");
  const transition =
    startY.current == null && !reduceMotion ? "180ms ease" : undefined;

  return (
    <div
      className={cn("relative", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetPull}
    >
      {indicatorVisible ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center overflow-hidden tablet:hidden"
          style={{
            height: distance,
            transition: transition
              ? `height ${transition}`
              : undefined,
          }}
        >
          <div
            role="status"
            aria-live="polite"
            aria-label={refreshing ? t("refreshing") : releaseLabel}
            data-state={refreshing ? "refreshing" : ready ? "ready" : "pulling"}
            className="flex min-h-6 max-w-[82%] items-center justify-center px-3 text-mobile-caption font-semibold text-muted-foreground"
            style={{
              opacity: refreshing || visibleReleaseLabelLength > 0 ? 1 : 0,
              transform: refreshing
                ? undefined
                : `translateY(${Math.min(4, distance * 0.05)}px)`,
            }}
          >
            {refreshing ? (
              <LoaderCircle
                className="mr-1.5 size-3.5 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative min-w-14 whitespace-nowrap text-center">
              <span className="invisible" aria-hidden="true">
                {refreshing ? visibleLabel : releaseLabel}
              </span>
              <span
                data-refresh-label
                className="absolute inset-0"
                aria-hidden="true"
              >
                {visibleLabel}
              </span>
            </span>
          </div>
        </div>
      ) : null}
      <div
        style={{
          transform: distance ? `translateY(${distance}px)` : undefined,
          transition: transition ? `transform ${transition}` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
