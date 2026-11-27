import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContinuationProposalCard } from "./home-continuation-proposal-card";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  apply: vi.fn(),
  reject: vi.fn(),
  push: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => ({ active: false }),
}));

vi.mock("@/lib/query-invalidation", () => ({
  invalidateAfterPlanMutation: mocks.invalidate,
}));

vi.mock("@/api/ai-coach", () => ({
  fetchCoachHomeReviewState: mocks.fetch,
  confirmAndApplyCoachDecision: mocks.apply,
  rejectCoachDecision: mocks.reject,
}));

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HomeContinuationProposalCard />
    </QueryClientProvider>,
  );
}

describe("HomeContinuationProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pending open_next continuation proposal and navigates to coach on confirm", async () => {
    mocks.fetch.mockResolvedValue({
      decisions: [
        {
          id: "dec-open-next",
          branchId: "branch-1",
          contextId: "ctx-1",
          planId: "plan-completed",
          planTitle: "8 周 10 公里完赛计划",
          decisionType: "PLAN_LIFECYCLE",
          rationale: "完成率 100%，建议基于本周期总结开启下一份计划。",
          payload: {
            action: "open_next",
            planId: "plan-completed",
            nextPlanPrompt: "开启下一份计划",
          },
        },
      ],
    });
    mocks.apply.mockResolvedValueOnce({ applied: true });

    renderCard();

    expect(
      await screen.findByTestId("home-continuation-proposal"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("完成率 100%，建议基于本周期总结开启下一份计划。"),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "decisionStack.confirm" }),
    );

    await waitFor(() => {
      expect(mocks.apply).toHaveBeenCalledWith("dec-open-next");
      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push.mock.calls[0][0]).toContain("/ai-coach?");
    });
  });

  it("renders nothing when there is no open_next continuation decision", async () => {
    mocks.fetch.mockResolvedValue({
      decisions: [
        {
          id: "dec-other",
          decisionType: "PLAN_ADAPTATION",
          payload: {},
        },
      ],
    });

    renderCard();

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByTestId("home-continuation-proposal"),
    ).not.toBeInTheDocument();
  });
});
