import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSmoothStreamingText } from "./use-smooth-streaming-text";

type RafCallback = FrameRequestCallback;

let nextFrameId = 1;
let frameCallbacks = new Map<number, RafCallback>();

function runFrame(timestamp: number) {
  const callbacks = Array.from(frameCallbacks.values());
  frameCallbacks.clear();
  act(() => {
    for (const callback of callbacks) callback(timestamp);
  });
}

beforeEach(() => {
  nextFrameId = 1;
  frameCallbacks = new Map();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: RafCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      frameCallbacks.delete(id);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSmoothStreamingText", () => {
  it("keeps the animation scheduled after StrictMode replays mount effects", () => {
    const { result, rerender } = renderHook(
      ({ streaming }) =>
        useSmoothStreamingText(
          "嗨！这段回复需要实时显示。",
          streaming,
          "assistant-1",
        ),
      { initialProps: { streaming: true }, wrapper: StrictMode },
    );

    runFrame(0);
    expect(result.current.text.length).toBeGreaterThan(0);

    rerender({ streaming: false });
    for (let timestamp = 24; timestamp <= 1_000; timestamp += 24) {
      runFrame(timestamp);
    }
    expect(result.current.text).toBe("嗨！这段回复需要实时显示。");
    expect(result.current.isRendering).toBe(false);
  });

  it("reveals uneven incoming chunks progressively", () => {
    const { result, rerender } = renderHook(
      ({ text }) => useSmoothStreamingText(text, true, "assistant-1"),
      { initialProps: { text: "" } },
    );

    rerender({ text: "这是一段突然到达的较长回复内容" });
    expect(result.current.text).toBe("");

    runFrame(0);
    const firstFrame = result.current.text;
    expect(firstFrame.length).toBeGreaterThan(0);
    expect(firstFrame.length).toBeLessThan(
      "这是一段突然到达的较长回复内容".length,
    );

    rerender({ text: "这是一段突然到达的较长回复内容，并且后面又来了一大段" });
    runFrame(24);
    expect(result.current.text.startsWith(firstFrame)).toBe(true);
    expect(result.current.text.length).toBeGreaterThan(firstFrame.length);
  });

  it("keeps catching up smoothly when streaming finishes", () => {
    const { result, rerender } = renderHook(
      ({ streaming }) =>
        useSmoothStreamingText("尚未完全显示的回复", streaming, "assistant-1"),
      { initialProps: { streaming: true } },
    );

    runFrame(0);
    const partiallyRendered = result.current.text;
    expect(partiallyRendered).not.toBe("尚未完全显示的回复");

    rerender({ streaming: false });
    expect(result.current.text).toBe(partiallyRendered);
    expect(result.current.isRendering).toBe(true);

    for (let timestamp = 24; timestamp <= 240; timestamp += 24) {
      runFrame(timestamp);
    }
    expect(result.current.text).toBe("尚未完全显示的回复");
    expect(result.current.isRendering).toBe(false);
  });

  it("resets the visible buffer when the message changes", () => {
    const { result, rerender } = renderHook(
      ({ id, text }) => useSmoothStreamingText(text, true, id),
      {
        initialProps: {
          id: "assistant-1",
          text: "第一条回复正在输出",
        },
      },
    );

    runFrame(0);
    expect(result.current.text.length).toBeGreaterThan(0);

    rerender({ id: "assistant-2", text: "第二条回复" });
    expect(result.current.text).toBe("");
    runFrame(24);
    expect("第二条回复".startsWith(result.current.text)).toBe(true);
    expect(result.current.text).not.toContain("第一条");
  });

  it("does not split an emoji surrogate pair between frames", () => {
    const { result } = renderHook(() =>
      useSmoothStreamingText("🏃继续训练", true, "assistant-1"),
    );

    runFrame(0);
    expect(result.current.text).toBe("🏃");
  });
});
