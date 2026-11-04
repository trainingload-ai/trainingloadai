import { describe, expect, it } from "vitest";
import type { SportDefinition } from "@/api/sports";
import {
  activitySupportsDistance,
  isGenericActivityClassification,
} from "./activity-presentation";

const catalog = [
  {
    code: "OTHER",
    family: "UNKNOWN",
    isDefaultForFamily: true,
    supportsDistance: false,
  },
  {
    code: "ROAD_RUNNING",
    family: "RUN",
    isDefaultForFamily: true,
    supportsDistance: true,
  },
] as SportDefinition[];

describe("activity presentation", () => {
  it("recognizes only the generic UNKNOWN classification", () => {
    expect(
      isGenericActivityClassification({
        sportType: "UNKNOWN",
        subSportType: "OTHER",
      }),
    ).toBe(true);
    expect(
      isGenericActivityClassification({
        sportType: "UNKNOWN",
        subSportType: "STRENGTH_TRAINING",
      }),
    ).toBe(false);
  });

  it("uses sport capabilities instead of a positive numeric distance", () => {
    expect(
      activitySupportsDistance(catalog, {
        sportType: "UNKNOWN",
        subSportType: "OTHER",
      }),
    ).toBe(false);
    expect(
      activitySupportsDistance(catalog, {
        sportType: "RUN",
        subSportType: "ROAD_RUNNING",
      }),
    ).toBe(true);
  });
});
