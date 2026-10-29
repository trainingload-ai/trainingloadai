import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CoachChatProvider } from "./coach-chat-provider";
import { CoachMessageList } from "./coach-run-timeline";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { COACH_MESSAGE_COMPONENTS } from "./coach-message-renderer";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const responseText = "这段正文必须在 SSE 完成后继续留在页面上。";

function sseResponse() {
  const frames = [
    { type: "start" },
    { type: "start-step" },
    {
      type: "data-coach-status",
      id: "coach-status-current",
      data: { status: "model" },
    },
    { type: "text-start", id: "coach-text-1" },
    { type: "text-delta", id: "coach-text-1", delta: responseText },
    { type: "text-end", id: "coach-text-1" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
  return new Response(
    `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join("\n\n")}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}

let runtime: UseChatHelpers<CoachUiMessage> | null = null;

function Harness({
  fetchStream = async () => sseResponse(),
}: {
  fetchStream?: () => Promise<Response>;
}) {
  const transport = new DefaultChatTransport<CoachUiMessage>({
    api: "/unused",
    fetch: fetchStream,
  });
  const currentRuntime = useChat<CoachUiMessage>({
    id: "existing-session",
    messages: [],
    transport,
  });
  runtime = currentRuntime;
  return (
    <NextIntlClientProvider
      locale="zh"
      timeZone="Asia/Shanghai"
      messages={{
        AiCoachPage: { status: { phaseModel: "生成回复" } },
        AiOperationErrors: {},
      }}
    >
      <CoachChatProvider chat={currentRuntime} onStopError={vi.fn()}>
        <div>
          <CoachMessageList />
        </div>
      </CoachChatProvider>
    </NextIntlClientProvider>
  );
}

describe("coach live SSE rendering", () => {
  it("renders a delayed delta before finish under the Next.js StrictMode lifecycle", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const send = (...frames: unknown[]) => {
      for (const frame of frames) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
        );
      }
    };
    render(
      <StrictMode>
        <Harness
          fetchStream={async () =>
            new Response(body, {
              headers: { "content-type": "text/event-stream" },
            })
          }
        />
      </StrictMode>,
    );
    await act(async () => {
      void runtime!.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "嗨" }],
      });
    });
    await act(async () => {
      send(
        {
          type: "data-coach-status",
          id: "coach-status-current",
          data: { status: "model" },
        },
        { type: "text-start", id: "coach-text-1" },
      );
    });
    await waitFor(() => expect(screen.getByText("生成回复")).toBeVisible());
    await act(async () => {
      send({ type: "text-delta", id: "coach-text-1", delta: responseText });
    });
    try {
      await waitFor(() =>
        expect(runtime!.messages.at(-1)?.parts).toContainEqual(
          expect.objectContaining({
            type: "text",
            text: responseText,
          }),
        ),
      );
      // Keep the stream open: rendering must work before finish or history reload.
      await waitFor(
        () => expect(screen.getByText(responseText)).toBeVisible(),
        { timeout: 2_000 },
      );
      expect(
        runtime!.status === "submitted" || runtime!.status === "streaming",
      ).toBe(true);
    } finally {
      await act(async () => {
        send(
          { type: "text-end", id: "coach-text-1" },
          { type: "finish-step" },
          { type: "finish", finishReason: "stop" },
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      });
    }
    await waitFor(() =>
      expect(
        runtime!.status === "submitted" || runtime!.status === "streaming",
      ).toBe(false),
    );
    expect(screen.getByText(responseText)).toBeVisible();
  });

  it("keeps streamed text in the real coach message renderer", async () => {
    render(<Harness />);
    await act(async () => {
      await runtime!.sendMessage({
        role: "user",
        parts: [{ type: "text", text: "测试" }],
      });
    });

    await waitFor(() => expect(screen.getByText(responseText)).toBeVisible());
    expect(
      runtime!.status === "submitted" || runtime!.status === "streaming",
    ).toBe(false);
    expect(screen.getByText(responseText)).toBeVisible();
  });
});
