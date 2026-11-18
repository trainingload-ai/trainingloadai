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
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import {
  CoachDecisionDraftCard,
  type CoachDecisionDraftToolResult,
} from "./cards/CoachDecisionCard";
import { rejectCoachDecision } from "@/api/ai-coach";

vi.mock("@/api/ai-coach", () => ({ rejectCoachDecision: vi.fn() }));
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
function show(state = "PROPOSED", applied = false) {
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
  return onConfirm;
}
it("requires an explicit confirmation and does not claim success after a click", () => {
  const confirm = show();
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
  expect(screen.getByText("调整下一周")).toBeTruthy();
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
  expect(
    within(screen.getByText("重复课程").parentElement!).getByText("删除"),
  ).toBeInTheDocument();
  expect(screen.getByText("30m @easy → —")).toBeInTheDocument();
  expect(
    screen.getByText("开始后更新日历，并等待设备同步。"),
  ).toBeInTheDocument();
  expect(screen.queryByText("English server text")).not.toBeInTheDocument();
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
  expect(screen.getByText("2026-11-23 — 2026-12-20")).toBeInTheDocument();
  expect(screen.getByText("星期二、星期四")).toBeInTheDocument();
  expect(screen.getByText("不可训练日期").parentElement).toHaveTextContent(
    "2026-11-27",
  );
  expect(
    screen.getByText("已确认的可训练例外").parentElement,
  ).toHaveTextContent("2026-12-01");
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
                startDate: "2026-11-22",
                calendarTimeZone: "Asia/Shanghai",
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
