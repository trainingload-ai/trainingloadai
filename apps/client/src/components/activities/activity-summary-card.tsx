"use client";

import * as React from "react";
import {
  Activity,
  Bike,
  CircleHelp,
  Dumbbell,
  Footprints,
  Mountain,
  Orbit,
  PersonStanding,
  ShipWheel,
  StretchHorizontal,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MapThumbnail } from "@/components/activities/map-thumbnail";
import {
  getActivitySportVisual,
  type ActivitySportVisual,
} from "@shared/activity-visual";

export type ActivitySummaryCardSport =
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "UNKNOWN"
  | string;

type ActivitySummaryCardProps = {
  title: string;
  sportType: ActivitySummaryCardSport;
  subSportType?: string | null;
  sportLabel?: string | null;
  startLabel?: string | null;
  distanceLabel?: string | null;
  durationLabel?: string | null;
  load?: number | null;
  loadPlacement?: "meta" | "aside";
  note?: string | null;
  mapThumbnailUrl?: string | null;
  mapThumbnailDarkUrl?: string | null;
  loadLabel?: string;
  onOpen?: () => void;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

function SportIcon({ visual }: { visual: ActivitySportVisual }) {
  const className = "h-5 w-5";
  return (
    <span aria-hidden="true">
      {visual === "cycling" ? <Bike className={className} /> : null}
      {visual === "swim" ? <Waves className={className} /> : null}
      {visual === "walking" || visual === "run" ? (
        <Footprints className={className} />
      ) : null}
      {visual === "hiking" ? <Mountain className={className} /> : null}
      {visual === "strength" ? <Dumbbell className={className} /> : null}
      {visual === "stretching" ? (
        <StretchHorizontal className={className} />
      ) : null}
      {visual === "hiit" ? <Activity className={className} /> : null}
      {visual === "yoga" ? <PersonStanding className={className} /> : null}
      {visual === "rowing" ? <ShipWheel className={className} /> : null}
      {visual === "elliptical" ? <Orbit className={className} /> : null}
      {visual === "unknown" ? <CircleHelp className={className} /> : null}
    </span>
  );
}

export function getActivitySummarySportClassName(
  sportType: ActivitySummaryCardSport,
  subSportType?: string | null,
) {
  const visual = getActivitySportVisual(sportType, subSportType);
  if (visual === "cycling") {
    return "text-slate-500/80 dark:text-slate-300";
  }
  if (visual === "swim" || visual === "rowing") {
    return "text-cyan-700/55 dark:text-cyan-200/70";
  }
  if (visual === "strength" || visual === "hiit") {
    return "text-stone-500/80 dark:text-stone-300";
  }
  if (visual === "stretching" || visual === "yoga") {
    return "text-violet-700/50 dark:text-violet-200/70";
  }
  if (visual === "unknown") {
    return "text-zinc-400 dark:text-zinc-400";
  }
  return "text-success/70";
}

function ActivityThumbnail({
  sportType,
  subSportType,
  mapThumbnailDarkUrl,
  mapThumbnailUrl,
}: {
  sportType: ActivitySummaryCardSport;
  subSportType?: string | null;
  mapThumbnailDarkUrl?: string | null;
  mapThumbnailUrl?: string | null;
}) {
  const sportVisual = getActivitySportVisual(sportType, subSportType);

  return (
    <MapThumbnail
      lightUrl={mapThumbnailUrl}
      darkUrl={mapThumbnailDarkUrl}
      sizes="96px"
      className="h-20 w-24"
      fallback={
        <div
          className={cn(
            "relative flex h-full w-full items-center justify-center overflow-hidden bg-secondary",
            getActivitySummarySportClassName(sportType, subSportType),
          )}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-control bg-card">
            <SportIcon visual={sportVisual} />
          </span>
        </div>
      }
    />
  );
}

export function ActivitySummaryCard({
  title,
  sportType,
  subSportType,
  sportLabel,
  startLabel,
  distanceLabel,
  durationLabel,
  load,
  loadPlacement = "aside",
  note,
  mapThumbnailDarkUrl,
  mapThumbnailUrl,
  loadLabel = "load",
  onOpen,
  headerAction,
  footer,
  className,
}: ActivitySummaryCardProps) {
  const meta = [
    sportLabel,
    startLabel,
    distanceLabel,
    durationLabel,
    loadPlacement === "meta" && typeof load === "number"
      ? `${loadLabel} ${load}`
      : null,
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  const clickable = Boolean(onOpen);

  return (
    <article
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "rounded-surface bg-muted/70 p-3 transition-colors",
        clickable &&
          "tap-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <ActivityThumbnail
          sportType={sportType}
          subSportType={subSportType}
          mapThumbnailDarkUrl={mapThumbnailDarkUrl}
          mapThumbnailUrl={mapThumbnailUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {title}
              </h2>
              {meta.length > 0 ? (
                <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                  {meta.join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="shrink-0">
              {loadPlacement === "aside" && typeof load === "number" ? (
                <div className="mb-2 text-right">
                  <div className="text-sm font-semibold text-foreground">
                    {load}
                  </div>
                  <div className="text-mobile-unit pc:text-[10px] text-muted-foreground">
                    {loadLabel}
                  </div>
                </div>
              ) : null}
              {headerAction ? (
                <div
                  className="flex items-center justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  {headerAction}
                </div>
              ) : null}
            </div>
          </div>
          {note ? (
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              {note}
            </p>
          ) : null}
          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>
      </div>
    </article>
  );
}
