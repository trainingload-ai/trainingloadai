"use client";

import React from "react";
import {
  Activity as ActivityIcon,
  Bike,
  ChevronRight,
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
import { useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { MapThumbnail } from "@/components/activities/map-thumbnail";
import { MobilePlanWorkoutRow } from "@/components/plan/mobile-plan-workout-row";
import { cn } from "@/lib/utils";
import {
  getActivitySportVisual,
  type ActivitySportVisual,
} from "@shared/activity-visual";
import {
  getLocalizedActivityTitle,
  type ActivityTitleTranslator,
} from "@/lib/activity-title";

type Translate = (key: string) => string;

function sportLabel(t: Translate, sportType?: string | null) {
  if (sportType === "RUN") return t("CalendarExperience.sportLabels.run");
  if (sportType === "CYCLING")
    return t("CalendarExperience.sportLabels.cycling");
  if (sportType === "SWIM") return t("CalendarExperience.sportLabels.swim");
  return t("CalendarExperience.sportLabels.other");
}

function formatCompactDuration(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function activityDetail(activity: Activity, t: Translate) {
  const distance =
    typeof activity.distance === "number" && activity.distance > 0
      ? `${(activity.distance / 1000).toFixed(1)} km`
      : null;
  return [
    sportLabel(t, activity.sportType),
    distance,
    formatCompactDuration(activity.duration),
  ]
    .filter(Boolean)
    .join(" - ");
}

function SportIcon({ visual }: { visual: ActivitySportVisual }) {
  const className = "size-5";
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
      {visual === "hiit" ? <ActivityIcon className={className} /> : null}
      {visual === "yoga" ? <PersonStanding className={className} /> : null}
      {visual === "rowing" ? <ShipWheel className={className} /> : null}
      {visual === "elliptical" ? <Orbit className={className} /> : null}
      {visual === "unknown" ? <CircleHelp className={className} /> : null}
    </span>
  );
}

function activityFallbackClass(visual: ActivitySportVisual) {
  if (visual === "cycling") return "text-slate-500 dark:text-slate-300";
  if (visual === "swim" || visual === "rowing")
    return "text-cyan-700/60 dark:text-cyan-200/70";
  if (visual === "strength" || visual === "hiit")
    return "text-stone-500 dark:text-stone-300";
  if (visual === "stretching" || visual === "yoga")
    return "text-violet-700/55 dark:text-violet-200/70";
  if (visual === "unknown") return "text-muted-foreground";
  return "text-emerald-700/55 dark:text-emerald-200/70";
}

function ActivityThumbnail({ activity }: { activity: Activity }) {
  const definition = activity.subSportType ?? activity.sportDefinitionCode;
  const visual = getActivitySportVisual(activity.sportType, definition);
  return (
    <MapThumbnail
      lightUrl={activity.mapThumbnailUrl}
      darkUrl={activity.mapThumbnailDarkUrl}
      sizes="64px"
      className="h-14 w-16 rounded-lg"
      fallback={
        <span
          className={cn(
            "relative flex h-full w-full items-center justify-center overflow-hidden border border-zinc-200/80 bg-zinc-100/80 dark:border-white/[0.06] dark:bg-zinc-800/70",
            activityFallbackClass(visual),
          )}
        >
          <span className="absolute -right-5 -top-5 size-16 rounded-full border border-zinc-300/35 dark:border-white/[0.035]" />
          <span className="absolute -bottom-7 -left-7 size-16 rounded-full border border-zinc-300/30 dark:border-white/[0.03]" />
          <span className="relative flex size-10 items-center justify-center rounded-full border border-zinc-200/70 bg-white/55 dark:border-white/[0.07] dark:bg-zinc-900/60">
            <SportIcon visual={visual} />
          </span>
        </span>
      }
    />
  );
}

const CompetitionCard = React.memo(function CompetitionCard({
  event,
  onPress,
  t,
}: {
  event: CompetitionEvent;
  onPress: (event: CompetitionEvent) => void;
  t: Translate;
}) {
  const meta = [
    t(`CompetitionEvents.importance.${event.importance}.label`),
    sportLabel(t, event.sportType),
    typeof event.distanceMeters === "number" && event.distanceMeters > 0
      ? `${(event.distanceMeters / 1000).toFixed(1)} km`
      : null,
    formatCompactDuration(event.targetTimeSeconds),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      aria-label={event.title}
      onClick={() => onPress(event)}
      className="tap-feedback w-full rounded-surface border border-violet-100/80 bg-violet-50/70 px-3 py-3 text-left transition-colors hover:bg-violet-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-violet-800/25 dark:bg-violet-950/20 dark:hover:bg-violet-900/25"
    >
      <span
        className={cn(
          "block text-sm font-semibold text-violet-900 dark:text-violet-100",
          event.status === "CANCELLED" && "line-through opacity-60",
        )}
      >
        ⚑ {event.title}
      </span>
      <span className="mt-1 block text-xs text-violet-700 dark:text-violet-300">
        {meta}
      </span>
    </button>
  );
});

const SelectedActivityCard = React.memo(function SelectedActivityCard({
  activity,
  onPress,
  t,
  tActivityTitle,
}: {
  activity: Activity;
  onPress: (activity: Activity) => void;
  t: Translate;
  tActivityTitle: ActivityTitleTranslator;
}) {
  const fallback = sportLabel(t, activity.sportType);
  const title = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    fallback,
  );
  return (
    <button
      type="button"
      aria-label={title}
      onClick={() => onPress(activity)}
      className="tap-feedback w-full rounded-surface border border-sky-100/80 bg-sky-50/70 p-3 text-left transition-colors hover:bg-sky-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-800/25 dark:bg-sky-950/20 dark:hover:bg-sky-900/25"
    >
      <div className="flex items-center gap-3">
        <ActivityThumbnail activity={activity} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {title}
            </span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <span className="block line-clamp-2 text-sm leading-5 text-muted-foreground">
            {activityDetail(activity, t)}
          </span>
        </div>
      </div>
    </button>
  );
});

const SheetActivityCard = React.memo(function SheetActivityCard({
  activity,
  onPress,
  t,
  tActivityTitle,
}: {
  activity: Activity;
  onPress: (activity: Activity) => void;
  t: Translate;
  tActivityTitle: ActivityTitleTranslator;
}) {
  const fallback = sportLabel(t, activity.sportType);
  const title = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    fallback,
  );
  return (
    <button
      type="button"
      aria-label={title}
      onClick={() => onPress(activity)}
      className="tap-feedback w-full rounded-surface border border-sky-100/80 bg-sky-50/70 p-3 text-left transition-colors hover:bg-sky-100/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-sky-800/25 dark:bg-sky-950/20 dark:hover:bg-sky-900/25"
    >
      <span className="block text-[11px] font-medium text-sky-700 dark:text-sky-300">
        {t("MobileCalendarTimeline.completed")}
      </span>
      <span className="mt-1 block line-clamp-2 text-sm font-semibold text-foreground">
        {title}
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">
        {activityDetail(activity, t)}
      </span>
    </button>
  );
});

