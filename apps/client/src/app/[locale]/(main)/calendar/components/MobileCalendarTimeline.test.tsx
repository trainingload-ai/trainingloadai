import dayjs from "dayjs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { MobileCalendarTimeline } from "./MobileCalendarTimeline";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const visibleCount = Math.min(count, 20);
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        Array.from({ length: visibleCount }, (_, index) => ({
          end: (index + 1) * size,
          index,
          key: index,
          lane: 0,
          size,
          start: index * size,
        })),
    };
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

describe("MobileCalendarTimeline", () => {
  it("uses a compact month header and opens the selected day", () => {
    const onSelectDate = vi.fn();
    const first = dayjs("2026-07-20");
    const second = dayjs("2026-08-01");

    render(
      <MobileCalendarTimeline
        days={[first, second]}
        selectedDate={first}
        onSelectDate={onSelectDate}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass("h-[90px]");
    expect(rows[0]).toHaveAttribute("data-tap-feedback", "false");
    expect(screen.getByLabelText("Jul 2026")).toHaveClass("h-9");
    expect(screen.getByText("Jul 2026")).toHaveClass("whitespace-nowrap");

    fireEvent.scroll(screen.getByTestId("calendar-agenda-scroll"), {
      target: { scrollTop: 90 },
    });
    expect(screen.getByLabelText("Aug 2026")).toBeInTheDocument();

    fireEvent.click(rows[1]);
    expect(onSelectDate).toHaveBeenCalledWith(second);
  });

  it("requests more days when the timeline reaches either edge", () => {
    const onRequestEarlier = vi.fn();
    const onRequestLater = vi.fn();
    const first = dayjs("2026-07-20");
    const second = dayjs("2026-07-21");

    render(
      <MobileCalendarTimeline
        days={[first, second]}
        selectedDate={first}
        onRequestEarlier={onRequestEarlier}
        onRequestLater={onRequestLater}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    const scroller = screen.getByTestId("calendar-agenda-scroll");
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 180 },
      scrollHeight: { configurable: true, value: 720 },
    });

    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    expect(onRequestEarlier).toHaveBeenCalledTimes(1);

    fireEvent.scroll(scroller, { target: { scrollTop: 540 } });
    expect(onRequestLater).toHaveBeenCalledTimes(1);
  });

  it("keeps the visible date in place when earlier days are prepended", () => {
    const onRequestEarlier = vi.fn();
    const first = dayjs("2026-07-20");
    const second = dayjs("2026-07-21");
    const earlier = dayjs("2026-07-19");
    const { rerender } = render(
      <MobileCalendarTimeline
        days={[first, second]}
        selectedDate={first}
        onRequestEarlier={onRequestEarlier}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    const scroller = screen.getByTestId("calendar-agenda-scroll");
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 180 },
      scrollHeight: {
        configurable: true,
        get: () => scroller.querySelectorAll("button").length * 90,
      },
    });
    fireEvent.scroll(scroller, { target: { scrollTop: 30 } });

    rerender(
      <MobileCalendarTimeline
        days={[earlier, first, second]}
        selectedDate={first}
        onRequestEarlier={onRequestEarlier}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    expect(scroller.scrollTop).toBe(120);
  });

  it("shows sport, distance, and duration in the top-left session summary", () => {
    const date = dayjs("2026-07-20");

    render(
      <MobileCalendarTimeline
        days={[date]}
        selectedDate={date}
        onSelectDate={vi.fn()}
        activitiesByDate={{
          "2026-07-20": [
            {
              id: 1,
              activityName: "Morning run",
              sportType: "RUN",
              distance: 10000,
              duration: 3600,
            },
          ],
        }}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{ "2026-07-20": 50 }}
      />,
    );

    expect(screen.queryByText("Morning run")).toBeNull();
    expect(
      screen.getByText("CalendarExperience.sportLabels.run · 10.0 km · 1h"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("CalendarExperience.sportLabels.run · 10.0 km · 1h")
        .closest(".flex-wrap"),
    ).not.toBeNull();
    expect(
      screen.getByText("actualLoad").parentElement?.parentElement,
    ).toHaveClass("self-center");
    expect(screen.queryByText("TSS")).toBeNull();
  });

  it("shows actual and planned load independently like the mobile agenda", () => {
    const date = dayjs("2026-07-20");

    render(
      <MobileCalendarTimeline
        days={[date]}
        selectedDate={date}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{
          "2026-07-20": [
            {
              id: "workout-load",
              sportType: "RUN",
              estimatedLoad: 62,
              summary: { durationSeconds: 1800 },
            } as unknown as PlanWorkout,
          ],
        }}
        competitionEventsByDate={{}}
        tssByDate={{ "2026-07-20": 41 }}
      />,
    );

    expect(screen.getByText("actualLoad")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("plannedLoad")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
  });

  it("includes duration for planned workouts and target details for competitions", () => {
    const raceDate = dayjs("2026-07-20");
    const workoutDate = raceDate.add(1, "day");

    render(
      <MobileCalendarTimeline
        days={[raceDate, workoutDate]}
        selectedDate={raceDate}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{
          "2026-07-21": [
            {
              id: "workout-1",
              name: "Easy ride",
              sportType: "CYCLING",
              summary: { durationSeconds: 2700 },
            } as unknown as PlanWorkout,
          ],
        }}
        competitionEventsByDate={{
          "2026-07-20": [
            {
              id: "race-1",
              title: "City 10K",
              sportType: "RUN",
              distanceMeters: 10000,
              targetTimeSeconds: 5400,
            } as unknown as CompetitionEvent,
          ],
        }}
        tssByDate={{}}
      />,
    );

    expect(
      screen.getByText("CalendarExperience.sportLabels.run · 10.0 km · 1h 30m"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CalendarExperience.sportLabels.cycling · 45 min"),
    ).toBeInTheDocument();
  });

  it("only mounts the rows inside the virtual window", () => {
    const first = dayjs("2026-01-01");
    const days = Array.from({ length: 365 }, (_, index) =>
      first.add(index, "day"),
    );

    render(
      <MobileCalendarTimeline
        days={days}
        selectedDate={first}
        onSelectDate={vi.fn()}
        activitiesByDate={{}}
        workoutsByDate={{}}
        competitionEventsByDate={{}}
        tssByDate={{}}
      />,
    );

    expect(screen.getAllByRole("button").length).toBeLessThan(days.length);
  });
});
