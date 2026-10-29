import { describe, expect, it } from "vitest";
import { shouldShowTrailingCoachWaiting } from "./coach-streaming-content";

describe("shouldShowTrailingCoachWaiting", () => {
  it("keeps progress visible after a tool card while the turn continues", () => {
    expect(
      shouldShowTrailingCoachWaiting([{ kind: "tools" }], true),
    ).toBe(true);
    expect(
      shouldShowTrailingCoachWaiting(
        [{ kind: "text" }, { kind: "tools" }],
        true,
      ),
    ).toBe(true);
  });

  it("lets the active text block own streaming feedback", () => {
    expect(shouldShowTrailingCoachWaiting([{ kind: "text" }], true)).toBe(
      false,
    );
  });

  it("hides progress after the turn completes", () => {
    expect(shouldShowTrailingCoachWaiting([{ kind: "tools" }], false)).toBe(
      false,
    );
  });
});
