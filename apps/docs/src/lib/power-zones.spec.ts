import { describe, expect, it } from "vitest";
import { cogganZones } from "./ftp-field";
import {
  calculatePowerZones,
  POWER_ZONE_MODELS,
  roundZoneWatts,
  type PowerZoneBand,
} from "./power-zones";
import { parsePowerZonesPrefill, powerZonesHref } from "./zone-tool-links";

function expectOpenEnds(zones: PowerZoneBand[]) {
  expect(zones[0]?.minWatts).toBeNull();
  expect(zones.at(-1)?.maxWatts).toBeNull();
  expect(zones.at(-1)?.wattLabel).toMatch(/^(>|≥)/);
}

function expectContinuous(zones: PowerZoneBand[]) {
  for (let index = 0; index < zones.length - 1; index += 1) {
    const upper = zones[index]?.maxWatts;
    const next = zones[index + 1]?.minWatts;
    expect(upper).toEqual(expect.any(Number));
    expect(next).toEqual(expect.any(Number));
    expect(next!).toBeGreaterThan(upper!);
    expect(next).toBe(upper! + 1);
  }
}

describe("shared power zones", () => {
  it("preserves each model's thresholds and zone count at 300 W", () => {
    const coggan = calculatePowerZones("COGGAN", 300)!;
    expect(coggan).toHaveLength(7);
    expect(coggan[0].wattLabel).toBe("≤ 164W");
    expect(coggan[3].wattLabel).toBe("271–315W");
    expect(coggan[6].wattLabel).toBe("≥ 451W");

    const friel = calculatePowerZones("FRIEL", 300)!;
    expect(friel).toHaveLength(7);
    expect(friel[3].wattLabel).toBe("273–317W");
    expect(friel[3].percentLabel).toBe("91%–105%");

    const vance = calculatePowerZones("VANCE", 300)!;
    expect(vance).toHaveLength(7);
    expect(vance[3].wattLabel).toBe("288–317W");

    const stryd = calculatePowerZones("STRYD", 300)!;
    expect(stryd).toHaveLength(5);
    expect(stryd[2].wattLabel).toBe("273–302W");
    expect(stryd[4].wattLabel).toBe("≥ 348W");
  });

  it("carries the selected model and FTP into the detailed calculator", () => {
    for (const model of POWER_ZONE_MODELS) {
      const url = new URL(
        powerZonesHref("/zh", 300, model),
        "https://example.com",
      );
      expect(parsePowerZonesPrefill(url.search)).toEqual({
        model,
        baseType: "FTP",
        base: "300",
        example: false,
      });
    }
    expect(parsePowerZonesPrefill("model=unknown").model).toBeNull();
  });

  it("does not generate zones without a valid power value", () => {
    for (const model of POWER_ZONE_MODELS) {
      for (const power of [0, -1, NaN, Infinity]) {
        expect(calculatePowerZones(model, power)).toBeNull();
      }
    }
  });

  it("keeps adjacent zones from overlapping and leaves the top zone open", () => {
    const bases = [100, 250, 250.5, 300, 1999];
    for (const base of bases) {
      for (const model of POWER_ZONE_MODELS) {
        const zones = calculatePowerZones(model, base);
        expect(zones).not.toBeNull();
        expectOpenEnds(zones!);
        expectContinuous(zones!);
      }
    }
  });

  it("rounds each Friel, Vance, and Stryd boundary once", () => {
    expect(roundZoneWatts(250.5, 56)).toBe(140);
    expect(roundZoneWatts(251, 56)).toBe(141);

    const friel = calculatePowerZones("FRIEL", 250.5)!;
    expect(friel[1]).toMatchObject({ minWatts: 140, maxWatts: 189 });
    expect(friel[1]?.wattLabel).toBe("140–189W");
    expect(calculatePowerZones("FRIEL", 251)![1]?.minWatts).toBe(141);

    const vance = calculatePowerZones("VANCE", 250.5)!;
    expect(vance[3]?.minWatts).toBe(roundZoneWatts(250.5, 96));
    expect(vance[3]?.minWatts).not.toBe(roundZoneWatts(251, 96));

    const stryd = calculatePowerZones("STRYD", 250.5)!;
    expect(stryd[3]?.minWatts).toBe(roundZoneWatts(250.5, 101));
    expect(stryd[3]?.minWatts).not.toBe(roundZoneWatts(251, 101));

    expect(calculatePowerZones("COGGAN", 250)![1]?.maxWatts).toBe(
      Math.round((250 * 75) / 100),
    );
  });

  it("matches the shared Coggan table, including its single reference rounding", () => {
    const fromFloat = calculatePowerZones("COGGAN", 250.5)!;
    const fromRounded = calculatePowerZones("COGGAN", 251)!;
    expect(fromFloat.map((zone) => zone.wattLabel)).toEqual(
      fromRounded.map((zone) => zone.wattLabel),
    );
    const shared = cogganZones(250.5)!;
    expect(fromFloat[0]?.wattLabel).toBe(
      `≤ ${shared[0]!.maxWatts! - 1}W`,
    );
    expect(fromFloat[6]?.wattLabel).toBe(
      `≥ ${shared[5]!.maxWatts! + 1}W`,
    );
    expect(fromFloat[0]?.wattLabel.startsWith("≤")).toBe(true);
    expect(fromFloat[6]?.maxWatts).toBeNull();
  });

  it("reads an explicit example flag and rejects an overlong query", () => {
    expect(parsePowerZonesPrefill("model=coggan&baseType=ftp&base=250&example=1")).toEqual({
      model: "COGGAN",
      baseType: "FTP",
      base: "250",
      example: true,
    });
    expect(parsePowerZonesPrefill(`base=${"9".repeat(40)}`).base).toBeNull();
    expect(parsePowerZonesPrefill(`model=${"a".repeat(300)}`).model).toBeNull();
  });
});
