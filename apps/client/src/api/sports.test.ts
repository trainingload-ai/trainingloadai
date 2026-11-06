import { describe, expect, it } from "vitest";
import type { SportDefinition } from "./sports";
import { getSportDisplayName } from "./sports";
import zh from "../../../../packages/messages/client-core/zh.json";

const messages: Record<string, string> = {
  "sports.ROAD_RUNNING": "跑步",
  "families.RUN": "跑步",
  "families.UNKNOWN": "其他",
};

const translate = (key: string) => messages[key] ?? key;

describe("getSportDisplayName", () => {
  it.each([
    "CROSSFIT",
    "PADEL",
    "ALPINE_SKIING",
    "SNOWBOARDING",
    "MIXED_MARTIAL_ARTS",
    "SOCCER",
    "BASKETBALL",
    "FISHING",
  ])("localizes the new %s category before the catalog loads", (code) => {
    expect(
      getSportDisplayName(
        [],
        { sportType: "UNKNOWN", sportDefinitionCode: code },
        (key) =>
          (zh.SportCatalog.sports as Record<string, string>)[
            key.replace("sports.", "")
          ] ?? key,
      ),
    ).toBe((zh.SportCatalog.sports as Record<string, string>)[code]);
  });
  it("uses the localized sport definition name instead of the catalog display name", () => {
    const catalog: SportDefinition[] = [
      {
        code: "ROAD_RUNNING",
        family: "RUN",
        displayName: "Road Running",
        isDefaultForFamily: true,
        supportsPlanning: true,
        supportsStructuredWorkout: true,
        supportsDistance: true,
        supportsPace: true,
        supportsSpeed: true,
        supportsPower: false,
        supportsCadence: true,
        sortOrder: 10,
      },
    ];

    expect(
      getSportDisplayName(
        catalog,
        { sportType: "RUN", sportDefinitionCode: "ROAD_RUNNING" },
        translate,
      ),
    ).toBe("跑步");
  });

  it("localizes a known code even before the catalog has loaded", () => {
    expect(
      getSportDisplayName(
        [],
        { sportType: "RUN", sportDefinitionCode: "ROAD_RUNNING" },
        translate,
      ),
    ).toBe("跑步");
  });

  it("uses a localized family fallback when no sport definition is available", () => {
    expect(getSportDisplayName([], { sportType: "RUN" }, translate)).toBe(
      "跑步",
    );
  });
});
