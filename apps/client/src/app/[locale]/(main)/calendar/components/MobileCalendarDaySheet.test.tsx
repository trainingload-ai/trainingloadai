import React from "react";
import dayjs from "dayjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import { MobileCalendarDaySheet } from "./MobileCalendarDaySheet";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace?: string) =>
    (key: string, values?: { sport?: string }) => {
      if (namespace !== "ActivityTitle") return key;
      if (key === "sports.run") return "Running";
      if (key === "periods.evening") return `Evening ${values?.sport}`;
      return key;
    },
}));

vi.mock("@/hooks/use-mobile", () => ({
  BELOW_PC_MEDIA_QUERY: "(max-width: 1023px)",
  MOBILE_MEDIA_QUERY: "(max-width: 767px)",
  useMobileOnlyOpen: (open: boolean) => open,
}));

vi.mock("./MobileActivityDetailSheetContent", () => ({
  MobileActivityDetailSheetContent: ({
    previewActivity,
  }: {
    previewActivity: Activity;
  }) => <div>activity-detail:{previewActivity.activityName}</div>,
}));

vi.mock("@/components/plan/view-workout-dialog", () => ({
  ViewWorkoutDialog: ({ mobileEmbedded }: { mobileEmbedded?: boolean }) => (
    <div>{mobileEmbedded ? "embedded-workout-detail" : "workout-dialog"}</div>
  ),
}));

const workout = {
  id: "workout-one",
  planId: "plan-one",
  dayOffset: 1,
  weekIndex: 1,
  dayIndex: 2,
  sessionIndex: 1,
  name: "Easy run",
  sportType: "RUN",
  status: "PLANNED",
  text: "warmup 5m\nwork 20m hr z2\ncooldown 5m",
  notes: "Keep it conversational.",
  scheduledDate: "2026-07-21",
  structureKind: "ENDURANCE",
  dslVersion: 1,
  summary: {
    kind: "ENDURANCE",
    durationSeconds: 1800,
    stepCount: 3,
    hardSession: false,
  },
  structure: { kind: "ENDURANCE", version: 1, blocks: [] },
} as PlanWorkout;

function Harness({ withWorkout = false }: { withWorkout?: boolean }) {
  const [page, setPage] = React.useState<
    React.ComponentProps<typeof MobileCalendarDaySheet>["page"]
  >({ kind: "day" });
  return (
    <MobileCalendarDaySheet
      open
      onOpenChange={vi.fn()}
      page={page}
      onPageChange={setPage}
      date={dayjs("2026-07-21")}
      activities={[
        {
          id: 9,
          hashId: "activity-nine",
          activityName: "Evening Run",
          sportType: "RUN",
        },
      ]}
      workouts={withWorkout ? [workout] : []}
      events={[]}
    />
  );
}

describe("MobileCalendarDaySheet", () => {
  it("navigates from day content to activity detail inside the same sheet", () => {
    render(<Harness />);

    expect(screen.getByText("July 21, 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Tuesday").length).toBeGreaterThan(0);
    expect(
      screen.getByText("MobileCalendarTimeline.completed"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Evening Running/i }));
    const activityDetail = screen.getByText("activity-detail:Evening Run");
    expect(activityDetail).toBeInTheDocument();
    expect(activityDetail.closest(".p-0")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "backToDay" }));
    expect(
      screen.getByRole("button", { name: /Evening Running/i }),
    ).toBeInTheDocument();
  });

  it("switches to workout detail inside the same day sheet", async () => {
    render(<Harness withWorkout />);

    fireEvent.click(screen.getByRole("button", { name: /Easy run/ }));
    expect(await screen.findByText("embedded-workout-detail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "backToDay" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "backToDay" }));
    expect(screen.getByRole("button", { name: /Easy run/ })).toBeInTheDocument();
    expect(screen.queryByText("embedded-workout-detail")).toBeNull();
  });
});
