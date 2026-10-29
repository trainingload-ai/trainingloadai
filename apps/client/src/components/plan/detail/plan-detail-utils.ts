import dayjs from "dayjs";
import type { useTranslations } from "next-intl";
import {
  isWorkoutPlannedOrInProgress,
  type PlanSportType,
  type PlanStatus,
  type PlanWorkout,
  type TrainingPlanDetail,
} from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import type { WorkoutExpressionSportType } from "@/components/plan/workout-expression-codec";

export type TranslateFn = ReturnType<typeof useTranslations>;

export type DerivedWorkout = Omit<PlanWorkout, "planId"> & {
  planId: string;
  dateKey: string | null;
  dateLabel: string;
  dayLabel: string;
  title: string;
  description: string;
  statusLabel: string;
  displayKind: PlanWorkoutDisplayKind;
};

export type PlanWorkoutDisplayKind =
  | "done"
  | "skipped"
  | "moved"
  | "inProgress"
  | "incomplete"
  | "upcoming";

export type WeekGroup = {
  weekIndex: number;
  days: Array<{
    dayIndex: number;
    dayLabel: string;
    dateLabel: string;
    dateKey: string | null;
    workouts: DerivedWorkout[];
  }>;
};

export type PlanLifecycleAction =
  | "activate"
  | "resume"
  | "pause"
  | "complete"
  | "cancel"
  | "delete";

export function getWeekdayLabel(t: TranslateFn, dayIndex: number) {
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return t(`weekday.${keys[Math.max(0, dayIndex - 1)] ?? "mon"}`);
}

export function getWeekdayCompactLabel(dayIndex: number) {
  const labels = ["一", "二", "三", "四", "五", "六", "日"] as const;
  return labels[Math.max(0, Math.min(6, dayIndex - 1))] ?? "一";
}

export function formatSportTypeLabel(
  t: TranslateFn,
  sportType?: string | null,
) {
  const normalized = String(sportType ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "run" || normalized === "running") {
    return t("sportType.run");
  }
  if (normalized === "cycling" || normalized === "bike") {
    return t("sportType.cycling");
  }
  if (normalized === "swim" || normalized === "swimming") {
    return t("sportType.swim");
  }
  return "";
}

export function parsePlanBlocks(planWorkout?: PlanWorkout) {
  const blocks = planWorkout?.blocks;
  if (!blocks) return null;
  try {
    if (typeof blocks === "string") {
      const parsed = JSON.parse(blocks);
      return Array.isArray(parsed) ? (parsed as ParsedPlan) : null;
    }
    return Array.isArray(blocks) ? (blocks as ParsedPlan) : null;
  } catch {
    return null;
  }
}

export function hasPrimaryActivityLink(workout: PlanWorkout): boolean {
  return Boolean(workout.links?.some((l) => l.role === "PRIMARY"));
}

/** PLANNED / IN_PROGRESS 且未关联 PRIMARY 活动：可推迟或跳过。 */
export function canMutatePlanWorkoutSchedule(workout: PlanWorkout): boolean {
  return (
    isWorkoutPlannedOrInProgress(workout.status) &&
    !hasPrimaryActivityLink(workout)
  );
}

export function planSportToChartSport(
  sport: PlanSportType | string | null | undefined,
): WorkoutExpressionSportType {
  const s = String(sport ?? "RUN").toUpperCase();
  if (s === "CYCLING") return "CYCLING";
  if (s === "SWIM") return "SWIM";
  return "RUN";
}

export function buildWorkoutListTitle(t: TranslateFn, workout: PlanWorkout) {
  const fromName = workout.name?.trim();
  if (fromName) return fromName;
  const idx = Math.max(1, workout.sessionIndex ?? 1);
  const sportLabel = formatSportTypeLabel(t, workout.sportType);
  if (sportLabel) {
    return t("weekBreakdown.sessionMeta", {
      index: idx,
      sportType: sportLabel,
    });
  }
  return t("weekBreakdown.sessionOnly", { index: idx });
}

export function buildWorkoutListNotes(workout: PlanWorkout) {
  return String(workout.notes ?? "").trim();
}

export function getPlanStatusLabel(t: TranslateFn, status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return t("status.active");
    case "SCHEDULED":
      return t("status.scheduled");
    case "PAUSED":
      return t("status.paused");
    case "COMPLETED":
      return t("status.completed");
    case "CANCELLED":
      return t("status.cancelled");
    case "SUPERSEDED":
      return t("status.superseded");
    default:
      return t("status.draft");
  }
}

