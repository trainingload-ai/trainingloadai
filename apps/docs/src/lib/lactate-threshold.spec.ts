import { describe, expect, it } from "vitest";
import { calculateZone2FromLthr } from "@/lib/zone-2-heart-rate";
import { RACE_DISTANCES_KM } from "@/lib/running-pace";
import {
  buildThresholdPaceChart,
  estimateFtpFromProtocol,
  estimateLt2PaceFromRace,
  lt1HeartRateBand,
  lt1PaceBand,
  lt1PowerBand,
  paceSplitSeconds,
} from "@/lib/lactate-threshold";
import {
  heartRateZonesHref,
  parseHeartRateZonesPrefill,
  parsePowerZonesPrefill,
  powerZonesHref,
} from "@/lib/zone-tool-links";

describe("lactate threshold field estimates", () => {
  it("turns a 5K into an LT2 pace slower than race pace", () => {
    const timeSeconds = 20 * 60;
    const racePace = timeSeconds / RACE_DISTANCES_KM["5k"];
    const estimate = estimateLt2PaceFromRace(RACE_DISTANCES_KM["5k"], timeSeconds);

    expect(estimate).not.toBeNull();
    expect(estimate!.vdotSupported).toBe(true);
    expect(estimate!.secPerKm).toBeGreaterThan(racePace);
    expect(estimate!.secPerKm).toBeGreaterThan(250);
    expect(estimate!.secPerKm).toBeLessThan(280);
  });

  it("turns a marathon into an LT2 pace faster than marathon pace", () => {
    const timeSeconds = 3 * 3600;
    const racePace = timeSeconds / RACE_DISTANCES_KM.marathon;
    const estimate = estimateLt2PaceFromRace(
      RACE_DISTANCES_KM.marathon,
      timeSeconds,
    );

    expect(estimate).not.toBeNull();
    expect(estimate!.secPerKm).toBeLessThan(racePace);
  });

  it("gives a faster LT2 pace to a faster race at the same distance", () => {
    const slower = estimateLt2PaceFromRace(10, 50 * 60);
    const faster = estimateLt2PaceFromRace(10, 40 * 60);
    expect(slower && faster && faster.secPerKm < slower.secPerKm).toBe(true);
  });

  it("rejects empty race inputs", () => {
    expect(estimateLt2PaceFromRace(0, 1200)).toBeNull();
    expect(estimateLt2PaceFromRace(5, 0)).toBeNull();
    expect(estimateLt2PaceFromRace(Number.NaN, 1200)).toBeNull();
  });

  it("keeps the existing power-protocol factors", () => {
    expect(estimateFtpFromProtocol(260, "20MIN")).toBe(247);
    expect(estimateFtpFromProtocol(300, "8MIN")).toBe(270);
    expect(estimateFtpFromProtocol(240, "60MIN")).toBe(240);
    expect(estimateFtpFromProtocol(260.5, "20MIN")).toBe(247);
    expect(estimateFtpFromProtocol(0, "20MIN")).toBeNull();
  });

  it("aligns the heart-rate LT1 band with Friel zone 2", () => {
    const band = lt1HeartRateBand(170);
    const zone2 = calculateZone2FromLthr(170);
    expect(zone2).not.toBeNull();
    expect(band).toEqual({ min: zone2!.bpmMin, max: zone2!.bpmMax });
    expect(band).toEqual({ min: 138, max: 152 });
  });

  it("uses a 70–80% power band for LT1", () => {
    expect(lt1PowerBand(250)).toEqual({ min: 175, max: 200 });
    expect(lt1PowerBand(0)).toBeNull();
  });

  it("builds a race chart whose 5K 20:00 row matches the calculator", () => {
    const rows = buildThresholdPaceChart();
    const row = rows.find(
      (item) => item.preset === "5k" && item.timeSeconds === 20 * 60,
    );
    const estimate = estimateLt2PaceFromRace(RACE_DISTANCES_KM["5k"], 20 * 60);

    expect(rows).toHaveLength(16);
    expect(rows.map((item) => item.preset)).toEqual([
      "5k",
      "5k",
      "5k",
      "5k",
      "10k",
      "10k",
      "10k",
      "10k",
      "half",
      "half",
      "half",
      "half",
      "marathon",
      "marathon",
      "marathon",
      "marathon",
    ]);
    expect(row).toBeDefined();
    expect(estimate).not.toBeNull();
    expect(row!.secPerKm).toBe(estimate!.secPerKm);
    expect(row!.secPerKm).toBe(262);
    expect(row!.split400Seconds).toBe(paceSplitSeconds(262, 400));
    expect(row!.split400Seconds).toBe(105);
    expect(row!.split1600Seconds).toBe(419);
    expect(lt1PaceBand(262)).toEqual({ fastSecPerKm: 291, slowSecPerKm: 320 });
  });

  it("places the pace LT1 band slower than LT2", () => {
    const band = lt1PaceBand(240);
    expect(band).not.toBeNull();
    expect(band!.fastSecPerKm).toBeGreaterThan(240);
    expect(band!.slowSecPerKm).toBeGreaterThan(band!.fastSecPerKm);
    expect(band!.fastSecPerKm / 240).toBeCloseTo(1 / 0.9, 1);
    expect(band!.slowSecPerKm / 240).toBeCloseTo(1 / 0.82, 1);
  });
});

describe("zone tool handoff links", () => {
  it("prefills Friel LTHR and reads it back", () => {
    const href = heartRateZonesHref("", 171.6);
    expect(href).toBe("/heart-rate-zones-calculator?model=friel&lthr=172");
    expect(parseHeartRateZonesPrefill(href.split("?")[1] ?? "")).toEqual({
      model: "FRIEL",
      lthr: "172",
      maxHr: null,
      restHr: null,
    });
  });

  it("switches to Friel when only LTHR is present", () => {
    expect(parseHeartRateZonesPrefill("lthr=168").model).toBe("FRIEL");
  });

  it("prefills Friel FTP watts and reads them back", () => {
    const href = powerZonesHref("/zh", 247.2);
    expect(href).toBe("/zh/power-zones-calculator?model=friel&baseType=ftp&base=247");
    expect(parsePowerZonesPrefill("model=friel&baseType=ftp&base=247")).toEqual({
      model: "FRIEL",
      baseType: "FTP",
      base: "247",
      example: false,
    });
  });

  it("ignores non-numeric prefill values", () => {
    expect(parseHeartRateZonesPrefill("model=friel&lthr=fast").lthr).toBeNull();
    expect(parsePowerZonesPrefill("base=lots").base).toBeNull();
  });
});
