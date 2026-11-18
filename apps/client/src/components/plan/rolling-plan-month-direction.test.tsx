import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../packages/messages/client-core/zh.json";
import type { PlanMonthDirection, TrainingPlanDetail } from "@/api/plans";
import { mapTrainingPlanToHomePlan } from "@/api/v2-home";
import { RollingPlanMonthDirection } from "./rolling-plan-month-direction";

function month(monthStart: string, objective: string): PlanMonthDirection {
  return {
    monthStart,
    monthEnd:
      monthStart === "2026-11-01"
        ? "2026-11-30"
        : `${monthStart.slice(0, 7)}-31`,
    effectiveFrom: monthStart,
    revision: 1,
    strategy: {
      objective,
      loadRange: null,
      durationMinutesRange: null,
      weekFocus: [],
    },
  };
}
const plan: TrainingPlanDetail = {
  id: "continuous",
  userId: "owner",
  sourceType: "AI",
  status: "ACTIVE",
  endDate: null,
  createdAt: "2026-11-18",
  updatedAt: "2026-11-18",
  title: "长期耐力训练",
  planningMode: "ROLLING",
  periodWeeks: null,
  startDate: "2026-11-18",
  currentWeekIndex: 1,
  currentDayIndex: 1,
  workouts: [],
  automationPolicy: {
    revision: 2,
    enabled: true,
    settings: {
      goal: "提升耐力",
      sportTypes: ["RUN"],
      autoPlanMonths: true,
      autoGenerateWeeks: true,
      autoAdjustFuture: true,
    },
  },
};
function show(
  monthDirections: PlanMonthDirection[],
  planningMode: "FIXED" | "ROLLING" = "ROLLING",
) {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <RollingPlanMonthDirection
        plan={{ ...plan, planningMode, monthDirections }}
      />
    </NextIntlClientProvider>,
  );
}
describe("active continuous plan monthly direction", () => {
  it("shows the current month objective even when a future direction is listed first", () => {
    show([
      month("2026-12-01", "十二月逐步递进"),
      month("2026-11-01", "十一月建立有氧基础"),
    ]);
    expect(
      screen.getByRole("heading", { name: "2026-11 月度方向" }),
    ).toBeInTheDocument();
    expect(screen.getByText("十一月建立有氧基础")).toBeVisible();
    expect(screen.queryByText("十二月逐步递进")).not.toBeInTheDocument();
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument();
  });
  it("falls back to the earliest future direction, without repeating a past month", () => {
    show([
      month("2027-01-01", "一月目标"),
      month("2026-10-01", "过往方向"),
      month("2026-12-01", "十二月逐步递进"),
    ]);
    expect(
      screen.getByRole("heading", { name: "2026-12 月度方向" }),
    ).toBeInTheDocument();
    expect(screen.getByText("十二月逐步递进")).toBeVisible();
    expect(screen.queryByText("过往方向")).not.toBeInTheDocument();
  });
  it("keeps legacy fixed plans unchanged and preserves the policy and monthly facts through the home BFF mapper", () => {
    const directions = [month("2026-11-01", "十一月建立有氧基础")];
    const { container } = show(directions, "FIXED");
    expect(container).toBeEmptyDOMElement();
    const home = mapTrainingPlanToHomePlan(
      { ...plan, monthDirections: directions },
      "2026-11-18",
    );
    expect(home.automationPolicy).toEqual(plan.automationPolicy);
    expect(home.monthDirections).toEqual(directions);
  });
});
