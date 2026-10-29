import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityMap from "./ActivityMap";

const layerState = vi.hoisted(() => ({
  value: {
    data: undefined as undefined | { maps: Array<{ polyline: string }> },
    isLoading: false,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useActivityId", () => ({
  useActivityId: () => "run-one",
}));

vi.mock("@/api/useActivityLayer", () => ({
  useActivityLayer: () => layerState.value,
}));

vi.mock("@/components/MapBoxMap/MapBoxMap", () => ({
  default: ({
    className,
    interactive,
    lockedFitBoundsPadding,
    showInteractionOverlay,
  }: {
    className: string;
    interactive: boolean;
    lockedFitBoundsPadding: unknown;
    showInteractionOverlay: boolean;
  }) => (
    <div
      data-testid="route-map"
      data-class-name={className}
      data-interactive={String(interactive)}
      data-padding={JSON.stringify(lockedFitBoundsPadding)}
      data-show-overlay={String(showInteractionOverlay)}
    />
  ),
}));

vi.mock("@/components/ui/ThemeLogo", () => ({
  default: () => <div data-testid="theme-logo" />,
}));

describe("ActivityMap", () => {
  beforeEach(() => {
    layerState.value = { data: undefined, isLoading: false };
  });

  it("does not reserve a map section when the activity has no route", () => {
    const { container } = render(<ActivityMap />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("renders a locked map and allows enabling interaction", () => {
    layerState.value = {
      data: { maps: [{ polyline: "route" }] },
      isLoading: false,
    };

    render(<ActivityMap />);

    expect(screen.getByTestId("route-map")).toHaveAttribute(
      "data-interactive",
      "false",
    );
    expect(screen.getByTestId("route-map")).toHaveAttribute(
      "data-show-overlay",
      "false",
    );
    expect(screen.getByTestId("route-map")).toHaveAttribute(
      "data-padding",
      JSON.stringify({ top: 32, bottom: 32, left: 64, right: 64 }),
    );
    expect(screen.getByTestId("route-map")).toHaveAttribute(
      "data-class-name",
      expect.stringContaining("h-[clamp(220px,22vw,310px)]"),
    );

    fireEvent.click(screen.getByRole("button", { name: "locked" }));

    expect(screen.getByTestId("route-map")).toHaveAttribute(
      "data-interactive",
      "true",
    );
    expect(screen.getByRole("button", { name: "unlocked" })).toBeVisible();
  });
});
