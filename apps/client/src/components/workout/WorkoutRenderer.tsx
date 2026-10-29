"use client";

import { Dumbbell } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlanWorkout, PlanSportType } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { WorkoutPlanChart } from "@/components/workout/WorkoutPlanChart";
import { getStrengthExerciseKey } from "@/lib/strength-catalog";
import type {
  StrengthLoadV1,
  StrengthSetGroupIrV1,
  StrengthWorkoutIrV1,
} from "@shared/strength-workout-ir";
import type { WorkoutStructure } from "@shared/workout-structure";
import type { WorkoutSummary } from "@shared/workout-summary";
import type { WorkoutZoneColorMap } from "./workout-zone-colors";

export type WorkoutRendererDensity = "COMPACT" | "CARD" | "DETAIL";

export type WorkoutRendererValue = {
  structureKind?: PlanWorkout["structureKind"];
  structure?: PlanWorkout["structure"];
  summary?: PlanWorkout["summary"];
  blocks?: PlanWorkout["blocks"];
  estimatedLoadInputs?: PlanWorkout["estimatedLoadInputs"];
  text: string;
  sportType: PlanWorkout["sportType"];
};

type Props = {
  workout: WorkoutRendererValue;
  density?: WorkoutRendererDensity;
  className?: string;
  chartHeight?: number;
  chartFillHeight?: boolean;
  chartCompact?: boolean;
  zoneColors?: WorkoutZoneColorMap;
};

function chartSport(sport: PlanSportType) {
  return sport === "CYCLING" || sport === "SWIM" ? sport : "RUN";
}

function enduranceBlocks(workout: WorkoutRendererValue): ParsedPlan | null {
  if (workout.structure?.kind === "ENDURANCE") {
    return workout.structure.blocks as ParsedPlan;
  }
  if (Array.isArray(workout.blocks)) return workout.blocks as ParsedPlan;
  if (typeof workout.blocks === "string") {
    try {
      const parsed = JSON.parse(workout.blocks);
      return Array.isArray(parsed) ? (parsed as ParsedPlan) : null;
    } catch {
      return null;
    }
  }
  return null;
}

type StrengthPreviewTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function formatLoad(load: StrengthLoadV1, t: StrengthPreviewTranslator) {
  switch (load.kind) {
    case "ABSOLUTE":
      return `${load.value}${load.unit.toLowerCase()}`;
    case "PERCENT_1RM":
      return `${load.value}%1RM`;
    case "BODYWEIGHT":
      return t("bodyweight");
    case "BODYWEIGHT_OFFSET":
      return `${t("bodyweight")} ${load.direction === "ADDED" ? "+" : "-"}${load.value}${load.unit.toLowerCase()}`;
    default:
      return t("openLoad");
  }
}

function formatPrescription(
  group: StrengthSetGroupIrV1,
  t: StrengthPreviewTranslator,
) {
  const prescription =
    group.prescription.kind === "TIME"
      ? `${group.prescription.durationSeconds}s`
      : group.prescription.amrap
        ? "AMRAP"
        : group.prescription.repsMin === group.prescription.repsMax
          ? String(group.prescription.repsMin)
          : `${group.prescription.repsMin}-${group.prescription.repsMax}`;
  const effort = group.effort
    ? ` · ${group.effort.kind} ${group.effort.value}`
    : "";
  const rest = group.restSeconds
    ? ` · ${t("rest", { seconds: group.restSeconds })}`
    : "";
  return `${group.setCount} × ${prescription} · ${formatLoad(group.load, t)}${effort}${rest}`;
}

