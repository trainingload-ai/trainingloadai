import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listWorkoutsAt, usePlanStore } from "@/lib/plan-store";
import { ManualPlanWeekGrid } from "./manual-plan-week-grid";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("@/components/workout/WorkoutPlanChart", () => ({
  WorkoutPlanChart: () => null,
}));

vi.mock("@/components/workout/WorkoutRenderer", () => ({
  WorkoutRenderer: () => null,
}));

const originalInnerWidth = window.innerWidth;

describe("ManualPlanWeekGrid mobile flow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    usePlanStore.getState().clear();
    usePlanStore.getState().initCurrent("Test plan", 1, "");
  });

  afterAll(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("opens workout type first for an empty day", async () => {
    const onAddSession = vi.fn();

    const { rerender } = render(
      <ManualPlanWeekGrid
        onAddSession={onAddSession}
        onEditSession={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mobile-manual-plan-schedule")).toBeVisible();
    const weekLabel = screen.getByTestId("mobile-plan-week-label-0");
    expect(weekLabel.style.writingMode).toBe("vertical-rl");
    expect(weekLabel.style.textOrientation).toBe("mixed");
    fireEvent.click(screen.getByTestId("mobile-plan-day-0-0"));
    const daySheet = await screen.findByTestId("mobile-plan-day-sheet");
    expect(daySheet).toBeVisible();
    expect(daySheet).toHaveClass("bg-muted", "text-foreground");
    expect(daySheet).not.toHaveClass("bg-neutral-100");
    expect(screen.getByText("WorkoutEditor.mobile.endurance")).toBeVisible();
    expect(
      screen.getByText("PlanCreatePage.calendarSelection.strengthTypeHint"),
    ).toBeVisible();
    fireEvent.click(screen.getByTestId("mobile-plan-add-strength"));

    await waitFor(() =>
      expect(onAddSession).toHaveBeenCalledWith(0, 0, 1, "STRENGTH"),
    );

    rerender(
      <ManualPlanWeekGrid
        openDayRequest={{ week: 0, day: 0, requestId: 1 }}
        onAddSession={onAddSession}
        onEditSession={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mobile-plan-open-type-picker")).toBeVisible();
  });

  it("removes a workout directly from the day sheet", async () => {
    await usePlanStore.getState().setWorkout(
      0,
      0,
      {
        text: "Easy run",
      },
      1,
    );

    render(
      <ManualPlanWeekGrid onAddSession={vi.fn()} onEditSession={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId("mobile-plan-day-0-0"));
    fireEvent.click(
      await screen.findByLabelText("WorkoutEditor.buttons.delete"),
    );

    await waitFor(() =>
      expect(
        listWorkoutsAt(usePlanStore.getState().current, 0, 0),
      ).toHaveLength(0),
    );
  });
});
