"use client";

import dayjs from "dayjs";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Layers3,
  MessageCircle,
  MoreHorizontal,
  Mountain,
  Plus,
  Sparkles,
  StopCircle,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { getSportDisplayName, useSportCatalog } from "@/api/sports";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateActivePlanAndPlanDetails } from "@/lib/query-invalidation";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { useActivePlan } from "@/api/usePlans";
import { useDeletePlan, useCompletePlan } from "@/api/usePlanMutations";
import {
  isWorkoutPlannedOrInProgress,
  type PlanWorkout,
  type TrainingPlanDetail,
} from "@/api/plans";
import type { SportType } from "@/api/activities";
import type { ParsedPlan } from "@/api/workout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PlanWorkoutActivityLinkControl } from "@/components/plan/plan-workout-activity-link-control";
import { PlanExecutionAdviceCard } from "@/components/plan/PlanExecutionAdviceCard";
import { AccessGuardedLink } from "@deployment/managed-ui";
import {
  PlanWorkoutListRow,
  planWorkoutRowSport,
} from "@/components/plan/plan-workout-list-row";
import { useLocale, useTranslations } from "next-intl";
import { usePlanWorkoutActions } from "@/hooks/usePlanWorkoutActions";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { cn } from "@/lib/utils";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";
import { PlanPageSkeleton } from "./plan-page-skeleton";
import { CompetitionPlanImpactCard } from "@/components/competition/competition-plan-impact-card";
import { MobilePlanNavigation } from "@/components/mobile-app/components/MobilePlanNavigation";
import {
  MobilePlanWorkoutRow,
  WorkoutMiniChart,
} from "@/components/plan/mobile-plan-workout-row";
import { getPlanFocusWorkouts } from "@/components/plan/mobile-plan-load-model";
import { MobilePlanDetailSheet } from "@/components/plan/mobile-plan-detail";
import { WorkoutActionConfirm } from "@/components/plan/workout-action-confirm";
import { summarizePlanCycleProgress } from "@/components/plan/plan-cycle-progress-model";
import {
  buildWorkoutListNotes,
  buildWorkoutListTitle,
  canMutatePlanWorkoutSchedule,
  getPlanWorkoutDisplayKind,
  getPlanWorkoutMovedByLabel,
  getPlanWorkoutStatusLabel,
  hasPrimaryActivityLink,
  type PlanWorkoutDisplayKind,
} from "@/components/plan/detail/plan-detail-utils";

const PlanCreateLauncher = dynamic(
  () =>
    import("@/components/plan/plan-create-launcher").then(
      (module) => module.PlanCreateLauncher,
    ),
  { ssr: false },
);

const ViewWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/view-workout-dialog").then(
      (module) => module.ViewWorkoutDialog,
    ),
  { ssr: false },
);

const PlanWeekLoadChart = dynamic(
  () =>
    import("@/components/plan/plan-week-load-chart").then(
      (module) => module.PlanWeekLoadChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 animate-pulse bg-background/60" aria-hidden />
    ),
  },
);

const PlanCycleProgressChart = dynamic(
  () =>
    import("@/components/plan/plan-cycle-progress-chart").then(
      (module) => module.PlanCycleProgressChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 animate-pulse bg-background/60" aria-hidden />
    ),
  },
);

type TranslateFn = ReturnType<typeof useTranslations>;

function getWeekdayLabel(t: TranslateFn, dayIndex: number) {
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return t(`weekday.${keys[Math.max(0, dayIndex - 1)] ?? "mon"}`);
}

function getWeekdayLabelFromDate(t: TranslateFn, date: dayjs.Dayjs) {
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return t(`weekday.${keys[date.day()]}`);
}

type ManageAction = "complete" | "delete" | null;
type PostponeAction =
  | { type: "today" }
  | { type: "single"; workout: DerivedWorkout }
  | null;

type DerivedWorkout = Omit<PlanWorkout, "planId"> & {
  planId: string;
  scheduledDateKey: string | null;
  uiWeekIndex: number;
  uiDayIndex: number;
  dayLabel: string;
  dateLabel: string;
  sport: "run" | "bike" | "swim" | "other";
  statusLabel: string;
  displayKind: PlanWorkoutDisplayKind;
  isToday: boolean;
  isOverdue: boolean;
};

