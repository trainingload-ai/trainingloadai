import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { buildCoachSendMessagesRequestBody } from "@/lib/ai-coach-stream";

describe("buildCoachSendMessagesRequestBody", () => {
  it("sends only the latest message instead of the full UI history", () => {
    const largeToolPayload = "x".repeat(200_000);
    const messages: UIMessage[] = [
      {
        id: "assistant-with-large-tool-card",
        role: "assistant",
        parts: [{ type: "text", text: largeToolPayload }],
      },
      {
        id: "latest-user-message",
        role: "user",
        parts: [{ type: "text", text: "继续生成计划" }],
      },
    ];

    const body = buildCoachSendMessagesRequestBody({
      id: "session-1",
      messages,
      trigger: "submit-message",
      body: {
        sourceNode: { kind: "plan" },
        messages,
      },
    });

    expect(body).toEqual({
      id: "session-1",
      trigger: "submit-message",
      sourceNode: { kind: "plan" },
      message: messages[1],
    });
    expect(body).not.toHaveProperty("messages");
    expect(JSON.stringify(body).length).toBeLessThan(1_000);
  });
});
