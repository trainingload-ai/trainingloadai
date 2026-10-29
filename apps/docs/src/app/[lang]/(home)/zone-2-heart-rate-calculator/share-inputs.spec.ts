import { describe, expect, it } from "vitest";
import {
  calculateZone2FromLthr,
  calculateZone2FromMaxHr,
} from "@/lib/zone-2-heart-rate";
import {
  buildZone2ShareSearch,
  EMPTY_ZONE2_INPUTS,
  readZone2Inputs,
  ZONE2_EXAMPLE,
} from "./share-inputs";

describe("zone 2 shared inputs", () => {
  it("round-trips the active anchor and unrelated query params", () => {
    const state = {
      method: "lthr" as const,
      maxHr: "",
      restHr: "",
      lthr: "165",
      age: "",
      formula: "fox" as const,
      example: false,
    };
    const search = buildZone2ShareSearch("?utm_source=newsletter", state);
    expect(search).toContain("utm_source=newsletter");
    expect(search).toContain("model=lthr");
    expect(search).not.toContain("maxHr=");
    expect(
      readZone2Inputs(Object.fromEntries(new URLSearchParams(search.slice(1)))),
    ).toEqual(state);
    expect(calculateZone2FromLthr(165)).toMatchObject({
      bpmMin: 134,
      bpmMax: 148,
    });
  });

  it("starts empty and only marks an example when the anchor is present", () => {
    expect(readZone2Inputs({})).toEqual(EMPTY_ZONE2_INPUTS);
    expect(readZone2Inputs({ example: "1" }).example).toBe(false);
    expect(
      readZone2Inputs({ model: "maxHr", maxHr: "190", example: "1" }),
    ).toEqual(ZONE2_EXAMPLE);
    expect(calculateZone2FromMaxHr(190)).toMatchObject({
      bpmMin: 114,
      bpmMax: 132,
      percentMin: 60,
      percentMax: 70,
    });
  });

  it("drops invalid, unknown, and oversized values", () => {
    expect(
      readZone2Inputs({
        model: "unknown",
        method: "lthr",
        maxHr: "0",
        lthr: "-4",
        age: "abc",
        formula: "maf",
        example: "1",
      }),
    ).toEqual({ ...EMPTY_ZONE2_INPUTS, method: "lthr" });
    expect(readZone2Inputs({ maxHr: "1".repeat(33) })).toEqual(
      EMPTY_ZONE2_INPUTS,
    );
    expect(readZone2Inputs({ model: "age", age: "9".repeat(40) })).toEqual({
      ...EMPTY_ZONE2_INPUTS,
      method: "age",
    });
    expect(
      buildZone2ShareSearch(
        "?model=maxHr&maxHr=190&example=1",
        EMPTY_ZONE2_INPUTS,
      ),
    ).toBe("");
  });

  it("still reads the older method query key", () => {
    expect(
      readZone2Inputs({ method: "age", age: "40", formula: "fox" }),
    ).toMatchObject({
      method: "age",
      age: "40",
      formula: "fox",
    });
  });

  it("round-trips max and resting heart rate for Karvonen HRR", () => {
    const state = {
      ...EMPTY_ZONE2_INPUTS,
      method: "hrr" as const,
      maxHr: "190",
      restHr: "50",
    };
    const search = buildZone2ShareSearch("", state);
    expect(search).toContain("model=hrr");
    expect(search).toContain("maxHr=190");
    expect(search).toContain("restHr=50");
    expect(
      readZone2Inputs(Object.fromEntries(new URLSearchParams(search.slice(1)))),
    ).toEqual(state);
    expect(
      readZone2Inputs({ model: "karvonen", maxHr: "190", restHr: "50" }),
    ).toMatchObject({ method: "hrr", maxHr: "190", restHr: "50" });
  });
});
