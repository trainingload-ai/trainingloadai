"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Dumbbell, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import { fetchActivityStrength } from "@/api/activity";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/query-keys";
import { getStrengthExerciseKey } from "@/lib/strength-catalog";
import type {
  ActivityStrengthExerciseV1,
  ActivityStrengthResponse,
  ActivityStrengthSetV1,
} from "../../../../../../../../../packages/shared/strength-activity";
import type {
  StrengthLoadV1,
  StrengthSetGroupIrV1,
} from "../../../../../../../../../packages/shared/strength-workout-ir";

type Props = { activity: Activity };

const formatLoad = (load: StrengthLoadV1, isZh: boolean) => {
  if (load.kind === "OPEN") return isZh ? "开放重量" : "Open load";
  if (load.kind === "BODYWEIGHT") return isZh ? "自重" : "Bodyweight";
  if (load.kind === "PERCENT_1RM") return `${load.value}% 1RM`;
  if (load.kind === "ABSOLUTE")
    return `${load.value}${load.unit.toLowerCase()}`;
  return `${
    load.direction === "ASSISTED" ? (isZh ? "辅助 " : "Assisted ") : "+"
  }${load.value}${load.unit.toLowerCase()}`;
};

const formatPrescription = (group?: StrengthSetGroupIrV1) => {
  if (!group) return null;
  if (group.prescription.kind === "TIME") {
    return `${group.prescription.durationSeconds}s`;
  }
  const { repsMin, repsMax, amrap } = group.prescription;
  const reps = repsMin === repsMax ? String(repsMin) : `${repsMin}-${repsMax}`;
  return amrap ? `${reps}+` : reps;
};

function materializePlanned(
  response: ActivityStrengthResponse,
): ActivityStrengthExerciseV1[] {
  if (!response.planned) return [];
  return response.planned.structure.exercises.map((exercise) => {
    let setIndex = 0;
    return {
      exerciseCode: exercise.exerciseCode,
      name: exercise.name,
      equipmentCode: exercise.equipmentCode,
      notes: exercise.notes,
      sets: exercise.setGroups.flatMap((group) =>
        Array.from({ length: group.setCount }, () => ({
          plannedSetGroupId: group.id,
          setIndex: setIndex++,
          setType: group.setType,
          load: group.load,
          source: "APP" as const,
          completedAt: null,
        })),
      ),
    };
  });
}

function findPlannedGroup(
  response: ActivityStrengthResponse,
  set: ActivityStrengthSetV1,
) {
  if (!set.plannedSetGroupId || !response.planned) return undefined;
  return response.planned.structure.exercises
    .flatMap((exercise) => exercise.setGroups)
    .find((group) => group.id === set.plannedSetGroupId);
}

function SetRow({
  response,
  set,
  isZh,
}: {
  response: ActivityStrengthResponse;
  set: ActivityStrengthSetV1;
  isZh: boolean;
}) {
  const planned = findPlannedGroup(response, set);
  const hasActual =
    set.completedAt != null ||
    set.completedReps != null ||
    set.completedDurationSeconds != null ||
    set.actualRpe != null;
  const actualAmount =
    set.completedDurationSeconds != null
      ? `${set.completedDurationSeconds}s`
      : set.completedReps != null
        ? `${set.completedReps} ${isZh ? "次" : "reps"}`
        : null;

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 py-2.5 text-mobile-caption pc:text-xs first:border-t-0">
      <span className="tabular-nums text-muted-foreground">
        #{set.setIndex + 1}
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          {formatPrescription(planned) ?? (isZh ? "自由组" : "Open set")}
          <span className="font-normal text-muted-foreground">
            {formatLoad(planned?.load ?? set.load, isZh)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span>
            {isZh ? "实际" : "Actual"}:{" "}
            {actualAmount ?? (isZh ? "未记录" : "Not recorded")}
          </span>
          {hasActual ? <span>{formatLoad(set.load, isZh)}</span> : null}
          {set.actualRpe != null ? <span>RPE {set.actualRpe}</span> : null}
          {hasActual ? <span>{set.source}</span> : null}
        </div>
      </div>
      {set.completedAt ? (
        <CheckCircle2
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
          aria-label={isZh ? "已完成" : "Completed"}
        />
      ) : (
        <CircleDashed
          className="h-4 w-4 text-muted-foreground"
          aria-label={isZh ? "未完成" : "Not completed"}
        />
      )}
    </div>
  );
}

