import { fireEvent, render, screen, within } from "@testing-library/react";
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
  overrides: Partial<TrainingPlanDetail> = {},
) {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <RollingPlanMonthDirection
        plan={{ ...plan, ...overrides, monthDirections }}
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
    const disclosure = screen.getByText("当月方向", { selector: "summary" });
    expect(screen.getByText("十一月建立有氧基础")).not.toBeVisible();
    fireEvent.click(disclosure);
    expect(screen.getByText("十一月建立有氧基础")).toBeVisible();
    expect(screen.queryByText("十二月逐步递进")).not.toBeInTheDocument();
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument();
  });
  it("keeps past directions behind a separate entry when the current month is missing", async () => {
    show([
      month("2027-01-01", "一月目标"),
      month("2026-10-01", "过往方向"),
      month("2026-12-01", "十二月逐步递进"),
    ]);
    expect(screen.queryByText("当月方向")).not.toBeInTheDocument();
    expect(screen.queryByText("十二月逐步递进")).not.toBeInTheDocument();
    expect(screen.queryByText("过往方向")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "历史方向" }));
    const history = within(await screen.findByRole("dialog", { name: "历史方向" }));
    fireEvent.click(history.getByText("2026-10 月度方向", { selector: "summary" }));
    expect(history.getByText("过往方向")).toBeVisible();
    expect(history.queryByText("十二月逐步递进")).not.toBeInTheDocument();
  });
  it("shows only planned monthly targets and dates for a partial window", () => {
    const direction = month("2026-11-01", "逐步建立有氧基础");
    direction.effectiveFrom = "2026-11-18";
    direction.strategy.loadRange = {
      unit: "NORMALIZED_LOAD",
      min: 90,
      max: 120,
    };
    direction.strategy.durationMinutesRange = { min: 185, max: 245 };
    direction.strategy.monthOverMonthReason = "不应比较半月和整月。";
    direction.strategy.weekFocus = [
      {
        weekStart: "2026-11-16",
        focus: "起步",
        loadRange: { unit: "NORMALIZED_LOAD", min: 30, max: 45 },
        durationMinutesRange: { min: 45, max: 60 },
      },
    ];

    const previous = month("2026-10-01", "上月目标");
    previous.strategy.durationMinutesRange = { min: 100, max: 150 };
    show([previous, direction]);
    fireEvent.click(screen.getByText("当月方向", { selector: "summary" }));

    expect(screen.getByText("2026-11-18 – 2026-11-30 的目标")).toBeVisible();
    expect(screen.getByText("计划负荷")).toBeVisible();
    expect(screen.getByText("90–120")).toBeVisible();
    expect(screen.getByText(/185–245\s*分钟/)).toBeVisible();
    expect(screen.getAllByText("暂无上月对比")).toHaveLength(2);
    expect(screen.queryByText(/起步|实际完成|计划跑量|较上月|不应比较半月和整月/)).not.toBeInTheDocument();
  });
  it("compares like-for-like targets against the previous full month", () => {
    const previous = month("2026-10-01", "建立基础");
    const current = month("2026-11-01", "巩固耐力");
    previous.strategy.runningDistanceKmRange = { min: 40, max: 50 };
    current.strategy.runningDistanceKmRange = { min: 50, max: 60 };
    previous.strategy.durationMinutesRange = { min: 250, max: 280 };
    current.strategy.durationMinutesRange = { min: 230, max: 260 };
    current.strategy.loadRange = { unit: "NORMALIZED_LOAD", min: 90, max: 120 };
    previous.strategy.loadRange = current.strategy.loadRange;
    current.strategy.monthOverMonthReason = "把高强度训练换成轻松跑，保持总负荷。";

    show([previous, current], { startDate: "2026-10-01", currentWeekIndex: 8 });
    fireEvent.click(screen.getByText("当月方向", { selector: "summary" }));

    const distance = within(screen.getByText("计划跑量").parentElement!);
    expect(distance.getByText(/50–60\s*公里/)).toBeVisible();
    expect(distance.getByText("较上月增加")).toBeVisible();
    expect(within(screen.getByText("计划时长").parentElement!).getByText("较上月减少")).toBeVisible();
    expect(within(screen.getByText("计划负荷").parentElement!).getByText("与上月持平")).toBeVisible();
    expect(screen.getByText(current.strategy.monthOverMonthReason)).toBeVisible();
  });
  it("keeps legacy fixed plans unchanged and preserves the policy and monthly facts through the home BFF mapper", () => {
    const directions = [month("2026-11-01", "十一月建立有氧基础")];
    const { container } = show(directions, { planningMode: "FIXED" });
    expect(container).toBeEmptyDOMElement();
    const home = mapTrainingPlanToHomePlan(
      { ...plan, monthDirections: directions },
      "2026-11-18",
    );
    expect(home.automationPolicy).toEqual(plan.automationPolicy);
    expect(home.monthDirections).toEqual(directions);
  });
});
