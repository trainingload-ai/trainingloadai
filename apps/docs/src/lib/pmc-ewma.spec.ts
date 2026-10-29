import { describe, expect, it } from "vitest";
import {
  ATL_TIME_CONSTANT_DAYS,
  CTL_TIME_CONSTANT_DAYS,
  EXAMPLE_PMC_STARTING_ATL,
  EXAMPLE_PMC_STARTING_CTL,
  EXAMPLE_PMC_WEEK_TSS,
  interpretTsb,
  nextTrainingPeaksLoad,
  projectPmc,
  sparklinePoints,
  trainingStressBalance,
} from "./pmc-ewma";

describe("TrainingPeaks-style PMC EWMA", () => {
  it("advances CTL and ATL with 1/τ blending", () => {
    const ctl = nextTrainingPeaksLoad(50, 100, CTL_TIME_CONSTANT_DAYS);
    const atl = nextTrainingPeaksLoad(50, 100, ATL_TIME_CONSTANT_DAYS);

    expect(ctl).toBeCloseTo(50 + (100 - 50) / 42, 8);
    expect(atl).toBeCloseTo(50 + (100 - 50) / 7, 8);
    expect(atl).toBeGreaterThan(ctl);
  });

  it("sets TSB to same-day CTL minus ATL", () => {
    expect(trainingStressBalance(55, 70)).toBeCloseTo(-15, 8);
    expect(trainingStressBalance(60, 48)).toBeCloseTo(12, 8);
  });

  it("projects the seeded example week into fatigue after a hard Saturday", () => {
    const projection = projectPmc({
      startingCtl: EXAMPLE_PMC_STARTING_CTL,
      startingAtl: EXAMPLE_PMC_STARTING_ATL,
      dailyTss: [...EXAMPLE_PMC_WEEK_TSS],
    });

    expect(projection).not.toBeNull();
    expect(projection!.days).toHaveLength(7);
    expect(projection!.final.tss).toBe(55);

    let ctl = EXAMPLE_PMC_STARTING_CTL;
    let atl = EXAMPLE_PMC_STARTING_ATL;
    for (const tss of EXAMPLE_PMC_WEEK_TSS) {
      ctl = nextTrainingPeaksLoad(ctl, tss, CTL_TIME_CONSTANT_DAYS);
      atl = nextTrainingPeaksLoad(atl, tss, ATL_TIME_CONSTANT_DAYS);
    }

    expect(projection!.final.ctl).toBeCloseTo(ctl, 8);
    expect(projection!.final.atl).toBeCloseTo(atl, 8);
    expect(projection!.final.tsb).toBeCloseTo(ctl - atl, 8);
    expect(projection!.tsbBand).toBe(interpretTsb(projection!.final.tsb));
  });

  it("classifies TSB bands used by the teaching demo", () => {
    expect(interpretTsb(-18)).toBe("fatigue");
    expect(interpretTsb(0)).toBe("maintaining");
    expect(interpretTsb(14)).toBe("freshening");
  });

  it("rejects negative loads and empty series", () => {
    expect(
      projectPmc({
        startingCtl: 40,
        startingAtl: 40,
        dailyTss: [],
      }),
    ).toBeNull();
    expect(
      projectPmc({
        startingCtl: 40,
        startingAtl: 40,
        dailyTss: [10, -1],
      }),
    ).toBeNull();
    expect(
      projectPmc({
        startingCtl: -1,
        startingAtl: 10,
        dailyTss: [20],
      }),
    ).toBeNull();
  });

  it("keeps rest days as zero TSS that still decay the averages", () => {
    const projection = projectPmc({
      startingCtl: 60,
      startingAtl: 80,
      dailyTss: [0],
    });

    expect(projection).not.toBeNull();
    expect(projection!.final.tss).toBe(0);
    expect(projection!.final.ctl).toBeCloseTo(60 + (0 - 60) / 42, 8);
    expect(projection!.final.atl).toBeCloseTo(80 + (0 - 80) / 7, 8);
    expect(projection!.final.ctl).toBeLessThan(60);
    expect(projection!.final.atl).toBeLessThan(80);
  });

  it("builds a sparkline polyline from CTL values", () => {
    const points = sparklinePoints([50, 52, 51], 100, 40);
    expect(points.split(" ")).toHaveLength(3);
    expect(points.startsWith("4.0,")).toBe(true);
  });
});
