import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { PlanDemoCopy, PlanDemoPayload, PlanDemoWorkout } from "./types";

type ExampleCopy = {
  header: PlanDemoPayload["header"];
  weekdayLabels: string[];
  workouts: Pick<
    PlanDemoWorkout,
    "dayLabel" | "title" | "detail" | "statusLabel" | "linkedActivity"
  >[];
  coach: PlanDemoPayload["coach"];
};

const sampleWorkouts = [
  { id: "w1", day: 1, date: "01", load: 42 },
  { id: "w2", day: 3, date: "03", load: 88 },
  { id: "w3", day: 6, date: "06", load: 116 },
] as const;

function buildPayload(example: ExampleCopy): PlanDemoPayload {
  const workouts = sampleWorkouts.map(({ id, day, date, load }, index): PlanDemoWorkout => ({
    ...example.workouts[index]!,
    id,
    dateLabel: `06/${date}`,
    isoDate: `2026-06-${date}`,
    sport: "run",
    sportType: "RUN",
    estimatedLoad: load,
    loadLabel: `TSS ${load}`,
    uiWeekIndex: 5,
    uiDayIndex: day,
    isToday: day === 3,
  }));

  return {
    header: example.header,
    selectedWeek: 5,
    weeks: [72, 78, 90, 62, 48, 34, 18, 12].map((executionPercent, index) => ({
      week: index + 1,
      workoutCount: index === 4 ? 4 : 3,
      completedCount: index < 4 ? 3 : index === 4 ? 2 : 0,
      state: index < 4 ? "done" : index === 4 ? "current" : "next",
      executionPercent,
    })),
    days: example.weekdayLabels.map((dayLabel, index) => {
      const day = index + 1;
      const date = String(day).padStart(2, "0");
      return {
        dayIndex: day,
        dayLabel,
        dateLabel: `06/${date}`,
        isoDate: `2026-06-${date}`,
        workoutCount: day === 1 || day === 3 || day === 6 ? 1 : 0,
        completedCount: day === 1 || day === 3 ? 1 : 0,
        executionPercent: [52, 4, 72, 2, 40, 86, 2][index] ?? 0,
        isToday: day === 3,
      };
    }),
    workouts,
    todayWorkout: workouts[1],
    weekGoal: {
      totalSessions: 4,
      completedSessions: 2,
      currentDayIndex: 3,
    },
    coach: example.coach,
  };
}

export function usePlanDemoCopy(): PlanDemoCopy {
  const t = useTranslations("home.demo.plan");

  return useMemo(
    () => ({
      weekStrip: t.raw("weekStrip") as PlanDemoCopy["weekStrip"],
      weekLoad: {
        title: t("weekLoad.title"),
        plannedSessions: t("weekLoad.plannedSessions"),
        currentWeek: (week) => t("weekLoad.currentWeek", { week }),
      },
      workout: {
        title: t("workout.title"),
        loadBadge: t("workout.loadBadge"),
        notLinked: t("workout.notLinked"),
        linked: (activity) => t("workout.linked", { activity }),
        session: (index) => t("workout.session", { index }),
      },
      actions: t.raw("actions") as PlanDemoCopy["actions"],
      today: t.raw("today") as PlanDemoCopy["today"],
      goal: {
        title: t("goal.title"),
        weekSessions: t("goal.weekSessions"),
        completed: t("goal.completed"),
        progressTo: t("goal.progressTo"),
        dayNumber: (day) => t("goal.dayNumber", { day }),
      },
      payload: buildPayload(t.raw("example") as ExampleCopy),
    }),
    [t],
  );
}
