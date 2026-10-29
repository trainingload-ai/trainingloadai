import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CoachChatProvider } from "./coach-chat-provider";
import { CoachMessageList } from "./coach-run-timeline";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { COACH_MESSAGE_COMPONENTS } from "./coach-message-renderer";
import { CoachTurnRetryContext } from "./coach-turn-retry-context";
import { useState } from "react";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@deployment/managed-ui", () => ({
  useManagedAiAccessRecovery: (reason: string | null) => {
    const [open, setOpen] = useState(false);
    return {
      recoveryAction:
        reason === "accessRequired"
          ? { label: "处理访问权限", onClick: () => setOpen(true) }
          : undefined,
      overlay: open ? <div role="dialog">托管恢复弹框</div> : null,
    };
  },
}));

const failureText = "模型暂时无法响应，请尝试切换模型后重试。";
const answerText = "今天建议轻松跑 40 分钟。";

function sse(frames: unknown[]) {
  return new Response(
    `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n")}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}

/** Mirrors what the server streams for a failed turn. */
function failedTurnResponse() {
  return sse([
    { type: "start" },
    { type: "start-step" },
    {
      type: "data-coach-turn-error",
      id: "coach-turn-error",
      data: { code: "model_unavailable", message: failureText },
    },
    { type: "error", errorText: failureText },
    { type: "finish-step" },
    { type: "finish", finishReason: "error" },
  ]);
}

function answeredTurnResponse() {
  return sse([
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "coach-text-1" },
    { type: "text-delta", id: "coach-text-1", delta: answerText },
    { type: "text-end", id: "coach-text-1" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ]);
}

const messages = {
  AiCoachPage: {
    status: { phaseModel: "生成回复" },
    transcript: {
      titleModelUnavailable: "模型暂时无法响应",
      reasonModelUnavailable: "请尝试切换模型后重试，或稍后再试。",
      titleTurnFailed: "回复未生成完成",
      reasonUnknown: "生成过程出现问题。",
      titleAccessRequired: "AI 访问暂不可用",
      reasonAccessRequired: "请检查 AI 配置或账户权限。",
      retry: "重试",
      switchToDeepAndRetry: "切换到深度模式重试",
      switchToStandardAndRetry: "切换到标准模式重试",
    },
  },
  AiOperationErrors: {
    accessRequired: "当前无法使用 AI，请检查实例配置或账户权限。",
  },
  CoachTurnErrors: {
    modelUnavailable: "模型暂时无法响应，请尝试切换模型后重试。",
    aborted: "本次生成已中断，你可以重新发送。",
    business: "当前请求无法完成，请检查要求后重试。",
    internal: "系统内部错误，请稍后重试。",
    upstreamFailed: "教练服务暂时不可用，请稍后重试。",
    unsafeOutput: "本次回答无法安全展示，请重新生成。",
    invalidStructuredOutput: "结构化内容生成失败，请重试。",
    unknown: "生成过程出现问题，请稍后重试。",
  },
};

let runtime: UseChatHelpers<CoachUiMessage> | null = null;

function Harness({
  fetchStream,
  prepareRetry,
  initialMessages = [],
}: {
  fetchStream: () => Promise<Response>;
  prepareRetry: (options?: { thinkingEnabled?: boolean }) => void;
  initialMessages?: CoachUiMessage[];
}) {
  const transport = new DefaultChatTransport<CoachUiMessage>({
    api: "/unused",
    fetch: fetchStream,
  });
  const currentRuntime = useChat<CoachUiMessage>({
    id: "existing-session",
    messages: initialMessages,
    transport,
  });
  runtime = currentRuntime;
  return (
    <NextIntlClientProvider
      locale="zh"
      timeZone="Asia/Shanghai"
      messages={messages}
    >
      <CoachTurnRetryContext.Provider
        value={{ thinkingEnabled: false, prepareRetry }}
      >
        <CoachChatProvider chat={currentRuntime} onStopError={vi.fn()}>
          <div>
            <CoachMessageList />
          </div>
        </CoachChatProvider>
      </CoachTurnRetryContext.Provider>
    </NextIntlClientProvider>
  );
}

describe("coach turn error card", () => {
  it("shows an inline, retryable model failure and retries with the other mode", async () => {
    const fetchStream = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(failedTurnResponse())
      .mockResolvedValueOnce(answeredTurnResponse());
    const prepareRetry = vi.fn();
    render(<Harness fetchStream={fetchStream} prepareRetry={prepareRetry} />);

    await act(async () => {
      await runtime!.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "今天怎么练？" }],
      });
    });

    await waitFor(() =>
      expect(screen.getByText("模型暂时无法响应")).toBeVisible(),
    );
    expect(
      screen.getByText("模型暂时无法响应，请尝试切换模型后重试。"),
    ).toBeVisible();
    // The generic stream error is replaced by the card, not shown twice.
    expect(screen.getAllByText(failureText)).toHaveLength(1);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "切换到深度模式重试" }),
      );
    });

    expect(prepareRetry).toHaveBeenCalledWith({ thinkingEnabled: true });
    await waitFor(() => expect(screen.getByText(answerText)).toBeVisible());
    expect(fetchStream).toHaveBeenCalledTimes(2);
    expect(screen.getByText("模型暂时无法响应")).toBeVisible();
    // Legacy retries preserve the failure too; v2 retries use a fresh attempt without a new user turn.
    expect(runtime!.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("renders a persisted failure after refresh, without retry on older turns", async () => {
    const prepareRetry = vi.fn();
    render(
      <Harness
        fetchStream={vi.fn()}
        prepareRetry={prepareRetry}
        initialMessages={[
          { id: "u1", role: "user", parts: [{ type: "text", text: "你好" }] },
          {
            id: "a1",
            role: "assistant",
            parts: [
              { type: "text", text: failureText },
              {
                type: "data-coach-turn-error",
                id: "coach-turn-error",
                data: { code: "model_unavailable", message: failureText },
              },
            ],
          },
          { id: "u2", role: "user", parts: [{ type: "text", text: "在吗" }] },
          {
            id: "a2",
            role: "assistant",
            parts: [
              {
                type: "data-coach-turn-error",
                id: "coach-turn-error",
                data: {
                  code: "internal",
                  message: "系统内部错误，请稍后重试。",
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(await screen.findByText("模型暂时无法响应")).toBeVisible();
    // The stored copy is rendered once in the failure card, not repeated as a bubble.
    expect(screen.getAllByText(failureText)).toHaveLength(1);
    expect(screen.getByText("回复未生成完成")).toBeVisible();
    expect(screen.getByText("系统内部错误，请稍后重试。")).toBeVisible();
    // Only the latest turn is retryable; no model switch for non-model errors.
    expect(screen.getAllByRole("button", { name: "重试" })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "切换到深度模式重试" }),
    ).toBeNull();
  });

  it("offers the deployment recovery slot when AI access is unavailable", async () => {
    render(
      <Harness
        fetchStream={vi.fn()}
        prepareRetry={vi.fn()}
        initialMessages={[
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "分析活动" }],
          },
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "data-coach-turn-error",
                id: "coach-turn-error",
                data: {
                  code: "AI_ACCESS_REQUIRED",
                  message: "AI_ACCESS_REQUIRED",
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(
      await screen.findByText(
        "当前无法使用 AI，请检查实例配置或账户权限。",
      ),
    ).toBeVisible();
    const recovery = screen.getByRole("button", { name: "处理访问权限" });
    expect(recovery).toBeVisible();
    fireEvent.click(recovery);
    expect(screen.getByRole("dialog")).toHaveTextContent("托管恢复弹框");
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    expect(screen.queryByText("AI_ACCESS_REQUIRED")).toBeNull();
  });
});
