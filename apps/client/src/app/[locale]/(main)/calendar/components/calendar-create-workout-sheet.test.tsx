import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CalendarCreateWorkoutSheet } from "./calendar-create-workout-sheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/components/plan/WorkoutEditorSheet", () => ({
  WorkoutEditorSheet: ({ headerExtra }: { headerExtra: ReactNode }) => (
    <div>{headerExtra}</div>
  ),
}));

describe("CalendarCreateWorkoutSheet", () => {
  it("renders equal-height, equal-width workout scope controls", () => {
    render(
      <CalendarCreateWorkoutSheet
        open
        onOpenChange={vi.fn()}
        scheduledDate="2026-07-26"
        activePlanId="plan-1"
      />,
    );

    const inPlan = screen.getByRole("button", { name: "scopeInPlan" });
    const independent = screen.getByRole("button", {
      name: "scopeIndependent",
    });

    expect(inPlan).toHaveClass("h-9", "pc:h-8");
    expect(independent).toHaveClass("h-9", "pc:h-8");
    expect(inPlan.parentElement).toHaveClass("grid", "grid-cols-2");
    expect(inPlan).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(independent);

    expect(independent).toHaveAttribute("aria-pressed", "true");
    expect(inPlan).toHaveAttribute("aria-pressed", "false");
  });
});
