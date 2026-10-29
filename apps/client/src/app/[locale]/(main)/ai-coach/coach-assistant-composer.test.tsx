import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { CoachComposer } from "./coach-assistant-composer";

const runtime = vi.hoisted(() => ({
  isRunning: false,
  messages: [
    {
      role: "assistant",
      content: [
        { type: "data", name: "coach-status", data: { status: "tool_run" } },
        {
          type: "data",
          name: "coach-tool-progress",
          data: { status: "start", toolName: "activity.recent" },
        },
      ],
    },
  ],
  append: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("./coach-chat-provider", () => ({
  useCoachThread: (select: (state: typeof runtime) => unknown) =>
    select(runtime),
  useCoachActions: () => runtime,
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["start", "footer", "embedded"] as const)(
  "%s composer",
  (variant) => {
    it.each([false, true])(
      "omits the status strip while retaining controls (running=%s)",
      (running) => {
        runtime.isRunning = running;
        const { container } = render(
          <NextIntlClientProvider locale="zh" messages={messages}>
            <CoachComposer variant={variant} />
          </NextIntlClientProvider>,
        );
        expect(screen.queryByText("智能教练")).toBeNull();
        expect(screen.queryByText("已就绪")).toBeNull();
        expect(screen.queryByText("正在读取最近训练活动")).toBeNull();
        expect(
          screen.getAllByText(messages.AiCoachPage.composer.standardMode),
        ).toHaveLength(1);
        const form = container.querySelector("form")!;
        expect(form.parentElement?.children.length).toBe(1); // no empty status-bar row
        expect(
          form.querySelector("[data-coach-context-trigger]"),
        ).not.toBeNull();
        if (running) {
          fireEvent.click(screen.getByRole("button", { name: "停止" }));
          expect(runtime.stop).toHaveBeenCalledOnce();
        } else {
          fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "查看最近训练" },
          });
          fireEvent.click(screen.getByRole("button", { name: "发送" }));
          expect(runtime.append).toHaveBeenCalledWith("查看最近训练");
        }
      },
    );
  },
);
