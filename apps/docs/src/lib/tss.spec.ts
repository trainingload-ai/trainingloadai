import { describe, expect, it } from "vitest";
import {
  calculateTss,
  durationHoursFromParts,
  formatIntensityFactor,
  formatTssScore,
  intensityFactor,
  parseNonNegativeNumber,
  parsePositiveNumber,
} from "./tss";

describe("TSS math", () => {
  it("returns 100 TSS for one hour at FTP", () => {
    const result = calculateTss({
      durationHours: 1,
      powerWatts: 250,
      ftpWatts: 250,
      powerKind: "normalized",
    });

    expect(result).not.toBeNull();
    expect(result!.intensityFactor).toBeCloseTo(1, 8);
    expect(result!.tss).toBeCloseTo(100, 8);
  });

  it("uses hours × (NP/FTP)² × 100", () => {
    const durationHours = 1.5;
    const np = 250;
    const ftp = 300;
    const result = calculateTss({
      durationHours,
      powerWatts: np,
      ftpWatts: ftp,
      powerKind: "normalized",
    });

    expect(result).not.toBeNull();
    expect(result!.intensityFactor).toBeCloseTo(np / ftp, 8);
    expect(result!.tss).toBeCloseTo(durationHours * (np / ftp) ** 2 * 100, 8);
    expect(result!.tss).toBeCloseTo(104.1667, 3);
  });

  it("matches the seconds form of the TSS docs formula", () => {
    const hours = 2;
    const np = 220;
    const ftp = 280;
    const seconds = hours * 3600;
    const ifactor = np / ftp;
    const fromDocs = ((seconds * np * ifactor) / (ftp * 3600)) * 100;
    const result = calculateTss({
      durationHours: hours,
      powerWatts: np,
      ftpWatts: ftp,
      powerKind: "normalized",
    });

    expect(result!.tss).toBeCloseTo(fromDocs, 8);
  });

  it("uses the same arithmetic for average power, with the kind preserved", () => {
    const npResult = calculateTss({
      durationHours: 1,
      powerWatts: 200,
      ftpWatts: 250,
      powerKind: "normalized",
    });
    const avgResult = calculateTss({
      durationHours: 1,
      powerWatts: 200,
      ftpWatts: 250,
      powerKind: "average",
    });

    expect(avgResult!.tss).toBeCloseTo(npResult!.tss, 8);
    expect(avgResult!.powerKind).toBe("average");
  });

  it("rejects incomplete or out-of-range inputs", () => {
    expect(durationHoursFromParts(0, 0)).toBeNull();
    expect(durationHoursFromParts(1, 60)).toBeNull();
    expect(durationHoursFromParts(-1, 0)).toBeNull();
    expect(intensityFactor(0, 250)).toBeNull();
    expect(intensityFactor(250, 0)).toBeNull();
    expect(
      calculateTss({
        durationHours: 0,
        powerWatts: 250,
        ftpWatts: 250,
        powerKind: "normalized",
      }),
    ).toBeNull();
    expect(parsePositiveNumber("")).toBeNull();
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parseNonNegativeNumber("0")).toBe(0);
  });

  it("formats IF to two decimals and TSS without a trailing tenth at 100+", () => {
    expect(formatIntensityFactor(0.8333)).toBe("0.83");
    expect(formatTssScore(69.44)).toBe("69.4");
    expect(formatTssScore(100)).toBe("100");
  });
});
