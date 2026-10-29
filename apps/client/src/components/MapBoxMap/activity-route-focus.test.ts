import { describe, expect, it } from "vitest";
import {
  coordinateAtRouteDistance,
  sliceRouteByDistance,
  type RouteCoordinate,
} from "./activity-route-focus";

const linearDistance = (from: RouteCoordinate, to: RouteCoordinate) =>
  Math.abs(to[0] - from[0]);

describe("activity route focus", () => {
  it("interpolates a point at the requested route distance", () => {
    expect(
      coordinateAtRouteDistance(
        [
          [
            [0, 0],
            [100, 0],
            [200, 0],
          ],
        ],
        150,
        linearDistance,
      ),
    ).toEqual([150, 0]);
  });

  it("returns only the selected part of a route", () => {
    expect(
      sliceRouteByDistance(
        [
          [
            [0, 0],
            [100, 0],
            [200, 0],
          ],
        ],
        50,
        150,
        linearDistance,
      ),
    ).toEqual([
      [
        [50, 0],
        [100, 0],
        [150, 0],
      ],
    ]);
  });

  it("does not draw a connector between separate tracks", () => {
    expect(
      sliceRouteByDistance(
        [
          [
            [0, 0],
            [100, 0],
          ],
          [
            [1000, 0],
            [1100, 0],
          ],
        ],
        50,
        150,
        linearDistance,
      ),
    ).toEqual([
      [
        [50, 0],
        [100, 0],
      ],
      [
        [1000, 0],
        [1050, 0],
      ],
    ]);
  });
});
