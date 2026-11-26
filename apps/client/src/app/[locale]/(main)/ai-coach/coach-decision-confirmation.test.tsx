import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarAdjustmentState } from "@shared/plan-proposal";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import {
  CoachDecisionDraftCard,
  type CoachDecisionDraftToolResult,
} from "./cards/CoachDecisionCard";
import { CoachScheduleAdjustmentCard } from "./cards/CoachScheduleAdjustmentCard";
import { rejectCoachDecision } from "@/api/ai-coach";

vi.mock("@/api/ai-coach", () => ({ rejectCoachDecision: vi.fn() }));

it("collapses past schedule cards by default and expands each one independently", () => {
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachScheduleAdjustmentCard
        state={CalendarAdjustmentState.Stale}
        planTitle="本周长跑"
        footer={<button type="button">加载最新课表</button>}
      >
        <p>原定周末</p>
      </CoachScheduleAdjustmentCard>
      <CoachScheduleAdjustmentCard
        state={CalendarAdjustmentState.Applied}
        planTitle="下周长跑"
      >
        <p>已移到周日</p>
      </CoachScheduleAdjustmentCard>
    </NextIntlClientProvider>,
  );
  const stale = screen.getByRole("button", { name: /课表已变化.*本周长跑/ });
  const applied = screen.getByRole("button", { name: /已生效.*下周长跑/ });
  expect(stale).toHaveAttribute("aria-expanded", "false");
  expect(applied).toHaveAttribute("aria-expanded", "false");
  expect(within(applied).getByText("已生效")).toHaveClass("text-success");
  expect(screen.queryByRole("button", { name: "加载最新课表" })).toBeNull();
  fireEvent.click(stale);
  expect(screen.getByRole("button", { name: "加载最新课表" })).toBeVisible();
  fireEvent.click(applied);
  expect(screen.getByText("已移到周日")).toBeVisible();
  expect(stale).toHaveAttribute("aria-expanded", "true");
});