/** PRIMARY 关联活动上的实际负荷（与复盘 / PMC 同源口径） */
function primaryActualLoadFromWorkout(workout: PlanWorkout): number {
  const primary = workout.links?.find((l) => l.role === "PRIMARY");
  const v = primary?.actualLoad;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

type WeekSummary = {
  week: number;
  workoutCount: number;
  completedCount: number;
  missedCount: number;
  skippedCount: number;
  movedCount: number;
  pendingCount: number;
  state: "done" | "current" | "next";
};

type DaySummary = {
  dayIndex: number;
  dayLabel: string;
  dateLabel: string;
  workoutCount: number;
  completedCount: number;
  /** 当日已完成课次 PRIMARY 实际负荷之和 */
  actualLoadSum: number;
  /** 当日所有排期课次的 estimatedLoad 之和（与周条「计划」口径一致） */
  estimatedLoadSum: number;
  isToday: boolean;
  workouts: DerivedWorkout[];
};

function parsePlanBlocks(planWorkout?: PlanWorkout) {
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

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-background pc:rounded-none pc:bg-transparent ",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  title,
  action,
  actionHref,
}: {
  title: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action && actionHref ? (
        <Link
          href={actionHref}
          className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return <PlanPageSkeleton />;
}

function normalizeSport(workout: PlanWorkout): DerivedWorkout["sport"] {
  return planWorkoutRowSport(workout.sportType);
}

function detectIndexOffsets(plan: TrainingPlanDetail): {
  weekOffset: 0 | 1;
  dayOffset: 0 | 1;
} {
  const weekValues = plan.workouts
    .map((w) => w.weekIndex)
    .filter((v): v is number => Number.isFinite(v));
  const dayValues = plan.workouts
    .map((w) => w.dayIndex)
    .filter((v): v is number => Number.isFinite(v));

  const weekOffset: 0 | 1 = weekValues.some((v) => v <= 0) ? 1 : 0;
  const dayOffset: 0 | 1 = dayValues.some((v) => v <= 0) ? 1 : 0;
  return { weekOffset, dayOffset };
}

function toUiWeekIndex(rawWeekIndex: number, weekOffset: 0 | 1): number {
  return Math.max(1, rawWeekIndex + weekOffset);
}

function toUiDayIndex(rawDayIndex: number, dayOffset: 0 | 1): number {
  return Math.min(7, Math.max(1, rawDayIndex + dayOffset));
}

function getUiWeekDay(
  workout: PlanWorkout,
  offsets: { weekOffset: 0 | 1; dayOffset: 0 | 1 },
) {
  if (
    typeof workout.dayOffset === "number" &&
    Number.isFinite(workout.dayOffset)
  ) {
    const d = Math.max(0, Math.floor(workout.dayOffset));
    return {
      uiWeekIndex: Math.floor(d / 7) + 1,
      uiDayIndex: (d % 7) + 1,
    };
  }
  return {
    uiWeekIndex: toUiWeekIndex(workout.weekIndex, offsets.weekOffset),
    uiDayIndex: toUiDayIndex(workout.dayIndex, offsets.dayOffset),
  };
}

function getWorkoutDate(
  plan: TrainingPlanDetail,
  workout: PlanWorkout,
  options: { weekOffset: 0 | 1; dayOffset: 0 | 1 },
) {
  if (workout.scheduledDate) {
    return dayjs(workout.scheduledDate).startOf("day");
  }
  if (!plan.startDate) {
    return null;
  }

  // dayOffset 是服务端真值；若缺失再回退 week/day 推导。
  const offsetDays =
    typeof workout.dayOffset === "number" && Number.isFinite(workout.dayOffset)
      ? Math.max(0, Math.floor(workout.dayOffset))
      : (() => {
          const { uiWeekIndex: uiWeek, uiDayIndex: uiDay } = getUiWeekDay(
            workout,
            options,
          );
          return (uiWeek - 1) * 7 + (uiDay - 1);
        })();

  return dayjs(plan.startDate).startOf("day").add(offsetDays, "day");
}

function toDerivedWorkout(
  t: TranslateFn,
  plan: TrainingPlanDetail,
  workout: PlanWorkout,
  offsets: { weekOffset: 0 | 1; dayOffset: 0 | 1 },
): DerivedWorkout {
  const date = getWorkoutDate(plan, workout, offsets);
  const dateKey = date?.format("YYYY-MM-DD") ?? null;
  const isToday = Boolean(date && date.isSame(dayjs(), "day"));
  const displayKind = getPlanWorkoutDisplayKind({
    status: workout.status,
    scheduledDate: dateKey,
  });
  const isOverdue = displayKind === "incomplete";
  const { uiWeekIndex, uiDayIndex } = getUiWeekDay(workout, offsets);
  const dayLabel = date
    ? getWeekdayLabelFromDate(t, date)
    : getWeekdayLabel(t, uiDayIndex);

  return {
    ...workout,
    planId: workout.planId ?? plan.id,
    scheduledDateKey: dateKey,
    uiWeekIndex,
    uiDayIndex,
    dayLabel,
    dateLabel: date ? date.format("M/D") : t("workout.unscheduled"),
    sport: normalizeSport(workout),
    displayKind,
    statusLabel: getPlanWorkoutStatusLabel(t, displayKind),
    isToday,
    isOverdue,
  };
}

function buildWeekSummaries(
  plan: TrainingPlanDetail,
  currentWeekIndex: number,
  currentDayIndex: number | null,
  offsets: { weekOffset: 0 | 1; dayOffset: 0 | 1 },
) {
  const summaries: WeekSummary[] = [];
  const todayKey = dayjs().format("YYYY-MM-DD");

  for (let week = 1; week <= Math.max(1, plan.periodWeeks || 1); week += 1) {
    const workouts = plan.workouts.filter(
      (item) => getUiWeekDay(item, offsets).uiWeekIndex === week,
    );
    const state =
      week < currentWeekIndex
        ? "done"
        : week === currentWeekIndex
          ? "current"
          : "next";
    const counts = summarizePlanCycleProgress(
      workouts.map((workout) => ({
        status: workout.status,
        dateKey:
          getWorkoutDate(plan, workout, offsets)?.format("YYYY-MM-DD") ?? null,
        dayIndex: getUiWeekDay(workout, offsets).uiDayIndex,
      })),
      {
        phase:
          state === "done"
            ? "past"
            : state === "current"
              ? "current"
              : "future",
        todayKey,
        currentDayIndex,
      },
    );

    summaries.push({
      week,
      workoutCount: workouts.length,
      completedCount: counts.completed,
      missedCount: counts.missed,
      skippedCount: counts.skipped,
      movedCount: counts.moved,
      pendingCount: counts.pending,
      state,
    });
  }

  return summaries;
}

function buildCurrentWeekDays(args: {
  t: TranslateFn;
  plan: TrainingPlanDetail;
  currentWeekIndex: number;
  offsets: { weekOffset: 0 | 1; dayOffset: 0 | 1 };
}) {
  const { t, plan, currentWeekIndex, offsets } = args;
  const derived = plan.workouts
    .filter(
      (item) => getUiWeekDay(item, offsets).uiWeekIndex === currentWeekIndex,
    )
    .map((item) => toDerivedWorkout(t, plan, item, offsets));

  return Array.from({ length: 7 }, (_, index) => {
    const dayIndex = index + 1;
    const workouts = derived
      .filter((item) => item.uiDayIndex === dayIndex)
      .sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));

    const fallbackDate =
      plan.startDate == null
        ? null
        : dayjs(plan.startDate)
            .startOf("day")
            .add((currentWeekIndex - 1) * 7 + index, "day");
    const firstWorkoutDate = workouts[0]?.scheduledDateKey
      ? dayjs(workouts[0].scheduledDateKey)
      : null;
    const displayDate = firstWorkoutDate ?? fallbackDate;
    const dateLabel = displayDate
      ? displayDate.format("M/D")
      : t("workout.unscheduled");
    const dayLabel = displayDate
      ? getWeekdayLabelFromDate(t, displayDate)
      : getWeekdayLabel(t, dayIndex);

    const actualLoadSum = workouts
      .filter((item) => item.status === "DONE")
      .reduce((sum, item) => sum + primaryActualLoadFromWorkout(item), 0);

    const estimatedLoadSum = workouts.reduce((sum, item) => {
      const v = item.estimatedLoad;
      return (
        sum + (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0)
      );
    }, 0);

    return {
      dayIndex,
      dayLabel,
      dateLabel,
      workoutCount: workouts.length,
      completedCount: workouts.filter((item) => item.status === "DONE").length,
      actualLoadSum,
      estimatedLoadSum,
      isToday: workouts.some((item) => item.isToday),
      workouts,
    } satisfies DaySummary;
  });
}

