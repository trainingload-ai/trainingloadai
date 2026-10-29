import { describe, expect, it } from "vitest";
import { readHeartRateZonesInputs } from "./share-inputs";

describe("heart-rate zones share inputs", () => {
  it("restores a complete Karvonen share, including the example flag", () => {
    expect(
      readHeartRateZonesInputs({
        model: "karvonen",
        maxHr: "190",
        restHr: "50",
        example: "1",
      }),
    ).toEqual({
      model: "KARVONEN",
      maxHr: "190",
      restHr: "50",
      lthr: "",
      example: true,
    });
  });

  it("keeps a decimal anchor and a Friel handoff", () => {
    expect(
      readHeartRateZonesInputs({ model: "friel", lthr: "171.5" }),
    ).toMatchObject({ model: "FRIEL", lthr: "171.5", example: false });
    expect(
      readHeartRateZonesInputs({ model: "mhr", maxHr: "180.5", restHr: "40" }),
    ).toEqual({
      model: "MHR",
      maxHr: "180.5",
      restHr: "",
      lthr: "",
      example: false,
    });
  });

  it("drops empty, partial, oversized, and non-finite shares", () => {
    expect(readHeartRateZonesInputs({})).toMatchObject({
      model: "KARVONEN",
      maxHr: "",
      example: false,
    });
    expect(
      readHeartRateZonesInputs({ model: "karvonen", maxHr: "190" }).maxHr,
    ).toBe("");
    expect(
      readHeartRateZonesInputs({ model: "friel", lthr: "not-a-number" }).lthr,
    ).toBe("");
    expect(
      readHeartRateZonesInputs({
        model: "mhr",
        maxHr: "1".repeat(40),
      }).maxHr,
    ).toBe("");
    expect(
      readHeartRateZonesInputs({
        model: "karvonen",
        maxHr: "190",
        restHr: "200",
        example: "1",
      }),
    ).toMatchObject({ maxHr: "", example: false });
  });
});
