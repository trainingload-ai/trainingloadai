import { describe, expect, it } from "vitest";

import {
  planDescriptionTextLength,
  planDescriptionToPlainText,
} from "./plan-description-limit";

describe("plan description text helpers", () => {
  it("keeps readable line breaks when rich HTML moves to the mobile textarea", () => {
    expect(
      planDescriptionToPlainText(
        "<p>First &amp; second</p><ul><li>Run</li><li>Ride</li></ul>",
      ),
    ).toBe("First & second\n• Run\n• Ride");
  });

  it("counts visible unicode characters instead of markup", () => {
    expect(planDescriptionTextLength("<p>跑步🏃</p>")).toBe(3);
  });
});
