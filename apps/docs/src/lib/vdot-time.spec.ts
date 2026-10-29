import { describe, expect, it } from "vitest";
import { computeVdotForDistanceTime } from "@shared/vdot";
import { parseFlexibleTime, parseTimeParts } from "./vdot-time";

describe("parseFlexibleTime", () => {
  it("accepts mm:ss, h:mm:ss, compact digits, and h/m/s suffixes", () => {
    expect(parseFlexibleTime("25:00")).toBe(1500);
    expect(parseFlexibleTime("1:55:08")).toBe(6908);
    expect(parseFlexibleTime("25：00")).toBe(1500);
    expect(parseFlexibleTime("2500")).toBe(1500);
    expect(parseFlexibleTime("15508")).toBe(6908);
    expect(parseFlexibleTime("25")).toBe(1500);
    expect(parseFlexibleTime("500")).toBe(300);
    expect(parseFlexibleTime("90:00")).toBe(5400);
    expect(parseFlexibleTime("1h25m8s")).toBe(5108);
    expect(parseFlexibleTime(" 25 : 00 ")).toBe(1500);
  });

  it("rejects empty, zero, and impossible clocks", () => {
    expect(parseFlexibleTime("")).toBeNull();
    expect(parseFlexibleTime("0:00")).toBeNull();
    expect(parseFlexibleTime("25:60")).toBeNull();
    expect(parseFlexibleTime("1:60:00")).toBeNull();
    expect(parseTimeParts("", "", "")).toBeNull();
    expect(parseTimeParts("", "25", "00")).toBe(1500);
    expect(parseTimeParts("1", "55", "08")).toBe(6908);
  });

  it("keeps the published 5K examples on this Daniels-style model", () => {
    expect(
      Math.round((computeVdotForDistanceTime(5000, 1500) ?? 0) * 10) / 10,
    ).toBe(38.3);
    expect(
      Math.round((computeVdotForDistanceTime(5000, 1200) ?? 0) * 10) / 10,
    ).toBe(49.8);
  });
});
