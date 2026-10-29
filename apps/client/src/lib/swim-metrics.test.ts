import { describe, expect, it } from "vitest";
import { computeAverageSwolf, computeLengthSwolf } from "./swim-metrics";

describe("swim metrics", () => {
  it("computes SWOLF from elapsed seconds and strokes", () => {
    expect(computeLengthSwolf({ duration: 40, totalStrokes: 20 })).toBe(60);
  });

  it("excludes invalid lengths from the average", () => {
    expect(
      computeAverageSwolf([
        { duration: 40, totalStrokes: 20 },
        { duration: 36, totalStrokes: 18 },
        { duration: 0, totalStrokes: 0 },
      ]),
    ).toBe(57);
  });
});
