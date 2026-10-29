import { describe, expect, it } from "vitest";
import { examplePmcWeek, projectPmc } from "@/lib/pmc-ewma";
import { readTrainingLoadInputs } from "./share-inputs";

describe("training load shared inputs", () => {
  it("restores zero seeds and a full 14-day period without changing the calculation", () => {
    const values = [0, 70, 45.5, 90, 0, 130, 55, 0, 70, 45, 90, 0, 130, 55];
    const restored = readTrainingLoadInputs({
      ctl: "0",
      atl: "0",
      tss: values.join(","),
    });
    expect(restored.ctl).toBe("0");
    expect(
      projectPmc({
        startingCtl: Number(restored.ctl),
        startingAtl: Number(restored.atl),
        dailyTss: restored.tss.map(Number),
      }),
    ).toEqual(projectPmc({ startingCtl: 0, startingAtl: 0, dailyTss: values }));
  });

  it.each([
    "0,0,0,0,0,0",
    Array(15).fill(0).join(","),
    "0,0,-1,0,0,0,0",
    "0,0,,0,0,0,0",
    "0,0,Infinity,0,0,0,0",
  ])(
    "falls back rather than silently shortening an invalid period: %s",
    (tss) => {
      expect(readTrainingLoadInputs({ tss }).tss).toEqual(
        examplePmcWeek().map(String),
      );
    },
  );

  it("ignores repeated and non-finite query values", () => {
    expect(
      readTrainingLoadInputs({
        ctl: ["30", "40"],
        atl: "NaN",
        tss: ["70", "80"],
      }),
    ).toEqual(readTrainingLoadInputs({}));
  });
});
