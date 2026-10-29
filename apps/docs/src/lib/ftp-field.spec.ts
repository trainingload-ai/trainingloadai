import { describe, expect, it } from "vitest";
import {
  ALLEN_COGGAN_FTP_CATEGORIES,
  allenCogganCategoryForWkg,
  bodyMassLimits,
  bodyMassToKilograms,
  buildFtpFieldSearch,
  cogganZones,
  estimateFieldFtp,
  formatCanonicalMass,
  formatDisplayMass,
  ftpWattsPerKg,
  ftpWkgBand,
  kilogramsToPounds,
  parseFtpFieldQuery,
  poundsToKilograms,
} from "./ftp-field";

describe("estimateFieldFtp", () => {
  it("applies the four field-test multipliers", () => {
    expect(estimateFieldFtp(250, "20MIN")).toBe(238);
    expect(estimateFieldFtp(300, "RAMP")).toBe(225);
    expect(estimateFieldFtp(280, "2X8")).toBe(252);
    expect(estimateFieldFtp(240, "60MIN")).toBe(240);
  });

  it("rounds the typed average before the factor", () => {
    expect(estimateFieldFtp(250.4, "20MIN")).toBe(238);
    expect(estimateFieldFtp(199.6, "20MIN")).toBe(190);
  });

  it("rejects empty, zero, negative, and extreme power", () => {
    expect(estimateFieldFtp(0, "20MIN")).toBeNull();
    expect(estimateFieldFtp(-10, "RAMP")).toBeNull();
    expect(estimateFieldFtp(Number.NaN, "60MIN")).toBeNull();
    expect(estimateFieldFtp(2001, "2X8")).toBeNull();
    expect(estimateFieldFtp(2000, "60MIN")).toBe(2000);
  });
});

describe("ftp W/kg bands", () => {
  it("uses FTP watts, not a ranking table", () => {
    expect(ftpWattsPerKg(238, 70)).toBeCloseTo(3.4, 5);
    expect(ftpWkgBand(3.4)).toBe("club");
  });

  it("cuts at 2.5, 3.5, and 4.5 W/kg", () => {
    expect(ftpWkgBand(2.49)).toBe("recreational");
    expect(ftpWkgBand(2.5)).toBe("club");
    expect(ftpWkgBand(3.49)).toBe("club");
    expect(ftpWkgBand(3.5)).toBe("strong_club");
    expect(ftpWkgBand(4.49)).toBe("strong_club");
    expect(ftpWkgBand(4.5)).toBe("competitive");
  });

  it("ignores weight outside 30–200 kg", () => {
    expect(ftpWattsPerKg(238, 29)).toBeNull();
    expect(ftpWattsPerKg(238, 201)).toBeNull();
    expect(ftpWattsPerKg(238, 30)).toBeCloseTo(238 / 30, 5);
    expect(ftpWattsPerKg(0, 70)).toBeNull();
  });
});

describe("ftp field query", () => {
  it("round-trips power, weight, and a non-default protocol", () => {
    const search = buildFtpFieldSearch("", {
      protocol: "RAMP",
      power: "300",
      weight: "70",
    });
    expect(search).toBe("?protocol=RAMP&power=300&weight=70");
    expect(parseFtpFieldQuery(search)).toEqual({
      protocol: "RAMP",
      power: "300",
      weight: "70",
      units: "metric",
    });
  });

  it("omits the default 20-minute protocol and blank fields", () => {
    expect(
      buildFtpFieldSearch("?utm=1", {
        protocol: "20MIN",
        power: "250",
        weight: "",
      }),
    ).toBe("?utm=1&power=250");
    expect(parseFtpFieldQuery("?power=250&weight=70")).toEqual({
      protocol: null,
      power: "250",
      weight: "70",
      units: "metric",
    });
  });

  it("keeps imperial as a display flag and still stores kilograms", () => {
    const search = buildFtpFieldSearch("?utm=1", {
      protocol: "60MIN",
      power: "300",
      weight: "70",
      units: "imperial",
    });
    expect(search).toBe("?utm=1&protocol=60MIN&power=300&weight=70&units=imperial");
    expect(parseFtpFieldQuery(search).units).toBe("imperial");
    expect(parseFtpFieldQuery("?units=nope").units).toBe("metric");
  });

  it("ignores junk query values", () => {
    expect(parseFtpFieldQuery("?protocol=nope&power=12watts&weight=.")).toEqual({
      protocol: null,
      power: null,
      weight: null,
      units: "metric",
    });
  });
});

describe("body mass units", () => {
  it("converts 70 kg to 154.3 lb and back inside one decimal", () => {
    expect(formatDisplayMass(kilogramsToPounds(70))).toBe("154.3");
    expect(formatDisplayMass(poundsToKilograms(154.3))).toBe("70");
    expect(formatCanonicalMass(bodyMassToKilograms(154.3, "imperial"))).toBe("69.99");
    expect(bodyMassToKilograms(70, "metric")).toBe(70);
  });

  it("limits pounds to the 1-decimal values inside 30–200 kg", () => {
    expect(bodyMassLimits("metric")).toEqual({ min: 30, max: 200 });
    expect(bodyMassLimits("imperial")).toEqual({ min: 66.2, max: 440.9 });
    expect(bodyMassToKilograms(66.2, "imperial")).toBeGreaterThanOrEqual(30);
    expect(bodyMassToKilograms(440.9, "imperial")).toBeLessThanOrEqual(200);
  });
});

describe("Allen & Coggan FTP categories", () => {
  it("lists Untrained through Superior with men's example watts", () => {
    expect(ALLEN_COGGAN_FTP_CATEGORIES.map((row) => row.id)).toEqual([
      "untrained",
      "fair",
      "good",
      "excellent",
      "superior",
    ]);
    expect(ALLEN_COGGAN_FTP_CATEGORIES[0]).toEqual({
      id: "untrained",
      men: "< 2.23",
      women: "< 1.90",
      w65: "< 145 W",
      w70: "< 156 W",
      w75: "< 167 W",
    });
    expect(ALLEN_COGGAN_FTP_CATEGORIES.at(-1)?.men).toBe("≥ 5.05");
    expect(ALLEN_COGGAN_FTP_CATEGORIES.at(-1)?.w75).toBe("379+ W");
  });

  it("places 3.40 W/kg in Good for men and Excellent for women", () => {
    expect(allenCogganCategoryForWkg(3.4, "men")).toBe("good");
    expect(allenCogganCategoryForWkg(3.4, "women")).toBe("excellent");
    expect(allenCogganCategoryForWkg(0, "men")).toBeNull();
  });
});

describe("cogganZones", () => {
  it("builds seven zones from FTP with Coggan percents", () => {
    expect(cogganZones(200)).toEqual([
      { id: "z1", percentLabel: "<55", minWatts: null, maxWatts: 110 },
      { id: "z2", percentLabel: "56–75", minWatts: 112, maxWatts: 150 },
      { id: "z3", percentLabel: "76–90", minWatts: 152, maxWatts: 180 },
      { id: "z4", percentLabel: "91–105", minWatts: 182, maxWatts: 210 },
      { id: "z5", percentLabel: "106–120", minWatts: 212, maxWatts: 240 },
      { id: "z6", percentLabel: "121–150", minWatts: 242, maxWatts: 300 },
      { id: "z7", percentLabel: ">150", minWatts: 300, maxWatts: null },
    ]);
  });

  it("returns null without a positive FTP", () => {
    expect(cogganZones(0)).toBeNull();
    expect(cogganZones(Number.NaN)).toBeNull();
  });
});
