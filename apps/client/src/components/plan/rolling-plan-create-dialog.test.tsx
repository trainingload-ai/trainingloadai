import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import messages from "../../../../../packages/messages/client-core/zh.json";
import { RollingPlanCreateDialog } from "./rolling-plan-create-dialog";
import { createPlan } from "@/api/plans";

vi.mock("@/api/plans", () => ({ createPlan: vi.fn() }));
vi.mock("@/lib/query-invalidation", () => ({
  invalidateAfterPlanMutation: vi.fn(),
}));
vi.mock("./plan-start-conversation-dialog", () => ({
  PlanStartConversationDialog: ({
    open,
    planId,
  }: {
    open: boolean;
    planId: string;
  }) => (open ? <div>START:{planId}</div> : null),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

it("creates an empty open-ended draft and opens the existing START conversation", async () => {
  vi.mocked(createPlan).mockResolvedValue({ id: "rolling-draft" } as never);
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="zh" messages={messages}>
        <RollingPlanCreateDialog open onOpenChange={onOpenChange} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("计划名称"), {
    target: { value: "  长期跑步  " },
  });
  fireEvent.change(screen.getByLabelText("训练目标"), {
    target: { value: "提升耐力" },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建草稿" }));
  await waitFor(() =>
    expect(createPlan).toHaveBeenCalledWith({
      title: "长期跑步",
      goal: "提升耐力",
      sourceType: "AI",
      planningMode: "ROLLING",
      periodWeeks: null,
      workouts: [],
    }),
  );
  expect(await screen.findByText("START:rolling-draft")).toBeInTheDocument();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
