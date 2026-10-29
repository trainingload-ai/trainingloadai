import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStepModule } from "@/components/plan/plan-workout-builder-model";
import { StructuredWorkoutBuilder } from "./StructuredWorkoutBuilder";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("./use-structured-workout-builder-model", () => ({
  useStructuredWorkoutBuilderModel: ({
    value,
    onChange,
  }: {
    value: Array<{ id: string }>;
    onChange: (value: Array<{ id: string }>) => void;
  }) => ({
    sensors: [],
    heartRateZones: [],
    powerZones: [],
    paceZones: [],
    handleDragEnd: vi.fn(),
    addStep: vi.fn(),
    addRepeat: vi.fn(),
    updateModule: (moduleId: string, next: { id: string }) =>
      onChange(value.map((item) => (item.id === moduleId ? next : item))),
    removeModule: (moduleId: string) =>
      onChange(value.filter((item) => item.id !== moduleId)),
  }),
}));

describe("StructuredWorkoutBuilder mobile cards", () => {
  it("shows a compact collapsed step summary and expands on demand", () => {
    const step = {
      ...createStepModule("WARMUP"),
      duration: 10 * 60,
      primaryTarget: {
        kind: "HEART_RATE_CUSTOM" as const,
        value: "140",
        valueHigh: "140",
        relation: "EQUAL" as const,
        unit: "bpm",
      },
    };

    render(
      <StructuredWorkoutBuilder
        sportType="RUN"
        value={[step]}
        onChange={vi.fn()}
      />,
    );

    const toggle = screen.getByTestId(`mobile-workout-step-${step.id}`);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(
      'WorkoutEditor.mobile.stepLabel {"number":1}',
    );
    expect(toggle).toHaveTextContent("10 min");
    expect(
      screen.getByText("WorkoutEditor.mobile.manualBuilderHint"),
    ).toBeVisible();

    const addStep = screen.getByTestId("mobile-add-workout-step");
    expect(
      toggle.compareDocumentPosition(addStep) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("mobile-add-workout-repeat")).toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const stepType = screen.getByLabelText("PlanCreatePage.fields.stepType");
    expect(stepType).toHaveClass(
      "data-[size=sm]:h-10",
      "data-[size=sm]:text-[16px]",
      "bg-neutral-100",
    );
    expect(stepType.parentElement).toHaveClass("flex", "min-h-[52px]");

    const targetFields = screen
      .getByText("PlanCreatePage.fields.primaryTarget")
      .closest('[data-slot="workout-target-fields"]');
    expect(targetFields).toHaveClass("bg-neutral-200/70");
    expect(
      screen.getByLabelText("PlanCreatePage.fields.targetType"),
    ).toHaveClass(
      "data-[size=sm]:h-10",
      "data-[size=sm]:text-[16px]",
      "bg-background",
    );
    expect(
      screen.getByLabelText("PlanCreatePage.fields.targetSource").parentElement,
    ).toHaveClass("flex", "min-h-[52px]");
    expect(
      screen.getByText("PlanCreatePage.fields.targetValue").parentElement,
    ).toHaveClass("flex", "min-h-[52px]");
  });
});
