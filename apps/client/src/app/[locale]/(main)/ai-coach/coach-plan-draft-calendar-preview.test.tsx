import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CoachPlanDraft } from "@/lib/coach-plan-draft";
import { CoachPlanDraftCalendarPreview } from "./coach-plan-draft-calendar-preview";

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

vi.mock("@/lib/browser-sanitize-html", () => ({
  sanitizeHtmlForBrowser: async (value: string) => value,
}));

vi.mock("@/components/workout/WorkoutPlanChart", () => ({
  WorkoutPlanChart: () => null,
}));

vi.mock("@/components/workout/WorkoutRenderer", () => ({
  WorkoutRenderer: () => null,
}));

vi.mock("./coach-plan-draft-workout-dialog", () => ({
  CoachPlanDraftWorkoutDialog: ({
    open,
    workouts,
  }: {
    open: boolean;
    workouts: Array<{ name?: string }>;
  }) =>
    open ? (
      <div data-testid="workout-dialog-selection">
        {workouts.map((workout) => workout.name).join(",")}
      </div>
    ) : null,
}));

const draft: CoachPlanDraft = {
  title: "Mixed Friday",
  periodWeeks: 1,
  workouts: [
    {
      weekIndex: 1,
      dayIndex: 5,
      sessionIndex: 1,
      name: "Easy run",
      sportType: "RUN",
      text: "work 30m pace z2",
    },
    {
      weekIndex: 1,
      dayIndex: 5,
      sessionIndex: 2,
      name: "Strength B",
      sportType: "UNKNOWN",
      structureKind: "STRENGTH",
      text: "duration 40m\nexercise squat { work 3x10 open }",
      notes:
        "完整力量训练说明很长，不应显示在空间有限的日历预览格子里。",
      summary: {
        kind: "STRENGTH",
        durationSeconds: 2400,
        durationSource: "EXPLICIT",
        plannedSessionRpe: 6,
        exerciseCount: 5,
        warmupSetCount: 0,
        workingSetCount: 15,
        totalRepsMin: 150,
        totalRepsMax: 150,
        timedSetSeconds: 0,
        volumeLoadKg: null,
        volumeLoadLb: null,
        loadConfidence: "LOW",
        hardSession: false,
        lowerBodyLoad: "MEDIUM",
        upperBodyLoad: "MEDIUM",
      },
    },
  ],
};

describe("CoachPlanDraftCalendarPreview workout selection", () => {
  it("opens the exact workout pressed instead of the whole day", () => {
    render(<CoachPlanDraftCalendarPreview draft={draft} />);

    const mobileCalendar = screen.getByTestId(
      "coach-plan-draft-mobile-calendar",
    );
    const easyRun = within(mobileCalendar).getByRole("button", {
      name: "Easy run · S1",
    });
    const strength = within(mobileCalendar).getByRole("button", {
      name: "Strength B · S2",
    });

    expect(easyRun).toHaveAttribute("aria-pressed", "false");
    expect(strength).toHaveAttribute("aria-pressed", "false");
    expect(strength).toHaveClass(
      "touch-manipulation",
      "active:scale-[0.985]",
      "active:bg-neutral-200",
    );
    expect(strength).toHaveTextContent(
      "exerciseCount 5 · workingSetCount 15",
    );
    expect(strength).not.toHaveTextContent("title ·");
    expect(strength).not.toHaveTextContent("完整力量训练说明很长");

    fireEvent.click(easyRun);
    expect(screen.getByTestId("workout-dialog-selection")).toHaveTextContent(
      "Easy run",
    );
    expect(screen.getByTestId("workout-dialog-selection")).not.toHaveTextContent(
      "Strength B",
    );

    fireEvent.click(strength);
    expect(screen.getByTestId("workout-dialog-selection")).toHaveTextContent(
      "Strength B",
    );
    expect(screen.getByTestId("workout-dialog-selection")).not.toHaveTextContent(
      "Easy run",
    );
  });
});