export function getPlanStatusClass(status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200";
    case "SCHEDULED":
      return "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200";
    case "PAUSED":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200";
    case "COMPLETED":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200";
    case "SUPERSEDED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** 计划复盘等负荷数字：一位小数，避免 36.539899999999996 这类浮点噪声。 */
export function formatPlanLoadDisplay(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 周计划课次卡片：左侧色条 + 浅底，对齐锁定的状态词汇。 */
export function getWeekWorkoutCardChrome(kind: PlanWorkoutDisplayKind): string {
  if (kind === "done") {
    return "border-l-2 border-[hsl(var(--emerald-500)/0.7)] bg-[hsl(var(--emerald-50)/0.8)] hover:bg-[hsl(var(--emerald-100)/0.8)] dark:border-[hsl(var(--emerald-400)/0.5)] dark:bg-[hsl(var(--emerald-500)/0.1)] dark:hover:bg-[hsl(var(--emerald-500)/0.15)]";
  }
  if (kind === "incomplete") {
    return "border-l-2 border-[hsl(var(--amber-500)/0.75)] bg-[hsl(var(--amber-100)/0.55)] hover:bg-[hsl(var(--amber-100)/0.8)] dark:border-[hsl(var(--amber-400)/0.55)] dark:bg-[hsl(var(--amber-500)/0.12)] dark:hover:bg-[hsl(var(--amber-500)/0.18)]";
  }
  if (kind === "inProgress") {
    return "border-l-2 border-[hsl(var(--sky-400)/0.7)] bg-[hsl(var(--sky-50)/0.8)] hover:bg-[hsl(var(--sky-100)/0.8)] dark:border-[hsl(var(--sky-400)/0.5)] dark:bg-[hsl(var(--sky-500)/0.1)] dark:hover:bg-[hsl(var(--sky-500)/0.15)]";
  }
  if (kind === "moved") {
    return "relative overflow-hidden border border-[hsl(var(--violet-300)/0.3)] bg-[hsl(var(--violet-50)/0.22)] opacity-[0.58] hover:bg-[hsl(var(--violet-50)/0.38)] dark:border-[hsl(var(--violet-400)/0.2)] dark:bg-[hsl(var(--violet-500)/0.04)] dark:hover:bg-[hsl(var(--violet-500)/0.07)]";
  }
  if (kind === "skipped") {
    return "border-l-2 border-neutral-300/50 bg-neutral-100/45 opacity-[0.72] hover:bg-neutral-100/70 dark:border-neutral-700/50 dark:bg-muted/20 dark:hover:bg-muted/30";
  }
  return "border-l-2 border-border/80 bg-neutral-100 hover:bg-neutral-200 dark:border-border dark:bg-muted/45 dark:hover:bg-muted";
}

export function getWeekWorkoutStatusLabelClass(
  kind: PlanWorkoutDisplayKind,
): string {
  if (kind === "done") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (kind === "incomplete") {
    return "text-[hsl(var(--amber-800))] dark:text-[hsl(var(--amber-200))]";
  }
  if (kind === "inProgress") {
    return "text-[hsl(var(--sky-700))] dark:text-[hsl(var(--sky-300))]";
  }
  return "text-muted-foreground";
}

export function getPlanWorkoutDisplayKind(
  workout: Pick<PlanWorkout, "status" | "scheduledDate">,
  today = dayjs().startOf("day"),
): PlanWorkoutDisplayKind {
  if (workout.status === "DONE") return "done";
  if (workout.status === "SKIPPED") return "skipped";
  if (workout.status === "MOVED") return "moved";
  if (workout.status === "IN_PROGRESS") return "inProgress";
  const scheduled = workout.scheduledDate
    ? dayjs(workout.scheduledDate).startOf("day")
    : null;
  if (scheduled && scheduled.isBefore(today)) return "incomplete";
  return "upcoming";
}

export function rollupPlanDetailExecution(
  plan: TrainingPlanDetail,
  today = dayjs().startOf("day"),
) {
  const counts = {
    incomplete: 0,
    upcoming: 0,
    inProgress: 0,
    done: 0,
    skipped: 0,
    moved: 0,
  };
  for (const workout of plan.workouts) {
    const date = getWorkoutDate(plan, workout);
    const kind = getPlanWorkoutDisplayKind(
      {
        status: workout.status,
        scheduledDate: date?.format("YYYY-MM-DD") ?? workout.scheduledDate,
      },
      today,
    );
    counts[kind] += 1;
  }
  return counts;
}

export function getWorkoutDate(plan: TrainingPlanDetail, workout: PlanWorkout) {
  if (workout.scheduledDate) {
    return dayjs(workout.scheduledDate).startOf("day");
  }
  if (!plan.startDate) {
    return null;
  }

  const offsetDays =
    typeof workout.dayOffset === "number"
      ? workout.dayOffset
      : (workout.weekIndex - 1) * 7 + (workout.dayIndex - 1);

  return dayjs(plan.startDate).startOf("day").add(offsetDays, "day");
}

export function getPlanWorkoutStatusLabel(
  t: TranslateFn,
  kind: PlanWorkoutDisplayKind,
) {
  switch (kind) {
    case "done":
      return t("workoutStatus.done");
    case "inProgress":
      return t("workoutStatus.inProgress");
    case "skipped":
      return t("workoutStatus.skipped");
    case "moved":
      return t("workoutStatus.moved");
    case "incomplete":
      return t("workoutStatus.incomplete");
    default:
      return t("workoutStatus.upcoming");
  }
}

export function getPlanWorkoutMovedByLabel(
  t: TranslateFn,
  movedBy: PlanWorkout["movedBy"],
) {
  if (movedBy === "COACH") return t("movedBy.coach");
  if (movedBy === "USER") return t("movedBy.user");
  return null;
}

export function toDerivedWorkout(
  t: TranslateFn,
  plan: TrainingPlanDetail,
  workout: PlanWorkout,
): DerivedWorkout {
  const date = getWorkoutDate(plan, workout);
  const displayKind = getPlanWorkoutDisplayKind({
    status: workout.status,
    scheduledDate: date?.format("YYYY-MM-DD") ?? workout.scheduledDate,
  });

  return {
    ...workout,
    planId: workout.planId ?? plan.id,
    dateKey: date?.format("YYYY-MM-DD") ?? null,
    dateLabel: date?.format("M/D") ?? t("workout.unscheduled"),
    dayLabel: getWeekdayLabel(t, workout.dayIndex ?? 1),
    title: buildWorkoutListTitle(t, workout),
    description: buildWorkoutListNotes(workout),
    displayKind,
    statusLabel: getPlanWorkoutStatusLabel(t, displayKind),
  };
}

export function buildWeekGroups(
  t: TranslateFn,
  plan: TrainingPlanDetail,
): WeekGroup[] {
  return Array.from(
    { length: Math.max(1, plan.periodWeeks || 1) },
    (_, weekOffset) => {
      const weekIndex = weekOffset + 1;
      const workouts = plan.workouts
        .filter((item) => item.weekIndex === weekIndex)
        .map((item) => toDerivedWorkout(t, plan, item));

      const days = Array.from({ length: 7 }, (_, dayOffset) => {
        const dayIndex = dayOffset + 1;
        const dayWorkouts = workouts
          .filter((item) => item.dayIndex === dayIndex)
          .sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
        const firstWorkout = dayWorkouts[0];
        const fallbackDate =
          plan.startDate != null
            ? dayjs(plan.startDate)
                .startOf("day")
                .add((weekIndex - 1) * 7 + dayOffset, "day")
            : null;

        return {
          dayIndex,
          dayLabel: getWeekdayLabel(t, dayIndex),
          dateLabel:
            firstWorkout?.dateLabel ?? fallbackDate?.format("M/D") ?? "",
          dateKey:
            firstWorkout?.dateKey ?? fallbackDate?.format("YYYY-MM-DD") ?? null,
          workouts: dayWorkouts,
        };
      });

      return {
        weekIndex,
        days,
      };
    },
  );
}

export function getLifecycleDescription(t: TranslateFn, status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return t("lifecycle.description.active");
    case "SCHEDULED":
      return t("lifecycle.description.scheduled");
    case "PAUSED":
      return t("lifecycle.description.paused");
    case "COMPLETED":
      return t("lifecycle.description.completed");
    case "CANCELLED":
      return t("lifecycle.description.cancelled");
    case "SUPERSEDED":
      return t("lifecycle.description.superseded");
    default:
      return t("lifecycle.description.draft");
  }
}

export function getLifecycleDialogCopy(
  t: TranslateFn,
  action: PlanLifecycleAction,
) {
  return {
    title: t(`lifecycle.confirm.${action}.title`),
    description: t(`lifecycle.confirm.${action}.description`),
    cancel: t("lifecycle.confirm.dismiss"),
    confirm: t(`lifecycle.confirm.${action}.confirm`),
  };
}
