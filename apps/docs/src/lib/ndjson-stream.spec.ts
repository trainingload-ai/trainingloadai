import { describe, expect, it } from "vitest";
import { NdjsonDecoder } from "./ndjson-stream";

describe("NdjsonDecoder", () => {
  it("decodes split UTF-8 chunks and preserves every complete event", () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      '{"type":"progress","stage":"parsing"}\n{"type":"result","data":{"verdict":"稳定训练"}}\n',
    );
    const decoder = new NdjsonDecoder();
    const events = [
      ...decoder.push(bytes.slice(0, 53)),
      ...decoder.push(bytes.slice(53, 68)),
      ...decoder.push(bytes.slice(68)),
      ...decoder.finish(),
    ];

    expect(events).toEqual([
      { type: "progress", stage: "parsing" },
      { type: "result", data: { verdict: "稳定训练" } },
    ]);
  });

  it("rejects a non-JSON line instead of silently losing stream state", () => {
    const decoder = new NdjsonDecoder();
    expect(() => decoder.push(new TextEncoder().encode("not-json\n"))).toThrow(
      "NDJSON_RESPONSE_INVALID",
    );
  });
});
