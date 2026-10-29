import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanWorkout } from "@/api/plans";
import { MobileViewWorkoutDialog } from "./mobile-view-workout-dialog";

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

vi.mock("@/components/plan/plan-workout-activity-link-control", () => ({
  PlanWorkoutActivityLinkControl: ({
    mobileAction,
  }: {
    mobileAction?: boolean;
  }) => (
    <button type="button">
      {mobileAction ? "linkActivityAction" : "link"}
    </button>
  ),
}));

const workout: PlanWorkout = {
  id: "workout-1",
  planId: "plan-1",
  dayOffset: 0,
  weekIndex: 1,
  dayIndex: 1,
  sessionIndex: 1,
  scheduledDate: "2026-08-11",
  name: "Easy run",
  text: "warmup 5m\nwork 20m\ncooldown 5m",
  notes: "Keep the effort conversational and relaxed.",
  sportType: "RUN",
  structureKind: "ENDURANCE",
  dslVersion: 1,
  structure: {
    kind: "ENDURANCE",
    version: 1,
    blocks: [
      {
        type: "work",
        steps: [
          { duration: 300, stepKind: "WARMUP" },
          { duration: 1200, stepKind: "WORK" },
          { duration: 300, stepKind: "COOLDOWN" },
        ],
      },
    ],
  },
  summary: {
    kind: "ENDURANCE",
    durationSeconds: 1800,
    stepCount: 3,
    hardSession: false,
  },
  status: "PLANNED",
  links: [],
};

describe("MobileViewWorkoutDialog", () => {
  it("matches the mobile content order and action hierarchy", async () => {
    const onPostpone = vi.fn().mockResolvedValue(undefined);
    render(
      <MobileViewWorkoutDialog
        open
        loading={false}
        pending={false}
        workout={workout}
        onOpenChange={vi.fn()}
        onPostpone={onPostpone}
        onSkip={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const chart = screen.getByRole("img", { name: "workoutChartLabel" });
    const description = screen.getByText(workout.notes!);
    const structure = screen.getByText("workoutStructureLabel");
    expect(chart.parentElement).toHaveClass("bg-muted/60");
    expect(structure.nextElementSibling).toHaveClass("bg-muted/60");
    expect(structure.nextElementSibling).not.toHaveClass("dark:bg-zinc-900/45");
    expect(
      chart.compareDocumentPosition(description) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      description.compareDocumentPosition(structure) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      screen.getByRole("button", { name: "linkActivityAction" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "postpone" }));
    expect(screen.getByText("confirmPostponeTitle")).toBeVisible();
    const postponeButtons = screen.getAllByRole("button", {
      name: "postpone",
    });
    fireEvent.click(postponeButtons.at(-1)!);
    await waitFor(() => expect(onPostpone).toHaveBeenCalledTimes(1));
  });

  it("hides postpone/skip for moved workouts and shows the movedBy badge", () => {
    render(
      <MobileViewWorkoutDialog
        open
        loading={false}
        pending={false}
        workout={{ ...workout, status: "MOVED", movedBy: "USER" }}
        onOpenChange={vi.fn()}
        onPostpone={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText("movedBy.user")).toBeVisible();
    expect(screen.queryByRole("button", { name: "postpone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "skip" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "linkActivityAction" }),
    ).toBeNull();
  });

  it("hides postpone/skip for completed workouts", () => {
    render(
      <MobileViewWorkoutDialog
        open
        loading={false}
        pending={false}
        workout={{ ...workout, status: "DONE" }}
        onOpenChange={vi.fn()}
        onPostpone={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "postpone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "skip" })).toBeNull();
  });
});
