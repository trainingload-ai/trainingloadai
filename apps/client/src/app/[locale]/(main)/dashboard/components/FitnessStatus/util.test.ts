import { describe, expect, it } from "vitest";

import { parseFitnessStatusLayout } from "./util";

const validKeys = ["vo2Max", "paceZones", "atl"] as const;

describe("parseFitnessStatusLayout", () => {
  it("preserves an explicitly empty saved layout", () => {
    expect(parseFitnessStatusLayout("[]", validKeys)).toEqual([]);
  });

  it("rejects malformed layouts instead of treating them as empty", () => {
    expect(parseFitnessStatusLayout("{}", validKeys)).toBeNull();
    expect(parseFitnessStatusLayout("not-json", validKeys)).toBeNull();
  });

  it("keeps Client's pace-zone migration for non-empty legacy layouts", () => {
    expect(
      parseFitnessStatusLayout(
        JSON.stringify([
          { key: "vo2Max", span: 4 },
          { key: "atl", span: 2 },
        ]),
        validKeys,
      ),
    ).toEqual([
      { key: "vo2Max", span: 4 },
      { key: "paceZones", span: 1 },
      { key: "atl", span: 2 },
    ]);
  });
});
