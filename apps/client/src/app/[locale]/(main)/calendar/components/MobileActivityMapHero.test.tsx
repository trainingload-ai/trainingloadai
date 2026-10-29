import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileActivityMapHero } from "./MobileActivityMapHero";

const layerState = vi.hoisted(() => ({
  value: {
    data: undefined as
      | undefined
      | { center: [number, number]; maps: Array<{ polyline: string }> },
    isLoading: false,
  },
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockMap({ containerId }: { containerId: string }) {
      return <div data-testid="pc-route-map" data-container-id={containerId} />;
    },
}));

vi.mock("@/api/useActivityLayer", () => ({
  useActivityLayer: () => layerState.value,
}));

vi.mock("@/components/activities/map-thumbnail", () => ({
  MapThumbnail: () => <div data-testid="map-thumbnail" />,
}));

const activity = {
  id: 1,
  hashId: "run-one",
  activityName: "Evening Run",
  sportType: "RUN",
};

describe("MobileActivityMapHero", () => {
  beforeEach(() => {
    layerState.value = { data: undefined, isLoading: false };
  });

  it("uses the compact mobile hero when no route visual exists", () => {
    render(
      <MobileActivityMapHero
        activity={activity}
        activityId="run-one"
        meta="RUN · Jul 18"
        title="Evening Run"
      />,
    );

    expect(screen.getByTestId("mobile-activity-map-hero")).toHaveClass(
      "h-[190px]",
    );
    expect(screen.queryByTestId("pc-route-map")).not.toBeInTheDocument();
  });

  it("renders the reusable PC route map in the tall mobile hero", () => {
    layerState.value = {
      data: {
        center: [-122.02, 37.32],
        maps: [{ polyline: "route" }],
      },
      isLoading: false,
    };

    render(
      <MobileActivityMapHero
        activity={activity}
        activityId="run-one"
        meta="RUN · Jul 18"
        title="Evening Run"
      />,
    );

    expect(screen.getByTestId("mobile-activity-map-hero")).toHaveClass(
      "h-[max(480px,calc(100dvh-194px))]",
    );
    expect(screen.getByTestId("pc-route-map")).toHaveAttribute(
      "data-container-id",
      expect.stringMatching(/^calendar-/),
    );
  });
});
