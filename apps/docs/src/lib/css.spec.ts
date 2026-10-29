import { describe, expect, it } from "vitest";
import {
  calculateCss,
  METERS_PER_YARD,
  formatPaceClock,
  formatSpeedMps,
  isUnusualCssPace,
  parsePositiveNumber,
  timePartsToSeconds,
} from "./css";

describe("CSS math", () => {
  it("preserves physical speed and every training pace when units change", () => {
    const a = { distance: 600, timeSec: 720 };
    const b = { distance: 300, timeSec: 330 };
    const metric = calculateCss(a, b, "meters")!;
    const imperial = calculateCss(
      { ...a, distance: a.distance / METERS_PER_YARD },
      { ...b, distance: b.distance / METERS_PER_YARD },
      "yards",
    )!;
    expect(imperial.speedMps).toBeCloseTo(metric.speedMps, 10);
    expect(imperial.pacePer100UnitSec / METERS_PER_YARD).toBeCloseTo(
      metric.pacePer100UnitSec,
      10,
    );
    for (let i = 0; i < metric.zones.length; i++) {
      expect(imperial.zones[i].paceStartSec / METERS_PER_YARD).toBeCloseTo(
        metric.zones[i].paceStartSec,
        10,
      );
      expect(imperial.zones[i].paceEndSec / METERS_PER_YARD).toBeCloseTo(
        metric.zones[i].paceEndSec,
        10,
      );
    }
  });

  it("allows valid long records and fractional seconds without a test-duration gate", () => {
    expect(timePartsToSeconds(80, 30.5)).toBe(4830.5);
    expect(formatPaceClock(119.9)).toBe("2:00");
    expect(
      calculateCss(
        { distance: 2500, timeSec: 3600 },
        { distance: 5000, timeSec: 8000 },
        "meters",
      ),
    ).not.toBeNull();
  });

  it("matches the classic 400/200 formula", () => {
    // 400 m in 6:00 (360 s), 200 m in 2:40 (160 s)
    // CSS = (400 − 200) / (360 − 160) = 1.0 m/s → 1:40 /100 m
    const result = calculateCss(
      { distance: 400, timeSec: 360 },
      { distance: 200, timeSec: 160 },
      "meters",
    );

    expect(result).not.toBeNull();
    expect(result!.speedMps).toBeCloseTo(1, 8);
    expect(result!.pacePer100mSec).toBeCloseTo(100, 8);
    expect(result!.pacePer100UnitSec).toBeCloseTo(100, 8);
    expect(formatPaceClock(result!.pacePer100mSec)).toBe("1:40");
  });

  it("orders distances so the longer swim is D2", () => {
    const forward = calculateCss(
      { distance: 200, timeSec: 170 },
      { distance: 400, timeSec: 380 },
      "meters",
    );
    const reversed = calculateCss(
      { distance: 400, timeSec: 380 },
      { distance: 200, timeSec: 170 },
      "meters",
    );

    expect(forward!.speedMps).toBeCloseTo(reversed!.speedMps, 8);
    expect(forward!.longDistance).toBe(400);
    expect(reversed!.longDistance).toBe(400);
  });

  it("converts yards into CSS m/s then pace per 100 yards", () => {
    const result = calculateCss(
      { distance: 400, timeSec: 360 },
      { distance: 200, timeSec: 160 },
      "yards",
    );

    expect(result).not.toBeNull();
    // Same split in yards is slower in m/s because 200 yd < 200 m.
    expect(result!.speedMps).toBeCloseTo(0.9144, 4);
    expect(result!.pacePer100UnitSec).toBeCloseTo(100, 4);
    expect(result!.pacePer100mSec).toBeCloseTo(100 / 0.9144, 4);
  });

  it("rejects equal distances, inverted times, and empty inputs", () => {
    expect(
      calculateCss(
        { distance: 400, timeSec: 360 },
        { distance: 400, timeSec: 180 },
        "meters",
      ),
    ).toBeNull();
    expect(
      calculateCss(
        { distance: 400, timeSec: 160 },
        { distance: 200, timeSec: 360 },
        "meters",
      ),
    ).toBeNull();
    expect(timePartsToSeconds(0, 0)).toBeNull();
    expect(timePartsToSeconds(1, 60)).toBeNull();
    expect(parsePositiveNumber("0")).toBeNull();
    expect(timePartsToSeconds(6, 20)).toBe(380);
  });

  it("formats pace clocks and flags unusual CSS values", () => {
    expect(formatPaceClock(105.4)).toBe("1:45");
    expect(formatSpeedMps(0.95238)).toBe("0.952");
    expect(isUnusualCssPace(50)).toBe(true);
    expect(isUnusualCssPace(100)).toBe(false);
  });

  it("offsets training zones from CSS pace per 100", () => {
    const result = calculateCss(
      { distance: 400, timeSec: 360 },
      { distance: 200, timeSec: 160 },
      "meters",
    );
    const threshold = result!.zones.find((zone) => zone.id === "threshold");
    const easy = result!.zones.find((zone) => zone.id === "easy");
    const vo2 = result!.zones.find((zone) => zone.id === "vo2");

    expect(threshold?.paceStartSec).toBeCloseTo(100, 8);
    expect(easy?.paceStartSec).toBeCloseTo(108, 8);
    expect(easy?.paceEndSec).toBeCloseTo(112, 8);
    expect(vo2?.paceStartSec).toBeCloseTo(96, 8);
  });
});
