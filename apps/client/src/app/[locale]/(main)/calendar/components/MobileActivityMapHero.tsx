"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Activity as ActivityIcon, Loader2 } from "lucide-react";
import type { Activity } from "@/api/activities";
import { useActivityLayer } from "@/api/useActivityLayer";
import { MapThumbnail } from "@/components/activities/map-thumbnail";
import { cn } from "@/lib/utils";

const MapBoxMap = dynamic(() => import("@/components/MapBoxMap/MapBoxMap"), {
  ssr: false,
});

export function MobileActivityMapHero({
  activity,
  activityId,
  meta,
  title,
}: {
  activity: Activity;
  activityId: string;
  meta: string;
  title: string;
}) {
  const layer = useActivityLayer(activityId);
  const mapContainerId = React.useId().replaceAll(":", "");
  const hasRouteMap = Boolean(
    layer.data?.center && layer.data.maps && layer.data.maps.length > 0,
  );
  const hasThumbnail = Boolean(
    activity.mapThumbnailUrl || activity.mapThumbnailDarkUrl,
  );
  const hasMapVisual = hasRouteMap || hasThumbnail || layer.isLoading;

  return (
    <section
      data-testid="mobile-activity-map-hero"
      className={cn(
        "relative w-full overflow-hidden bg-zinc-900",
        hasMapVisual ? "h-[max(480px,calc(100dvh-194px))]" : "h-[190px]",
      )}
    >
      {hasRouteMap ? (
        <MapBoxMap
          activityLayer={layer.data}
          containerId={`calendar-${mapContainerId}`}
          fitBoundsPadding={44}
          lockedFitBoundsPadding={44}
          interactive={false}
          showInteractionOverlay={false}
          className="h-full min-h-0 w-full aspect-auto lg:min-h-0"
        />
      ) : hasThumbnail ? (
        <MapThumbnail
          lightUrl={activity.mapThumbnailUrl}
          darkUrl={activity.mapThumbnailDarkUrl}
          sizes="100vw"
          className="h-full w-full rounded-none"
          fallback={null}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-white/75">
          {layer.isLoading ? (
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          ) : null}
        </div>
      )}

      {layer.isLoading && hasThumbnail ? (
        <span className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent [background-position:bottom] [background-size:100%_52%] [background-repeat:no-repeat]" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-7 pt-16">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-xl font-semibold leading-tight text-foreground">
              {title}
            </h2>
            <p className="mt-1.5 truncate text-sm text-muted-foreground">
              {meta}
            </p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border/60 bg-background/75 text-foreground shadow-sm backdrop-blur-md">
            <ActivityIcon className="size-5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </section>
  );
}
