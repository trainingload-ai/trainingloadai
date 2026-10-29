"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updatePlan, type PlanWorkout } from "@/api/plans";
import { useUpdatePlanWorkout } from "@/api/usePlanMutations";
import {
  WorkoutEditorSheet,
  type WorkoutEditorPayload,
} from "@/components/plan/WorkoutEditorSheet";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import type { ParsedPlan } from "@/api/workout";

export function PlanDetailWorkoutEditor({
  open,
  onOpenChange,
  planId,
  workout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  workout: PlanWorkout | null;
}) {
  const t = useTranslations("WorkoutEditor");
  const tMutations = useTranslations("PlanMutations");
  const queryClient = useQueryClient();
  const { mutateAsync: updateWorkout } = useUpdatePlanWorkout();

  if (!workout) return null;

  const handleSave = async (payload: WorkoutEditorPayload) => {
    await updateWorkout({
      planId,
      workoutId: workout.id,
      dto: {
        weekIndex: workout.weekIndex,
        dayIndex: workout.dayIndex,
        sessionIndex: workout.sessionIndex,
        text: payload.text,
        notes: payload.notes,
        name: payload.name ?? null,
        sportType: payload.sportType,
        sportDefinitionCode: payload.sportDefinitionCode,
        definition: payload.definition,
        blocks: payload.blocks,
      },
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await updatePlan(planId, { deletedWorkoutIds: [workout.id] });
    await invalidateAfterPlanMutation(queryClient, { planId });
    toast.success(tMutations("success.updated"));
    onOpenChange(false);
  };

  return (
    <WorkoutEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("title.edit")} · ${t("title.weekLabel", { week: workout.weekIndex })}`}
      mobileTitle={t("title.edit")}
      mobileScheduleLabel={t("title.weekLabel", { week: workout.weekIndex })}
      mobilePlanLayout
      showNameField
      showDelete
      canDelete
      saveLabel={t("buttons.saveDraft")}
      resetKey={workout.id}
      initialValue={{
        text: workout.text || "",
        notes: workout.notes || "",
        name: workout.name || "",
        sportType: workout.sportType || "RUN",
        sportDefinitionCode: workout.sportDefinitionCode,
        blocks: Array.isArray(workout.blocks)
          ? (workout.blocks as ParsedPlan)
          : null,
        structureKind: workout.structureKind,
        structure: workout.structure,
        summary: workout.summary,
      }}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