function StrengthRenderer({
  structure,
  summary,
  density,
}: {
  structure: StrengthWorkoutIrV1;
  summary: WorkoutSummary | undefined;
  density: WorkoutRendererDensity;
}) {
  const t = useTranslations("WorkoutEditor.strength.preview");
  const tCatalog = useTranslations("StrengthCatalog.exercise");
  const strengthSummary = summary?.kind === "STRENGTH" ? summary : null;
  if (density === "COMPACT") {
    const exerciseCount =
      strengthSummary?.exerciseCount ?? structure.exercises.length;
    const workingSets =
      strengthSummary?.workingSetCount ??
      structure.exercises.reduce(
        (sum, exercise) =>
          sum +
          exercise.setGroups.reduce(
            (sets, group) =>
              sets + (group.setType === "WORK" ? group.setCount : 0),
            0,
          ),
        0,
      );
    return (
      <div className="flex h-full min-h-12 items-center gap-2 rounded-md bg-violet-500/10 px-3 text-violet-800 dark:text-violet-200">
        <Dumbbell className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate text-mobile-caption pc:text-xs font-medium">
          {t("exerciseCount", { count: exerciseCount })} ·{" "}
          {t("workingSetCount", { count: workingSets })}
        </span>
      </div>
    );
  }

  const visibleExercises =
    density === "CARD" ? structure.exercises.slice(0, 3) : structure.exercises;
  return (
    <div className="space-y-3 rounded-md bg-violet-500/5 p-3">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Dumbbell className="h-4 w-4 text-violet-600" aria-hidden />
        <span>
          {t("title")} ·{" "}
          {t("exerciseCount", { count: structure.exercises.length })}
          {strengthSummary
            ? ` · ${t("workingSetCount", { count: strengthSummary.workingSetCount })}`
            : ""}
        </span>
      </div>
      <div className="space-y-3">
        {visibleExercises.map((exercise, exerciseIndex) => {
          const exerciseKey = getStrengthExerciseKey(exercise);
          const exerciseName = exerciseKey
            ? tCatalog(exerciseKey)
            : exercise.name;
          return (
            <div
              key={exercise.id ?? `${exercise.name}-${exerciseIndex}`}
              className="rounded-md bg-background/80 p-3"
            >
              <div className="break-words text-sm font-medium">
                {exerciseName || t("unnamedExercise")}
              </div>
              <div className="mt-1 space-y-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                {exercise.setGroups.map((group, groupIndex) => (
                  <div key={group.id ?? `${exerciseIndex}-${groupIndex}`}>
                    {group.setType === "WARMUP" ? `${t("warmup")} · ` : ""}
                    {formatPrescription(group, t)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {density === "CARD" && structure.exercises.length > 3 ? (
        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("moreExercises", { count: structure.exercises.length - 3 })}
        </div>
      ) : null}
    </div>
  );
}

export function WorkoutRenderer({
  workout,
  density = "CARD",
  className,
  chartHeight,
  chartFillHeight,
  chartCompact,
  zoneColors,
}: Props) {
  const structureKind = workout.structureKind ?? workout.structure?.kind;
  const structure = workout.structure as WorkoutStructure | undefined;

  if (structureKind === "STRENGTH" && structure?.kind === "STRENGTH") {
    return (
      <div className={className}>
        <StrengthRenderer
          structure={structure}
          summary={workout.summary}
          density={density}
        />
      </div>
    );
  }

  if (structureKind === "FREEFORM") {
    return (
      <div className={className}>
        <div className="rounded-md border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
          {structure?.kind === "FREEFORM" ? structure.text : workout.text}
        </div>
      </div>
    );
  }

  const blocks = enduranceBlocks(workout);
  return (
    <div className={className}>
      <WorkoutPlanChart
        plan={blocks}
        sportType={chartSport(workout.sportType)}
        thresholds={workout.estimatedLoadInputs?.thresholds}
        height={chartHeight ?? (density === "COMPACT" ? 50 : undefined)}
        fillHeight={chartFillHeight}
        compact={chartCompact ?? density === "COMPACT"}
        hideAxes={density === "COMPACT"}
        hideTooltip={density === "COMPACT"}
        zoneColors={zoneColors}
      />
    </div>
  );
}
