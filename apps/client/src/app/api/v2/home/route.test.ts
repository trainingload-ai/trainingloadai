import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/server-api-base-url", () => ({
  getServerApiBaseUrl: () => "http://api.test",
}));
vi.mock("@/lib/bff-upstream-headers", () => ({
  buildBffServiceHeaders: () => new Headers(),
  buildBffInternalHeaders: () => new Headers(),
}));

const independent = {
  id: "independent",
  planId: null,
  name: "Ordinary run",
  text: "Run",
  notes: null,
  sportType: "RUN",
  status: "PLANNED",
  scheduledDate: "2026-07-06",
  sessionIndex: 1,
  dayOffset: 0,
  weekIndex: 1,
  dayIndex: 1,
  links: [],
  structure: {
    kind: "FREEFORM",
    version: 1,
    text: "Run",
    durationSeconds: 1800,
  },
  summary: { kind: "FREEFORM", durationSeconds: 1800, hardSession: null },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("home scheduled workout contract", () => {
  it.each([false, true])(
    "shows independent courses with active plan=%s using the athlete-local day",
    async (hasPlan) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-05T23:30:00Z"));
      const owned = {
        ...independent,
        id: "plan-workout",
        planId: "plan",
        name: "Plan run",
      };
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/plans/active")
          return Response.json({
            data: {
              plan: hasPlan
                ? {
                    id: "plan",
                    title: "Current plan",
                    workouts: [owned],
                    startDate: "2026-07-06",
                    currentWeekIndex: 1,
                  }
                : null,
            },
          });
        if (url.pathname === "/plans/scheduled-workouts") {
          expect(url.searchParams.get("start")).toBe("2026-07-06");
          expect(url.searchParams.get("end")).toBe("2026-07-06");
          return Response.json({
            data: {
              inPlan: hasPlan ? [owned] : [],
              independent: [independent],
            },
          });
        }
        if (url.pathname === "/users/profile")
          return Response.json({ data: { timezone: "Asia/Shanghai" } });
        if (url.pathname === "/api/v2/activities/feed")
          return Response.json({ items: [] });
        return Response.json({ data: null });
      });
      vi.stubGlobal("fetch", fetch);
      const response = await GET(
        new NextRequest("http://client.test/api/v2/home", {
          headers: { cookie: "better-auth.session_token=synthetic" },
        }),
      );
      const home = await response.json();
      expect(home.todayDate).toBe("2026-07-06");
      expect(home.todayWorkouts).toHaveLength(hasPlan ? 2 : 1);
      expect(home.todayWorkouts).toContainEqual(
        expect.objectContaining({
          id: "independent",
          planId: null,
          title: "Ordinary run",
          durationSeconds: 1800,
        }),
      );
      expect(home.activePlan?.id ?? null).toBe(hasPlan ? "plan" : null);
    },
  );

  it.each([
    { today: "2026-11-27", currentWeekIds: [] },
    { today: "2026-12-01", currentWeekIds: ["first", "legacy", "sunday"] },
  ])("uses the calendar week for a fixed plan on $today", async ({ today, currentWeekIds }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${today}T01:00:00Z`));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input));
      if (pathname === "/plans/active") {
        return Response.json({ data: { plan: {
          id: "plan",
          title: "Fixed plan",
          planningMode: "FIXED",
          startDate: "2026-11-30",
          currentWeekIndex: 1,
          workouts: [
            { ...independent, id: "next-monday", scheduledDate: "2026-12-07" },
            { ...independent, id: "sunday", scheduledDate: "2026-12-06", weekIndex: 2 },
            { ...independent, id: "legacy", scheduledDate: null, dayOffset: 2 },
            { ...independent, id: "first", scheduledDate: "2026-12-01" },
          ],
        } } });
      }
      if (pathname === "/users/profile") {
        return Response.json({ data: { timezone: "Asia/Shanghai" } });
      }
      return Response.json({ data: null });
    }));

    const response = await GET(new NextRequest("http://client.test/api/v2/home", {
      headers: { cookie: "better-auth.session_token=synthetic" },
    }));
    const home = await response.json();
    expect(home.activePlan.currentWeekIndex).toBe(1);
    expect(home.activePlan.currentWeekWorkouts.map((workout: { id: string }) => workout.id))
      .toEqual(currentWeekIds);
    expect(home.activePlan.nextWorkout.scheduledDate).toBe("2026-12-01");
  });
});
