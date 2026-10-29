import { describe, expect, it } from "vitest";
import {
  buildCoachHomeStackItems,
  visibleCoachHomeStack,
} from "@shared/coach-home-card-stack";

const decisions = [{ id: "d-high" }, { id: "d-later" }, { id: "d-hidden" }];

describe("coach home card stack", () => {
  it("keeps the suggestion card when there are no decisions", () => {
    expect(buildCoachHomeStackItems([])).toEqual([
      { kind: "suggestion", id: "suggestion" },
    ]);
  });

  it("puts pending decisions in front of today’s suggestion", () => {
    const items = buildCoachHomeStackItems(decisions.slice(0, 1));
    expect(items.map((item) => item.kind)).toEqual(["decision", "suggestion"]);
    expect(items[0]).toMatchObject({ id: "d-high" });
  });

  it("hides extra decisions so at most 3 cards show, with suggestion always kept", () => {
    const visible = visibleCoachHomeStack(
      buildCoachHomeStackItems(decisions),
      null,
    );
    expect(visible).toHaveLength(3);
    expect(visible.map((item) => item.id)).toEqual([
      "d-high",
      "d-later",
      "suggestion",
    ]);
  });

  it("brings a peeked card to the front without dropping the suggestion", () => {
    const visible = visibleCoachHomeStack(
      buildCoachHomeStackItems(decisions.slice(0, 2)),
      "suggestion",
    );
    expect(visible.map((item) => item.id)).toEqual([
      "suggestion",
      "d-high",
      "d-later",
    ]);
  });

  it("keeps ordinary decisions ahead of guidance under the visible-card cap", () => {
    const items = buildCoachHomeStackItems(decisions, 3, { id: "g-1" });
    expect(items.map((item) => item.kind)).toEqual([
      "decision",
      "decision",
      "suggestion",
    ]);
  });

  it("puts a state Inquiry ahead of an ordinary decision and guidance", () => {
    const items = buildCoachHomeStackItems(
      [{ id: "ordinary", riskTier: "LOW" }],
      4,
      { id: "g-1" },
      { caseId: "case-1" },
    );
    expect(items.map((item) => item.kind)).toEqual([
      "inquiry",
      "decision",
      "guidance",
      "suggestion",
    ]);
  });
});
