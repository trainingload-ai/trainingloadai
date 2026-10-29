import { describe, expect, it } from "vitest";

import { normalizePowerZoneResponse } from "./use-power";

describe("normalizePowerZoneResponse", () => {
  it("returns an empty zones collection when the API has no power data", () => {
    expect(normalizePowerZoneResponse(undefined)).toEqual({ zones: [] });
  });

  it("preserves a valid power-zone response", () => {
    const response = {
      benchmark: "250 W",
      zones: [{ name: "z1", min: 0, max: 150 }],
    };

    expect(normalizePowerZoneResponse(response)).toBe(response);
  });
});
