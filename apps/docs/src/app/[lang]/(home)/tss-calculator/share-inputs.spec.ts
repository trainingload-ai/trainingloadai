import { describe, expect, it } from "vitest";
import {
  readTssInputs,
  tssSearchParams,
  EXAMPLE_TSS_INPUTS,
} from "./share-inputs";
import { calculateTss, durationHoursFromParts } from "@/lib/tss";

describe("TSS shared inputs", () => {
  it("preserves input values and average-power provenance after a link round trip", () => {
    const inputs = { ...EXAMPLE_TSS_INPUTS, kind: "average" as const };
    const restored = readTssInputs(Object.fromEntries(tssSearchParams(inputs)));
    expect(restored).toEqual(inputs);
    expect(
      calculateTss({
        durationHours: durationHoursFromParts(
          Number(restored.hours),
          Number(restored.minutes),
        )!,
        powerWatts: Number(restored.power),
        ftpWatts: Number(restored.ftp),
        powerKind: restored.kind,
      }),
    ).toMatchObject({
      powerKind: "average",
      intensityFactor: 0.8,
      tss: expect.closeTo(96),
    });
  });
  it("starts empty and ignores arrays, negative, infinite and oversized query values", () => {
    expect(readTssInputs({})).toEqual({
      hours: "",
      minutes: "",
      power: "",
      ftp: "",
      kind: "normalized",
    });
    expect(
      readTssInputs({
        hours: ["1", "2"],
        minutes: "-5",
        power: "Infinity",
        ftp: "1".repeat(50),
        kind: "lab",
      }),
    ).toEqual(readTssInputs({}));
  });
});
