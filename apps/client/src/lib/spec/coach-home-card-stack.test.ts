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

  it("keeps urgent safety items first without hiding the daily judgment", () => {
    const items = buildCoachHomeStackItems(
      [
        { id: "urgent", riskTier: "HIGH" },
        { id: "ordinary", riskTier: "LOW" },
      ],
      3,
      null,
      { caseId: "safety-case", state: "HIGH_CONCERN" },
    );
    expect(items.map((item) => item.id)).toEqual([
      "urgent",
      "inquiry-safety-case",
      "suggestion",
    ]);
  });

  it("keeps today’s judgment ahead of ordinary pending decisions", () => {
    const items = buildCoachHomeStackItems(decisions.slice(0, 1));
    expect(items.map((item) => item.kind)).toEqual(["suggestion", "decision"]);
    expect(items[1]).toMatchObject({ id: "d-high" });
  });

  it("hides extra decisions so at most 3 cards show, with suggestion always kept", () => {
    const visible = visibleCoachHomeStack(
      buildCoachHomeStackItems(decisions),
      null,
    );
    expect(visible).toHaveLength(3);
    expect(visible.map((item) => item.id)).toEqual([
      "suggestion",
      "d-high",
      "d-later",
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
      "suggestion",
      "decision",
      "decision",
    ]);
  });

  it("keeps ordinary inquiries optional behind the daily judgment", () => {
    const items = buildCoachHomeStackItems(
      [{ id: "ordinary", riskTier: "LOW" }],
      4,
      { id: "g-1" },
      { caseId: "case-1" },
    );
    expect(items.map((item) => item.kind)).toEqual([
      "suggestion",
      "decision",
      "inquiry",
      "guidance",
    ]);
  });
});
