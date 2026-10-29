import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { CoachActivity } from "@shared/ai-coach-run-contract";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { CoachReasoningSummary } from "./coach-reasoning-summary";

afterEach(cleanup);
const text = "先核对训练负荷，再确定恢复安排。";
const activity: CoachActivity = {
  activityId: "attempt:model:1:1",
  attemptId: "attempt",
  runId: "run",
  seq: 0,
  revision: 2,
  kind: "analysis",
  status: "completed",
  labelKey: "analysis",
  publicSummary: { source: "assistant_public_summary", text },
};
function view(runActive: boolean, value = activity) {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachReasoningSummary activity={value} runActive={runActive} />
    </NextIntlClientProvider>
  );
}
describe("Coach public reasoning disclosure", () => {
  it("opens live summaries, folds on completion and starts history collapsed", () => {
    const { rerender } = render(view(true));
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    rerender(view(false));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByText(/思考了|\d+ 秒/)).not.toBeInTheDocument();
  });
  it("preserves a manual close across updates and a manual open across completion", () => {
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole("button"));
    const updated = {
      ...activity,
      revision: 3,
      publicSummary: {
        ...activity.publicSummary!,
        text: text + "不直接增加强度。",
      },
    };
    rerender(view(true, updated));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button"));
    rerender(view(false, updated));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(updated.publicSummary.text)).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
  it.each(["cancelled", "interrupted", "failed"] as const)(
    "keeps the summary readable after %s",
    (status) => {
      render(view(false, { ...activity, status }));
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText(text)).toBeVisible();
    },
  );
  it("does not manufacture empty, legacy or raw reasoning summaries", () => {
    const { container, rerender } = render(
      view(false, { ...activity, publicSummary: undefined }),
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      view(false, {
        ...activity,
        publicSummary: {
          source: "reasoning_content",
          text: "private",
        } as never,
      }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
