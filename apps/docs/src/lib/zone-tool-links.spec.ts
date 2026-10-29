import { describe, expect, it } from "vitest";
import {
  buildHeartRateZonesSearch,
  heartRateZonesHref,
  heartRateZonesSearch,
  parseHeartRateZonesPrefill,
} from "./zone-tool-links";

describe("heart-rate zones share URL", () => {
  it("keeps the lactate-threshold handoff on Friel + LTHR", () => {
    expect(buildHeartRateZonesSearch({ model: "FRIEL", lthr: "172" })).toBe(
      heartRateZonesSearch(172),
    );
    expect(parseHeartRateZonesPrefill(`?${heartRateZonesSearch(171.6)}`)).toEqual({
      model: "FRIEL",
      lthr: "172",
      maxHr: null,
      restHr: null,
    });
  });

  it("encodes Karvonen inputs and omits the empty default", () => {
    expect(
      buildHeartRateZonesSearch({
        model: "KARVONEN",
        maxHr: "190",
        restHr: "55",
      }),
    ).toBe("model=karvonen&maxHr=190&restHr=55");
    expect(
      buildHeartRateZonesSearch({ model: "KARVONEN", maxHr: "", restHr: "" }),
    ).toBe("");
  });

  it("clears the URL until the selected model can calculate", () => {
    expect(buildHeartRateZonesSearch({ model: "FRIEL", lthr: "" })).toBe("");
    expect(
      buildHeartRateZonesSearch({ model: "KARVONEN", maxHr: "190", restHr: "" }),
    ).toBe("");
    expect(
      buildHeartRateZonesSearch({
        model: "KARVONEN",
        maxHr: "190.5",
        restHr: "50",
        example: true,
      }),
    ).toBe("model=karvonen&maxHr=190.5&restHr=50&example=1");
    expect(parseHeartRateZonesPrefill("model=karvonen&maxHr=190.5&restHr=50")).toMatchObject({
      model: "KARVONEN",
      maxHr: "190.5",
      restHr: "50",
    });
  });

  it("round-trips max-HR-only zones without a resting value", () => {
    const search = buildHeartRateZonesSearch({
      model: "MHR",
      maxHr: "180",
      restHr: "55",
    });
    expect(search).toBe("model=mhr&maxHr=180");
    expect(parseHeartRateZonesPrefill(`?${search}`)).toMatchObject({
      model: "MHR",
      maxHr: "180",
      restHr: null,
    });
  });
});

describe("heart rate zone handoff links", () => {
  it("round-trips a Friel LTHR link", () => {
    const href = heartRateZonesHref("/zh", { model: "FRIEL", lthr: 165.4 });
    expect(href).toBe("/zh/heart-rate-zones-calculator?model=friel&lthr=165");
    expect(parseHeartRateZonesPrefill(href.split("?")[1] ?? "")).toEqual({
      model: "FRIEL",
      lthr: "165",
      maxHr: null,
      restHr: null,
    });
  });

  it("round-trips a max-HR link", () => {
    const href = heartRateZonesHref("", { model: "MHR", maxHr: 190.5 });
    expect(href).toBe("/heart-rate-zones-calculator?model=mhr&maxHr=191");
    expect(parseHeartRateZonesPrefill(href.split("?")[1] ?? "")).toMatchObject({
      model: "MHR",
      maxHr: "191",
      lthr: null,
    });
  });

  it("round-trips Karvonen max and resting heart rate", () => {
    const href = heartRateZonesHref("/ja", {
      model: "KARVONEN",
      maxHr: 188,
      restHr: 48.6,
    });
    expect(href).toBe(
      "/ja/heart-rate-zones-calculator?model=karvonen&maxHr=188&restHr=49",
    );
    expect(parseHeartRateZonesPrefill(href.split("?")[1] ?? "")).toEqual({
      model: "KARVONEN",
      lthr: null,
      maxHr: "188",
      restHr: "49",
    });
  });
});
