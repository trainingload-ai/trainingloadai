"use client";

import React from "react";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { Activity } from "@/api/activities";
import { getScheduledWorkouts, type PlanWorkout } from "@/api/plans";
import { useActivePlan } from "@/api/usePlans";
import { usePMCData } from "@/api/usePMC";
import { useMonthlyActivities } from "@/hooks/useActivities";
import { queryKeys } from "@/lib/query-keys";
import { generateCalendarWeeks } from "./utils";
import {
  getCompetitionEvents,
  type CompetitionEvent,
} from "@/api/competition-events";

type CalendarWorkout = PlanWorkout & { scope: "inPlan" | "independent" };

type WeekStats = {
  count: number;
  distance: number;
  duration: number;
  tss: number;
};

type SummaryScope = {
  key: "plan" | "month";
  title: string;
  description: string;
  comparisonLabel: string;
  stats: WeekStats;
  comparisonStats: WeekStats;
};

function emptyWeekStats(): WeekStats {
  return {
    count: 0,
    distance: 0,
    duration: 0,
    tss: 0,
  };
}

function buildWeekStats(args: {
  activitiesByDate: Record<string, Activity[]>;
  start: Dayjs;
  tssByDate: Record<string, number>;
}): WeekStats {
  const { start, activitiesByDate, tssByDate } = args;
  const result = emptyWeekStats();

  for (let i = 0; i < 7; i += 1) {
    const key = start.add(i, "day").format("YYYY-MM-DD");
    const acts = activitiesByDate[key] || [];
    result.count += acts.length;
    result.tss += tssByDate[key] || 0;
    for (const activity of acts) {
      result.distance += activity.distance || 0;
      result.duration += activity.duration || 0;
    }
  }

  return result;
}

function buildRangeStats(args: {
  activitiesByDate: Record<string, Activity[]>;
  start: Dayjs;
  end: Dayjs;
  tssByDate: Record<string, number>;
}): WeekStats {
  const { start, end, activitiesByDate, tssByDate } = args;
  const result = emptyWeekStats();
  const totalDays = Math.max(
    end.startOf("day").diff(start.startOf("day"), "day"),
    0,
  );

  for (let i = 0; i <= totalDays; i += 1) {
    const key = start.add(i, "day").format("YYYY-MM-DD");
    const acts = activitiesByDate[key] || [];
    result.count += acts.length;
    result.tss += tssByDate[key] || 0;
    for (const activity of acts) {
      result.distance += activity.distance || 0;
      result.duration += activity.duration || 0;
    }
  }

  return result;
}

