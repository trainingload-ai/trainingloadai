import { describe, expect, it } from "vitest";
import { LACTATE_METHOD_IDS } from "@trainingloadai/shared/lactate-analysis";
import { getLactateCopy } from "./lactate-curve-copy";

function leaves(value: unknown): unknown[] {
  return typeof value === "object" && value !== null
    ? Object.values(value).flatMap(leaves)
    : [value];
}

describe("lactate indexed locale contract", () => {
  for (const lang of ["en", "zh", "zh-hant", "ja"]) {
    it(`contains complete native content for ${lang}`, () => {
      const copy = getLactateCopy(lang);
      expect(Object.keys(copy).sort()).toEqual(
        Object.keys(getLactateCopy("en")).sort(),
      );
      expect(Object.keys(copy.methodNames).sort()).toEqual(
        [...LACTATE_METHOD_IDS].sort(),
      );
      expect(Object.keys(copy.methodDescriptions).sort()).toEqual(
        [...LACTATE_METHOD_IDS].sort(),
      );
      expect(Object.keys(copy.reasons).sort()).toEqual(
        Object.keys(getLactateCopy("en").reasons).sort(),
      );
      expect(Object.keys(copy.presentation).sort()).toEqual(
        Object.keys(getLactateCopy("en").presentation).sort(),
      );
      expect(
        leaves(copy).every(
          (value) => typeof value === "string" && value.trim().length > 0,
        ),
      ).toBe(true);
      expect(copy.faq).toHaveLength(4);
      if (lang !== "en")
        expect(copy.title).not.toBe(getLactateCopy("en").title);
    });
  }
});
