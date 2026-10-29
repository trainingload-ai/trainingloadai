import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { MobileCalendarDayContent } from "./MobileCalendarSessionCards";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (namespace?: string) => (key: string, values?: { sport?: string }) => {
      if (namespace !== "ActivityTitle") return key;
      if (key === "sports.run") return "Running";
      if (key === "periods.evening") return `Evening ${values?.sport}`;
      return key;
    },
}));

vi.mock("@/components/activities/map-thumbnail", () => ({
  MapThumbnail: ({ fallback }: { fallback: ReactNode }) => (
    <div data-testid="activity-thumbnail">{fallback}</div>
  ),
}));

const activity: Activity = {
  id: 9,
  hashId: "activity-nine",
  activityName: "Evening Run",
  sportType: "RUN",
  distance: 2100,
  duration: 542,
};

const workout = {
  id: "workout-one",
  name: "Tempo Session",
  text: "Warm up and tempo intervals",
  notes: "Threshold focus",
  sportType: "RUN",
  estimatedLoad: 62,
  summary: {
    kind: "ENDURANCE",
    durationSeconds: 1800,
    stepCount: 2,
    hardSession: true,
  },
  structure: {
    kind: "ENDURANCE",
    version: 1,
    blocks: [
      {
        type: "work",
        steps: [
          { duration: 600, stepKind: "WARMUP" },
          { duration: 1200, stepKind: "WORK", power: 0.85 },
        ],
      },
    ],
  },
} as PlanWorkout;

describe("MobileCalendarDayContent", () => {
  it("matches the mobile activity-card hierarchy and compact metadata", () => {
    const onActivityPress = vi.fn();
    render(
      <MobileCalendarDayContent
        activities={[activity]}
        events={[]}
        workouts={[]}
        onActivityPress={onActivityPress}
        onEventPress={vi.fn()}
        onWorkoutPress={vi.fn()}
      />,
    );

    expect(screen.getByTestId("activity-thumbnail")).toBeInTheDocument();
    expect(screen.getByText("Evening Running")).toHaveClass("text-base");
    expect(
      screen.getByText("CalendarExperience.sportLabels.run - 2.1 km - 9 min"),
    ).toBeInTheDocument();
    expect(screen.queryByText("MobileCalendarTimeline.completed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Evening Running" }));
    expect(onActivityPress).toHaveBeenCalledWith(activity);
  });

  it("renders the mobile workout preview chart and lightweight empty state", () => {
    const { rerender } = render(
      <MobileCalendarDayContent
        activities={[]}
        events={[]}
        workouts={[workout]}
        onActivityPress={vi.fn()}
        onEventPress={vi.fn()}
        onWorkoutPress={vi.fn()}
      />,
    );

    expect(screen.getByText("Tempo Session")).toHaveClass(
      "text-base",
      "pc:text-sm",
    );
    expect(screen.getByTestId("workout-mini-chart")).toBeInTheDocument();
    expect(screen.getByText("Threshold focus")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
    expect(
      screen.queryByText("Warm up and tempo intervals"),
    ).not.toBeInTheDocument();

    rerender(
      <MobileCalendarDayContent
        activities={[]}
        events={[]}
        workouts={[]}
        onActivityPress={vi.fn()}
        onEventPress={vi.fn()}
        onWorkoutPress={vi.fn()}
      />,
    );
    const empty = screen.getByText("MobileCalendarTimeline.selectDateHint");
    expect(empty).toBeInTheDocument();
    expect(empty).not.toHaveClass("border-dashed");
  });
});
