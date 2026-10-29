"use client";

import dynamic from "next/dynamic";
import { Map as MapIcon, Mountain } from "lucide-react";
import type { FitFileViewerPageMessages } from "../fit-view-copy";
import type { FitViewModel } from "../fit-view-model";

const ActivityRoute3D = dynamic(
  () =>
    import("@/components/tools/activity-route-3d").then(
      (module) => module.ActivityRoute3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] animate-pulse rounded-compact border border-neutral-200 bg-neutral-100 motion-reduce:animate-none dark:border-border dark:bg-white/[0.035] sm:h-[460px]" />
    ),
  },
);

function routeSport(model: FitViewModel) {
  const sport = model.identity.sport?.toLowerCase() ?? "";
  return sport.includes("run") ? "RUN" : sport.toUpperCase();
}

function elevationRange(model: FitViewModel, lang: string, unknown: string) {
  const altitudes = model.visualization.route3d
    .map((point) => point.altitudeM)
    .filter((value): value is number => value !== undefined);
  if (altitudes.length < 2) return unknown;
  const range = Math.max(...altitudes) - Math.min(...altitudes);
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(range)} m`;
}

export function FitRoutePanel({
  model,
  lang,
  copy,
}: {
  model: FitViewModel;
  lang: string;
  copy: FitFileViewerPageMessages;
}) {
  const r = copy.results;
  const points = model.visualization.route3d;

  if (points.length < 2) {
    return (
      <section className="grid min-h-80 place-items-center rounded-compact border border-dashed border-neutral-300 bg-neutral-50/50 p-8 text-center dark:border-border dark:bg-white/[0.02]">
        <div className="max-w-md">
          <MapIcon
            aria-hidden="true"
            className="mx-auto size-6 text-neutral-400"
          />
          <h3 className="mt-3 text-sm font-bold text-neutral-950 dark:text-white">
            {r.mapUnavailable}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {r.mapDescription}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="fit-route-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h3
            id="fit-route-heading"
            className="text-sm font-bold text-neutral-950 dark:text-white"
          >
            {r.mapTitle}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {r.mapDescription}
          </p>
        </div>
        <dl className="flex gap-5 text-xs">
          <div>
            <dt className="text-neutral-500 dark:text-neutral-400">
              {r.routePoints}
            </dt>
            <dd className="mt-1 font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {new Intl.NumberFormat(lang).format(points.length)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
              <Mountain aria-hidden="true" className="size-3.5" />
              {r.elevationRange}
            </dt>
            <dd className="mt-1 font-mono font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {elevationRange(model, lang, r.unknown)}
            </dd>
          </div>
        </dl>
      </div>

      <ActivityRoute3D
        points={points}
        sport={routeSport(model)}
        verticalExaggeration={model.visualization.verticalExaggeration}
        labels={{
          reset: r.resetView,
          slow: r.slow,
          fast: r.fast,
          unavailable: r.mapUnavailable,
          elevationScale: r.elevationScale,
          interactiveLabel: r.mapInteractive,
          speedUnavailable: r.speedUnavailable,
          speedUniform: r.speedUniform,
        }}
      />
    </section>
  );
}
