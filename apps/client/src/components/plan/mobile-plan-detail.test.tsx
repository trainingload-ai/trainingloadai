import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PlanWorkout,
  TrainingPlanDetail,
  TrainingPlanSummary,
} from "@/api/plans";
import {
  MobilePlanDetailContent,
  MobilePlanLibraryItem,
} from "./mobile-plan-detail";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).map(String).join(" ")}` : key,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

function workout(id: string, name: string, dayIndex: number): PlanWorkout {
  return {
    id,
    planId: "plan-1",
    dayOffset: dayIndex - 1,
    weekIndex: 1,
    dayIndex,
    sessionIndex: 1,
    scheduledDate: null,
    name,
    text: "work 45m",
    notes: "45-minute steady work",
    sportType: "RUN",
    structureKind: "FREEFORM",
    dslVersion: 1,
    structure: { kind: "FREEFORM", version: 1, text: "work 45m" },
    summary: { durationSeconds: 2700 },
    status: "PLANNED",
  } as PlanWorkout;
}

const summary = {
  id: "plan-1",
  userId: "user-1",
  title: "Marathon base",
  description: "Build aerobic capacity",
  goal: null,
  sourceType: "AI",
  status: "ACTIVE",
  periodWeeks: 8,
  startDate: null,
  endDate: null,
  currentWeekIndex: 1,
  currentDayIndex: 1,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  workoutCount: 3,
  completedWorkoutCount: 0,
} satisfies TrainingPlanSummary;

describe("mobile plan experience", () => {
  it("opens a plan from a mobile-style library button instead of a link", () => {
    const onClick = vi.fn();
    render(
      <MobilePlanLibraryItem
        active
        focused={false}
        plan={summary}
        onClick={onClick}
      />,
    );

    const item = screen.getByRole("button", { name: /Marathon base/ });
    expect(item).not.toHaveAttribute("href");
    expect(item).toHaveClass("bg-zinc-800/80");
    const description = screen.getByText("Build aerobic capacity");
    expect(description).toBeVisible();
    expect(description).toHaveClass("line-clamp-3");
    expect(description).not.toHaveClass("block");
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the mobile load and training sections and expands remaining workouts", () => {
    const onWorkoutClick = vi.fn();
    const plan = {
      ...summary,
      workouts: [
        workout("workout-1", "Easy run", 1),
        workout("workout-2", "Threshold run", 2),
        workout("workout-3", "Long run", 3),
      ],
    } satisfies TrainingPlanDetail;

    render(
      <MobilePlanDetailContent plan={plan} onWorkoutClick={onWorkoutClick} />,
    );

    expect(screen.getAllByText("loadChart.title").length).toBeGreaterThan(0);
    expect(screen.getByText("training")).toBeVisible();
    expect(screen.getByText("Easy run")).toBeVisible();
    expect(screen.getByText("45-minute steady work")).toHaveClass(
      "line-clamp-2",
      "pc:line-clamp-1",
    );
    expect(screen.getByText("45-minute steady work")).not.toHaveClass("block");
    expect(screen.queryByText("Threshold run")).not.toBeInTheDocument();
    expect(screen.queryByText("Long run")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "showAll" }));
    expect(screen.getByText("Threshold run")).toBeVisible();
    expect(screen.getByText("Long run")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Threshold run/ }));
    expect(onWorkoutClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workout-2" }),
    );
  });
});
