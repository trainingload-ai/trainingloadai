import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePlanStore } from "@/lib/plan-store";

import ManualPlanCreatePage from "./page";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/hooks/useSetPageTitle", () => ({
  useSetPageTitle: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

vi.mock("@/components/mobile-app/components/MobileNavigationProvider", () => ({
  useMobileNavigation: vi.fn(),
}));

vi.mock("@/components/plan/manual-plan-meta-form", () => ({
  ManualPlanMetaForm: ({
    onSubmit,
  }: {
    onSubmit: (values: {
      name: string;
      weeks: number;
      description: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({ name: "Mobile plan", weeks: 1, description: "" })
      }
    >
      set up plan
    </button>
  ),
}));

vi.mock("@/components/plan/manual-plan-week-grid", () => ({
  ManualPlanWeekGrid: () => <div>week grid</div>,
}));

vi.mock("@/components/plan/EditWorkoutDialog", () => ({
  EditWorkoutDialog: ({
    open,
    weekIndex,
    dayIndex,
    sessionIndex,
    mobilePlanLayout,
    readOnly,
  }: {
    open: boolean;
    weekIndex: number;
    dayIndex: number;
    sessionIndex: number;
    mobilePlanLayout: boolean;
    readOnly: boolean;
  }) =>
    open ? (
      <div
        data-testid="review-workout-sheet"
        data-week={weekIndex}
        data-day={dayIndex}
        data-session={sessionIndex}
        data-mobile={mobilePlanLayout}
        data-read-only={readOnly}
      />
    ) : null,
}));

vi.mock(
  "@/app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview",
  () => ({ CoachPlanDraftCalendarPreview: () => null }),
);

vi.mock("@/components/plan/plan-description-rich", () => ({
  PlanDescriptionRich: () => null,
}));

vi.mock("@/components/workout/WorkoutRenderer", () => ({
  WorkoutRenderer: () => <div data-testid="workout-preview-chart" />,
}));

vi.mock("@/api/sports", () => ({
  getLocalizedSportDefinitionCodeName: () => "Running",
}));

vi.mock("@/api/usePlanMutations", () => ({
  useCreatePlanFromDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("ManualPlanCreatePage mobile review", () => {
  beforeEach(() => {
    usePlanStore.getState().clear();
  });

  it("opens the selected workout in a read-only mobile sheet", async () => {
    render(<ManualPlanCreatePage />);

    fireEvent.click(screen.getByRole("button", { name: "set up plan" }));
    await act(async () => {
      await usePlanStore.getState().setWorkout(
        0,
        2,
        {
          name: "Preview run",
          text: "warmup 10m\nwork 20m\ncooldown 5m",
          sportType: "RUN",
          sportDefinitionCode: "ROAD_RUNNING",
        },
        2,
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "PlanCreatePage.buttons.continueToReview",
      }),
    );
    expect(screen.getByText("PlanSummary.weekly")).toBeVisible();
    expect(await screen.findByTestId("workout-preview-chart")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Preview run/ }));

    const reviewWorkoutSheet = await screen.findByTestId(
      "review-workout-sheet",
    );
    expect(reviewWorkoutSheet).toHaveAttribute(
      "data-week",
      "0",
    );
    expect(reviewWorkoutSheet).toHaveAttribute(
      "data-day",
      "2",
    );
    expect(reviewWorkoutSheet).toHaveAttribute(
      "data-session",
      "2",
    );
    expect(reviewWorkoutSheet).toHaveAttribute(
      "data-mobile",
      "true",
    );
    expect(reviewWorkoutSheet).toHaveAttribute(
      "data-read-only",
      "true",
    );
  });
});
