import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiInfoStream } from "./activity";

describe("activity review stream protocol", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["AI_OPERATION_IN_PROGRESS", "AI_OPERATION_COMPLETION_PENDING"])(
    "preserves a plain SSE %s wait signal",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(`event: error\ndata: ${code}\n\n`, {
              headers: { "content-type": "text/event-stream" },
            }),
        ),
      );
      await expect(
        getAiInfoStream("activity-1", vi.fn(), "zh"),
      ).rejects.toMatchObject({ errorCode: code });
    },
  );
  it("delivers persisted markdown and accepts the stream terminator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            'data: {"content":"已完成训练，今天保持轻松恢复。"}\n\ndata: [DONE]\n\n',
            {
              headers: { "content-type": "text/event-stream" },
            },
          ),
      ),
    );
    const onMessage = vi.fn();
    await getAiInfoStream("activity-1", onMessage, "zh");
    expect(onMessage).toHaveBeenCalledExactlyOnceWith(
      "已完成训练，今天保持轻松恢复。",
    );
  });
});