function describePlanStatus(t: TranslateFn, plan: TrainingPlanDetail) {
  switch (plan.status) {
    case "ACTIVE":
      return t("status.active");
    case "PAUSED":
      return t("status.paused");
    case "COMPLETED":
      return t("status.completed");
    case "CANCELLED":
      return t("status.cancelled");
    default:
      return t("status.draft");
  }
}

const emptyPlanActionClassName =
  "group flex h-full w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-surface bg-neutral-100 px-3 py-2.5 text-left font-normal text-foreground shadow-none transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-muted/45 dark:hover:bg-muted";

function EmptyPlanActionContent({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <>
      <span className="flex w-full items-center justify-between gap-2">
        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground/90" />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/90" />
      </span>
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-mobile-caption font-normal leading-5 text-muted-foreground pc:text-xs">
        {description}
      </span>
    </>
  );
}

function EmptyActivePlan({ t }: { t: TranslateFn }) {
  return (
    <>
      <div className="flex min-h-[520px] w-full items-center justify-center px-5 py-16 pc:hidden">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CalendarDays className="h-[21px] w-[21px]" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            {t("empty.title")}
          </h1>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            {t("empty.description")}
          </p>
          <PlanCreateLauncher
            size="touch"
            className="mt-5 min-w-28 bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            {t("empty.createPlan")}
          </PlanCreateLauncher>
        </div>
      </div>

      <div className="mx-auto hidden w-full max-w-6xl flex-col gap-3 pb-2 pc:flex">
        <header className="px-1 py-1">
          <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
            <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{t("header.title")}</span>
            </div>
            <h1 className="mt-2 text-base font-semibold tracking-normal text-foreground">
              {t("empty.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
              {t("empty.description")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PlanCreateLauncher
                variant="default"
                size="sm"
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                <Plus className="h-4 w-4" />
                {t("empty.createPlan")}
              </PlanCreateLauncher>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="bg-background text-muted-foreground dark:bg-black/20"
              >
                <Link href="/plans">
                  <Layers3 className="h-4 w-4" />
                  {t("empty.viewHistory")}
                </Link>
              </Button>
            </div>
          </section>
        </header>

        <div
          className={cn(
            "flex flex-col gap-2 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start pc:gap-3",
            "pc:[grid-template-areas:'main_aside']",
          )}
        >
          <aside className="order-1 min-w-0 pc:order-none pc:[grid-area:aside]">
            <Panel className="space-y-3">
              <SectionTitle title={t("empty.includesTitle")} />
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-surface bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                  {t("empty.includes.structure")}
                </div>
                <div className="rounded-surface bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                  {t("empty.includes.daily")}
                </div>
                <div className="rounded-surface bg-neutral-100 px-3 py-2 dark:bg-muted/45">
                  {t("empty.includes.review")}
                </div>
              </div>
            </Panel>
          </aside>

          <main
            className={cn(
              "order-2 flex min-w-0 flex-col gap-2 pc:gap-3 pc:order-none",
              "pc:[grid-area:main] pc:min-h-0",
            )}
          >
            <Panel className="space-y-3">
              <SectionTitle title={t("empty.nextSteps.title")} />
              <div className="grid gap-3 sm:grid-cols-3">
                <PlanCreateLauncher
                  mode="ai"
                  className={emptyPlanActionClassName}
                >
                  <EmptyPlanActionContent
                    icon={Sparkles}
                    title={t("empty.nextSteps.aiTitle")}
                    description={t("empty.nextSteps.aiDescription")}
                  />
                </PlanCreateLauncher>
                <Link href="/plans" className={emptyPlanActionClassName}>
                  <EmptyPlanActionContent
                    icon={Layers3}
                    title={t("empty.nextSteps.historyTitle")}
                    description={t("empty.nextSteps.historyDescription")}
                  />
                </Link>
                <AccessGuardedLink
                  href="/ai-coach"
                  className={emptyPlanActionClassName}
                >
                  <EmptyPlanActionContent
                    icon={MessageCircle}
                    title={t("empty.nextSteps.coachTitle")}
                    description={t("empty.nextSteps.coachDescription")}
                  />
                </AccessGuardedLink>
              </div>
            </Panel>
          </main>
        </div>
      </div>
    </>
  );
}

/** 周期进度 */
function WeekStrip({
  weeks,
  selectedWeek,
  onSelectWeek,
  planHref,
  t,
}: {
  weeks: WeekSummary[];
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  planHref?: string;
  t: TranslateFn;
}) {
  const currentWeek =
    weeks.find((week) => week.state === "current") ?? weeks[0];
  return (
    <Panel>
      <PlanCycleProgressChart
        ariaLabel={t("weekStrip.title")}
        action={
          planHref ? (
            <Link
              href={planHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("weekStrip.action")}
              <ArrowRight className="size-3.5" />
            </Link>
          ) : undefined
        }
        currentKey={String(currentWeek?.week ?? selectedWeek)}
        selectedKey={String(selectedWeek)}
        onPointSelect={(key) => onSelectWeek(Number(key))}
        labels={{
          completed: t("workout.status.done"),
          missed: t("workout.status.overdue"),
          skipped: t("workout.status.skipped"),
          moved: t("workout.status.moved"),
          pending: t("workout.status.planned"),
        }}
        data={weeks.map((week) => ({
          key: t("weekLoad.currentWeek", { week: week.week }),
          label: t("weekLoad.currentWeek", { week: week.week }),
          selectionKey: String(week.week),
          completed: week.completedCount || undefined,
          missed: week.missedCount || undefined,
          skipped: week.skippedCount || undefined,
          moved: week.movedCount || undefined,
          pending: week.pendingCount || undefined,
        }))}
      />
    </Panel>
  );
}

/** 本周负荷 */
function WeekLoadMap({
  currentWeekIndex,
  days,
}: {
  currentWeekIndex: number;
  days: DaySummary[];
}) {
  return (
    <Panel>
      <PlanWeekLoadChart
        week={currentWeekIndex}
        plannedSessions={days.reduce((sum, day) => sum + day.workoutCount, 0)}
        data={days.map((day) => ({
          key: `${day.dayLabel} · ${day.dateLabel}`,
          label: day.dayLabel,
          actual: day.actualLoadSum,
          planned: day.estimatedLoadSum,
        }))}
      />
    </Panel>
  );
}

// 本周训练列表
function WorkoutList({
  workouts,
  t,
  onOpenWorkout,
  onPostponeWorkout,
  onSkipWorkout,
  pendingWorkoutId,
}: {
  workouts: DerivedWorkout[];
  t: TranslateFn;
  onOpenWorkout: (workout: DerivedWorkout) => void;
  onPostponeWorkout: (workout: DerivedWorkout) => Promise<void>;
  onSkipWorkout: (workout: DerivedWorkout) => Promise<void>;
  pendingWorkoutId: string | null;
}) {
  const tSports = useTranslations("SportCatalog");
  const detailT = useTranslations("V2PlanDetailPage");
  const tActivities = useTranslations("activities");
  const tLoad = useTranslations("V2PlanDetailPage.mobile.loadChart");
  const { data: sportCatalog = [] } = useSportCatalog();
  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle title={t("workout.title")} />
      <div className="space-y-1.5">
        {workouts.length === 0 ? (
          <div className="rounded-surface border border-dashed border-border/70 bg-neutral-100 px-4 py-6 text-sm text-muted-foreground dark:bg-muted/45">
            {t("workout.empty")}
          </div>
        ) : (
          workouts.map((workout) => {
            const canMutate = canMutatePlanWorkoutSchedule(workout);
            const postponing = pendingWorkoutId === workout.id;
            const isGhost = workout.displayKind === "moved";
            const movedByLabel = getPlanWorkoutMovedByLabel(t, workout.movedBy);
            const title = buildWorkoutListTitle(detailT, workout);
            const notes = buildWorkoutListNotes(workout);
            const subtitle = notes && notes !== title ? notes : null;
            const duration = formatWorkoutDuration(
              workout.summary.durationSeconds,
            );
            const meta = [
              getSportDisplayName(sportCatalog, workout, tSports),
              duration !== "--" ? duration : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <PlanWorkoutListRow
                key={workout.id}
                dateLabel={workout.dateLabel}
                dayLabel={workout.dayLabel}
                displayKind={workout.displayKind}
                onOpen={() => onOpenWorkout(workout)}
                sessionLabel={
                  workout.sessionIndex > 1
                    ? t("workout.session", { index: workout.sessionIndex })
                    : undefined
                }
                statusLabel={workout.statusLabel}
                subtitle={subtitle}
                title={title}
                meta={meta}
                chart={<WorkoutMiniChart workout={workout} />}
                metrics={[
                  { label: tActivities("distance"), value: "—" },
                  {
                    label: tActivities("duration"),
                    value: duration !== "--" ? duration : "—",
                  },
                  {
                    label: tLoad("plannedLoad"),
                    value:
                      workout.estimatedLoad != null
                        ? String(Math.round(workout.estimatedLoad))
                        : "—",
                  },
                ]}
                footerLeading={
                  <>
                    {isGhost ? (
                      movedByLabel ? (
                        <span className="inline-flex rounded-compact bg-background/70 px-1.5 py-0.5 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-black/20">
                          {movedByLabel}
                        </span>
                      ) : null
                    ) : (
                      <div className="pointer-events-auto inline-flex max-w-full">
                        <PlanWorkoutActivityLinkControl
                          workoutId={workout.id}
                          sportType={workout.sportType}
                          scheduledDateKey={workout.scheduledDateKey}
                          links={workout.links}
                          compact
                        />
                      </div>
                    )}
                  </>
                }
                footerActions={
                  <>
                    {canMutate ? (
                      <button
                        type="button"
                        disabled={postponing}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onPostponeWorkout(workout);
                        }}
                        className="pointer-events-auto rounded-compact bg-background/35 px-1.5 py-0.5 text-mobile-caption pc:text-[11px] text-muted-foreground/65 transition-colors hover:bg-background/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/10 dark:hover:bg-muted/60"
                      >
                        {postponing
                          ? t("actions.pending")
                          : t("actions.postpone")}
                      </button>
                    ) : null}
                    {canMutate ? (
                      <button
                        type="button"
                        disabled={postponing}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onSkipWorkout(workout);
                        }}
                        className="pointer-events-auto rounded-compact bg-background/35 px-1.5 py-0.5 text-mobile-caption pc:text-[11px] text-destructive/55 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/10"
                      >
                        {t("actions.skip")}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
          })
        )}
      </div>
    </Panel>
  );
}

// 侧边栏 今日训练模块
function TodayWorkout({
  workout,
  plan,
  planHref,
  onOpenWorkout,
  t,
}: {
  workout?: DerivedWorkout;
  plan: TrainingPlanDetail;
  planHref?: string;
  onOpenWorkout: (workout: DerivedWorkout) => void;
  t: TranslateFn;
}) {
  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle
        title={t("today.title")}
        action={planHref ? t("today.viewTodayPlan") : undefined}
        actionHref={planHref}
      />
      {workout ? (
        <MobilePlanWorkoutRow
          plan={plan}
          workout={workout}
          showDateBlock={false}
          emptyTitle={t("today.empty")}
          emptyDetail={t("today.empty")}
          onClick={() => onOpenWorkout(workout)}
        />
      ) : (
        <div className="rounded-surface bg-neutral-100 px-4 py-6 text-sm text-muted-foreground dark:bg-muted/45">
          {t("today.empty")}
        </div>
      )}
    </Panel>
  );
}

/**
 * 周目标
 * @param totalSessions 总课次
 * @param completedSessions 已完成课次
 * @param currentDayIndex 当前天数
 * @param t 翻译函数
 * @returns
 */
function WeekGoal({
  totalSessions,
  completedSessions,
  currentDayIndex,
  t,
}: {
  totalSessions: number;
  completedSessions: number;
  currentDayIndex: number | null;
  t: TranslateFn;
}) {
  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle title={t("goal.title")} />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Target className="h-4 w-4" />
          {t("goal.weekSessions")}
        </span>
        <span className="font-semibold">{totalSessions}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {t("goal.completed")}
        </span>
        <span className="font-semibold">{completedSessions}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Mountain className="h-4 w-4" />
          {t("goal.progressTo")}
        </span>
        <span className="font-semibold">
          {currentDayIndex
            ? t("goal.dayNumber", { day: currentDayIndex })
            : t("goal.notStarted")}
        </span>
      </div>
    </Panel>
  );
}