export const MobileCalendarDayContent = React.memo(
  function MobileCalendarDayContent({
    activities,
    events,
    onActivityPress,
    onEventPress,
    onWorkoutPress,
    variant = "selected",
    workouts,
  }: {
    activities: Activity[];
    events: CompetitionEvent[];
    onActivityPress: (activity: Activity) => void;
    onEventPress: (event: CompetitionEvent) => void;
    onWorkoutPress: (workout: PlanWorkout) => void;
    variant?: "selected" | "sheet";
    workouts: PlanWorkout[];
  }) {
    const t = useTranslations();
    const tActivityTitle = useTranslations("ActivityTitle");
    const hasContent =
      activities.length > 0 || workouts.length > 0 || events.length > 0;
    const ActivityCard =
      variant === "sheet" ? SheetActivityCard : SelectedActivityCard;

    if (!hasContent) {
      return (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          {t(
            variant === "sheet"
              ? "MobileCalendarTimeline.restHint"
              : "MobileCalendarTimeline.selectDateHint",
          )}
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {events.map((event) => (
          <CompetitionCard
            key={event.id}
            event={event}
            onPress={onEventPress}
            t={t}
          />
        ))}
        {workouts.map((workout) => (
          <MobilePlanWorkoutRow
            key={workout.id}
            workout={workout}
            emptyTitle={t("MobileCalendarTimeline.plannedWorkout")}
            emptyDetail={t("MobileCalendarTimeline.restHint")}
            onClick={onWorkoutPress}
            showDateBlock={false}
          />
        ))}
        {activities.map((activity) => (
          <ActivityCard
            key={`${activity.id}-${activity.hashId ?? ""}`}
            activity={activity}
            onPress={onActivityPress}
            t={t}
            tActivityTitle={tActivityTitle}
          />
        ))}
      </div>
    );
  },
);
