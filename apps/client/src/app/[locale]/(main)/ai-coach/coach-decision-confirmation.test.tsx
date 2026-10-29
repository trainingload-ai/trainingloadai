import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
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
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachDecisionDraftCard
        result={{ ...proposal, state }}
        isApplied={applied}
        onConfirm={onConfirm}
      />
    </NextIntlClientProvider>,
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
