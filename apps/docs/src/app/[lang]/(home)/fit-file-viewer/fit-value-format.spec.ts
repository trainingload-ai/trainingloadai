import { describe, expect, it } from "vitest";
import {
  fitDisplayUnits,
  formatSemicircleCoordinate,
  metersPerSecondToKilometersPerHour,
  metersPerSecondToPaceSecondsPerKilometer,
  semicirclesToDegrees,
} from "./fit-value-format";

describe("FIT value formatting", () => {
  it("converts signed 32-bit semicircles to decimal degrees", () => {
    expect(semicirclesToDegrees(2 ** 30)).toBe(90);
    expect(semicirclesToDegrees(-(2 ** 30))).toBe(-90);
    expect(semicirclesToDegrees(461_739_970)).toBeCloseTo(38.7026, 4);
    expect(semicirclesToDegrees(-112_049_164)).toBeCloseTo(-9.39185, 4);
  });

  it("formats coordinates with useful GPS precision", () => {
    expect(formatSemicircleCoordinate(461_739_970, "en")).toBe("38.7025972°");
  });

  it("converts the FIT Profile m/s speed unit for chart display", () => {
    expect(metersPerSecondToKilometersPerHour(2.5)).toBe(9);
    expect(metersPerSecondToPaceSecondsPerKilometer(2.5)).toBe(400);
    expect(metersPerSecondToPaceSecondsPerKilometer(0)).toBeUndefined();
  });

  it("labels transformed and decoded FIT values with display units", () => {
    expect(fitDisplayUnits("semicircles", "sint32")).toBe("°");
    expect(fitDisplayUnits("watts", "uint16")).toBe("W");
    expect(fitDisplayUnits("C", "sint8")).toBe("°C");
    expect(fitDisplayUnits("s", "dateTime")).toBeNull();
    expect(fitDisplayUnits("m/s", "uint32")).toBe("m/s");
  });
});
