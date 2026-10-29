import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  createPlan,
  updatePlan,
  activatePlan,
  pausePlan,
  completePlan,
  cancelPlan,
  deletePlan,
  updatePlanWorkout,
  updatePlanWorkoutStatus,
  type PlanWorkoutStatus,
  type UpdatePlanWorkoutDto,
} from "./plans";
import { usePlanStore } from "@/lib/plan-store";
import { toast } from "sonner";
import type { CoachPlanDraft } from "@/lib/coach-plan-draft";
import { draftToCreatePlanDto } from "@/lib/coach-plan-draft";
import {
  invalidateAfterPlanMutation,
  invalidatePlanListsAndActive,
} from "@/lib/query-invalidation";

/** 教练草案 → `POST /plans`（与手动创建共用服务端路径） */
export function useCreateCoachPlanFromDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (draft: CoachPlanDraft) => {
      let dto;
      try {
        dto = draftToCreatePlanDto(draft);
      } catch {
        throw new Error("NO_WORKOUTS");
      }
      const result = await createPlan(dto);
      if (!result?.id) throw new Error("CREATE_FAILED");
      return result;
    },
    onSuccess: () => {
      void invalidatePlanListsAndActive(qc);
    },
  });
}

export function useCreatePlanFromDraft() {
  const t = useTranslations("PlanMutations");
  const serialize = usePlanStore((s) => s.serializeToCreate);
  const clear = usePlanStore((s) => s.clear);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const dto = serialize();
      if (!dto) throw new Error("NO_PLAN");
      return createPlan(dto);
    },
    onSuccess: () => {
      toast.success(t("success.saved"));
      clear();
      void invalidatePlanListsAndActive(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      if (raw === "NO_PLAN") {
        toast.error(t("errors.noPlan"));
        return;
      }
      toast.error(raw || t("errors.saveFailed"));
    },
  });
}

export function useUpdatePlanFromDraft() {
  const t = useTranslations("PlanMutations");
  const serialize = usePlanStore((s) => s.serializeToUpdate);
  const clear = usePlanStore((s) => s.clear);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const dto = serialize();
      if (!dto) throw new Error("NO_PLAN");
      const { planId, ...payload } = dto;
      return updatePlan(String(planId), payload);
    },
    onSuccess: (result) => {
      toast.success(t("success.updated"));
      clear();
      void invalidateAfterPlanMutation(qc, { planId: result?.id });
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      if (raw === "NO_PLAN") {
        toast.error(t("errors.noPlan"));
        return;
      }
      toast.error(raw || t("errors.updateFailed"));
    },
  });
}

export function useUpdatePlanWorkout() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      workoutId,
      dto,
    }: {
      planId: string;
      workoutId: string;
      dto: UpdatePlanWorkoutDto;
    }) => {
      return updatePlanWorkout(planId, workoutId, dto);
    },
    onSuccess: (result, variables) => {
      toast.success(t("success.workoutUpdated"));
      void invalidateAfterPlanMutation(qc, {
        planId: variables.planId,
        workout: {
          planId: variables.planId,
          workoutId: result?.id ?? variables.workoutId,
        },
      });
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.workoutUpdateFailed"));
    },
  });
}

/**
 * Activate plan
 * @returns
 */
export function useActivatePlan() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      startDate,
    }: {
      planId: string;
      startDate?: string;
    }) => {
      return activatePlan(planId, startDate);
    },
    onSuccess: () => {
      toast.success(t("success.activated"));
      void invalidateAfterPlanMutation(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.activateFailed"));
    },
  });
}

/**
 * Cancel plan
 * @returns
 */
export function useCancelActivation() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId }: { planId: string }) => {
      return cancelPlan(planId);
    },
    onSuccess: () => {
      toast.success(t("success.activationCancelled"));
      void invalidateAfterPlanMutation(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.cancelFailed"));
    },
  });
}

export function usePausePlan() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      reason,
    }: {
      planId: string;
      reason?: string;
    }) => {
      return pausePlan(planId, reason);
    },
    onSuccess: () => {
      toast.success(t("success.paused"));
      void invalidateAfterPlanMutation(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.pauseFailed"));
    },
  });
}

export function useCompletePlan() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      completedAt,
      reason,
    }: {
      planId: string;
      completedAt?: string;
      reason?: string;
    }) => {
      return completePlan(planId, completedAt, reason);
    },
    onSuccess: () => {
      toast.success(t("success.completed"));
      void invalidateAfterPlanMutation(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.completeFailed"));
    },
  });
}

/**
 * 直接改 PlanWorkout.status 的接口；用于 view-workout 弹窗里的「标记完成 / 撤销完成」按钮。
 * 自动 link 时服务端已经会自动置 DONE，这里只覆盖手动改态的场景。
 */
export function useUpdatePlanWorkoutStatus() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      workoutId,
      status,
    }: {
      planId: string;
      workoutId: string;
      status: PlanWorkoutStatus;
    }) => {
      return updatePlanWorkoutStatus(planId, workoutId, { status });
    },
    onSuccess: (_result, variables) => {
      void invalidateAfterPlanMutation(qc, {
        planId: variables.planId,
        workout: {
          planId: variables.planId,
          workoutId: variables.workoutId,
        },
      });
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.workoutUpdateFailed"));
    },
  });
}

export function useDeletePlan() {
  const t = useTranslations("PlanMutations");
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId }: { planId: string }) => {
      return deletePlan(planId);
    },
    onSuccess: () => {
      toast.success(t("success.deleted"));
      void invalidateAfterPlanMutation(qc);
    },
    onError: (err: unknown) => {
      const raw = (err as { message?: string })?.message;
      toast.error(raw || t("errors.deleteFailed"));
    },
  });
}
