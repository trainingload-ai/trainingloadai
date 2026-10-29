import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutEditorSheet } from "./WorkoutEditorSheet";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

vi.mock("@/hooks/useUserZones", () => ({
  useUserZones: () => ({ data: [] }),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ data: undefined }),
}));

vi.mock("@/api/sports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/sports")>();
  return {
    ...actual,
    usePlanningSportCatalog: () => ({ data: [] }),
  };
});

vi.mock("@/components/plan/StrengthWorkoutBuilder", () => ({
  createDefaultStrengthWorkout: () => ({
    kind: "STRENGTH",
    version: 1,
    durationSeconds: 2700,
    plannedSessionRpe: 6,
    exercises: [],
  }),
  StrengthWorkoutBuilder: () => <div>strength-builder</div>,
}));

vi.mock("@/components/plan/StructuredWorkoutBuilder", () => ({
  StructuredWorkoutBuilder: ({ value }: { value: unknown[] }) => (
    <div data-testid="endurance-builder">{value.length}</div>
  ),
}));

vi.mock("@/components/workout/WorkoutPlanChart", () => ({
  WorkoutPlanChart: () => null,
}));

vi.mock("@/components/workout/WorkoutRenderer", () => ({
  WorkoutRenderer: () => null,
}));

describe("WorkoutEditorSheet mobile plan layout", () => {
  it("starts with workout type before schedule and keeps type switching in the editor", () => {
    render(
      <WorkoutEditorSheet
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        title="Desktop title"
        mobileTitle="Add workout"
        mobileScheduleLabel="Week 1 · Monday · Session 1"
        mobilePlanLayout
        initialValue={{
          text: "",
          notes: "",
          structureKind: "ENDURANCE",
          sportType: "RUN",
          sportDefinitionCode: "ROAD_RUNNING",
        }}
      />,
    );

    const editor = screen.getByTestId("mobile-plan-workout-editor");
    expect(screen.getByRole("dialog")).toHaveClass(
      "bg-muted",
      "text-foreground",
    );
    const typeLabel = within(editor).getByText(
      "WorkoutEditor.mobile.workoutType",
    );
    const scheduledLabel = within(editor).getByText(
      "WorkoutEditor.mobile.scheduledAt",
    );
    expect(within(editor).getByTestId("mobile-workout-schedule")).toHaveClass(
      "flex",
      "min-h-[52px]",
    );
    expect(scheduledLabel.nextElementSibling).toHaveClass(
      "truncate",
      "text-right",
    );

    const orderedFields = [
      typeLabel,
      scheduledLabel,
      within(editor).getByText("WorkoutEditor.fields.name.label"),
      within(editor).getByText("WorkoutEditor.fields.notes.label"),
      within(editor).getByText("WorkoutEditor.mobile.sport"),
      within(editor).getByText("WorkoutEditor.mobile.editMode"),
    ];
    for (let index = 0; index < orderedFields.length - 1; index += 1) {
      expect(
        orderedFields[index]!.compareDocumentPosition(
          orderedFields[index + 1]!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(
      within(editor).getByText("WorkoutEditor.mobile.manualMode"),
    ).toBeVisible();
    expect(
      within(editor).getByText("WorkoutEditor.mobile.dslMode"),
    ).toBeVisible();
    expect(screen.getByTestId("mobile-workout-kind-endurance")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(editor).getByTestId("endurance-builder")).toHaveTextContent(
      "3",
    );
    expect(screen.getByTestId("workout-editor-preview")).toHaveClass(
      "overflow-hidden",
    );

    fireEvent.click(screen.getByTestId("mobile-workout-mode-rules"));

    const dslEditor = screen.getByTestId("mobile-workout-dsl-editor");
    expect(
      within(dslEditor).getByText("WorkoutEditor.mobile.dslHint"),
    ).toBeVisible();
    const dslInput = within(dslEditor).getByLabelText(
      "WorkoutEditor.fields.rules.label",
    );
    expect(dslInput).toHaveClass("font-mono");
    expect((dslInput as HTMLTextAreaElement).value).toContain("warmup");
    expect(
      within(dslEditor).getByPlaceholderText(
        "WorkoutEditor.mobile.dslPlaceholder",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByTestId("mobile-workout-kind-strength"));

    expect(screen.getByTestId("mobile-workout-kind-strength")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("workout-editor-preview")).toHaveClass(
      "overflow-y-auto",
    );
    expect(within(editor).getByText("strength-builder")).toBeVisible();
  });

  it("opens text-only endurance workouts in the DSL editor", () => {
    render(
      <WorkoutEditorSheet
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        title="Desktop title"
        mobileTitle="Edit workout"
        mobilePlanLayout
        initialValue={{
          text: "warmup 10m\nwork 30m\ncooldown 5m",
          structureKind: "ENDURANCE",
          sportType: "RUN",
          sportDefinitionCode: "ROAD_RUNNING",
        }}
      />,
    );

    expect(screen.getByTestId("mobile-workout-mode-rules")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("mobile-workout-dsl-editor")).toBeVisible();
  });
});
