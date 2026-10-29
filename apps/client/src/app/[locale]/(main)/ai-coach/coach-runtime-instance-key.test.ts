import { describe, expect, it } from "vitest";
import { coachRuntimeInstanceKey } from "./coach-runtime-instance-key";

describe("coachRuntimeInstanceKey", () => {
  it("stays stable when a persisted reply arrives for the active session", () => {
    const before = coachRuntimeInstanceKey("session-1", [
      { id: "user-message" },
    ]);
    const after = coachRuntimeInstanceKey("session-1", [
      { id: "user-message" },
      { id: "assistant-message" },
    ]);

    expect(after).toBe(before);
  });

  it("stays stable when an unrelated query rerenders the same transcript", () => {
    expect(
      coachRuntimeInstanceKey("session-1", [{ id: "assistant-message" }]),
    ).toBe(coachRuntimeInstanceKey("session-1", [{ id: "assistant-message" }]));
  });

  it("changes when the user opens another conversation", () => {
    expect(coachRuntimeInstanceKey("session-1", [])).not.toBe(
      coachRuntimeInstanceKey("session-2", []),
    );
  });
});
