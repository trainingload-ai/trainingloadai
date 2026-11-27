import dayjs from "dayjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileCalendarMonthPanel } from "./MobileCalendarMonthPanel";
import { generateCalendarWeeks } from "./utils";

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

describe("MobileCalendarMonthPanel", () => {
  it("keeps date selection inside the month panel", () => {
    const currentMonth = dayjs("2026-07-01");
    const onSelectDate = vi.fn();
    render(
      <MobileCalendarMonthPanel
        currentMonth={currentMonth}
        weeks={generateCalendarWeeks(currentMonth, "en")}
        selectedDate={dayjs("2026-07-21")}
        onSelectDate={onSelectDate}
        onNavigateMonth={vi.fn()}
        onSelectActivity={vi.fn()}
        onSelectCompetition={vi.fn()}
        onSelectWorkout={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    const dayButton = screen.getByRole("button", { name: "22" });
    expect(dayButton).toHaveAttribute("data-tap-feedback", "false");
    fireEvent.click(dayButton);
    expect(onSelectDate).toHaveBeenCalledWith(
      expect.objectContaining({ $D: 22 }),
    );
    expect(screen.getAllByText("noSchedule").length).toBeGreaterThan(0);
    expect(
      screen.getByText("MobileCalendarTimeline.selectDateHint"),
    ).toBeInTheDocument();
  });

  it("shows visible semantic markers and the selected day's mobile cards", () => {
    const currentMonth = dayjs("2026-07-01");
    const activity = {
      id: 9,
      hashId: "activity-nine",
      activityName: "Evening Run",
      sportType: "RUN",
      startTime: "2026-07-18T18:00:00.000Z",
    };
    const { container } = render(
      <MobileCalendarMonthPanel
        currentMonth={currentMonth}
        weeks={generateCalendarWeeks(currentMonth, "en")}
        selectedDate={dayjs("2026-07-18")}
        onSelectDate={vi.fn()}
        onNavigateMonth={vi.fn()}
        onSelectActivity={vi.fn()}
        onSelectCompetition={vi.fn()}
        onSelectWorkout={vi.fn()}
        activitiesByDate={{ "2026-07-18": [activity] }}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    expect(screen.getByText("dayContent")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Evening Running/i }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-calendar-marker="activity"]'),
    ).toHaveStyle({ backgroundColor: "#0ea5e9" });
  });

  it("shows both actual and planned load for the selected day", () => {
    const currentMonth = dayjs("2026-07-01");
    render(
      <MobileCalendarMonthPanel
        currentMonth={currentMonth}
        weeks={generateCalendarWeeks(currentMonth, "en")}
        selectedDate={dayjs("2026-07-18")}
        onSelectDate={vi.fn()}
        onNavigateMonth={vi.fn()}
        onSelectActivity={vi.fn()}
        onSelectCompetition={vi.fn()}
        onSelectWorkout={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{
          "2026-07-18": [
            {
              id: "planned-load",
              sportType: "RUN",
              estimatedLoad: 58,
              summary: { durationSeconds: 1800 },
              structure: { kind: "ENDURANCE", version: 1, blocks: [] },
              status: "PLANNED",
            } as never,
          ],
        }}
        competitionEventsByDate={{}}
        tssByDate={{ "2026-07-18": 35 }}
      />,
    );

    expect(screen.getByText("actualLoad")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getAllByText("plannedLoad")).toHaveLength(2);
    expect(screen.getAllByText("58")).toHaveLength(2);
  });

  it("keeps the plan start distinct in the adjacent month and when selected", () => {
    const currentMonth = dayjs("2026-07-01");
    const startOfWeek = dayjs("2026-08-01");
    const props = {
      currentMonth,
      weeks: generateCalendarWeeks(currentMonth, "en"),
      range: { startOfWeek, end: dayjs("2026-08-07") },
      onSelectDate: vi.fn(),
      onNavigateMonth: vi.fn(),
      onSelectActivity: vi.fn(),
      onSelectCompetition: vi.fn(),
      onSelectWorkout: vi.fn(),
      activitiesByDate: {},
      workoutsByDate: {},
      competitionEventsByDate: {},
      tssByDate: {},
    };
    const { container, rerender } = render(
      <MobileCalendarMonthPanel {...props} selectedDate={currentMonth} />,
    );
    const start = container.querySelector('[data-calendar-date="2026-08-01"]');
    expect(start).toHaveAccessibleDescription("dateLabel");
    expect(start).toHaveClass("bg-brand/10");
    expect(start).not.toHaveClass("opacity-30");
    expect(container.querySelector('[data-calendar-date="2026-08-02"]')?.className)
      .toContain("var(--foreground)");

    rerender(<MobileCalendarMonthPanel {...props} selectedDate={startOfWeek} />);
    expect(start).toHaveClass("bg-brand/10");
    expect(start).toHaveAttribute("aria-pressed", "true");
  });
});
