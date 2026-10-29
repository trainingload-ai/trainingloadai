import { describe, expect, it } from "vitest";
import { cpDraftsFromFileResponse } from "./cp-file-result";
import {
  fitCriticalPower,
  parseCpQuery,
  buildCpSearch,
} from "./critical-power";

const row = {
  cp: 250,
  ftp: 238,
  wPrimeJ: 27000,
  derived: { p3m: 400, pLong: 300, longDurationSec: 540 },
};

describe("CP file result", () => {
  it("fits the extracted windows as CP, without applying the FTP conversion", () => {
    const drafts = cpDraftsFromFileResponse({ code: 200, data: [row] })!;
    const fit = fitCriticalPower(
      drafts.slice(0, 2).map((d) => ({
        seconds:
          d.preset === "custom" ? Number(d.minutes) * 60 : Number(d.preset),
        watts: Number(d.watts),
      })),
    )!;
    expect(fit.cpWatts).toBe(250);
    expect(fit.wPrimeJoules).toBe(27000);
    expect(drafts[2].watts).toBe("");
    const query = buildCpSearch("", {
      efforts: drafts,
      weightKg: "70",
      units: "metric",
    });
    expect(parseCpQuery(query).efforts[1]).toMatchObject({
      preset: "540",
      watts: "300",
    });
  });
  it("accepts raw and wrapped responses and the 30-minute window", () => {
    expect(cpDraftsFromFileResponse([row])).not.toBeNull();
    const long = { ...row, derived: { ...row.derived, longDurationSec: 1800 } };
    expect(cpDraftsFromFileResponse([long])?.[1].minutes).toBe("30");
  });
  it("rejects missing, invalid, or nonphysical windows instead of reusing stale results", () => {
    for (const payload of [
      null,
      [],
      {},
      { code: 400, data: [row] },
      [{ ...row, derived: null }],
      ...[
        { p3m: 0 },
        { pLong: 500 },
        { pLong: 400 },
        { p3m: "400" },
        { longDurationSec: 180 },
        { longDurationSec: 1801 },
        { pLong: Infinity },
      ].map((override) => [
        { ...row, derived: { ...row.derived, ...override } },
      ]),
    ]) {
      expect(cpDraftsFromFileResponse(payload)).toBeNull();
    }
  });
});
