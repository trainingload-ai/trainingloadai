"use client";

import dayjs from "dayjs";
import {
  ArrowLeft,
  Bike,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Footprints,
  Link2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { DayPlanDemoData, HomeDayDemoCopy } from "./types";

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function SportIcon({
  sport,
}: {
  sport: DayPlanDemoData["workouts"][number]["sport"];
}) {
  if (sport === "bike") return <Bike className="h-4 w-4" />;
  if (sport === "strength") return <ShieldCheck className="h-4 w-4" />;
  return <Footprints className="h-4 w-4" />;
}

function sportClassName(sport: DayPlanDemoData["workouts"][number]["sport"]) {
  if (sport === "bike") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-200 dark:border-sky-900/50";
  }
  if (sport === "strength") {
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-200 dark:border-amber-900/50";
  }
  return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-200 dark:border-emerald-900/50";
}

function statusClassName(
  statusType: DayPlanDemoData["workouts"][number]["statusType"],
) {
  if (statusType === "done") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (statusType === "key") {
    return "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950";
  }
  return "bg-muted text-muted-foreground";
}

export function HomeDayDemoHeader({
  copy,
  dayPlanData,
  onBackHome,
  onPreviousDay,
  onNextDay,
}: {
  copy: HomeDayDemoCopy;
  dayPlanData: DayPlanDemoData;
  onBackHome?: () => void;
  onPreviousDay?: () => void;
  onNextDay?: () => void;
}) {
  return (
    <header className="px-1 py-1">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5">
          {onBackHome ? (
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {copy.backHome}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPreviousDay}
            aria-label={copy.previousDay}
            className="inline-flex h-7 w-7 items-center justify-center rounded-compact bg-neutral-100 text-muted-foreground transition-colors hover:text-foreground dark:bg-muted/45"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNextDay}
            aria-label={copy.nextDay}
            className="inline-flex h-7 w-7 items-center justify-center rounded-compact bg-neutral-100 text-muted-foreground transition-colors hover:text-foreground dark:bg-muted/45"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <section className="rounded-compact bg-neutral-100 p-2.5 dark:bg-muted/45">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          <span className="truncate">
            {copy.todayPlanMeta
              .replace("{date}", dayPlanData.dateLabel)
              .replace("{weekday}", dayPlanData.weekday)
              .replace("{week}", dayPlanData.weekLabel)}
          </span>
        </div>
        <div className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
          {dayPlanData.cycle}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap rounded bg-white/88 px-1.5 py-0.5 dark:bg-black/28">
            {dayPlanData.weekLabel}
          </span>
          <span className="truncate">{dayPlanData.intent}</span>
        </div>
      </section>
    </header>
  );
}

export function HomeDayDemoOverview({
  copy,
  dayPlanData,
  completedPercent,
}: {
  copy: HomeDayDemoCopy;
  dayPlanData: DayPlanDemoData;
  completedPercent: number;
}) {
  return (
    <Panel className="space-y-3">
      <SectionTitle title={copy.overviewTitle} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: copy.plannedLoad, value: dayPlanData.summary.plannedLoad },
          { label: copy.completed, value: dayPlanData.summary.completedLoad },
          {
            label: copy.plannedDuration,
            value: dayPlanData.summary.plannedDuration,
          },
          {
            label: copy.progress,
            value: `${dayPlanData.summary.completedCount}/${dayPlanData.summary.totalCount}`,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-compact bg-neutral-100 px-3 py-2.5 dark:bg-muted/45"
          >
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-xl font-semibold">{item.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${completedPercent}%` }}
        />
      </div>
    </Panel>
  );
}

