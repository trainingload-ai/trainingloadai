import dayjs from "dayjs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanProposalPresentation } from "@shared/plan-proposal";
import { PlanStartConversationDialog } from "./plan-start-conversation-dialog";

const api = vi.hoisted(() => ({
  fetchDraft: vi.fn(),
  assess: vi.fn(),
  confirm: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/query-invalidation", () => ({
  invalidateAfterPlanMutation: api.invalidate,
}));

vi.mock("sonner", () => ({
  toast: { success: api.toastSuccess, error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "zh",
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString().slice(0, 10),
  }),
}));

vi.mock("@/api/plans", () => ({
  fetchPlanStartDraft: api.fetchDraft,
  assessPlanStart: api.assess,
  confirmPlanStart: api.confirm,
}));

vi.mock("@/public-demo/use-viewer-session", () => ({
  useViewerSession: () => ({ data: { user: { id: "owner" } } }),
}));

vi.mock("@/components/calendar-select", () => ({
  default: ({
    date,
    onSelect,
    fromDate,
  }: {
    date?: Date;
    fromDate?: Date;
    onSelect: (d?: Date) => void;
  }) => (
    <input
      aria-label="start date"
      type="date"
      min={
        fromDate
          ? `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`
          : undefined
      }
      value={date ? dayjs(date).format("YYYY-MM-DD") : ""}
      onChange={(e) =>
        onSelect(
          e.target.value ? new Date(e.target.value + "T12:00:00") : undefined,
        )
      }
    />
  ),
}));

vi.mock(
  "@/app/[locale]/(main)/calendar/components/calendar-move-preview-calendar",
  () => ({
    CalendarMovePreviewCalendar: ({
      initialDate,
      schedule,
    }: {
      initialDate: string;
      schedule: Record<string, Array<{ id: string; name?: string | null }>>;
    }) => (
      <div data-testid="preview-calendar">
        {initialDate}:
        {Object.entries(schedule)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([date, items]) =>
              `${date}=${items.map((w) => `${w.id}:${w.name ?? ""}`).join(",")}`,
          )
          .join(";")}
      </div>
    ),
  }),
);

vi.mock(
  "@/app/[locale]/(main)/ai-coach/cards/coach-schedule-comparison",
  () => ({
    CoachScheduleReview: ({ proposal }: { proposal: PlanProposalPresentation }) => (
      <div data-testid="schedule-review">
        {proposal.title}:
        {proposal.rows
          .filter((r) => r.changeKind && r.changeKind !== "PRESERVED")
          .map((r) => `${r.changeKind}:${r.name}@${r.scheduledDate}`)
          .join(",")}
      </div>
    ),
  }),
);

function makeRollingDraft(startDate = "2026-12-31") {
  return {
    startDate,
    earliestStartDate: "2026-12-30",
    calendarTimeZone: "Asia/Shanghai",
    revision: "rev-1",
    plan: {
      id: "plan-p07",
      title: "跑步体能重建 · 持续计划",
      planningMode: "ROLLING",
      status: "DRAFT",
      periodWeeks: null,
      generationMetadata: {},
      workouts: [
        { id: "w-jan2", name: "跑走交替 35 分钟", dayOffset: 2, weekIndex: 1, dayIndex: 3, sessionIndex: 1 },
        { id: "w-jan4", name: "轻松跑 30 分钟", dayOffset: 4, weekIndex: 1, dayIndex: 5, sessionIndex: 1 },
        { id: "w-jan6", name: "恢复跑 25 分钟", dayOffset: 6, weekIndex: 1, dayIndex: 7, sessionIndex: 1 },
      ],
    },
  };
}

const sampleProposal: PlanProposalPresentation = {
  title: "跑步体能重建 · 持续计划",
  summary: "建议将首周负荷下调 10 分钟",
  mode: "START",
  startDate: "2026-12-31",
  calendarTimeZone: "Asia/Shanghai",
  facts: [],
  syncImpact: "LOCAL_ONLY",
  counts: { total: 3, changed: 1, added: 0, deleted: 0, preserved: 2, skipped: 0 },
  rows: [
    {
      workoutId: "w-jan2",
      name: "轻松走跑 25 分钟",
      beforeName: "跑走交替 35 分钟",
      sportType: "RUN",
      beforeScheduledDate: "2027-01-02",
      scheduledDate: "2027-01-02",
      disposition: "APPLY",
      changeKind: "CHANGED",
      before: "35 min",
      after: "25 min",
      rationale: "近两周无跑步记录，首课下调负荷。",
    },
  ],
  warnings: [],
};

