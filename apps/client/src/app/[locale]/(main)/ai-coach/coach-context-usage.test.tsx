import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import type { CoachContextWindowData } from "@/lib/ai-coach-ui-parts";
import { CoachContextUsage } from "./coach-context-usage";
import { readCoachStatusSnapshot } from "./coach-composer-status";

const estimate: CoachContextWindowData = {
  step: 2,
  maxContextTokens: 128000,
  reservedOutputTokens: 8000,
  inputBudgetTokens: 120000,
  usedInputTokens: 30000,
  remainingInputTokens: 90000,
  compressionThresholdTokens: 100000,
  usageRatio: 0.25,
  estimator: "mixed_chars_v1",
  compressed: false,
  compactedMessages: 0,
};
afterEach(cleanup);
function show(context: CoachContextWindowData | null) {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachContextUsage context={context} />
    </NextIntlClientProvider>,
  );
}
describe("Coach context estimates", () => {
  it("shows an unknown state, not zero usage or cost, until an estimate exists", () => {
    show(null);
    fireEvent.click(screen.getByRole("button", { name: "上下文窗口当前空闲" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(
      screen.getByText("教练在思考时，这里会显示上下文占用情况。"),
    ).toBeTruthy();
  });
  it("uses input budget rather than total window and identifies estimates", () => {
    show({ ...estimate, usageRatio: 0.8 }); // stale/rounded ratio must not override counts
    fireEvent.click(
      screen.getByRole("button", { name: "上下文窗口占用 ~25%" }),
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "25",
    );
    expect(screen.getByText("120,000")).toBeTruthy();
    expect(screen.getByText("128,000")).toBeTruthy();
    expect(screen.getByText("~30,000")).toBeTruthy();
    expect(screen.getByText(/最近一次模型请求的 token 估算/)).toBeTruthy();
  });
  it("reports compression and clamps only the progress bar when over budget", () => {
    show({
      ...estimate,
      usedInputTokens: 150000,
      compressed: true,
      compactedMessages: 12,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "上下文窗口占用 ~125%" }),
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
    expect(screen.getByText("本轮已压缩 12 条更早的消息")).toBeTruthy();
    expect(screen.getByText(/已接近压缩阈值/)).toBeTruthy();
  });
  it("keeps the last estimate during a new attempt, without stale execution status", () => {
    const snapshot = readCoachStatusSnapshot([
      {
        role: "assistant",
        content: [
          { type: "data", name: "coach-context-window", data: estimate },
          { type: "data", name: "coach-status", data: { phase: "tool_run" } },
        ],
      },
      { role: "assistant", content: [{ type: "text", text: "new attempt" }] },
    ]);
    expect(snapshot.contextWindow).toBe(estimate);
    expect(snapshot.status).toBeNull();
    expect(snapshot.toolProgress).toBeNull();
  });
  it("ignores malformed estimates and resets when changing to an empty thread", () => {
    for (const data of [
      {},
      { ...estimate, inputBudgetTokens: 0 },
      { ...estimate, usedInputTokens: NaN },
    ]) {
      expect(
        readCoachStatusSnapshot([
          {
            role: "assistant",
            content: [{ type: "data", name: "coach-context-window", data }],
          },
        ]).contextWindow,
      ).toBeNull();
    }
    expect(readCoachStatusSnapshot([]).contextWindow).toBeNull();
  });
});