export function useCalendarViewModel(
  currentMonth: Dayjs,
  requestedRange?: { start: Dayjs; end: Dayjs } | null,
) {
  const locale = useLocale();
  const t = useTranslations("CalendarExperience");
  const weeks = React.useMemo(
    () => generateCalendarWeeks(currentMonth, locale),
    [currentMonth, locale],
  );

  const [selectedDate, setSelectedDate] = React.useState<Dayjs>(() => dayjs());

  React.useEffect(() => {
    const visible = weeks.flat();
    const inVisibleRange = visible.some((date) =>
      date.isSame(selectedDate, "day"),
    );
    if (inVisibleRange) return;

    const fallback = currentMonth.isSame(dayjs(), "month")
      ? dayjs()
      : currentMonth.startOf("month");
    setSelectedDate(fallback);
  }, [currentMonth, selectedDate, weeks]);

  const visibleFetchStart = weeks[0]?.[0]?.subtract(7, "day");
  const visibleFetchEnd = weeks[weeks.length - 1]?.[6]?.add(7, "day");
  const fetchStartDate =
    requestedRange?.start &&
    (!visibleFetchStart || requestedRange.start.isBefore(visibleFetchStart))
      ? requestedRange.start
      : visibleFetchStart;
  const fetchEndDate =
    requestedRange?.end &&
    (!visibleFetchEnd || requestedRange.end.isAfter(visibleFetchEnd))
      ? requestedRange.end
      : visibleFetchEnd;
  const fetchStart = fetchStartDate?.format("YYYY-MM-DD");
  const fetchEnd = fetchEndDate?.format("YYYY-MM-DD");

  const {
    workoutsByDate: activePlanWorkoutsByDate,
    range,
    active,
  } = useActivePlan(true);
  const activePlanId = active?.plan?.id ?? null;
  const { data: scheduledWorkouts } = useQuery({
    queryKey: queryKeys.plans.scheduled(fetchStart, fetchEnd),
    queryFn: () => getScheduledWorkouts(fetchStart!, fetchEnd!),
    enabled: Boolean(fetchStart && fetchEnd),
  });
  const { data: activeCompetitionEvents = [] } = useQuery({
    queryKey: queryKeys.competitionEvents.range(fetchStart, fetchEnd),
    queryFn: () => getCompetitionEvents(fetchStart!, fetchEnd!),
    enabled: Boolean(fetchStart && fetchEnd),
  });
  const { data: cancelledCompetitionEvents = [] } = useQuery({
    queryKey: queryKeys.competitionEvents.range(
      fetchStart,
      fetchEnd,
      "CANCELLED",
    ),
    queryFn: () => getCompetitionEvents(fetchStart!, fetchEnd!, "CANCELLED"),
    enabled: Boolean(fetchStart && fetchEnd),
  });
  const competitionEvents = React.useMemo(
    () => [...activeCompetitionEvents, ...cancelledCompetitionEvents],
    [activeCompetitionEvents, cancelledCompetitionEvents],
  );
  const competitionEventsByDate = React.useMemo(() => {
    const map: Record<string, CompetitionEvent[]> = {};
    for (const event of competitionEvents) {
      const start = dayjs(event.startDate);
      const end = event.endDate ? dayjs(event.endDate) : start;
      const durationDays = Math.min(Math.max(end.diff(start, "day"), 0), 31);
      for (let offset = 0; offset <= durationDays; offset += 1) {
        const key = start.add(offset, "day").format("YYYY-MM-DD");
        if (!map[key]) map[key] = [];
        map[key].push(event);
      }
    }
    return map;
  }, [competitionEvents]);

  const { workoutsByDate, independentWorkoutsByDate } = React.useMemo(() => {
    const all: Record<string, CalendarWorkout[]> = {};
    const independent: Record<string, PlanWorkout[]> = {};

    const push = (
      dateKey: string | null | undefined,
      workout: PlanWorkout,
      scope: CalendarWorkout["scope"],
    ) => {
      if (!dateKey) return;
      const item: CalendarWorkout = { ...workout, scope };
      if (!all[dateKey]) all[dateKey] = [];
      all[dateKey].push(item);
      if (scope === "independent") {
        if (!independent[dateKey]) independent[dateKey] = [];
        independent[dateKey].push(workout);
      }
    };

    for (const workout of scheduledWorkouts?.inPlan ?? []) {
      push(workout.scheduledDate, workout, "inPlan");
    }
    for (const workout of scheduledWorkouts?.independent ?? []) {
      push(workout.scheduledDate, workout, "independent");
    }

    if (!scheduledWorkouts) {
      for (const [dateKey, workouts] of Object.entries(
        activePlanWorkoutsByDate,
      )) {
        for (const workout of workouts) {
          push(dateKey, workout as PlanWorkout, "inPlan");
        }
      }
    }

    for (const items of Object.values(all)) {
      items.sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
    }
    for (const items of Object.values(independent)) {
      items.sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
    }

    return {
      workoutsByDate: all,
      independentWorkoutsByDate: independent,
    };
  }, [activePlanWorkoutsByDate, scheduledWorkouts]);
  const { data: pmcData = [] } = usePMCData({
    startDate: fetchStart!,
    endDate: fetchEnd!,
  });

  const { data: monthlyData } = useMonthlyActivities(fetchStart, fetchEnd, {
    orderBy: "startTime",
    orderDirection: "asc",
  });

  const activitiesByDate: Record<string, Activity[]> = React.useMemo(() => {
    const map: Record<string, Activity[]> = {};
    const list = monthlyData?.activities || [];
    for (const act of list) {
      if (!act.startTime) continue;
      const key = dayjs(act.startTime).format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(act);
    }
    return map;
  }, [monthlyData]);

  const tssByDate = React.useMemo(() => {
    const list = Array.isArray(pmcData)
      ? (pmcData as Array<{ date: string | Date; value: number }>)
      : [];
    const map: Record<string, number> = {};
    for (const point of list) {
      if (!point?.date) continue;
      map[dayjs(point.date).format("YYYY-MM-DD")] = point.value ?? 0;
    }
    return map;
  }, [pmcData]);

  const selectedDateKey = selectedDate.format("YYYY-MM-DD");
  const effectiveWorkoutsByDate = workoutsByDate;
  const effectiveRange = range;
  const hasPlanScope =
    Boolean(effectiveRange) &&
    Object.values(effectiveWorkoutsByDate).some((items) =>
      items.some((item) => item.scope === "inPlan"),
    );

  const selectedActivities = activitiesByDate[selectedDateKey] || [];
  const selectedPlanWorkouts = effectiveWorkoutsByDate[selectedDateKey] || [];
  const selectedCompetitionEvents =
    competitionEventsByDate[selectedDateKey] || [];
  const selectedTss = tssByDate[selectedDateKey] || 0;

  const selectedWeek = React.useMemo(() => {
    return (
      weeks.find((week) =>
        week.some((date) => date.isSame(selectedDate, "day")),
      ) ||
      weeks[0] ||
      []
    );
  }, [selectedDate, weeks]);

  const selectedWeekStart = selectedWeek[0] || selectedDate.startOf("week");
  const selectedWeekStats = React.useMemo(
    () =>
      buildWeekStats({
        start: selectedWeekStart,
        activitiesByDate,
        tssByDate,
      }),
    [activitiesByDate, selectedWeekStart, tssByDate],
  );

  const previousWeekStats = React.useMemo(
    () =>
      buildWeekStats({
        start: selectedWeekStart.subtract(7, "day"),
        activitiesByDate,
        tssByDate,
      }),
    [activitiesByDate, selectedWeekStart, tssByDate],
  );

  const planSummaryScope = React.useMemo<SummaryScope | null>(() => {
    if (!effectiveRange || !hasPlanScope) return null;

    const today = dayjs().endOf("day");
    const progressEnd = today.isBefore(effectiveRange.startOfWeek)
      ? effectiveRange.startOfWeek
      : today.isAfter(effectiveRange.end)
        ? effectiveRange.end
        : today;
    const progressDays = Math.max(
      progressEnd
        .startOf("day")
        .diff(effectiveRange.startOfWeek.startOf("day"), "day"),
      0,
    );
    const previousStart = effectiveRange.startOfWeek.subtract(
      progressDays + 1,
      "day",
    );
    const previousEnd = effectiveRange.startOfWeek.subtract(1, "day");

    return {
      key: "plan",
      title: t("planProgressTitle"),
      description: t("planProgressDescription", {
        start: effectiveRange.startOfWeek.format("MM/DD"),
        end: effectiveRange.end.format("MM/DD"),
      }),
      comparisonLabel: t("comparisonLabelPlan"),
      stats: buildRangeStats({
        start: effectiveRange.startOfWeek,
        end: progressEnd,
        activitiesByDate,
        tssByDate,
      }),
      comparisonStats: buildRangeStats({
        start: previousStart,
        end: previousEnd,
        activitiesByDate,
        tssByDate,
      }),
    };
  }, [activitiesByDate, effectiveRange, hasPlanScope, t, tssByDate]);

  const monthSummaryScope = React.useMemo<SummaryScope>(() => {
    const monthStart = currentMonth.startOf("month");
    const monthEnd = currentMonth.endOf("month");
    const previousMonthStart = currentMonth
      .subtract(1, "month")
      .startOf("month");
    const previousMonthEnd = currentMonth.subtract(1, "month").endOf("month");

    return {
      key: "month",
      title: t("monthOverview"),
      description: t("monthOverviewDescription", {
        month: currentMonth.format("YYYY/MM"),
      }),
      comparisonLabel: t("comparisonLabelMonth"),
      stats: buildRangeStats({
        start: monthStart,
        end: monthEnd,
        activitiesByDate,
        tssByDate,
      }),
      comparisonStats: buildRangeStats({
        start: previousMonthStart,
        end: previousMonthEnd,
        activitiesByDate,
        tssByDate,
      }),
    };
  }, [activitiesByDate, currentMonth, t, tssByDate]);

  return {
    currentMonth,
    weeks,
    range: effectiveRange,
    selectedDate,
    setSelectedDate,
    selectedDateKey,
    selectedWeek,
    selectedWeekStart,
    selectedWeekStats,
    previousWeekStats,
    summaryScopes: {
      defaultKey: (planSummaryScope ? "plan" : "month") as "plan" | "month",
      plan: planSummaryScope,
      month: monthSummaryScope,
    },
    selectedActivities,
    selectedPlanWorkouts,
    selectedCompetitionEvents,
    selectedIndependentWorkouts:
      independentWorkoutsByDate[selectedDateKey] || [],
    activePlanId,
    selectedTss,
    activitiesByDate,
    workoutsByDate: effectiveWorkoutsByDate,
    competitionEventsByDate,
    tssByDate,
  };
}
