"use client";

import { isRenderablePreviewStructure } from "@shared/plan-share";
import type { WorkoutStructureKind } from "@shared/workout-structure";
import type { PlanSportType } from "@/api/plans";
import { PlanDescriptionRich } from "@/components/plan/plan-description-rich";
import type { SharePreviewWorkout } from "@/components/plan/plan-share-preview-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";

function asPlanSportType(value: string): PlanSportType {
  if (value === "CYCLING") return "CYCLING";
  if (value === "SWIM") return "SWIM";
  if (value === "STRETCHING") return "STRETCHING";
  if (value === "RUN") return "RUN";
  return "UNKNOWN";
}

function asStructureKind(value: string): WorkoutStructureKind {
  if (value === "STRENGTH" || value === "FREEFORM") return value;
  return "ENDURANCE";
}

export function PlanShareWorkoutDialog({
  open,
  onOpenChange,
  workout,
  title,
  sportLabel,
  notesLabel,
  chartLabel,
  loadLabel,
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: SharePreviewWorkout | null;
  title: string;
  sportLabel: string;
  notesLabel: string;
  chartLabel: string;
  loadLabel?: string;
  closeLabel: string;
}) {
  const structure = isRenderablePreviewStructure(workout?.structure)
    ? workout.structure
    : undefined;
  const sportType = asPlanSportType(workout?.sportType ?? "RUN");
  const structureKind = asStructureKind(workout?.structureKind ?? "ENDURANCE");
  const name = workout?.name?.trim() || sportLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none pc:max-h-[85vh] pc:w-[50vw] pc:gap-4 pc:p-6">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pb-4 pt-4 pr-14 text-left pc:border-0 pc:p-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pc:p-0 pc:pr-1">
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-control-lg bg-neutral-100 px-4 dark:bg-muted/45 pc:mb-2 pc:min-h-0 pc:justify-start pc:gap-3 pc:rounded-none pc:bg-transparent pc:px-0 pc:dark:bg-transparent">
            <div className="text-sm font-medium">{name}</div>
            <div className="text-sm text-muted-foreground">{sportLabel}</div>
          </div>
          {loadLabel ? (
            <p className="mb-4 text-mobile-caption pc:text-xs text-muted-foreground">
              {loadLabel}
            </p>
          ) : null}

          <div className="grid gap-4 pc:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{notesLabel}</div>
              {workout?.notes ? (
                <div className="rounded-control-lg bg-neutral-100 px-4 py-3 dark:bg-muted/45 pc:border pc:border-border/60 pc:bg-background pc:dark:bg-background">
                  <PlanDescriptionRich
                    markdown={workout.notes}
                    variant="detail"
                  />
                </div>
              ) : (
                <div className="rounded-control-lg bg-neutral-100 px-4 py-3 text-sm text-muted-foreground dark:bg-muted/45 pc:border pc:border-border/60 pc:bg-background pc:dark:bg-background">
                  —
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{chartLabel}</div>
              {structure ? (
                <WorkoutRenderer
                  workout={{
                    text: "",
                    sportType,
                    structureKind,
                    structure,
                  }}
                  density="DETAIL"
                />
              ) : (
                <div className="rounded-control-lg bg-neutral-100 px-4 py-8 text-center text-sm text-muted-foreground dark:bg-muted/45">
                  —
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="relative z-10 shrink-0 border-t border-border/60 bg-background px-4 py-3 pc:px-0 pc:pb-0 pc:pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
