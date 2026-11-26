"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  deleteIndependentWorkout,
  updatePlan,
  type PlanWorkout,
} from "@/api/plans";
import { usePlanWorkoutActions } from "@/hooks/usePlanWorkoutActions";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";

export function useWorkoutDetailCommands(
  workout?: PlanWorkout,
  onDeleted?: () => void,
) {
  const t = useTranslations("ViewWorkoutDialog");
  const queryClient = useQueryClient();
  const { pendingWorkoutId, postponeWorkout, skipWorkout } =
    usePlanWorkoutActions();
  const [deleting, setDeleting] = useState(false);
  const planId = workout?.planId ?? undefined;
  const linked = Boolean(workout?.links?.some((link) => !link.unlinkedAt));
  const capabilities = {
    delete: planId
      ? workout?.capabilities?.delete === true
      : workout?.status === "PLANNED" && !linked,
    postpone: Boolean(planId) && workout?.capabilities?.postpone === true,
    skip: Boolean(planId) && workout?.capabilities?.skip === true,
  };
  return {
    capabilities,
    pending: deleting || pendingWorkoutId === workout?.id,
    onDelete: async () => {
      if (!workout || !capabilities.delete) return false;
      setDeleting(true);
      try {
        if (planId)
          await updatePlan(planId, { deletedWorkoutIds: [workout.id] });
        else await deleteIndependentWorkout(workout.id);
        await invalidateAfterPlanMutation(queryClient, { planId });
        toast.success(t("deleteSuccess"));
        onDeleted?.();
      } catch {
        toast.error(t("deleteFailed"));
        return false;
      } finally {
        setDeleting(false);
      }
    },
    onPostpone: async () => {
      if (!planId || !workout || !capabilities.postpone) return false;
      if (linked) {
        toast.message(t("linkedBlockedTip"));
        return false;
      }
      try {
        const updated = await postponeWorkout({
          planId,
          workoutId: workout.id,
          status: workout.status,
          sourceDayOffset: workout.dayOffset,
          text: workout.text,
          notes: workout.notes,
          name: workout.name,
          sportType: workout.sportType,
          sportDefinitionCode: workout.sportDefinitionCode,
        });
        if (!updated) return false;
        await invalidateAfterPlanMutation(queryClient, { planId });
        toast.success(t("postponeSuccess"));
      } catch {
        toast.error(t("postponeFailed"));
        return false;
      }
    },
    onSkip: async () => {
      if (!planId || !workout || !capabilities.skip) return false;
      if (linked) {
        toast.message(t("linkedBlockedTip"));
        return false;
      }
      try {
        if (
          !(await skipWorkout({
            planId,
            workoutId: workout.id,
            status: workout.status,
          }))
        )
          return false;
        await invalidateAfterPlanMutation(queryClient, { planId });
        toast.success(t("skipSuccess"));
      } catch {
        toast.error(t("skipFailed"));
        return false;
      }
    },
  };
}
