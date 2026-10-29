import { describe, expect, it } from "vitest";
import { buildWorkoutRouteModel } from "./workout-route-model";

describe("buildWorkoutRouteModel", () => {
  it("centers without distorting horizontal proportions and clips speed outliers", () => {
    const model = buildWorkoutRouteModel(
      [
        { xM: 0, zM: 0, altitudeM: 10, speedMps: 1 },
        { xM: 100, zM: 50, altitudeM: 20, speedMps: 3 },
        { xM: 200, zM: 100, altitudeM: 30, speedMps: 100 },
      ],
      4,
    );

    expect(model.positions[0]).toEqual([-100, 0, 50]);
    expect(model.positions[2][0] / model.positions[2][2]).toBe(-2);
    expect(model.speedRange.minimum).toBe(1);
    expect(model.speedRange.maximum).toBeLessThan(100);
    expect(model.speedRange.variable).toBe(true);
    expect(model.altitudeAvailable).toBe(true);
    expect(model.colors[0]).not.toEqual(model.colors[2]);
  });

  it("uses a uniform route color when speed is missing or effectively constant", () => {
    const missing = buildWorkoutRouteModel(
      [
        { xM: 0, zM: 0 },
        { xM: 10, zM: 10 },
      ],
      1,
    );
    const constant = buildWorkoutRouteModel(
      [
        { xM: 0, zM: 0, speedMps: 3 },
        { xM: 10, zM: 10, speedMps: 3.02 },
      ],
      1,
    );

    expect(missing.speedRange).toMatchObject({
      available: false,
      variable: false,
    });
    expect(missing.altitudeAvailable).toBe(false);
    expect(constant.speedRange).toMatchObject({
      available: true,
      variable: false,
    });
    expect(new Set(constant.colors.map((color) => color.join(","))).size).toBe(
      1,
    );
  });
});
