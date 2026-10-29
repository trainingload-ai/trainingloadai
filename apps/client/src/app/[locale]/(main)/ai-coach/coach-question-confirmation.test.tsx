import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CoachV2AssistantCards } from "./coach-assistant-cards";
import { CoachThreadReceiptsProvider } from "./coach-thread-receipts";
import { CoachQuestionCard } from "./coach-question-card";
import zhMessages from "../../../../../../../packages/messages/client-core/zh.json";
import { parseCoachQuestionReplyLikeToolResultPayload } from "@shared/ai-coach-schema";

const runtime = vi.hoisted(() => ({
  append: vi.fn(),
  messageId: "temporary-live-message",
  messages: [] as { role: string; content: unknown[] }[],
}));
vi.mock("./coach-chat-provider", () => ({
  useCoachMessage: (select: (message: unknown) => unknown) =>
    select({ id: runtime.messageId, role: "assistant", content: [] }),
  useCoachThread: (select: (state: unknown) => unknown) =>
    select({ isRunning: false, messages: runtime.messages }),
  useCoachActions: () => ({ append: runtime.append }),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/api/usePlanMutations", () => ({
  useCreateCoachPlanFromDraft: () => ({ isPending: false }),
}));
vi.mock("./cards/MutationAppliedCard", () => ({
  MutationAppliedCard: () => null,
}));
vi.mock("./coach-read-tool-cards", () => ({ CoachReadToolCard: () => null }));
vi.mock("./coach-decision-cards", () => ({
  CoachVolatileDecisionCards: () => null,
}));
vi.mock("./coach-plan-draft-calendar-preview", () => ({
  CoachPlanDraftCalendarPreview: () => null,
}));
vi.mock("./plan-workout-adjustment-draft-card", () => ({
  PlanWorkoutAdjustmentDraftCard: () => null,
}));

const prompt = {
  questions: [
    {
      id: "fitness_apply",
      header: "确认采用",
      question: "确认将跑步 LTHR: 165 bpm 保存为个人参考值吗？",
      options: [
        { value: "apply", label: "确认采用", description: "保存估计" },
        { value: "keep", label: "暂不采用", description: "保留设置" },
      ],
    },
  ],
};
const tool = {
  toolCallId: "stable-question-call",
  name: "AskUserQuestion",
  input: prompt,
};
function renderCards() {
  return render(
    <NextIntlClientProvider
      locale="zh"
      messages={zhMessages}
      timeZone="Asia/Shanghai"
    >
      <CoachThreadReceiptsProvider>
        <CoachV2AssistantCards toolsOverride={[tool]} />
      </CoachThreadReceiptsProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  runtime.append.mockClear();
  runtime.messageId = "temporary-live-message";
  runtime.messages = [];
});

describe("fitness question reply identity", () => {
  it("sends the stable question id and keeps the answer completed after history replaces the live message id", () => {
    const view = renderCards();
    fireEvent.click(screen.getByRole("radio", { name: /确认采用/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    expect(runtime.append).toHaveBeenCalledTimes(1);
    const message = runtime.append.mock.calls[0][0];
    const payload = message.content.find(
      (part: { type: string }) => part.type === "data",
    ).data.content;
    expect(parseCoachQuestionReplyLikeToolResultPayload(payload)).toMatchObject(
      {
        ok: true,
        data: {
          kind: "coach_question_reply",
          repliesToAssistantMessageId: "temporary-live-message",
          questionToolUseId: "stable-question-call",
          answers: { fitness_apply: "apply" },
        },
      },
    );
    view.unmount();
    runtime.messages = [message];
    runtime.messageId = "persisted-database-message";
    renderCards();
    expect(screen.getByText("已确认")).toBeInTheDocument();
    expect(
      screen.getByText("确认将跑步 LTHR: 165 bpm 保存为个人参考值吗？"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /确认采用/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "提交" })).toBeNull();
  });

  it("preserves the stable reference when skipping without creating an approval", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    const message = runtime.append.mock.calls[0][0];
    const payload = message.content.find(
      (part: { type: string }) => part.type === "data",
    ).data.content;
    expect(payload).toEqual({
      kind: "coach_question_skip",
      repliesToAssistantMessageId: "temporary-live-message",
      questionToolUseId: "stable-question-call",
    });
  });

  it("selects the new confirmation even when an older card uses the same question id", () => {
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <CoachQuestionCard
          prompt={prompt}
          onSubmit={vi.fn()}
          onSkip={vi.fn()}
        />
        <CoachQuestionCard
          prompt={prompt}
          onSubmit={vi.fn()}
          onSkip={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const options = screen.getAllByRole("radio", { name: /确认采用/ });
    fireEvent.click(options[1]);
    expect(options[0]).not.toBeChecked();
    expect(options[1]).toBeChecked();
    expect(options[0].id).not.toBe(options[1].id);
  });

  it("keeps each question focused and only advances after the current answer", () => {
    const onSubmit = vi.fn();
    const multiPrompt = {
      questions: [
        prompt.questions[0],
        {
          id: "training_days",
          header: "训练安排",
          question: "你每周可以训练几天？",
          options: [
            { value: "three", label: "3 天", description: "适合基础安排" },
            { value: "four", label: "4 天", description: "适合进阶安排" },
          ],
        },
      ],
    };

    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <CoachQuestionCard
          prompt={multiPrompt}
          onSubmit={onSubmit}
          onSkip={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    const next = screen.getByRole("button", { name: "下一步" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /确认采用/ }));
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(screen.getByText("你每周可以训练几天？")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "你每周可以训练几天？" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("radio", { name: /^4 天/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSubmit).toHaveBeenCalledWith({
      answers: { fitness_apply: "apply", training_days: "four" },
      notes: { fitness_apply: "", training_days: "" },
      skippedQuestionIds: [],
    });
  });

  it("skips only the current question and submits the remaining answers", () => {
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    const multiPrompt = {
      questions: [
        prompt.questions[0],
        {
          id: "training_days",
          header: "训练安排",
          question: "你每周可以训练几天？",
          options: [
            { value: "three", label: "3 天", description: "适合基础安排" },
            { value: "four", label: "4 天", description: "适合进阶安排" },
          ],
        },
      ],
    };

    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <CoachQuestionCard
          prompt={multiPrompt}
          onSubmit={onSubmit}
          onSkip={onSkip}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(screen.getByText("你每周可以训练几天？")).toBeInTheDocument();
    expect(onSkip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /^3 天/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSubmit).toHaveBeenCalledWith({
      answers: { training_days: "three" },
      notes: { training_days: "" },
      skippedQuestionIds: ["fitness_apply"],
    });
  });

  it("treats skipping every question as declining the whole set", () => {
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <CoachQuestionCard
          prompt={{
            questions: [
              prompt.questions[0],
              { ...prompt.questions[0], id: "second_question" },
            ],
          }}
          onSubmit={onSubmit}
          onSkip={onSkip}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
