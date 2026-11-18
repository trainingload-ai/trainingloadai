import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import messages from "../../../../../packages/messages/client-core/zh.json";
import { getPlanWindowSnapshot, type TrainingPlanDetail } from "@/api/plans";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { RollingPlanLoadSummary } from "./rolling-plan-load-summary";

vi.mock("@/api/plans", () => ({ getPlanWindowSnapshot: vi.fn() }));
it("reads a bounded current month from plan start, keeps unknown load and refreshes after automatic application", async () => {
  const metric = {
    unit: "NORMALIZED_LOAD",
    knownCount: 1,
    totalCount: 2,
    coverage: "PARTIAL",
    sources: ["HEART_RATE"],
  };
  vi.mocked(getPlanWindowSnapshot).mockResolvedValue({
    window: { from: "2026-11-18", through: "2026-11-30" },
    load: {
      actual: { ...metric, value: 24.3 },
      remainingPlanned: { ...metric, value: 50 },
      ungeneratedForecast: {
        unit: "NORMALIZED_LOAD",
        value: null,
        coverage: "UNKNOWN",
      },
    },
  } as never);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const plan = {
    id: "plan",
    planningMode: "ROLLING",
    status: "ACTIVE",
    startDate: "2026-11-18",
    currentWeekIndex: 1,
    currentDayIndex: 3,
  } as TrainingPlanDetail;
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <RollingPlanLoadSummary plan={plan} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("24.3")).toBeInTheDocument();
  expect(getPlanWindowSnapshot).toHaveBeenCalledWith(
    "plan",
    "2026-11-18",
    "2026-11-30",
  );
  expect(screen.getByText("2026-11-18 – 2026-11-30")).toBeInTheDocument();
  expect(screen.getAllByText(/1\/2/)).toHaveLength(2);
  expect(screen.getAllByText(/心率/)).toHaveLength(2);
  const forecast = screen.getByText("未生成部分预测").parentElement!;
  expect(within(forecast).getByText("未知")).toBeInTheDocument();
  expect(within(forecast).queryByText("0.0")).not.toBeInTheDocument();
  const before = vi.mocked(getPlanWindowSnapshot).mock.calls.length;
  await invalidateAfterPlanMutation(client);
  await waitFor(() =>
    expect(vi.mocked(getPlanWindowSnapshot).mock.calls.length).toBeGreaterThan(
      before,
    ),
  );
});
