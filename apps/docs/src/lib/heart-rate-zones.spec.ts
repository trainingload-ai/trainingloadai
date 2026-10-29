import { describe, expect, it } from "vitest";
import {
  calculateZone2FromLthr,
  calculateZone2FromMaxHr,
} from "./zone-2-heart-rate";
import {
  buildFrielZones,
  buildKarvonenZones,
  buildMhrZones,
  formatZoneBpm,
  heartRateZoneByOrder,
  parseHeartRateBpm,
  roundBpm,
  type HeartRateZone,
} from "./heart-rate-zones";

function expectAbutting(zones: HeartRateZone[]) {
  for (let index = 0; index < zones.length - 1; index++) {
    const current = zones[index];
    const next = zones[index + 1];
    expect(current.bpmMax).toBe(next.bpmMin - 1);
  }
}

describe("heart-rate zone tables", () => {
  it("builds non-overlapping Friel bands and matches the zone-2 LTHR range", () => {
    const zones = buildFrielZones(170);
    expect(zones).not.toBeNull();
    expect(zones!.map((zone) => zone.code)).toEqual([
      "Z1",
      "Z2",
      "Z3",
      "Z4",
      "Z5a",
      "Z5b",
      "Z5c",
    ]);
    expect(zones!.map((zone) => zone.percentLabel)).toEqual([
      "< 81%",
      "81%–89%",
      "90%–93%",
      "94%–99%",
      "100%–102%",
      "103%–106%",
      "≥ 107%",
    ]);
    expectAbutting(zones!);
    expect(zones!.at(-1)?.bpmMax).toBeNull();
    expect(formatZoneBpm(zones![0].bpmMin, zones![0].bpmMax)).toBe("< 138");
    const zone2 = heartRateZoneByOrder(zones!, 2)!;
    const shared = calculateZone2FromLthr(170)!;
    expect(zone2.bpmMin).toBe(shared.bpmMin);
    expect(zone2.bpmMax).toBe(shared.bpmMax);
    expect(zone2).toMatchObject({ bpmMin: 138, bpmMax: 152 });
  });

  it("assigns the max-HR boundary bpm to the next zone", () => {
    const zones = buildMhrZones(190)!;
    expect(zones.map((zone) => [zone.bpmMin, zone.bpmMax])).toEqual([
      [95, 113],
      [114, 132],
      [133, 151],
      [152, 170],
      [171, 190],
    ]);
    expect(zones.map((zone) => zone.percentLabel)).toEqual([
      "50%–60%",
      "60%–70%",
      "70%–80%",
      "80%–90%",
      "90%–100%",
    ]);
    expectAbutting(zones);
    const shared = calculateZone2FromMaxHr(190)!;
    const zone2 = heartRateZoneByOrder(zones, 2)!;
    expect(zone2.bpmMin).toBe(shared.bpmMin);
    expect(zone2.bpmMax).toBe(shared.bpmMax);
    expect(formatZoneBpm(zone2.bpmMin, zone2.bpmMax)).toBe("114–132");
  });

  it("builds Karvonen zones from heart-rate reserve and rejects rest >= max", () => {
    const zones = buildKarvonenZones(190, 50)!;
    expect(zones.map((zone) => [zone.bpmMin, zone.bpmMax])).toEqual([
      [120, 133],
      [134, 147],
      [148, 161],
      [162, 175],
      [176, 190],
    ]);
    expectAbutting(zones);
    expect(zones.at(-1)?.bpmMax).toBe(190);
    expect(buildKarvonenZones(150, 150)).toBeNull();
    expect(buildKarvonenZones(150, 160)).toBeNull();
  });

  it("rounds each bpm edge once and keeps a .5 anchor", () => {
    expect(roundBpm(180.5)).toBe(181);
    const fromHalf = buildMhrZones(180.5)!;
    const preRounded = buildMhrZones(181)!;
    expect(heartRateZoneByOrder(fromHalf, 2)?.bpmMin).toBe(108);
    expect(heartRateZoneByOrder(preRounded, 2)?.bpmMin).toBe(109);
    expect(buildKarvonenZones(200.5, 40.4)![0].bpmMin).toBe(120);
    expect(buildKarvonenZones(201, 40)![0].bpmMin).toBe(121);
    expect(buildFrielZones(170.5)![1].bpmMin).toBe(roundBpm(0.81 * 170.5));
    expect(buildFrielZones(170.5)![1].bpmMin).not.toBe(
      buildFrielZones(171)![1].bpmMin,
    );
  });

  it("rejects empty, zero, negative, and non-finite input", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
      expect(buildFrielZones(value)).toBeNull();
      expect(buildMhrZones(value)).toBeNull();
      expect(buildKarvonenZones(value, 50)).toBeNull();
      expect(buildKarvonenZones(180, value)).toBeNull();
    }
    expect(parseHeartRateBpm("")).toBeNull();
    expect(parseHeartRateBpm("0")).toBeNull();
    expect(parseHeartRateBpm("-4")).toBeNull();
    expect(parseHeartRateBpm("abc")).toBeNull();
    expect(parseHeartRateBpm("Infinity")).toBeNull();
    expect(parseHeartRateBpm("190.5")).toBe(190.5);
  });
});
