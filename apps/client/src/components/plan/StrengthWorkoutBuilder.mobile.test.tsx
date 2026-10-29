import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultStrengthWorkout,
  StrengthWorkoutBuilder,
} from "./StrengthWorkoutBuilder";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

describe("StrengthWorkoutBuilder mobile cards", () => {
  it("keeps set groups collapsed and exposes the prescription summary", () => {
    render(
      <StrengthWorkoutBuilder
        value={createDefaultStrengthWorkout()}
        onChange={vi.fn()}
      />,
    );

    const toggle = screen.getByTestId("mobile-strength-group-0-0");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("3 × 8 · 90s");
    expect(toggle.closest('[data-slot="strength-set-group"]')).toHaveClass(
      "bg-neutral-100",
    );

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByLabelText("WorkoutEditor.strength.setGroup.setType"),
    ).toHaveClass("border-0", "bg-background");
    expect(
      screen.getByLabelText("WorkoutEditor.strength.setGroup.sets"),
    ).toHaveClass("border-0", "bg-background");
  });
});