function CoachSuggestion({
  plan,
  remainingWeeks,
  completedSessions,
  totalSessions,
  currentWorkout,
  mobile = false,
  t,
}: {
  plan: TrainingPlanDetail;
  remainingWeeks: number;
  completedSessions: number;
  totalSessions: number;
  currentWorkout?: PlanWorkout | null;
  mobile?: boolean;
  t: TranslateFn;
}) {
  const fallbackSummary = t("coach.description", {
    status: describePlanStatus(t, plan),
    completed: completedSessions,
    total: totalSessions,
    remainingWeeks: Math.max(0, remainingWeeks),
  });
  const coachParams = new URLSearchParams({
    intent: "plan-followup",
    source: "plan",
    openReason: "plan_followup",
    planId: plan.id,
  });

  return (
    <PlanExecutionAdviceCard
      title={t("coach.title")}
      askLabel={t("coach.ask")}
      askHref={`/ai-coach?${coachParams.toString()}`}
      surface="PLAN_SIDEBAR"
      planId={plan.id}
      fallbackSummary={fallbackSummary}
      fallbackTags={[describePlanStatus(t, plan)]}
      className={mobile ? "" : "space-y-3"}
      mobilePlanPresentation={{
        planTitle: plan.title,
        metrics: [
          {
            label: t("header.currentCycle"),
            value: `${plan.currentWeekIndex ?? 1}/${plan.periodWeeks}`,
          },
          {
            label: t("weekLoad.title"),
            value:
              typeof currentWorkout?.estimatedLoad === "number"
                ? String(Math.round(currentWorkout.estimatedLoad))
                : "--",
          },
          {
            label: t("goal.completed"),
            value: `${completedSessions}/${totalSessions}`,
          },
        ],
      }}
    />
  );
}