function renderDialog(onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={client}>
        <PlanStartConversationDialog
          open
          planId="plan-p07"
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("PlanStartConversationDialog (direct start assessment)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows all three cross-year rolling workouts (Jan 2, 4, 6) and carryover notice", async () => {
    api.fetchDraft.mockResolvedValueOnce(makeRollingDraft());
    renderDialog();

    const cal = await screen.findByTestId("preview-calendar");
    expect(cal.textContent).toContain("2027-01-02=w-jan2");
    expect(cal.textContent).toContain("2027-01-04=w-jan4");
    expect(cal.textContent).toContain("2027-01-06=w-jan6");
    expect(screen.getByText(/rollingCarryoverNote/)).toBeTruthy();
  });

  it("starts directly, invalidates queries, and closes when original schedule fits", async () => {
    api.fetchDraft.mockResolvedValueOnce(makeRollingDraft());
    api.assess.mockResolvedValueOnce({
      outcome: "STARTED",
      alreadyActive: false,
      startDate: "2026-12-31",
      calendarTimeZone: "Asia/Shanghai",
      revision: "rev-1",
      summary: "适配当前状态",
      plan: makeRollingDraft().plan,
    });
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(await screen.findByRole("button", { name: "evaluate" }));

    await waitFor(() => {
      expect(api.assess).toHaveBeenCalledWith(
        "plan-p07",
        { startDate: "2026-12-31", revision: "rev-1", lang: "zh" },
        expect.any(AbortSignal),
      );
      expect(api.invalidate).toHaveBeenCalledWith(expect.anything(), {
        planId: "plan-p07",
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows coach suggestion + comparison and supports both start-with-suggestions and start-original", async () => {
    api.fetchDraft.mockResolvedValueOnce(makeRollingDraft());
    api.assess.mockResolvedValueOnce({
      outcome: "SUGGESTED_CHANGES",
      startDate: "2026-12-31",
      calendarTimeZone: "Asia/Shanghai",
      revision: "rev-1",
      summary: "近两周未跑步，建议首课缩短至 25 分钟。",
      originalCanStart: true,
      previewId: "preview-1",
      proposal: sampleProposal,
    });
    api.confirm.mockResolvedValueOnce({
      plan: makeRollingDraft().plan,
      started: true,
      alreadyActive: false,
    });
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(await screen.findByRole("button", { name: "evaluate" }));

    expect(await screen.findByTestId("schedule-review")).toBeTruthy();
    expect(screen.getByText("近两周未跑步，建议首课缩短至 25 分钟。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "startOriginal" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "startWithSuggestions" }));

    await waitFor(() => {
      expect(api.confirm).toHaveBeenCalledWith("plan-p07", {
        startDate: "2026-12-31",
        revision: "rev-1",
        choice: "SUGGESTED",
        previewId: "preview-1",
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows conflict details without start-original when original schedule has hard conflicts", async () => {
    api.fetchDraft.mockResolvedValueOnce(makeRollingDraft());
    api.assess.mockResolvedValueOnce({
      outcome: "CONFLICT",
      startDate: "2026-12-31",
      calendarTimeZone: "Asia/Shanghai",
      revision: "rev-1",
      summary: "1 月 2 日与固定休息日冲突，已调整至 1 月 3 日。",
      conflicts: [{ date: "2027-01-02", code: "REST_DAY", message: "周六为固定休息日" }],
      originalCanStart: false,
      previewId: "preview-conflict",
      proposal: sampleProposal,
    });
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "evaluate" }));

    expect(await screen.findByText("conflictHeading")).toBeTruthy();
    expect(screen.getByText(/周六为固定休息日/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "startOriginal" })).toBeNull();
    expect(screen.getByRole("button", { name: "startWithSuggestions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "adjustSchedule" })).toBeTruthy();
  });

  it("handles insufficient data and assessment failure retry while preserving draft/date", async () => {
    api.fetchDraft.mockResolvedValueOnce(makeRollingDraft());
    api.assess
      .mockRejectedValueOnce(new Error("NETWORK_ERROR"))
      .mockResolvedValueOnce({
        outcome: "INSUFFICIENT_DATA",
        startDate: "2026-12-31",
        calendarTimeZone: "Asia/Shanghai",
        revision: "rev-1",
        summary: "近期无训练记录。",
        missingEvidence: ["近 8 周无跑步活动", "未设置配速/心率区间"],
        originalCanStart: true,
        conflicts: [],
      });
    api.confirm.mockResolvedValueOnce({
      plan: makeRollingDraft().plan,
      started: true,
      alreadyActive: false,
    });
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(await screen.findByRole("button", { name: "evaluate" }));
    expect(await screen.findByText("assessmentFailed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "retryAssessment" }));
    expect(await screen.findByText("insufficientDataHeading")).toBeTruthy();
    expect(screen.getByText("近 8 周无跑步活动")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "startOriginal" }));
    await waitFor(() => {
      expect(api.confirm).toHaveBeenCalledWith("plan-p07", {
        startDate: "2026-12-31",
        revision: "rev-1",
        choice: "ORIGINAL",
        previewId: undefined,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
