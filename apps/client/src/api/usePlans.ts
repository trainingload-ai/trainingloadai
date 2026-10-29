import React from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  getListPlans,
  getActivePlan,
  getPlanDetail,
  getPlanWorkoutDetail,
  getIndependentWorkoutDetail,
  getPlanSummary,
  type PlanWorkout,
  type TrainingPlanSummary,
  type TrainingPlanDetail,
  type ActivePlanResponse,
  type PlanSummary,
  type ListPlansAggregates,
} from "@/api/plans";
import { queryKeys } from "@/lib/query-keys";

// Remove null from ActivePlanResponse plan union type before indexing workouts to avoid type errors
type ActiveWorkout = NonNullable<
  NonNullable<ActivePlanResponse>["plan"]
>["workouts"][number];

/**
 * Get plan list, sorted within hook: active first, others by update/create time descending
 */
export function usePlansList(enabled = true) {
  const query = useQuery<{
    plans: TrainingPlanSummary[];
    aggregates: ListPlansAggregates;
  }>({
    queryKey: queryKeys.plans.list(),
    queryFn: () => getListPlans(),
    enabled,
  });

  const sorted = React.useMemo(
    () =>
      (query.data?.plans || []).slice().sort((a, b) => {
        const aActive = a.status === "ACTIVE" ? 1 : 0;
        const bActive = b.status === "ACTIVE" ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      }),
    [query.data?.plans],
  );

  return {
    ...query,
    plans: sorted,
    aggregates: query.data?.aggregates,
  };
}

/**
 * Get current active plan, providing derived data: startDate, periodWeeks, workoutsByDate and planWeeksRange
 */
export function useActivePlan(enabled = true) {
  const query = useQuery<ActivePlanResponse>({
    queryKey: queryKeys.plans.active(),
    queryFn: () => getActivePlan(),
    enabled,
  });

  const startDate = query.data?.startDate
    ? dayjs(query.data.startDate).startOf("day")
    : null;
  const periodWeeks = query.data?.plan?.periodWeeks ?? null;
  const workouts = (query.data?.plan?.workouts ?? []) as NonNullable<
    NonNullable<ActivePlanResponse>["plan"]
  >["workouts"];

  const workoutsByDate: Record<string, ActiveWorkout[]> = React.useMemo(() => {
    const map: Record<string, ActiveWorkout[]> = {};
    if (!startDate || workouts.length === 0) return map;
    workouts.forEach((w) => {
      const offsetDays =
        typeof w.dayOffset === "number"
          ? w.dayOffset
          : (w.weekIndex - 1) * 7 + (w.dayIndex - 1);
      const d = startDate.add(offsetDays, "day").format("YYYY-MM-DD");
      if (!map[d]) map[d] = [];
      map[d].push(w);
    });
    Object.values(map).forEach((items) => {
      items.sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
    });
    return map;
  }, [startDate, workouts]);

  // Plan range should start from activation start date (not natural week start), lasting periodWeeks weeks
  const range = React.useMemo(
    () =>
      startDate && periodWeeks
        ? {
            startOfWeek: startDate.startOf("day"),
            end: startDate.add(periodWeeks * 7 - 1, "day").endOf("day"),
          }
        : null,
    [periodWeeks, startDate],
  );

  return {
    ...query,
    active: query.data,
    startDate,
    periodWeeks,
    workoutsByDate,
    range,
  };
}

export function usePlanDetail(planId?: string, enabled = true) {
  return useQuery<TrainingPlanDetail | undefined>({
    queryKey: queryKeys.plans.detail(planId),
    queryFn: () => getPlanDetail(planId as string),
    enabled: enabled && !!planId,
  });
}

export function usePlanWorkoutDetail(
  planId?: string,
  workoutId?: string,
  enabled = true,
) {
  const isIndependent = !planId && !!workoutId;
  return useQuery<PlanWorkout | undefined>({
    queryKey: queryKeys.plans.workoutDetail(planId, workoutId),
    queryFn: () =>
      isIndependent
        ? getIndependentWorkoutDetail(workoutId as string)
        : getPlanWorkoutDetail(planId as string, workoutId as string),
    enabled: enabled && !!workoutId && (!!planId || isIndependent),
  });
}

export function usePlanSummary(planId?: string, enabled = true) {
  return useQuery<PlanSummary | undefined>({
    queryKey: queryKeys.plans.summary(planId),
    queryFn: () => getPlanSummary(planId as string),
    enabled: enabled && !!planId,
  });
}
