import { describe, expect, it } from "vitest";
import { EMPTY_RACE_TIME_SHARE, EXAMPLE_RACE_TIME_SHARE } from "@/lib/race-time-predictor";
import { readRaceTimeShare } from "./share-inputs";

describe("race time share inputs", () => {
  it("reads an empty query as an empty form", () => {
    expect(readRaceTimeShare({})).toEqual(EMPTY_RACE_TIME_SHARE);
  });

  it("restores the explicit example without a prefilled result on a blank URL", () => {
    expect(readRaceTimeShare({ example: "1" })).toEqual(EXAMPLE_RACE_TIME_SHARE);
  });
});
