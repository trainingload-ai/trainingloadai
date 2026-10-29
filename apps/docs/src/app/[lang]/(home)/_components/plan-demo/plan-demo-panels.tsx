"use client";

import type { ComponentType } from "react";
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Footprints,
  Info,
  Link2,
  MoreHorizontal,
  Mountain,
  Plus,
  Sparkles,
  Target,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { planLoadBarFillStyle } from "./plan-load-bar";
import type {
  PlanDemoCopy,
  PlanDemoDay,
  PlanDemoSport,
  PlanDemoWeek,
  PlanDemoWorkout,
} from "./types";

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function SectionTitle({
  title,
  action,
  onAction,
  interactive,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  interactive?: boolean;
}) {
  const actionContent = action ? (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {action}
      <ChevronRight className="h-3.5 w-3.5" />
    </span>
  ) : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action && interactive && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="cursor-pointer transition-colors hover:text-foreground"
        >
          {actionContent}
        </button>
      ) : action ? (
        actionContent
      ) : null}
    </div>
  );
}

function SportIcon({ sport }: { sport: PlanDemoSport }) {
  if (sport === "bike") return <Bike className="h-4 w-4" />;
  if (sport === "swim") return <Waves className="h-4 w-4" />;
  return <Footprints className="h-4 w-4" />;
}

function sportClassName(sport: PlanDemoSport) {
  if (sport === "bike") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-200 dark:border-sky-900/50";
  }
  if (sport === "swim") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-200 dark:border-indigo-900/50";
  }
  return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-200 dark:border-emerald-900/50";
}

function DemoWorkoutLoadBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-compact bg-neutral-100 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-muted/45">
      {label}
    </span>
  );
}

function isWorkoutDone(statusLabel: string) {
  const normalized = statusLabel.toLowerCase();
  return (
    normalized.includes("done") ||
    statusLabel.includes("已完成") ||
    statusLabel.includes("完了")
  );
}

