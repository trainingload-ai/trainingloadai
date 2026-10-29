import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Overview from "./Overview";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/hooks/useActivityId", () => ({
  useActivityId: () => "run-one",
}));

vi.mock("@/hooks/useActivities", () => ({
  useGetActivity: () => ({
    data: {
      sportType: "RUN",
      distance: 8560,
      movingTime: 3355,
      averageSpeed: 2.55,
      avgHeartRate: 150,
      maxHeartRate: 172,
      avgPower: 244,
    },
  }),
}));

vi.mock("@/lib/store", () => ({
  useStore: () => ({ systemUnit: "metric" }),
}));

vi.mock("@/hooks/useFormatterBySettings", () => ({
  formatValue: (value: number, metric: string) => `${metric}:${value}`,
  getUnit: (metric: string) => `unit:${metric}`,
}));

describe("activity detail Overview", () => {
  it("renders the six fixed mobile summary metrics without chart controls", () => {
    render(<Overview />);

    expect(screen.getAllByTestId("activity-summary-metric")).toHaveLength(6);
    expect(screen.getByText("activities.distance")).toBeVisible();
    expect(screen.getByText("activities.duration")).toBeVisible();
    expect(screen.getByText("Overview.stats.avgPace")).toBeVisible();
    expect(screen.getByText("Overview.stats.avgHeartRate")).toBeVisible();
    expect(
      screen.getByText("HeartRatePage.tooltip.maxHeartRate"),
    ).toBeVisible();
    expect(screen.getByText("Overview.stats.avgPower")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
