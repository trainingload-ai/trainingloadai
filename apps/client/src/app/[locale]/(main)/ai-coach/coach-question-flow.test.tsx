import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  CoachQuestionDock,
  CoachQuestionFlowProvider,
  CoachQuestionSurface,
} from "./coach-question-flow";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import messages from "../../../../../../../packages/messages/client-core/zh.json";

const runtime = vi.hoisted(() => ({
  messages: [] as { ui: CoachUiMessage }[],
}));
vi.mock("./coach-chat-provider", () => ({
  useCoachThread: (select: (state: unknown) => unknown) => select(runtime),
}));
function pending(id: string, runId = id, attemptId = id): CoachUiMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "data-coach-run",
        data: {
          runId,
          attemptId,
          messageId: id,
          revision: 1,
          status: "awaiting_input",
          startedAt: "2026-10-09T00:00:00Z",
          executionMs: 0,
          previousExecutionMs: 0,
          pendingInteractionId: id,
        },
      },
      {
        type: "data-coach-tool",
        data: {
          toolCallId: "q",
          name: "AskUserQuestion",
          input: {
            questions: [
              {
                id: "goal",
                header: "目标",
                question: "你的目标？",
                options: [
                  { value: "a", label: "提升体能", description: "循序渐进" },
                  { value: "b", label: "恢复", description: "保持轻松" },
                ],
              },
            ],
          },
        },
      },
      {
        type: "data-coach-interaction",
        data: {
          interactionId: id,
          runId,
          questionMessageId: id,
          questionToolCallId: "q",
          revision: 1,
          status: "pending",
        },
      },
    ],
  };
}
function Fixture() {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachQuestionFlowProvider>
        <section data-testid="transcript">
          {runtime.messages.map(({ ui }) => (
            <CoachQuestionSurface key={ui.id} id={`${ui.id}:q`}>
              {(dismiss, inactive) => (
                <div>
                  <input aria-label={`answer-${ui.id}`} disabled={inactive} />
                  {dismiss ? (
                    <button onClick={dismiss}>close-{ui.id}</button>
                  ) : null}
                </div>
              )}
            </CoachQuestionSurface>
          ))}
        </section>
        <CoachQuestionDock>
          <input aria-label="composer" />
        </CoachQuestionDock>
      </CoachQuestionFlowProvider>
    </NextIntlClientProvider>
  );
}
describe("bottom question flow", () => {
  it("keeps the ordinary composer and its draft mounted underneath the overlay", () => {
    runtime.messages = [];
    const view = render(<Fixture />);
    const composer = screen.getByRole("textbox", { name: "composer" });
    fireEvent.change(composer, { target: { value: "还没发出的消息" } });
    runtime.messages = [{ ui: pending("m1") }];
    view.rerender(<Fixture />);
    expect(screen.getByLabelText("composer")).toBe(composer);
    expect(composer).toHaveValue("还没发出的消息");
    expect(composer.closest("[data-coach-composer-layer]")).toHaveAttribute(
      "inert",
    );
    fireEvent.click(screen.getByText("close-m1"));
    expect(screen.getByRole("textbox", { name: "composer" })).toBe(composer);
    expect(composer).toHaveValue("还没发出的消息");
  });
  it("moves answers outside the transcript and preserves drafts across dismissal", () => {
    runtime.messages = [{ ui: pending("m1") }];
    render(<Fixture />);
    expect(
      within(screen.getByTestId("transcript")).queryByRole("textbox"),
    ).toBeNull();
    const composer = screen.getByLabelText("composer");
    expect(composer).toBeInTheDocument();
    expect(composer.closest("[data-coach-composer-layer]")).toHaveAttribute(
      "inert",
    );
    expect(composer.closest("[data-coach-composer-layer]")).not.toHaveAttribute(
      "hidden",
    );
    fireEvent.change(screen.getByLabelText("answer-m1"), {
      target: { value: "my draft" },
    });
    fireEvent.click(screen.getByText("close-m1"));
    expect(screen.getByRole("textbox", { name: "composer" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "继续回答" }));
    expect(screen.getByLabelText("answer-m1")).toHaveValue("my draft");
  });
  it("defaults to the latest pending question and lets an earlier task resume in place", () => {
    runtime.messages = [{ ui: pending("m1") }, { ui: pending("m2") }];
    render(<Fixture />);
    expect(screen.getByRole("textbox", { name: "answer-m2" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "answer-m1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "继续回答" }));
    expect(screen.getByRole("textbox", { name: "answer-m1" })).toBeVisible();
  });
  it("never enables a stale attempt's question after the same run advances", () => {
    runtime.messages = [
      { ui: pending("m1", "r", "attempt1") },
      { ui: pending("m2", "r", "attempt2") },
    ];
    render(<Fixture />);
    expect(screen.getByLabelText("answer-m1")).toBeDisabled();
    expect(screen.getByLabelText("answer-m2")).not.toBeDisabled();
  });
});
