"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import type { PlanWorkout } from "@/api/plans";

function finiteLoad(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function getPlannedWorkoutLoad(workouts: readonly PlanWorkout[]) {
  return workouts.reduce(
    (total, workout) => total + finiteLoad(workout.estimatedLoad),
    0,
  );
}

function LoadValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline justify-end gap-1">
      <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {Math.round(value)}
      </span>
    </span>
  );
}

export const MobileCalendarDayLoad = memo(function MobileCalendarDayLoad({
  actualLoad,
  plannedLoad,
}: {
  actualLoad: number;
  plannedLoad: number;
}) {
  const t = useTranslations("MobileCalendarTimeline");
  const actual = finiteLoad(actualLoad);
  const planned = finiteLoad(plannedLoad);

  if (actual <= 0 && planned <= 0) {
    return (
      <span className="self-center text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
        -
      </span>
    );
  }

  return (
    <span className="flex shrink-0 self-center flex-col items-end gap-0.5">
      {actual > 0 ? (
        <LoadValue label={t("actualLoad")} value={actual} />
      ) : null}
      {planned > 0 ? (
        <LoadValue label={t("plannedLoad")} value={planned} />
      ) : null}
    </span>
  );
});
