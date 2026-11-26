import { type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { getSportDisplayName } from "@/api/sports";
import { cn } from "@/lib/utils";
import type { PlanWorkoutAdjustmentDraft } from "@/lib/plan-workout-adjustment-draft";
import { planChangeVersionStyles } from "./cards/coach-plan-change-comparison";

function WorkoutPane({
  title,
  workout,
  position,
  side,
  dateChanged,
  sportChanged,
  renderWorkout,
}: {
  title: string;
  workout: PlanWorkoutAdjustmentDraft["before"];
  position: string;
  side: "before" | "after";
  dateChanged: boolean;
  sportChanged: boolean;
  renderWorkout: (workout: PlanWorkoutAdjustmentDraft["before"], side: "before" | "after") => ReactNode;
}) {
  const sports = useTranslations("SportCatalog");
  const format = useFormatter();
  const sport = getSportDisplayName([], { sportType: workout.sportType }, sports);
  const localDate = workout.scheduledDate ? new Date(`${workout.scheduledDate.slice(0, 10)}T00:00:00Z`) : null;
  const date = localDate && Number.isFinite(localDate.getTime())
    ? format.dateTime(localDate, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : position;
  const highlight = side === "before" ? "font-semibold text-palette-sky-800 dark:text-palette-sky-300"
    : "font-semibold text-palette-emerald-800 dark:text-palette-emerald-300";
  return (
    <div role="group" aria-label={title} className={cn(
      "min-w-0 rounded-md border border-s-2 px-2.5 py-3 [overflow-wrap:anywhere]",
      planChangeVersionStyles[side],
    )}>
      <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
        {workout.name || workout.sportType}
      </div>
      <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
        <span className={cn(dateChanged && highlight)}>{date}</span>
        {" · "}<span className={cn(sportChanged && highlight)}>{sport}</span>
      </div>
      {renderWorkout(workout, side)}
      {workout.notes ? (
        <p className="mt-2 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {workout.notes}
        </p>
      ) : null}
    </div>
  );
}

export function PlanWorkoutAdjustmentComparison({ draft, renderWorkout }: {
  draft: Pick<PlanWorkoutAdjustmentDraft, "before" | "after">;
  renderWorkout: (workout: PlanWorkoutAdjustmentDraft["before"], side: "before" | "after") => ReactNode;
}) {
  const t = useTranslations("AiCoachPage.workoutAdjustment");
  const dateChanged = draft.before.scheduledDate !== draft.after.scheduledDate ||
    draft.before.weekIndex !== draft.after.weekIndex || draft.before.dayIndex !== draft.after.dayIndex;
  const sportChanged = draft.before.sportType !== draft.after.sportType;
  return (
    <div className="grid grid-cols-2 items-stretch gap-2">
      <WorkoutPane
        title={t("before")} side="before" dateChanged={dateChanged} sportChanged={sportChanged}
        renderWorkout={renderWorkout}
        workout={draft.before}
        position={t("position", {
          week: draft.before.weekIndex,
          day: draft.before.dayIndex,
        })}
      />
      <WorkoutPane
        title={t("after")} side="after" dateChanged={dateChanged} sportChanged={sportChanged}
        renderWorkout={renderWorkout}
        workout={draft.after}
        position={t("position", {
          week: draft.after.weekIndex,
          day: draft.after.dayIndex,
        })}
      />
    </div>
  );
}
