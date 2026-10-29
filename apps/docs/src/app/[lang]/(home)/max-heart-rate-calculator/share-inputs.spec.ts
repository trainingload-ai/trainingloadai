import { describe, expect, it } from "vitest";
import { readMaxHeartRateInputs } from "./share-inputs";

describe("max heart rate share inputs", () => {
  it("loads the age-40 example only from example=1", () => {
    expect(readMaxHeartRateInputs({ example: "1" })).toEqual({
      age: "40",
      sex: "unspecified",
      formula: "default",
      measured: "",
      example: true,
    });
  });

  it("keeps a formula chosen on top of the example", () => {
    expect(
      readMaxHeartRateInputs({
        example: "1",
        formula: "gulati",
        sex: "female",
      }),
    ).toMatchObject({
      age: "40",
      sex: "female",
      formula: "gulati",
      example: true,
    });
  });

  it("keeps a valid age, sex, formula, and measured value", () => {
    expect(
      readMaxHeartRateInputs({
        age: "40",
        sex: "female",
        formula: "gulati",
        measured: "176",
      }),
    ).toEqual({
      age: "40",
      sex: "female",
      formula: "gulati",
      measured: "176",
      example: false,
    });
  });

  it("preserves an adopted activity peak without relabeling it as a measured maximum", () => {
    expect(
      readMaxHeartRateInputs({ measured: "164", source: "observed" }),
    ).toMatchObject({ measured: "164", measuredSource: "observed" });
    expect(
      readMaxHeartRateInputs({ measured: "-4", source: "observed" }),
    ).not.toHaveProperty("measuredSource");
    expect(
      readMaxHeartRateInputs({ measured: "164", source: "anything" }),
    ).not.toHaveProperty("measuredSource");
  });

  it("drops invalid values and clears the page when nothing usable remains", () => {
    expect(
      readMaxHeartRateInputs({
        age: "0",
        sex: "female",
        formula: "nope",
        measured: "-4",
        example: "0",
      }),
    ).toEqual({
      age: "",
      sex: "unspecified",
      formula: "default",
      measured: "",
      example: false,
    });
    expect(readMaxHeartRateInputs({ age: "x".repeat(40) })).toEqual({
      age: "",
      sex: "unspecified",
      formula: "default",
      measured: "",
      example: false,
    });
  });
});
