"use client";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { CalendarDays } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { addCalendarDays } from "@shared/plan-calendar";
import type { CoachPlanCalendar } from "@shared/ai-coach-schema";
import { getScheduledWorkouts, type PlanWorkout } from "@/api/plans";
import { usePlanDetail } from "@/api/usePlans";
import { getPlanWorkoutDisplayKind } from "@/components/plan/detail/plan-detail-utils";
import { useCalendarWeekStartsOn } from "@/lib/calendar-week-start";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { CalendarWorkoutPreview, calendarWorkoutStatusClassName } from "../calendar/components/CalendarWorkoutPreview";
import { startOfCalendarWeek } from "../calendar/components/utils";
import { CoachPreviewCard } from "./cards/coach-preview-card";

export function CoachPublishedCalendarCard({ calendar, onOpen }: {
  calendar: CoachPlanCalendar;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const weekStartsOn = useCalendarWeekStartsOn();
  const weekStart = startOfCalendarWeek(dayjs(calendar.initialDate), weekStartsOn).format("YYYY-MM-DD");
  const weekEnd = addCalendarDays(weekStart, 6);
  const { data: plan } = usePlanDetail(calendar.planId, true, { errorSurface: "inline" });
  const usesSchedule = plan && ["ACTIVE", "PAUSED", "SCHEDULED"].includes(plan.status);
  const { data: schedule } = useQuery({
    queryKey: queryKeys.plans.scheduled(weekStart, weekEnd),
    queryFn: () => getScheduledWorkouts(weekStart, weekEnd, { suppressErrorToast: true }),
    enabled: Boolean(usesSchedule),
  });
  const startDate = plan?.startDate?.slice(0, 10);
  const workouts = usesSchedule
    ? schedule?.inPlan.filter((workout) => workout.planId === calendar.planId)
    : plan?.workouts;
  const byDate = new Map<string, PlanWorkout[]>();
  for (const workout of workouts ?? []) {
    const date = workout.scheduledDate?.slice(0, 10) ?? (!usesSchedule && startDate
      ? addCalendarDays(startDate, workout.dayOffset ?? (workout.weekIndex - 1) * 7 + workout.dayIndex - 1)
      : undefined);
    if (!date || date < weekStart || date > weekEnd) continue;
    const dayWorkouts = byDate.get(date) ?? [];
    dayWorkouts.push(workout);
    byDate.set(date, dayWorkouts);
  }
  let weekCount = 0;
  for (const dayWorkouts of byDate.values()) {
    dayWorkouts.sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
    weekCount += dayWorkouts.length;
  }
  const shortDate = (value: string) => format.dateTime(new Date(`${value}T00:00:00Z`), {
    month: "numeric", day: "numeric", timeZone: "UTC",
  });
  const subtitle = [
    `${shortDate(weekStart)} – ${shortDate(weekEnd)}`,
    workouts && t("CalendarExperience.planWorkoutCount", { count: weekCount }),
  ].filter(Boolean).join(" · ");

  return (
    <div className="@container w-full">
      <CoachPreviewCard title={calendar.title} subtitle={subtitle} icon={CalendarDays}
        actionLabel={t("AiCoachPage.workspace.viewCalendar")} onOpen={onOpen}>
        <ol className="grid grid-cols-7 gap-1 @min-[35rem]:gap-2">
          {Array.from({ length: 7 }, (_, index) => {
            const key = addCalendarDays(weekStart, index);
            const selected = key === calendar.initialDate;
            const inMonth = key.slice(0, 7) === calendar.initialDate.slice(0, 7);
            const day = new Date(`${key}T00:00:00Z`);
            const dayWorkouts = byDate.get(key) ?? [];
            const primaryWorkout = dayWorkouts[0];
            const title = primaryWorkout?.name?.trim() || t("CalendarExperience.plannedTraining");
            return (
              <li key={key} className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-control py-1.5",
                "@min-[35rem]:items-stretch @min-[35rem]:gap-2 @min-[35rem]:py-0",
                selected && "bg-primary text-primary-foreground @min-[35rem]:bg-transparent @min-[35rem]:text-foreground",
              )}>
                <span className={cn("text-center text-[10px] @min-[35rem]:text-xs @min-[35rem]:text-muted-foreground",
                  !selected && "text-muted-foreground")}>
                  {format.dateTime(day, { weekday: "short", timeZone: "UTC" })}
                </span>
                <div className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-control",
                  "@min-[35rem]:min-h-[100px] @min-[35rem]:items-stretch @min-[35rem]:gap-1.5 @min-[35rem]:bg-card @min-[35rem]:p-2",
                  !inMonth && "@min-[35rem]:bg-secondary @min-[35rem]:text-muted-foreground",
                  selected && "@min-[35rem]:ring-2 @min-[35rem]:ring-inset @min-[35rem]:ring-ring",
                )}>
                  <time dateTime={key} aria-current={selected ? "true" : undefined}
                    className="text-sm font-semibold tabular-nums">{day.getUTCDate()}</time>
                  <span aria-hidden className={cn("size-1 rounded-full @min-[35rem]:hidden",
                    primaryWorkout ? selected ? "bg-current" : "bg-success" : "bg-transparent")} />
                  {primaryWorkout ? (
                    <div className="hidden min-w-0 space-y-1 @min-[35rem]:block">
                      <div className={cn("flex min-w-0 flex-col gap-1 rounded-xs p-1",
                        calendarWorkoutStatusClassName(getPlanWorkoutDisplayKind(primaryWorkout)))}>
                        <CalendarWorkoutPreview workout={primaryWorkout} title={title} />
                      </div>
                      {dayWorkouts.length > 1 ? (
                        <p className="text-[10px] text-muted-foreground">
                          +{t("CalendarExperience.planWorkoutCount", { count: dayWorkouts.length - 1 })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CoachPreviewCard>
    </div>
  );
}
