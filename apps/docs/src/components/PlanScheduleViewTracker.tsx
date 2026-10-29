"use client";

import { useEffect, useRef } from "react";
import { trackMarketingEvent } from "@/lib/analytics";

export function PlanScheduleViewTracker({
  slug,
  templateSlug,
  weekCount,
  locale,
}: {
  slug: string;
  templateSlug?: string;
  weekCount: number;
  locale: string;
}) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const scheduleObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        trackMarketingEvent("plan_table_view", {
          slug,
          week_count: weekCount,
          locale,
        });
        scheduleObserver.disconnect();
      },
      { threshold: 0.25 },
    );

    const seenWeeks = new Set<string>();
    const weekObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const week = (entry.target as HTMLElement).dataset.planWeek;
          if (!week || seenWeeks.has(week)) continue;
          seenWeeks.add(week);
          trackMarketingEvent("plan_week_view", {
            template_slug: templateSlug ?? slug,
            source_page: slug,
            week: Number(week),
            locale,
          });
          weekObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.35 },
    );

    scheduleObserver.observe(marker);
    marker
      .closest("section")
      ?.querySelectorAll<HTMLElement>("[data-plan-week]")
      .forEach((week) => weekObserver.observe(week));
    return () => {
      scheduleObserver.disconnect();
      weekObserver.disconnect();
    };
  }, [locale, slug, templateSlug, weekCount]);

  return <span ref={markerRef} aria-hidden="true" className="sr-only" />;
}
