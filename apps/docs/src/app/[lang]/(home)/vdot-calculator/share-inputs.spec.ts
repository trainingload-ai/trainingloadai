import { describe, expect, it } from "vitest";
import { readVdotInputs } from "./share-inputs";

describe("readVdotInputs", () => {
  it("starts empty unless a shared race or the example is present", () => {
    expect(readVdotInputs({})).toEqual({
      preset: "5k",
      customKm: "",
      timeSec: null,
      unit: "km",
      example: false,
    });
    expect(readVdotInputs({ example: "1" }).example).toBe(true);
    expect(readVdotInputs({ example: "1" }).timeSec).toBe(1500);
    expect(readVdotInputs({ d: "10000", t: "3000", unit: "mi" })).toMatchObject({
      preset: "10k",
      timeSec: 3000,
      unit: "mi",
      example: false,
    });
  });

  it("drops over-long and non-finite parameters", () => {
    expect(readVdotInputs({ d: "x".repeat(40), t: "1500" }).timeSec).toBeNull();
    expect(readVdotInputs({ d: "0", t: "1500" }).timeSec).toBeNull();
    expect(readVdotInputs({ d: "5000", t: "NaN" }).timeSec).toBeNull();
    expect(readVdotInputs({ d: "-5", t: "1500" }).timeSec).toBeNull();
    expect(readVdotInputs({ d: "5000", t: "25:00" })).toMatchObject({
      preset: "5k",
      timeSec: 1500,
    });
  });
});
