import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { CoachV2AssistantCards } from "./coach-assistant-cards";

const runtime = vi.hoisted(() => ({ append: vi.fn(), push: vi.fn() }));
vi.mock("./coach-chat-provider", () => ({
  useCoachMessage: (select: (value: unknown) => unknown) =>
    select({ id: "message-1", role: "assistant", content: [] }),
  useCoachThread: (select: (value: unknown) => unknown) =>
    select({ isRunning: false }),
  useCoachActions: () => runtime,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => runtime }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./coach-thread-receipts", () => ({
  useCoachThreadReceipts: () => ({
    questionReplies: new Map(),
    savedPlanDrafts: new Set(),
    appliedDecisions: new Set(),
    appliedWorkoutAdjustments: new Set(),
  }),
}));
vi.mock("./coach-plan-draft-calendar-preview", () => ({
  CoachPlanDraftCalendarPreview: ({ draft }: { draft: { title: string } }) => (
    <div>{draft.title}</div>
  ),
}));
vi.mock("./coach-read-tool-cards", () => ({ CoachReadToolCard: () => null }));
vi.mock("./coach-decision-cards", () => ({
  CoachVolatileDecisionCards: () => null,
}));
vi.mock("./plan-workout-adjustment-draft-card", () => ({
  PlanWorkoutAdjustmentDraftCard: () => null,
}));
vi.mock("./cards/MutationAppliedCard", () => ({
  MutationAppliedCard: () => null,
}));
const draft = {
  title: "测试训练计划",
  periodWeeks: 1,
  workouts: [
    {
      weekIndex: 1,
      dayIndex: 1,
      sportType: "RUN",
      text: "work 30m",
      notes: "An easy run.",
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("coach plan save failure through the actual mutation and API", () => {
  it.each([
    [413, "tooLarge"],
    [422, "validation"],
    [503, "service"],
    [504, "network"],
  ] as const)(
    "retains the draft and shows the actual failure for HTTP %s",
    async (status, key) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("<html>Request failed</html>", {
          status,
          headers: { "content-type": "text/html" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <NextIntlClientProvider locale="zh" messages={messages}>
            <CoachV2AssistantCards
              toolsOverride={[
                {
                  toolCallId: "draft-1",
                  name: "PresentCoachPlanDraft",
                  input: draft,
                },
              ]}
            />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: messages.AiCoachPage.planDraft.createPlan,
        }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        key === "tooLarge"
          ? messages.ApiErrors.payloadTooLarge
          : messages.AiCoachPage.planDraft.saveErrors[key],
      );
      expect(screen.getByText(draft.title)).toBeVisible();
      expect(runtime.append).not.toHaveBeenCalled();
      expect(runtime.push).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", {
          name: messages.AiCoachPage.planDraft.createPlan,
        }),
      ).toBeEnabled();
      expect(screen.queryByText(/DSL/)).toBeNull();
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ data: { plan: { id: "saved-plan" } } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: messages.AiCoachPage.planDraft.createPlan,
        }),
      );
      await waitFor(() => expect(runtime.append).toHaveBeenCalledOnce());
      expect(screen.queryByRole("status")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1].body).toBe(
        fetchMock.mock.calls[1][1].body,
      );
    },
  );
  it("does not recreate a saved plan when the conversation receipt fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { plan: { id: "saved-plan" } } }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    runtime.append.mockRejectedValueOnce(new Error("receipt unavailable"));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={messages}>
          <CoachV2AssistantCards
            toolsOverride={[
              {
                toolCallId: "draft-1",
                name: "PresentCoachPlanDraft",
                input: draft,
              },
            ]}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: messages.AiCoachPage.planDraft.createPlan,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      messages.AiCoachPage.planDraft.saveErrors.receipt,
    );
    const savedButton = screen.getByRole("button", {
      name: messages.AiCoachPage.planDraft.planAlreadySavedShort,
    });
    expect(savedButton).toBeDisabled();
    fireEvent.click(savedButton);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages.AiCoachPage.planDraft.saveErrors.checkLibrary,
      }),
    );
    expect(runtime.push).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