const proposal: CoachDecisionDraftToolResult = {
  kind: "coach_decision_draft",
  decisionId: "decision",
  branchId: "branch",
  state: "PROPOSED",
  riskTier: "HIGH",
  decisionType: "PLAN_ADAPTATION",
  payload: {
    presentation: {
      title: "调整下一周",
      summary: "保留恢复时间",
      mode: "ADAPT",
      rows: [],
      counts: {},
    },
  },
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows the confirmed automatic scope and monthly direction on a continuous START proposal", () => {
  const rolling = {
    policy: { goal: "提升耐力", sportTypes: ["RUN", "STRENGTH", "STRETCHING", "OTHER", "UNKNOWN"], autoPlanMonths: true, autoGenerateWeeks: true, autoAdjustFuture: true },
    monthStrategies: [{ monthStart: "2026-11-01", objective: "逐步建立有氧基础", loadRange: null, durationMinutesRange: null, weekFocus: [{ weekStart: "2026-11-16", focus: "恢复后谨慎开始" }] }],
    generatedFrom: "2026-11-18", generatedThrough: "2026-11-22",
  };
  render(<QueryClientProvider client={new QueryClient()}><NextIntlClientProvider locale="zh" messages={messages}><CoachDecisionDraftCard result={{ ...proposal, decisionType: "PLAN_START", payload: { presentation: { ...proposal.payload!.presentation as object, mode: "START", startDate: "2026-11-18", rolling } } }} onConfirm={vi.fn()} /></NextIntlClientProvider></QueryClientProvider>);
  expect(screen.getByText("跑步 · 力量训练 · 拉伸 · 其他 · 其他")).toBeInTheDocument();
  expect(screen.getByText("持续训练计划")).toBeInTheDocument();
  expect(screen.getByText("逐步建立有氧基础")).toBeInTheDocument();
  expect(screen.getByText(/确认后将自动规划月度目标/)).toBeInTheDocument();
  expect(screen.getByText("确认后生成至 2026-11-22")).toBeInTheDocument();
  expect(screen.getAllByText(/恢复后谨慎开始/)).toHaveLength(1);
});
function openReview(title = "调整下一周") {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${title}`) }));
  expect(screen.getByRole("dialog", { name: title })).toBeVisible();
}

function show(state = "PROPOSED", applied = false, open = true) {
  const onConfirm = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard
          result={{ ...proposal, state }}
          isApplied={applied}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  if (open) openReview();
  return onConfirm;
}
it("requires an explicit confirmation and does not claim success after a click", () => {
  const confirm = show("PROPOSED", false, false);
  const card = screen.getByRole("button", { name: /^调整下一周/ });
  expect(card).toHaveAttribute("aria-expanded", "false");
  expect(card).toHaveTextContent("待确认");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "应用调整" })).not.toBeInTheDocument();
  openReview();
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getAllByText("确认后将应用以上变更。")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "应用调整" }));
  expect(confirm).toHaveBeenCalledWith("decision");
  expect(screen.queryByText("决策已应用")).toBeNull();
});
it("distinguishes domain approval from a successful apply receipt", () => {
  show("APPROVED");
  expect(screen.getByRole("status").textContent).toContain(
    "尚未收到执行成功回执",
  );
  expect(screen.queryByRole("button", { name: "应用调整" })).toBeNull();
  cleanup();
  show("PROPOSED", true);
  expect(screen.getByRole("status").textContent).toContain("决策已应用");
});
it("keeps the rejected proposal visible and cannot confirm it again", async () => {
  vi.mocked(rejectCoachDecision).mockResolvedValue();
  show();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("已取消此方案"),
  );
  expect(screen.getByRole("dialog", { name: "调整下一周" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "应用调整" })).toBeNull();
});
it("shows cancellation failure and keeps confirmation available", async () => {
  vi.mocked(rejectCoachDecision).mockRejectedValue(new Error("network error"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("取消失败"),
  );
  expect(
    screen.getByRole("button", { name: "应用调整" }).hasAttribute("disabled"),
  ).toBe(false);
});
it("honors a persisted rejected domain state", () => {
  show("REJECTED");
  expect(screen.getByRole("status").textContent).toContain("未应用变更");
  expect(screen.queryByRole("button", { name: "应用调整" })).toBeNull();
});

it("keeps superseded proposals visible without any confirm controls", () => {
  show("SUPERSEDED");
  expect(screen.queryByRole("button", { name: "应用调整" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("已被新方案替代");
});

it("renders a dated START candidate and confirms through the existing conversation action", () => {
  const onConfirm = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="zh"
        messages={messages}
        timeZone="Asia/Shanghai"
      >
        <CoachDecisionDraftCard
          result={{
            ...proposal,
            decisionType: "PLAN_START",
            payload: {
              presentation: {
                title: "开始已保存计划",
                summary: "保留原安排",
                mode: "START",
                startDate: "2026-11-22",
                calendarTimeZone: "Asia/Shanghai",
                calendarDraft: {
                  title: "完整计划",
                  periodWeeks: 1,
                  workouts: [
                    {
                      weekIndex: 1,
                      dayIndex: 1,
                      name: "周日轻松跑",
                      text: "20m @easy",
                      sportType: "RUN",
                    },
                  ],
                },
                counts: {
                  total: 1,
                  changed: 0,
                  preserved: 1,
                  added: 0,
                  deleted: 0,
                },
                facts: [],
                rows: [],
                warnings: [],
                syncImpact: "",
              },
            },
          }}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getAllByRole("button", { name: "周日轻松跑 · S1 · 2026-11-22" })
      .length,
  ).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "确认并开始" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith("decision");
  expect(screen.queryByText("决策已应用")).not.toBeInTheDocument();
  expect(screen.queryByText("每日训练时长上限")).not.toBeInTheDocument();
  expect(screen.queryByText("每周训练天数上限")).not.toBeInTheDocument();
});

it("shows localized deletion details and pending device sync for START", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard
          result={{
            ...proposal,
            decisionType: "PLAN_START",
            payload: {
              presentation: {
                title: "调整后开始",
                summary: "移除重复课",
                mode: "START",
                counts: {},
                facts: [],
                rows: [
                  {
                    name: "重复课程",
                    sportType: "RUN",
                    scheduledDate: "2026-11-24",
                    disposition: "APPLY",
                    changeKind: "DELETED",
                    before: "30m @easy",
                    after: "—",
                    rationale: "",
                  },
                ],
                warnings: [],
                syncImpact: "English server text",
              },
            },
          }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const row = within(screen.getByText("重复课程").closest("li")!);
  const before = within(row.getByRole("group", { name: "调整前" }));
  expect(before.getByText("删除")).toBeInTheDocument();
  expect(before.getByText("30m @easy")).toBeInTheDocument();
  const after = within(row.getByRole("group", { name: "调整后" }));
  expect(after.getByText("—")).toBeInTheDocument();
  expect(
    screen.getByText("开始后更新日历，并等待设备同步。"),
  ).toBeInTheDocument();
  expect(screen.queryByText("English server text")).not.toBeInTheDocument();
});

it("shows the original date and name beside the rescheduled workout", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard result={{
          ...proposal,
          payload: {
            presentation: {
              ...proposal.payload!.presentation as object,
              rows: [{
                name: "周末长距离跑",
                beforeName: "耐力长跑",
                beforeScheduledDate: "2026-11-24",
                scheduledDate: "2026-11-26",
                sportType: "RUN",
                disposition: "APPLY",
                before: "75m @easy",
                after: "60m @easy",
              }],
            },
          },
        }} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  openReview();
  const before = screen.getByText("耐力长跑").parentElement!;
  const after = screen.getByText("周末长距离跑").parentElement!;
  expect(before.querySelector("time")).toHaveAttribute("datetime", "2026-11-24");
  expect(after.querySelector("time")).toHaveAttribute("datetime", "2026-11-26");
  expect(within(before).getByText("75m @easy")).toBeInTheDocument();
  expect(within(after).getByText("60m @easy")).toBeInTheDocument();
});

it("restores the committed START receipt from an APPLIED draft without an applied message", () => {
  const onConfirm = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard
          result={{
            ...proposal,
            state: "APPLIED",
            decisionType: "PLAN_START",
            payload: {
              appliedReceipt: {
                mode: "START",
                planId: "plan",
                startDate: "2026-11-22",
                calendarTimeZone: "Asia/Shanghai",
                qualityContract: null,
                readbackVerified: true,
                changedWorkoutCount: 1,
                addedWorkoutCount: 0,
                deletedWorkoutCount: 0,
                preservedWorkoutCount: 2,
                identityMap: [],
              },
            },
          }}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByText(messages.AiCoachPage.decision.applyResult.APPLIED),
  ).toBeInTheDocument();
  expect(screen.getByText("2026-11-22 · Asia/Shanghai")).toBeInTheDocument();
  expect(
    screen.queryByText(messages.AiCoachPage.decision.scheduleRange),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("每日训练时长上限")).not.toBeInTheDocument();
  expect(screen.queryByText("每周训练天数上限")).not.toBeInTheDocument();
  expect(
    screen.getByText(messages.AiCoachPage.decision.readbackVerified),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByText(messages.AiCoachPage.decision.preserved).parentElement!,
    ).getByText("2"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "确认并开始" }),
  ).not.toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

const scheduleProposal: CoachDecisionDraftToolResult = {
  ...proposal,
  decisionType: "PLAN_SCHEDULE",
  payload: {
    presentation: {
      title: "调整剩余课表",
      summary: "保留恢复时间",
      mode: "SCHEDULE",
      startDate: "2026-11-22",
      calendarTimeZone: "Asia/Shanghai",
      range: { from: "2026-11-23", to: "2026-12-20" },
      qualityContract: {
        maxDailyMinutes: 30,
        maxTrainingDaysPerWeek: 2,
      },
      scheduleConstraints: {
        version: 1,
        revision: 3,
        calendarTimeZone: "Asia/Shanghai",
        fixedRestWeekdays: [2, 4],
        unavailableDates: ["2026-11-27"],
        availableDateOverrides: ["2026-12-01"],
        effectiveFrom: "2026-11-23",
        effectiveUntil: "2026-12-20",
        confirmation: { source: "USER", reference: "user-turn" },
      },
      calendarDraft: {
        title: "完整课表",
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 2,
            name: "协调后的轻松跑",
            sportType: "RUN",
            text: "20m @easy",
          },
        ],
      },
      counts: {
        total: 1,
        changed: 1,
        preserved: 0,
        protected: 2,
        added: 0,
        deleted: 0,
      },
      facts: [],
      rows: [],
      warnings: [],
      syncImpact: "",
    },
  },
};
it("shows the actual schedule rules and range before explicit confirmation", () => {
  const confirm = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard result={scheduleProposal} onConfirm={confirm} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  openReview("调整剩余课表");
  expect(screen.getByText("2026-11-23 — 2026-12-20")).toBeInTheDocument();
  expect(screen.getByText("每日训练时长上限").parentElement).toHaveTextContent(
    "30分钟",
  );
  expect(screen.getByText("每周训练天数上限").parentElement).toHaveTextContent(
    "2天",
  );
  expect(screen.getByText("星期二、星期四")).toBeInTheDocument();
  expect(screen.getByText("不可训练日期").parentElement).toHaveTextContent(
    "2026-11-27",
  );
  expect(
    screen.getByText("已确认的可训练例外").parentElement,
  ).toHaveTextContent("2026-12-01");
  expect(screen.getByText("规则生效日期").parentElement).toHaveTextContent(
    "2026-11-23",
  );
  expect(screen.getByText("规则结束日期").parentElement).toHaveTextContent(
    "2026-12-20",
  );
  expect(
    screen.getByRole("button", { name: "协调后的轻松跑 · S1 · 2026-11-23" }),
  ).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认并调整课表" }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith("decision");
});
it("restores the committed SCHEDULE receipt from an APPLIED draft without an applied message", () => {
  const onConfirm = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard
          result={{
            ...proposal,
            state: "APPLIED",
            decisionType: "PLAN_SCHEDULE",
            payload: {
              appliedReceipt: {
                mode: "SCHEDULE",
                planId: "plan",
                range: { from: "2026-11-23", to: "2026-12-20" },
                startDate: "2026-11-22",
                calendarTimeZone: "Asia/Shanghai",
                qualityContract: {
                  maxDailyMinutes: 30,
                  maxTrainingDaysPerWeek: 2,
                },
                scheduleConstraints: (
                  scheduleProposal.payload!.presentation as Record<string, unknown>
                ).scheduleConstraints,
                readbackVerified: true,
                changedWorkoutCount: 1,
                addedWorkoutCount: 0,
                deletedWorkoutCount: 0,
                preservedWorkoutCount: 2,
                identityMap: [],
              },
            },
          }}
          onConfirm={onConfirm}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByText(messages.AiCoachPage.decision.applyResult.APPLIED),
  ).toBeInTheDocument();
  expect(screen.getByText("2026-11-22 · Asia/Shanghai")).toBeInTheDocument();
  expect(
    screen.getByText(messages.AiCoachPage.decision.readbackVerified),
  ).toBeInTheDocument();
  expect(
    within(
      screen.getByText(messages.AiCoachPage.decision.preserved).parentElement!,
    ).getByText("2"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "确认并开始" }),
  ).not.toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText("2026-11-23 — 2026-12-20")).toBeInTheDocument();
  expect(screen.getByText("每日训练时长上限").parentElement).toHaveTextContent(
    "30分钟",
  );
  expect(screen.getByText("每周训练天数上限").parentElement).toHaveTextContent(
    "2天",
  );
  expect(screen.getByText("星期二、星期四")).toBeInTheDocument();
  expect(screen.getByText("不可训练日期").parentElement).toHaveTextContent(
    "2026-11-27",
  );
  expect(
    screen.getByText("已确认的可训练例外").parentElement,
  ).toHaveTextContent("2026-12-01");
  expect(screen.getByText("规则生效日期").parentElement).toHaveTextContent(
    "2026-11-23",
  );
  expect(screen.getByText("规则结束日期").parentElement).toHaveTextContent(
    "2026-12-20",
  );
});

it("keeps related independent and other-plan workouts visible as unmodified coordination facts", () => {
  const value = structuredClone(scheduleProposal);
  (
    value.payload!.presentation as Record<string, unknown>
  ).relatedCalendarConflicts = [
    {
      code: "REST_DAY_OCCUPIED",
      date: "2026-11-24",
      workoutId: "hidden-independent-id",
      planId: null,
      name: "独立力量训练",
      managed: false,
    },
    {
      code: "DAY_BUDGET",
      date: "2026-11-26",
      workoutId: "hidden-foreign-id",
      planId: "hidden-plan-id",
      name: "其他计划骑行",
      managed: false,
    },
  ];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachDecisionDraftCard result={value} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  openReview("调整剩余课表");
  expect(screen.getByText("相关课程仍需协调")).toBeInTheDocument();
  expect(
    screen.getByText(
      "以下独立课程或其他计划课程未由本提案修改，请继续与教练协调。",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("独立力量训练").closest("li")).toHaveTextContent(
    "2026-11-24",
  );
  expect(screen.getByText("其他计划骑行").closest("li")).toHaveTextContent(
    "2026-11-26",
  );
  expect(screen.queryByText("hidden-independent-id")).not.toBeInTheDocument();
  expect(screen.queryByText("hidden-plan-id")).not.toBeInTheDocument();
});