export function PlanDemoHeader({ copy }: { copy: PlanDemoCopy }) {
  const { header } = copy.payload;
  return (
    <header className="px-1 py-1">
      <section className="rounded-compact bg-neutral-100 p-2.5 dark:bg-muted/45">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{header.cycleLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-compact bg-white/92 px-2 py-1 text-[11px] dark:bg-black/30">
              {header.remainingLabel}
              <span className="ml-1 font-semibold">
                {header.remainingWeeks}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled
              className="inline-flex h-8 max-w-[min(100%,11rem)] shrink-0 gap-1 truncate px-2 text-xs font-medium sm:max-w-none sm:px-2.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {header.createPlan}
            </Button>
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-compact text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </div>
          </div>
        </div>
        <div className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
          {header.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-white/88 px-1.5 py-0.5 dark:bg-black/28">
            {header.weekStatus}
          </span>
          <span className="truncate">{header.totalSessions}</span>
        </div>
      </section>
    </header>
  );
}

export function PlanDemoWeekStrip({
  copy,
  interactive,
  onSelectWeek,
}: {
  copy: PlanDemoCopy;
  interactive?: boolean;
  onSelectWeek?: (week: number) => void;
}) {
  const { weeks, selectedWeek } = copy.payload;
  return (
    <Panel className="p-4">
      <SectionTitle title={copy.weekStrip.title} />
      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
        <div className="flex min-w-max gap-4">
          {weeks.map((week: PlanDemoWeek) => {
            const isSelected = selectedWeek === week.week;
            const loadBarHeight =
              week.executionPercent <= 0
                ? "1px"
                : `max(1px, ${week.executionPercent}%)`;
            const weekClassName = cn(
              "group relative flex w-[82px] min-w-0 flex-col overflow-hidden rounded-compact px-3 py-2.5 text-left",
              isSelected
                ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                : "bg-neutral-100 dark:bg-muted/45",
              interactive &&
                "cursor-pointer transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10",
            );

            const content = (
              <>
                <div
                  className="pointer-events-none absolute bottom-0 left-0 w-full"
                  style={planLoadBarFillStyle(loadBarHeight)}
                />
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">W{week.week}</span>
                  {week.state === "current" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  ) : null}
                </div>
                <div className="relative z-10 mt-2 h-24" />
                <div className="relative z-10 mt-2 text-xs text-muted-foreground">
                  {week.completedCount}/{week.workoutCount}
                </div>
                {week.state === "current" ? (
                  <div className="relative z-10 text-[11px] text-muted-foreground">
                    {copy.weekStrip.stateCurrent}
                  </div>
                ) : null}
              </>
            );

            if (interactive && onSelectWeek) {
              return (
                <button
                  key={week.week}
                  type="button"
                  onClick={() => onSelectWeek(week.week)}
                  className={weekClassName}
                >
                  {content}
                </button>
              );
            }

            return (
              <div key={week.week} className={weekClassName}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function PlanDemoWeekLoadMap({ copy }: { copy: PlanDemoCopy }) {
  const { days, selectedWeek } = copy.payload;
  const plannedSessions = days.reduce((sum, day) => sum + day.workoutCount, 0);

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-foreground">
          {copy.weekLoad.title}
        </h2>
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {copy.weekLoad.currentWeek(selectedWeek)}
          </div>
          <div className="shrink-0 rounded-compact bg-background px-3 py-2 text-right">
            <div className="text-[10px] text-muted-foreground">
              {copy.weekLoad.plannedSessions}
            </div>
            <div className="text-sm font-semibold">{plannedSessions}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-3">
          {days.map((day: PlanDemoDay) => {
            const loadBarHeight =
              day.executionPercent <= 0
                ? "1px"
                : `max(1px, ${day.executionPercent}%)`;
            return (
              <div
                key={day.dayIndex}
                className={cn(
                  "group relative flex min-w-0 flex-col overflow-hidden rounded-compact px-1.5 py-2 text-center",
                  day.isToday
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                    : "bg-neutral-100 dark:bg-muted/45",
                )}
              >
                <div
                  className="pointer-events-none absolute bottom-0 left-0 w-full"
                  style={planLoadBarFillStyle(loadBarHeight)}
                />
                <span className="relative z-10 text-[11px] text-muted-foreground">
                  {day.dayLabel}
                </span>
                <span className="relative z-10 mt-0.5 text-[10px] text-muted-foreground">
                  {day.dateLabel}
                </span>
                <div className="relative z-10 mt-2 h-24" />
                <span className="relative z-10 mt-2 truncate text-[11px] font-medium">
                  {day.completedCount}/{day.workoutCount || 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function PlanDemoWorkoutList({
  copy,
  interactive,
  onOpenWorkout,
}: {
  copy: PlanDemoCopy;
  interactive?: boolean;
  onOpenWorkout?: (workout: PlanDemoWorkout) => void;
}) {
  const { workouts } = copy.payload;
  return (
    <Panel className="flex min-h-0 flex-col gap-3 p-4">
      <SectionTitle title={copy.workout.title} />
      <div className="space-y-3">
        {workouts.map((workout: PlanDemoWorkout) => {
          const cardClassName = cn(
            "flex w-full items-center gap-3 rounded-compact border p-3 text-left",
            workout.isToday
              ? "border-emerald-300 bg-emerald-50/55 dark:border-emerald-900/70 dark:bg-emerald-950/15"
              : "border-border/70 bg-background",
            interactive &&
              "cursor-pointer transition-colors hover:border-border hover:bg-neutral-50 dark:hover:bg-muted/20",
          );

          const content = (
            <>
              <div className="w-9 shrink-0 text-center">
                <div className="text-xs font-medium">{workout.dayLabel}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {workout.dateLabel}
                </div>
              </div>
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-compact border",
                  sportClassName(workout.sport),
                )}
              >
                <SportIcon sport={workout.sport} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">
                  {workout.title}
                </h3>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {workout.detail}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <DemoWorkoutLoadBadge label={copy.workout.loadBadge} />
                  <span className="text-[11px] text-muted-foreground">
                    {workout.loadLabel}
                  </span>
                </div>
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {workout.linkedActivity
                      ? copy.workout.linked(workout.linkedActivity)
                      : copy.workout.notLinked}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isWorkoutDone(workout.statusLabel)}
                    className="rounded-compact bg-neutral-100 px-2 py-1 text-[11px] text-muted-foreground dark:bg-muted/45"
                  >
                    {copy.actions.postpone}
                  </button>
                  <button
                    type="button"
                    disabled={isWorkoutDone(workout.statusLabel)}
                    className="rounded-compact bg-neutral-100 px-2 py-1 text-[11px] text-muted-foreground dark:bg-muted/45"
                  >
                    {copy.actions.skip}
                  </button>
                  <button
                    type="button"
                    disabled
                    title={copy.actions.deleteDisabledTip}
                    className="rounded-compact bg-neutral-100 px-2 py-1 text-[11px] text-muted-foreground/60 dark:bg-muted/45"
                  >
                    {copy.actions.delete}
                  </button>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold">
                  {workout.statusLabel}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  W{workout.uiWeekIndex} D{workout.uiDayIndex}
                </div>
              </div>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            </>
          );

          if (interactive && onOpenWorkout) {
            return (
              <button
                key={workout.id}
                type="button"
                onClick={() => onOpenWorkout(workout)}
                className={cardClassName}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={workout.id} className={cardClassName}>
              {content}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function PlanDemoTodayWorkout({
  copy,
  interactive,
  onOpenToday,
}: {
  copy: PlanDemoCopy;
  interactive?: boolean;
  onOpenToday?: () => void;
}) {
  const workout = copy.payload.todayWorkout;
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <SectionTitle
        title={copy.today.title}
        action={copy.today.viewTodayPlan}
        interactive={interactive}
        onAction={onOpenToday}
      />
      {workout ? (
        interactive && onOpenToday ? (
          <button
            type="button"
            onClick={onOpenToday}
            className="overflow-hidden rounded-compact bg-neutral-100 text-left transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted/60"
          >
            <PlanDemoTodayWorkoutBody copy={copy} workout={workout} />
          </button>
        ) : (
          <div className="overflow-hidden rounded-compact bg-neutral-100 dark:bg-muted/45">
            <PlanDemoTodayWorkoutBody copy={copy} workout={workout} />
          </div>
        )
      ) : null}
    </Panel>
  );
}

function PlanDemoTodayWorkoutBody({
  copy,
  workout,
}: {
  copy: PlanDemoCopy;
  workout: PlanDemoWorkout;
}) {
  return (
    <>
      <div className="block p-3">
        <div className="flex items-start gap-3">
          <div className="rounded-compact bg-background p-2 text-emerald-700 dark:text-emerald-300">
            <SportIcon sport={workout.sport} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm">{workout.title}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-compact bg-background px-2.5 py-2">
            <Clock3 className="mb-1 h-3.5 w-3.5" />
            {workout.dateLabel}
          </div>
          <div className="rounded-compact bg-background px-2.5 py-2">
            <CircleGauge className="mb-1 h-3.5 w-3.5" />
            {workout.loadLabel}
          </div>
        </div>
        <div className="mt-2">
          <DemoWorkoutLoadBadge label={workout.loadLabel} />
        </div>
      </div>
      <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
        {workout.linkedActivity
          ? copy.workout.linked(workout.linkedActivity)
          : copy.workout.notLinked}
      </div>
    </>
  );
}

export function PlanDemoWeekGoal({ copy }: { copy: PlanDemoCopy }) {
  const { weekGoal } = copy.payload;
  const rows: Array<[string, string, ComponentType<{ className?: string }>]> = [
    [copy.goal.weekSessions, String(weekGoal.totalSessions), Target],
    [copy.goal.completed, String(weekGoal.completedSessions), CheckCircle2],
    [
      copy.goal.progressTo,
      copy.goal.dayNumber(weekGoal.currentDayIndex),
      Mountain,
    ],
  ];

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <SectionTitle title={copy.goal.title} />
      <div className="space-y-3 text-sm">
        {rows.map(([label, value, Icon]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              {label}
            </span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function PlanDemoCoachAdvice({ copy }: { copy: PlanDemoCopy }) {
  const { coach } = copy.payload;
  return (
    <Panel className="p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <span className="truncate">{coach.title}</span>
        </div>
        <p className="mt-1 line-clamp-5 indent-[2em] text-sm leading-5 text-muted-foreground">
          {coach.summary}
        </p>
      </div>
    </Panel>
  );
}
