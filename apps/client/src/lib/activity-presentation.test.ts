import { describe, expect, it } from "vitest";
import type { SportDefinition } from "@/api/sports";
import {
  activitySupportsDistance,
  isGenericActivityClassification,
  getOtherActivitySummaryCapabilities,
} from "./activity-presentation";
import { getActivitySportVisual } from "@shared/activity-visual";

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
  it("shows supported outdoor measurements without treating the sport as running", () => {
    const sports = [
      ...catalog,
      {
        code: "ALPINE_SKIING",
        family: "UNKNOWN",
        supportsDistance: true,
        supportsSpeed: true,
      } as SportDefinition,
    ];
    expect(
      getOtherActivitySummaryCapabilities(sports, {
        sportType: "UNKNOWN",
        sportDefinitionCode: "ALPINE_SKIING",
        distance: 10000,
        averageSpeed: 8,
      }),
    ).toEqual({ showDistance: true, showSpeed: true });
    expect(
      getOtherActivitySummaryCapabilities(sports, {
        sportType: "UNKNOWN",
        sportDefinitionCode: "OTHER",
        distance: 0.1,
        averageSpeed: 0,
      }),
    ).toEqual({ showDistance: false, showSpeed: false });
    expect(getActivitySportVisual("UNKNOWN", "ALPINE_SKIING")).toBe("other");
    expect(getActivitySportVisual("RUN", "HIKING")).toBe("hiking");
  });
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
