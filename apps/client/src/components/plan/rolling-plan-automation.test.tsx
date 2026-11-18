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

describe("continuous plan automatic management", () => {
  it("reads the real job state without requesting another weekly confirmation or writing on mount", async () => {
    network.apiFetch.mockResolvedValue(initial());
    show();
    expect(await screen.findByText("等待生成")).toBeVisible();
    expect(screen.getByText("2026-11-23")).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭自动管理" })).toBeEnabled();
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

  it("waits for authoritative state and can restore automation after disabling it", async () => {
    let snapshot = initial();
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
    const disable = await screen.findByRole("button", { name: "关闭自动管理" });
    act(() => {
      disable.click();
      disable.click();
    });
    await waitFor(() => expect(writes).toBe(1));
    expect(screen.getByText("自动管理已开启")).toBeVisible();
    expect(disable).toBeDisabled();
    await act(async () => {
      finish();
      await pending;
    });
    const enable = await screen.findByRole("button", { name: "恢复自动管理" });
    expect(screen.getByText("自动管理已关闭")).toBeVisible();
    fireEvent.click(enable);
    await screen.findByRole("button", { name: "关闭自动管理" });
    expect(writes).toBe(2);
    expect(snapshot.hasAuthorization).toBe(true);
  });

  it("keeps the server state and offers retry when an update cannot be confirmed", async () => {
    network.apiFetch.mockImplementation(async (_path, options) => {
      if (options.method === "PUT") throw new Error("Uncertain network result");
      return initial();
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "关闭自动管理" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "未能确认操作结果",
    );
    expect(screen.getByText("自动管理已开启")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "关闭自动管理" }),
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
    await screen.findByText("正在规划");
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

  it("keeps paused training distinct from enabled automatic management", async () => {
    network.apiFetch.mockResolvedValue(initial());
    show({ status: "PAUSED" });
    expect(
      await screen.findByRole("button", { name: "关闭自动管理" }),
    ).toBeEnabled();
    expect(
      screen.getByText("训练计划已暂停；恢复训练后才会自动安排新课表。"),
    ).toBeVisible();
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
    expect(screen.getByText("自动管理已开启")).toBeVisible();
    expect(
      screen.queryByText("后续课表会按设置自动安排，无需逐次确认。"),
    ).not.toBeInTheDocument();
  });

  it("does not promise automatic scheduling after disabling an idle plan", async () => {
    let snapshot = { ...initial(), jobs: [] };
    network.apiFetch.mockImplementation(async (_path, options) => {
      if (options.method === "PUT") {
        snapshot = { ...snapshot, enabled: false, revision: 2 };
        return { enabled: false, revision: 2 };
      }
      return snapshot;
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "关闭自动管理" }),
    );
    await screen.findByText("自动管理已关闭");
    expect(
      screen.queryByText("后续课表会按设置自动安排，无需逐次确认。"),
    ).not.toBeInTheDocument();
  });

  it("can reload an unavailable state without guessing whether automation is enabled", async () => {
    network.apiFetch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(initial());
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "暂时无法读取自动管理状态",
    );
    expect(screen.queryByText("自动管理已关闭")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取状态" }));
    expect(await screen.findByText("自动管理已开启")).toBeVisible();
  });

  it.each([{ planningMode: "FIXED" as const }, { status: "DRAFT" as const }])(
    "does not bypass first-start authorization for %o",
    (overrides) => {
      show(overrides);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(network.apiFetch).not.toHaveBeenCalled();
    },
  );
});