export function HomeDayDemoWorkoutTimeline({
  copy,
  dayPlanData,
}: {
  copy: HomeDayDemoCopy;
  dayPlanData: DayPlanDemoData;
}) {
  return (
    <Panel className="space-y-3">
      <SectionTitle title={copy.timelineTitle} />
      <div className="space-y-2">
        {dayPlanData.workouts.map((workout) => (
          <article
            key={workout.id}
            className="rounded-compact bg-neutral-100 p-3 dark:bg-muted/45"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-compact border",
                  sportClassName(workout.sport),
                )}
              >
                <SportIcon sport={workout.sport} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">
                        {workout.title}
                      </h2>
                      <span
                        className={cn(
                          "shrink-0 rounded-compact px-2 py-0.5 text-[11px]",
                          statusClassName(workout.statusType),
                        )}
                      >
                        {workout.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {copy.timelineMeta
                        .replace("{duration}", workout.duration)
                        .replace(
                          "{sessionCount}",
                          String(workout.sessionCount),
                        )}
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {workout.focus}。{workout.detail}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-compact bg-background px-3 py-2 text-xs text-muted-foreground dark:bg-black/20">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{copy.linkActivity}</span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/20"
                  >
                    {copy.actionPostpone}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/20"
                  >
                    {copy.actionSkip}
                  </button>
                  <button
                    type="button"
                    disabled
                    title={copy.deleteDisabledTip}
                    className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground/60 dark:bg-black/20"
                  >
                    {copy.actionDelete}
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function HomeDayDemoCoachCard({
  dayPlanData,
}: {
  dayPlanData: DayPlanDemoData;
}) {
  return (
    <Panel>
      <section className="space-y-3 rounded-compact bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {dayPlanData.coach.title}
          </h2>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-compact bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-60 dark:bg-black/20"
          >
            <MessageCircle className="h-3 w-3" />
            {dayPlanData.coach.askCoach}
          </button>
        </div>
        <p className="text-sm leading-5 text-muted-foreground">
          {dayPlanData.coach.body}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {dayPlanData.coach.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground dark:bg-black/20"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>
    </Panel>
  );
}

export function HomeDayDemoWeekContext({
  copy,
  dayPlanData,
}: {
  copy: HomeDayDemoCopy;
  dayPlanData: DayPlanDemoData;
}) {
  const maxLoad = Math.max(
    1,
    ...dayPlanData.weekContext.map((item) => item.load),
  );

  return (
    <Panel className="space-y-3">
      <SectionTitle title={copy.weekContextTitle} />
      <div className="grid grid-cols-7 gap-2">
        {dayPlanData.weekContext.map((item) => {
          const height =
            item.load > 0 ? Math.round((item.load / maxLoad) * 72) : 0;

          return (
            <div key={item.day} className="text-center">
              <div className="flex h-20 items-end justify-center rounded-compact bg-neutral-100 px-1.5 py-1.5 dark:bg-muted/45">
                {height > 0 ? (
                  <div
                    className={cn(
                      "w-full rounded-xs",
                      item.active ? "bg-emerald-500" : "bg-muted-foreground/30",
                    )}
                    style={{ height: `${height}px` }}
                  />
                ) : null}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {item.day}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function HomeDayDemoUploadDesktop({
  copy,
  disabled = true,
}: {
  copy: HomeDayDemoCopy;
  disabled?: boolean;
}) {
  return (
    <Panel className="hidden space-y-3 md:block">
      <SectionTitle title={copy.uploadTitle} />
      <div className="rounded-compact bg-neutral-100 p-4 text-center dark:bg-muted/45">
        <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
        <div className="mt-2 text-sm font-semibold">{copy.uploadCardTitle}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {copy.uploadDescription}
        </p>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "mt-3 inline-flex w-full max-w-[220px] items-center justify-center rounded-compact px-3 py-2 text-sm font-medium",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
              : "bg-foreground text-background hover:opacity-90",
          )}
        >
          {copy.uploadSelectFile}
        </button>
      </div>
    </Panel>
  );
}

export function HomeDayDemoUploadMobile({
  copy,
  disabled = true,
}: {
  copy: HomeDayDemoCopy;
  disabled?: boolean;
}) {
  return (
    <div className="md:hidden">
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2 rounded-compact text-sm font-medium",
          disabled
            ? "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
            : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        <FileUp className="h-4 w-4 shrink-0" />
        {copy.uploadSelectFile}
      </button>
    </div>
  );
}

export function shiftDemoDate(dateKey: string, deltaDays: number) {
  return dayjs(dateKey, "YYYY-MM-DD", true)
    .add(deltaDays, "day")
    .format("YYYY-MM-DD");
}
