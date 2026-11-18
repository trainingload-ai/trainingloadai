import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { PlanStartConversationDialog } from "./plan-start-conversation-dialog";
const api = vi.hoisted(() => ({ open: vi.fn(), messages: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/api/plans", () => ({ openPlanStartConversation: api.open }));
vi.mock("@/api/ai-coach", () => ({
  aiCoachMessagesQueryKey: (sid: string) => ["messages", sid],
  fetchCoachSessionMessages: api.messages,
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
    onSelect: (d: Date) => void;
  }) => (
    <input
      aria-label="start date"
      type="date"
      min={
        fromDate
          ? `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`
          : undefined
      }
      value={date?.toISOString().slice(0, 10) ?? ""}
      onChange={(e) => onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));
vi.mock("@/app/[locale]/(main)/ai-coach/coach-runtime-provider", () => ({
  CoachRuntimeProvider: ({
    sid,
    entry,
  }: {
    sid: string;
    entry: { key: string };
  }) => (
    <div data-testid="runtime">
      {sid}:{entry.key}
    </div>
  ),
}));
vi.mock("@/app/[locale]/(main)/ai-coach/coach-thread", () => ({
  CoachThreadLoading: () => <div>loading</div>,
}));
vi.mock(
  "@/app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview",
  () => ({
    CoachPlanDraftCalendarPreview: ({ startDate }: { startDate: string }) => (
      <div>calendar:{startDate}</div>
    ),
  }),
);
const prepared = {
  sid: "start-sid",
  branchId: "branch",
  entryKey: "entry-1",
  evaluationStarted: false,
  startDate: "2026-11-22",
  earliestStartDate: "2026-11-22",
  calendarTimeZone: "Asia/Shanghai",
  plan: { id: "plan", title: "Saved plan", periodWeeks: 1, workouts: [] },
};
describe("saved draft start conversation", () => {
  it("selects a date and enters embedded chat without activating the plan", async () => {
    api.open.mockResolvedValue(prepared);
    api.messages.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PlanStartConversationDialog
          open
          planId="plan"
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue("2026-11-22");
    expect(screen.queryByTestId("runtime")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "evaluate" }));
    expect(await screen.findByTestId("runtime")).toHaveTextContent(
      "start-sid:entry-1",
    );
    expect(screen.getByText("calendar:2026-11-22")).toBeInTheDocument();
    expect(api.open).toHaveBeenLastCalledWith("plan", "2026-11-22");
    fireEvent.click(screen.getByRole("button", { name: "changeDate" }));
    fireEvent.change(screen.getByLabelText("start date"), {
      target: { value: "2026-11-23" },
    });
    await waitFor(() =>
      expect(api.open).toHaveBeenLastCalledWith("plan", "2026-11-23"),
    );
    expect(screen.queryByTestId("runtime")).not.toBeInTheDocument();
  });
});

it("waits for authoritative entry restoration before mounting cached chat", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["plan-start-conversation", "owner", "restore-plan"],
    prepared,
  );
  client.setQueryData(
    ["messages", prepared.sid],
    [
      {
        id: "persisted-user",
        role: "user",
        content: "Earlier assessment",
        createdAt: "2026-11-22",
      },
    ],
  );
  let restore!: (value: unknown) => void;
  api.open.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        restore = resolve;
      }),
  );
  api.messages.mockResolvedValue([
    {
      id: "persisted-user",
      role: "user",
      content: "Earlier assessment",
      createdAt: "2026-11-22",
    },
  ]);
  render(
    <QueryClientProvider client={client}>
      <PlanStartConversationDialog
        open
        planId="restore-plan"
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByTestId("runtime")).not.toBeInTheDocument();
  restore({ ...prepared, evaluationStarted: true });
  expect(await screen.findByTestId("runtime")).toHaveTextContent("entry-1");
});

it("does not reuse a cached entry if authoritative restoration fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["plan-start-conversation", "owner", "unavailable-plan"],
    prepared,
  );
  api.open.mockRejectedValueOnce(new Error("unavailable"));
  api.messages.mockResolvedValue([]);
  render(
    <QueryClientProvider client={client}>
      <PlanStartConversationDialog
        open
        planId="unavailable-plan"
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("loadFailed");
  expect(screen.queryByTestId("runtime")).not.toBeInTheDocument();
});

it("uses the athlete server day as the earliest date and refuses earlier selections", async () => {
  api.open.mockResolvedValue(prepared);
  api.messages.mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PlanStartConversationDialog
        open
        planId="future-athlete-day"
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const input = await screen.findByDisplayValue("2026-11-22");
  expect(input).toHaveAttribute("min", "2026-11-22");
  const requests = api.open.mock.calls.length;
  fireEvent.change(input, { target: { value: "2026-11-21" } });
  expect(api.open).toHaveBeenCalledTimes(requests);
  expect(input).toHaveValue("2026-11-22");
});