export function ActivityStrengthSection({ activity }: Props) {
  const locale = useLocale();
  const tCatalog = useTranslations("StrengthCatalog.exercise");
  const isZh = locale.toLowerCase().startsWith("zh");
  const hashId = activity.hashId ?? "";
  const sportCode =
    activity.subSportType ?? activity.sportDefinitionCode ?? activity.sportType;
  const isStrength =
    sportCode === "STRENGTH_TRAINING" || sportCode === "STRENGTH";
  const query = useQuery({
    queryKey: queryKeys.activity.strength(hashId),
    queryFn: () => fetchActivityStrength(hashId),
    enabled: Boolean(hashId && isStrength),
  });
  const response = query.data;

  if (!isStrength || !hashId) return null;
  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isZh ? "加载力量训练记录…" : "Loading strength log…"}
        </CardContent>
      </Card>
    );
  }
  if (!response) return null;
  const displayExercises =
    response.exercises.length > 0
      ? response.exercises
      : materializePlanned(response);
  const displayedSetCount = displayExercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Dumbbell className="h-4 w-4" />
            {isZh ? "力量训练记录" : "Strength training record"}
          </CardTitle>
          <p className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {isZh
              ? `已完成 ${response.summary.completedSetCount}/${response.summary.setCount || displayedSetCount} 组 · ${response.summary.completedReps} 次`
              : `${response.summary.completedSetCount}/${response.summary.setCount || displayedSetCount} sets · ${response.summary.completedReps} reps`}
          </p>
        </div>
        <Badge variant="secondary">{isZh ? "只读" : "Read only"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3 pt-0">
        {response.planned ? (
          <div className="flex flex-wrap gap-1.5 text-mobile-caption pc:text-xs">
            <Badge variant="outline">
              {isZh ? "计划" : "Plan"}:{" "}
              {response.planned.summary.workingSetCount}{" "}
              {isZh ? "工作组" : "work sets"}
            </Badge>
            {response.planned.summary.plannedSessionRpe != null ? (
              <Badge variant="outline">
                session RPE {response.planned.summary.plannedSessionRpe}
              </Badge>
            ) : null}
          </div>
        ) : null}
        {displayExercises.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-mobile-caption pc:text-xs text-muted-foreground">
            {response.planned
              ? isZh
                ? "已关联力量处方，暂无实际训练记录。"
                : "A strength prescription is linked; no actual sets were recorded."
              : isZh
                ? "当前活动没有已关联的力量处方或实际组。"
                : "No linked strength prescription or actual sets."}
          </p>
        ) : (
          displayExercises.map((exercise) => {
            const exerciseKey = getStrengthExerciseKey(exercise);
            const exerciseName = exerciseKey
              ? tCatalog(exerciseKey)
              : exercise.name;
            return (
              <div
                key={exercise.id ?? exercise.name}
                className="rounded-md border border-border/70 px-3"
              >
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold">{exerciseName}</span>
                  <span className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                    {exercise.sets.filter((set) => set.completedAt).length}/
                    {exercise.sets.length}
                  </span>
                </div>
                {exercise.sets.map((set) => (
                  <SetRow
                    key={set.id ?? set.setIndex}
                    response={response}
                    set={set}
                    isZh={isZh}
                  />
                ))}
              </div>
            );
          })
        )}
        {response.summary.volumeLoadKg > 0 ||
        response.summary.volumeLoadLb > 0 ? (
          <p className="text-right text-mobile-caption pc:text-xs text-muted-foreground">
            {isZh ? "已完成容量" : "Completed volume"}:{" "}
            {response.summary.volumeLoadKg > 0
              ? `${response.summary.volumeLoadKg} kg`
              : ""}
            {response.summary.volumeLoadKg > 0 &&
            response.summary.volumeLoadLb > 0
              ? " · "
              : ""}
            {response.summary.volumeLoadLb > 0
              ? `${response.summary.volumeLoadLb} lb`
              : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
