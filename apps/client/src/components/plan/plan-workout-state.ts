import dayjs from "dayjs";

import {
  isWorkoutPlannedOrInProgress,
  type PlanWorkoutStatus,
} from "@/api/plans";

export type PlanWorkoutDatePosition =
  | "past"
  | "today"
  | "future"
  | "unscheduled";

export type PlanWorkoutActionState = {
  canPostpone: boolean;
  canSkip: boolean;
  datePosition: PlanWorkoutDatePosition;
  isOverdue: boolean;
};

export function getPlanWorkoutDatePosition(
  scheduledDateKey: string | null | undefined,
  today = dayjs(),
): PlanWorkoutDatePosition {
  if (!scheduledDateKey) return "unscheduled";

  const scheduledDate = dayjs(scheduledDateKey).startOf("day");
  if (!scheduledDate.isValid()) return "unscheduled";

  const currentDate = today.startOf("day");
  if (scheduledDate.isBefore(currentDate)) return "past";
  if (scheduledDate.isAfter(currentDate)) return "future";
  return "today";
}

/**
 * 统一计划课次的日期展示状态和操作权限。
 *
 * `PLANNED` / `IN_PROGRESS` 只表示生命周期仍开放；历史课次保留为复盘记录，
 * 不能再推迟或跳过。未排期课次仍可调整，避免计划缺少 startDate 时被永久锁死。
 */
export function getPlanWorkoutActionState({
  status,
  scheduledDateKey,
  hasLinkedActivity,
  today,
}: {
  status: PlanWorkoutStatus;
  scheduledDateKey: string | null | undefined;
  hasLinkedActivity: boolean;
  today?: dayjs.Dayjs;
}): PlanWorkoutActionState {
  const datePosition = getPlanWorkoutDatePosition(scheduledDateKey, today);
  const isOpen = isWorkoutPlannedOrInProgress(status);
  const isOverdue = isOpen && datePosition === "past";
  const canMutateSchedule = isOpen && !isOverdue && !hasLinkedActivity;

  return {
    canPostpone: canMutateSchedule,
    canSkip: canMutateSchedule,
    datePosition,
    isOverdue,
  };
}
