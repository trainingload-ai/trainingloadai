"use client";

import { ChevronRight } from "lucide-react";
import { isRenderablePreviewStructure } from "@shared/plan-share";
import type { WorkoutStructureKind } from "@shared/workout-structure";
import { SportType } from "@/api/activities";
import type { PlanSportType } from "@/api/plans";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import type { SharePreviewWorkout } from "@/components/plan/plan-share-preview-model";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { getSportTypeIcon } from "@/utils/sportTypeUtils";

function asPlanSportType(value: string): PlanSportType {
  if (value === "CYCLING") return "CYCLING";
  if (value === "SWIM") return "SWIM";
  if (value === "STRETCHING") return "STRETCHING";
  if (value === "RUN") return "RUN";
  return "UNKNOWN";
}

function asSportType(value: string): SportType {
  if (value === SportType.CYCLING) return SportType.CYCLING;
  if (value === SportType.SWIM) return SportType.SWIM;
  if (value === SportType.STRETCHING) return SportType.STRETCHING;
  if (value === SportType.RUN) return SportType.RUN;
  return SportType.UNKNOWN;
}

function asStructureKind(value: string): WorkoutStructureKind {
  if (value === "STRENGTH" || value === "FREEFORM") return value;
  return "ENDURANCE";
}

export function PlanShareWorkoutPreview({
  workout,
  sportLabel,
  loadLabel,
  openDetailsLabel,
  onOpen,
}: {
  workout: SharePreviewWorkout;
  sportLabel: string;
  loadLabel?: string;
  openDetailsLabel: string;
  onOpen: () => void;
}) {
  const sportType = asPlanSportType(workout.sportType);
  const structureKind = asStructureKind(workout.structureKind);
  const structure = isRenderablePreviewStructure(workout.structure)
    ? workout.structure
    : undefined;
  const title = workout.name?.trim() || sportLabel;
  const showSportCaption = Boolean(workout.name?.trim());

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-md bg-neutral-100 px-2.5 py-2 text-left transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {structure ? (
          <div
            className="pointer-events-none w-[130px] shrink-0 overflow-hidden rounded-md"
            aria-hidden
          >
            <WorkoutRenderer
              className="w-full"
              workout={{
                text: "",
                sportType,
                structureKind,
                structure,
              }}
              density="COMPACT"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          {showSportCaption ? (
            <div className="mb-0.5 flex items-center gap-1.5 text-mobile-caption pc:text-[11px] text-muted-foreground">
              {getSportTypeIcon(asSportType(workout.sportType), "h-3.5 w-3.5")}
              <span>{sportLabel}</span>
            </div>
          ) : null}
          <div className="truncate text-sm font-medium">{title}</div>
          {workout.notes ? (
            <div className="mt-1 min-w-0">
              <PlanDescriptionRich
                markdown={workout.notes}
                variant="sidebar"
                lineClamp={2}
              />
            </div>
          ) : null}
          {loadLabel ? (
            <div className="mt-1 text-mobile-caption pc:text-[11px] text-muted-foreground">
              {loadLabel}
            </div>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex shrink-0 self-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted"
        aria-label={openDetailsLabel}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