function MobileTodayWorkout({
  onOpenPlan,
  onOpenWorkout,
  plan,
  t,
  workout,
}: {
  onOpenPlan: () => void;
  onOpenWorkout: (workout: PlanWorkout) => void;
  plan: TrainingPlanDetail;
  t: TranslateFn;
  workout: PlanWorkout | null;
}) {
  const tMobile = useTranslations("V2PlanDetailPage.mobile");

  return (
    <section className="space-y-2 pc:hidden">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t("today.title")}
        </h2>
        <button
          type="button"
          onClick={onOpenPlan}
          className="min-h-9 px-1 text-mobile-caption font-semibold text-emerald-600 active:opacity-70 dark:text-emerald-400 pc:text-xs"
        >
          {t("today.viewTodayPlan")}
        </button>
      </div>
      <MobilePlanWorkoutRow
        plan={plan}
        workout={workout}
        showDateBlock={false}
        emptyTitle={tMobile("restDay")}
        emptyDetail={tMobile("noPlannedWorkout")}
        onClick={onOpenWorkout}
      />
    </section>
  );
}

export default function V2PlanPage() {
  const t = useTranslations("V2PlanPage");
  const tWorkoutDialog = useTranslations("ViewWorkoutDialog.mobile");
  const locale = useLocale();
  useSetPageTitle(t("header.title"));
  const [manageAction, setManageAction] = useState<ManageAction>(null);
  const { active, isLoading } = useActivePlan(true);
  const { mutateAsync: completeAsync, isPending: completing } =
    useCompletePlan();
  const { mutateAsync: deleteAsync, isPending: deleting } = useDeletePlan();
  const queryClient = useQueryClient();
  const {
    pendingWorkoutId: postponingWorkoutId,
    postponeWorkout: runPostponeWorkout,
    skipWorkout: runSkipWorkout,
  } = usePlanWorkoutActions();
  const [postponingToday, setPostponingToday] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<DerivedWorkout | null>(
    null,
  );
  const [postponeAction, setPostponeAction] = useState<PostponeAction>(null);
  const [skipTarget, setSkipTarget] = useState<DerivedWorkout | null>(null);
  const [mobilePlanDetailOpen, setMobilePlanDetailOpen] = useState(false);

  const plan = active?.plan ?? null;
  const offsets = useMemo(
    () =>
      plan
        ? detectIndexOffsets(plan)
        : { weekOffset: 0 as const, dayOffset: 0 as const },
    [plan],
  );
  const currentWeekIndex =
    active?.currentWeekIndex ?? plan?.currentWeekIndex ?? 1;
  const currentDayIndex =
    active?.currentDayIndex ?? plan?.currentDayIndex ?? null;
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const weekSummaries = useMemo(
    () =>
      plan
        ? buildWeekSummaries(
            plan,
            currentWeekIndex || 1,
            currentDayIndex,
            offsets,
          )
        : [],
    [plan, currentWeekIndex, currentDayIndex, offsets],
  );

  const effectiveWeek = selectedWeek || currentWeekIndex || 1;
  const currentWeekDays = useMemo(
    () =>
      plan
        ? buildCurrentWeekDays({
            t,
            plan,
            currentWeekIndex: effectiveWeek,
            offsets,
          })
        : [],
    [plan, effectiveWeek, offsets, t],
  );

  const currentWeekWorkouts = useMemo(
    () => currentWeekDays.flatMap((day) => day.workouts),
    [currentWeekDays],
  );
  const totalSessions = currentWeekWorkouts.length;
  const completedSessions = currentWeekWorkouts.filter(
    (item) => item.status === "DONE",
  ).length;
  const todayWorkout = currentWeekWorkouts.find((item) => item.isToday);
  const focusedWorkout = useMemo(
    () => (plan ? getPlanFocusWorkouts(plan).currentWorkout : null),
    [plan],
  );
  const focusedDerivedWorkout = useMemo(
    () =>
      plan && focusedWorkout
        ? toDerivedWorkout(t, plan, focusedWorkout, offsets)
        : null,
    [focusedWorkout, offsets, plan, t],
  );
  const activePlanSummary = useMemo(
    () =>
      plan
        ? {
            ...plan,
            workoutCount: plan.workouts.length,
            completedWorkoutCount: plan.workouts.filter(
              (workout) => workout.status === "DONE",
            ).length,
          }
        : null,
    [plan],
  );
  const remainingWeeks = plan
    ? Math.max(0, (plan.periodWeeks ?? 1) - (currentWeekIndex || 1))
    : 0;

  const postponeTodayEligibleCount = useMemo(() => {
    if (!plan) return 0;
    return plan.workouts
      .map((item) => toDerivedWorkout(t, plan, item, offsets))
      .filter(
        (item) =>
          item.isToday &&
          isWorkoutPlannedOrInProgress(item.status) &&
          !hasPrimaryActivityLink(item),
      ).length;
  }, [plan, offsets, t]);

  const postponeToday = async () => {
    if (!plan) return;
    const todayWorkouts = plan.workouts
      .map((item) => toDerivedWorkout(t, plan, item, offsets))
      .filter(
        (item) =>
          item.isToday &&
          isWorkoutPlannedOrInProgress(item.status) &&
          !hasPrimaryActivityLink(item),
      );
    if (todayWorkouts.length === 0) {
      toast.message(t("toast.noPostponableToday"));
      return;
    }
    setPostponingToday(true);
    try {
      for (const workout of todayWorkouts) {
        const sourceDayOffset =
          typeof workout.dayOffset === "number"
            ? workout.dayOffset
            : (workout.uiWeekIndex - 1) * 7 + (workout.uiDayIndex - 1);
        await runPostponeWorkout({
          planId: workout.planId,
          workoutId: workout.id,
          status: workout.status,
          sourceDayOffset,
          text: workout.text,
          notes: workout.notes ?? null,
          name: workout.name ?? null,
          sportType: workout.sportType,
          sportDefinitionCode: workout.sportDefinitionCode,
        });
      }
      await invalidateActivePlanAndPlanDetails(queryClient);
      toast.success(t("toast.postponeTodaySuccess"));
    } catch {
      toast.error(t("toast.postponeFailed"));
    } finally {
      setPostponingToday(false);
    }
  };

  const postponeWorkout = async (workout: DerivedWorkout) => {
    const linked = hasPrimaryActivityLink(workout);
    if (!canMutatePlanWorkoutSchedule(workout)) {
      if (linked) toast.message(t("actions.linkedBlockedTip"));
      return;
    }
    try {
      const sourceDayOffset =
        typeof workout.dayOffset === "number"
          ? workout.dayOffset
          : (workout.uiWeekIndex - 1) * 7 + (workout.uiDayIndex - 1);
      await runPostponeWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.status,
        sourceDayOffset,
        text: workout.text,
        notes: workout.notes ?? null,
        name: workout.name ?? null,
        sportType: workout.sportType,
        sportDefinitionCode: workout.sportDefinitionCode,
      });
      await invalidateActivePlanAndPlanDetails(queryClient);
      toast.success(t("toast.postponeOneSuccess"));
    } catch {
      toast.error(t("toast.postponeFailed"));
    }
  };

  const skipWorkout = async (workout: DerivedWorkout) => {
    const linked = hasPrimaryActivityLink(workout);
    if (!canMutatePlanWorkoutSchedule(workout)) {
      if (linked) toast.message(t("actions.linkedBlockedTip"));
      return;
    }
    try {
      await runSkipWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.status,
      });
      await invalidateActivePlanAndPlanDetails(queryClient);
      toast.success(t("toast.skipSuccess"));
    } catch {
      toast.error(t("toast.skipFailed"));
    }
  };

  const confirmPostpone = async () => {
    if (!postponeAction) return;
    if (postponeAction.type === "today") {
      await postponeToday();
      setPostponeAction(null);
      return;
    }
    await postponeWorkout(postponeAction.workout);
    setPostponeAction(null);
  };

  const confirmSkip = async () => {
    if (!skipTarget) return;
    await skipWorkout(skipTarget);
    setSkipTarget(null);
  };

  // 初始化周选择跟随当前周；当当前周变化时自动同步。
  useEffect(() => {
    setSelectedWeek(currentWeekIndex);
  }, [currentWeekIndex]);

  const actionCopy =
    manageAction === "complete"
      ? {
          title: t("manage.complete.title"),
          description: t("manage.complete.description"),
          confirm: t("manage.complete.confirm"),
          pending: completing,
          onConfirm: async () => {
            if (!plan) return;
            await completeAsync({ planId: plan.id });
          },
        }
      : manageAction === "delete"
        ? {
            title: t("manage.delete.title"),
            description: t("manage.delete.description"),
            confirm: t("manage.delete.confirm"),
            pending: deleting,
            onConfirm: async () => {
              if (!plan) return;
              await deleteAsync({ planId: plan.id });
            },
          }
        : null;

  if (isLoading) {
    return (
      <>
        <MobilePlanNavigation />
        <LoadingState />
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <MobilePlanNavigation />
        <EmptyActivePlan t={t} />
      </>
    );
  }

  return (
    <>
      <MobilePlanNavigation />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 pc:gap-4">
        {/* 顶部导航 */}
        <header className="hidden pc:block">
          <section className="rounded-surface bg-neutral-100 p-2.5 dark:bg-muted/45">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{t("header.currentCycle")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="inline-flex rounded-compact bg-white/92 px-2 py-1 text-mobile-caption pc:text-[11px] dark:bg-black/30">
                  {t("header.remaining")}
                  <span className="ml-1 font-semibold">
                    {t("header.remainingWeeks", { weeks: remainingWeeks })}
                  </span>
                </div>
                <PlanCreateLauncher
                  variant="secondary"
                  size="sm"
                  className="inline-flex max-w-[min(100%,11rem)] shrink-0 gap-1 truncate px-2 font-medium sm:max-w-none sm:px-2.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("header.createPlan")}
                </PlanCreateLauncher>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    unstyled
                    aria-label={t("header.manageAriaLabel")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem asChild>
                      <Link href="/plans">
                        <Layers3 className="h-4 w-4" />
                        {t("header.viewOtherPlans")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setManageAction("complete")}
                    >
                      <StopCircle className="h-4 w-4" />
                      {t("manage.complete.menu")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setManageAction("delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("manage.delete.menu")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <h1 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
              {plan.title}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
              <span className="rounded-xs bg-white/88 px-1.5 py-0.5 dark:bg-black/28">
                {t("header.weekStatus", {
                  current: currentWeekIndex,
                  total: plan.periodWeeks,
                  status: describePlanStatus(t, plan),
                })}
              </span>
              <span className="truncate">
                {t("header.totalSessions", { count: plan.workouts.length })}
              </span>
            </div>
          </section>
        </header>

        {/* 内容区域 */}
        <div
          className={cn(
            "flex flex-col gap-3 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start pc:gap-4",
            "pc:[grid-template-areas:'main_aside']",
          )}
        >
          <div className="order-1 flex min-w-0 flex-col gap-4 pc:hidden">
            <CoachSuggestion
              plan={plan}
              remainingWeeks={remainingWeeks}
              completedSessions={completedSessions}
              totalSessions={totalSessions}
              currentWorkout={focusedWorkout}
              mobile
              t={t}
            />
            {plan.startDate ? (
              <CompetitionPlanImpactCard
                anchorDate={dayjs().format("YYYY-MM-DD")}
                startDate={dayjs(plan.startDate).format("YYYY-MM-DD")}
                endDate={
                  plan.endDate
                    ? dayjs(plan.endDate).format("YYYY-MM-DD")
                    : dayjs(plan.startDate)
                        .add(Math.max(1, plan.periodWeeks) * 7 - 1, "day")
                        .format("YYYY-MM-DD")
                }
                locale={locale}
              />
            ) : null}
            <MobileTodayWorkout
              plan={plan}
              workout={focusedWorkout}
              t={t}
              onOpenPlan={() => setMobilePlanDetailOpen(true)}
              onOpenWorkout={() => {
                if (focusedDerivedWorkout) {
                  setSelectedWorkout(focusedDerivedWorkout);
                }
              }}
            />
          </div>
          {/* 右侧辅助列 */}
          <aside className="order-1 hidden min-w-0 flex-col gap-3 pc:flex pc:order-none pc:[grid-area:aside]">
            <div className="order-3 flex flex-col gap-3 pc:order-none">
              {/* 今日训练 */}
              <TodayWorkout
                workout={todayWorkout}
                plan={plan}
                planHref={`/plans/${plan.id}`}
                onOpenWorkout={setSelectedWorkout}
                t={t}
              />
              {/* 今日训练延迟按钮 */}
              <button
                type="button"
                onClick={() => setPostponeAction({ type: "today" })}
                disabled={postponingToday || postponeTodayEligibleCount === 0}
                title={
                  postponeTodayEligibleCount === 0
                    ? t("actions.postponeTodayBlockedTip")
                    : undefined
                }
                className="flex w-full items-center justify-center rounded-control bg-neutral-100 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-muted/45 dark:hover:bg-muted"
              >
                {postponingToday
                  ? t("actions.pending")
                  : t("actions.postponeToday")}
              </button>
            </div>
            <div className="hidden pc:block">
              <WeekGoal
                totalSessions={totalSessions}
                completedSessions={completedSessions}
                currentDayIndex={currentDayIndex}
                t={t}
              />
            </div>
            {plan.startDate ? (
              <div className="order-2 pc:order-none">
                <CompetitionPlanImpactCard
                  anchorDate={dayjs().format("YYYY-MM-DD")}
                  startDate={dayjs(plan.startDate).format("YYYY-MM-DD")}
                  endDate={
                    plan.endDate
                      ? dayjs(plan.endDate).format("YYYY-MM-DD")
                      : dayjs(plan.startDate)
                          .add(Math.max(1, plan.periodWeeks) * 7 - 1, "day")
                          .format("YYYY-MM-DD")
                  }
                  locale={locale}
                />
              </div>
            ) : null}
            {/* 教练建议 */}
            <div className="order-1 pc:order-none">
              <CoachSuggestion
                plan={plan}
                remainingWeeks={remainingWeeks}
                completedSessions={completedSessions}
                totalSessions={totalSessions}
                t={t}
              />
            </div>
          </aside>
          {/* 本周课表 */}
          <main
            className={cn(
              "order-2 hidden min-w-0 flex-col gap-3 pc:flex pc:gap-4 pc:order-none",
              "pc:[grid-area:main] pc:min-h-0",
            )}
          >
            {/* 周期进度 */}
            <WeekStrip
              weeks={weekSummaries}
              selectedWeek={effectiveWeek}
              onSelectWeek={setSelectedWeek}
              planHref="/plans"
              t={t}
            />
            {/* 本周负荷 */}
            <WeekLoadMap
              currentWeekIndex={effectiveWeek}
              days={currentWeekDays}
            />
            {/* 课表列表 */}
            <WorkoutList
              workouts={currentWeekWorkouts}
              t={t}
              onOpenWorkout={setSelectedWorkout}
              onPostponeWorkout={async (workout) => {
                setPostponeAction({ type: "single", workout });
              }}
              onSkipWorkout={async (workout) => {
                setSkipTarget(workout);
              }}
              pendingWorkoutId={postponingWorkoutId}
            />
          </main>
        </div>

        <AlertDialog
          open={Boolean(manageAction)}
          onOpenChange={(open) => {
            if (!open) setManageAction(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{actionCopy?.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {actionCopy?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionCopy?.pending}>
                {t("manage.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={actionCopy?.pending}
                onClick={async () => {
                  await actionCopy?.onConfirm();
                  setManageAction(null);
                }}
              >
                {actionCopy?.confirm ?? t("manage.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <WorkoutActionConfirm
          open={Boolean(postponeAction)}
          onOpenChange={(open) => {
            if (!open) setPostponeAction(null);
          }}
          title={t("postponeConfirm.title")}
          description={
            postponeAction?.type === "today"
              ? t("postponeConfirm.todayDescription")
              : t("postponeConfirm.singleDescription")
          }
          cancelLabel={t("manage.cancel")}
          confirmLabel={t("postponeConfirm.confirm")}
          pending={postponingToday || Boolean(postponingWorkoutId)}
          onConfirm={confirmPostpone}
        />
        <WorkoutActionConfirm
          open={Boolean(skipTarget)}
          onOpenChange={(open) => {
            if (!open) setSkipTarget(null);
          }}
          title={tWorkoutDialog("confirmSkipTitle")}
          description={tWorkoutDialog("confirmSkipMessage")}
          cancelLabel={tWorkoutDialog("cancel")}
          confirmLabel={tWorkoutDialog("skip")}
          pending={Boolean(postponingWorkoutId)}
          destructive
          onConfirm={confirmSkip}
        />
        {selectedWorkout ? (
          <ViewWorkoutDialog
            open={Boolean(selectedWorkout)}
            onOpenChange={(open) => {
              if (!open) setSelectedWorkout(null);
            }}
            planId={selectedWorkout.planId ?? undefined}
            workoutId={selectedWorkout.id}
            weekIndex={Math.max(0, (selectedWorkout.uiWeekIndex ?? 1) - 1)}
            dayIndex={Math.max(0, (selectedWorkout.uiDayIndex ?? 1) - 1)}
            notes={selectedWorkout.notes}
            text={selectedWorkout.text}
            sportType={selectedWorkout.sportType as SportType}
            plan={parsePlanBlocks(selectedWorkout)}
          />
        ) : null}
        <MobilePlanDetailSheet
          plan={activePlanSummary}
          open={mobilePlanDetailOpen}
          onOpenChange={setMobilePlanDetailOpen}
        />
      </div>
    </>
  );
}
