import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../packages/messages/client-core/zh.json";
import { RollingPlanAutomation } from "./rolling-plan-automation";
import { getPlanDetail, type TrainingPlanDetail } from "@/api/plans";
import { queryKeys } from "@/lib/query-keys";

const network = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  apiFetch: network.apiFetch,
  ApiFetchError: (await import("@/lib/api-error")).ApiFetchError,
}));

const plan: Pick<
  TrainingPlanDetail,
  "id" | "planningMode" | "status" | "startDate"
> = {
  id: "continuous-plan",
  planningMode: "ROLLING" as const,
  status: "ACTIVE" as const,
  startDate: "2026-11-18",
};
const initial = () => ({
  enabled: true,
  revision: 1,
  hasAuthorization: true,
  jobs: [
    {
      id: "week-job",
      kind: "WEEK",
      windowStart: "2026-11-23",
      state: "PENDING",
      attempts: 0,
      lastError: null,
      availableAt: "2026-11-19T12:00:00.000Z",
    },
  ],
});
const clients: QueryClient[] = [];
function show(overrides: Partial<typeof plan> = {}, children?: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <RollingPlanAutomation plan={{ ...plan, ...overrides }} />
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  network.apiFetch.mockReset();
});

describe("continuous plan scheduling status", () => {
  it("reads the real job state without requesting another weekly confirmation or writing on mount", async () => {
    network.apiFetch.mockResolvedValue(initial());
    const { client, container } = show();
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.plans.automation(plan.id))).toEqual(initial()),
    );
    expect(container).toBeEmptyDOMElement();
    expect(network.apiFetch).toHaveBeenCalledWith(
      "/plans/continuous-plan/automation",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      network.apiFetch.mock.calls.every(
        ([, options]) => options.method === "GET",
      ),
    ).toBe(true);
  });

  it("restores scheduling only on request for a legacy plan with scheduling disabled", async () => {
    let snapshot = { ...initial(), enabled: false };
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let writes = 0;
    network.apiFetch.mockImplementation(async (_path, options) => {
      if (options.method === "PUT") {
        writes++;
        if (writes === 1) await pending;
        snapshot = {
          ...snapshot,
          enabled: JSON.parse(options.body).enabled,
          revision: snapshot.revision + 1,
        };
        return { enabled: snapshot.enabled, revision: snapshot.revision };
      }
      return snapshot;
    });
    show();
    const resume = await screen.findByRole("button", { name: "恢复排课" });
    act(() => {
      resume.click();
      resume.click();
    });
    await waitFor(() => expect(writes).toBe(1));
    expect(screen.getByText("后续排课已关闭")).toBeVisible();
    expect(resume).toBeDisabled();
    await act(async () => {
      finish();
      await pending;
    });
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    expect(writes).toBe(1);
    expect(snapshot.enabled).toBe(true);
  });

  it("keeps the server state and offers retry when an update cannot be confirmed", async () => {
    network.apiFetch.mockImplementation(async (_path, options) => {
      if (options.method === "PUT") throw new Error("Uncertain network result");
      return { ...initial(), enabled: false };
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "恢复排课" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "未能确认操作结果",
    );
    expect(screen.getByText("后续排课已关闭")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "恢复排课" }),
      ).toBeEnabled(),
    );
  });

  it.each(["BLOCKED", "FAILED"])(
    "shows %s as an incomplete update without exposing internal errors",
    async (state) => {
      const snapshot = initial();
      snapshot.jobs[0] = {
        ...snapshot.jobs[0],
        state,
        lastError: "private-lease-token-and-stack",
      } as never;
      network.apiFetch.mockResolvedValue(snapshot);
      show();
      expect(
        await screen.findByText("课表尚未更新，请检查教练设置或与教练沟通。"),
      ).toBeVisible();
      expect(screen.queryByText("已更新")).not.toBeInTheDocument();
      expect(
        screen.queryByText("private-lease-token-and-stack"),
      ).not.toBeInTheDocument();
    },
  );

  it("refreshes an observed calendar when a background job is applied and deduplicates repeated receipts", async () => {
    let snapshot = initial();
    snapshot.jobs[0].state = "RUNNING";
    const initialPlan = {
      ...plan,
      workouts: [{ scheduledDate: "2026-11-25" }],
    } as TrainingPlanDetail;
    network.apiFetch.mockImplementation(async (path) =>
      path.endsWith("/automation")
        ? snapshot
        : {
            plan: {
              ...initialPlan,
              workouts: [{ scheduledDate: "2026-11-27" }],
            },
          },
    );
    function CalendarFact() {
      const result = useQuery({
        queryKey: queryKeys.plans.detail(plan.id),
        queryFn: () => getPlanDetail(plan.id),
        initialData: initialPlan,
        staleTime: Infinity,
      });
      return (
        <output aria-label="Calendar course date">
          {result.data?.workouts[0]?.scheduledDate}
        </output>
      );
    }
    const { client } = show({}, <CalendarFact />);
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.plans.automation(plan.id))).toEqual(snapshot),
    );
    expect(screen.getByLabelText("Calendar course date")).toHaveTextContent(
      "2026-11-25",
    );
    snapshot = {
      ...snapshot,
      jobs: [{ ...snapshot.jobs[0], state: "APPLIED" }],
    };
    await act(async () => {
      await client.refetchQueries({
        queryKey: queryKeys.plans.automation(plan.id),
      });
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Calendar course date")).toHaveTextContent(
        "2026-11-27",
      ),
    );
    const reads = () =>
      network.apiFetch.mock.calls.filter(
        ([path]) => path === "/plans/continuous-plan",
      ).length;
    expect(reads()).toBe(1);
    await act(async () => {
      await client.refetchQueries({
        queryKey: queryKeys.plans.automation(plan.id),
      });
    });
    expect(reads()).toBe(1);
  });

  it("reports unavailable AI access even before a job can be queued", async () => {
    network.apiFetch.mockResolvedValue({
      ...initial(),
      jobs: [],
      blockedReason: "ROLLING_AI_ACCESS_REQUIRED",
    });
    show();
    expect(
      await screen.findByText(
        "请检查 AI 教练功能和数据授权，自动安排暂时无法继续。",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "恢复排课" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("后续课表会按设置自动安排，无需逐次确认。"),
    ).not.toBeInTheDocument();
  });

  it("does not offer to restore a plan without initial authorization", async () => {
    network.apiFetch.mockResolvedValue({ ...initial(), enabled: false, hasAuthorization: false });
    show();
    expect(await screen.findByText("请先与教练确认持续计划的自动管理设置。")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("can reload an unavailable state without guessing whether automation is enabled", async () => {
    network.apiFetch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(initial());
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "暂时无法读取排课状态",
    );
    expect(screen.queryByRole("button", { name: "恢复排课" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取状态" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it.each([
    { planningMode: "FIXED" as const },
    { status: "DRAFT" as const },
    { status: "PAUSED" as const },
    { status: "CANCELLED" as const },
    { status: "COMPLETED" as const },
  ])(
    "only observes rolling plans while active (%o)",
    (overrides) => {
      show(overrides);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(network.apiFetch).not.toHaveBeenCalled();
    },
  );
});
