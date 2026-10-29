import { describe, expect, it } from "vitest";
import {
  EMPTY_PACE_CALCULATOR,
  PACE_CALCULATOR_EXAMPLE,
} from "@/lib/running-pace";
import { readPaceCalculatorInputs } from "./share-inputs";

describe("running pace shared inputs", () => {
  it("restores a full share without treating it as the example", () => {
    const restored = readPaceCalculatorInputs({
      solve: "time",
      race: "marathon",
      unit: "mi",
      pu: "mi",
      chart: "half",
      h: "3",
      m: "30",
      s: "00",
      pm: "8",
      ps: "00",
      d: "26.2",
    });
    expect(restored.example).toBe(false);
    expect(restored.solveFor).toBe("time");
    expect(restored.preset).toBe("marathon");
    expect(restored.distanceUnit).toBe("mi");
    expect(restored.paceUnit).toBe("min_per_mi");
    expect(restored.distanceText).toBe("26.2");
    expect(restored.hours).toBe("3");
    expect(restored.minutes).toBe("30");
    expect(restored.chart).toBe("half");
  });

  it("loads the labeled example only from example=1", () => {
    expect(readPaceCalculatorInputs({})).toEqual(EMPTY_PACE_CALCULATOR);
    expect(readPaceCalculatorInputs({ example: "1" })).toEqual(
      PACE_CALCULATOR_EXAMPLE,
    );
  });

  it("ignores repeated, overlong, and non-finite query values", () => {
    expect(
      readPaceCalculatorInputs({
        solve: ["pace", "time"],
        m: "NaN",
        d: "x".repeat(33),
      }),
    ).toEqual(EMPTY_PACE_CALCULATOR);
    expect(
      readPaceCalculatorInputs({
        d: "x".repeat(600),
        m: "25",
      }),
    ).toEqual(EMPTY_PACE_CALCULATOR);
  });
});
