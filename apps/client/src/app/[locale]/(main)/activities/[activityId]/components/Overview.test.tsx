import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Overview from "./Overview";

const activityState = vi.hoisted(() => ({
  value: {
    sportType: "RUN",
    distance: 8560,
    movingTime: 3355,
    averageSpeed: 2.55,
    avgHeartRate: 150,
    maxHeartRate: 172,
    avgPower: 244,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/hooks/useActivityId", () => ({
  useActivityId: () => "run-one",
}));

vi.mock("@/hooks/useActivities", () => ({
  useGetActivity: () => ({
    data: activityState.value,
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
  beforeEach(() => {
    activityState.value = {
      sportType: "RUN",
      distance: 8560,
      movingTime: 3355,
      averageSpeed: 2.55,
      avgHeartRate: 150,
      maxHeartRate: 172,
      avgPower: 244,
    };
  });

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

  it("shows only applicable recorded metrics for an OTHER activity", () => {
    activityState.value = {
      sportType: "UNKNOWN",
      sportDefinitionCode: "OTHER",
      distance: 0,
      movingTime: 1800,
      averageSpeed: 0,
      avgHeartRate: 112,
      maxHeartRate: 148,
      minHeartRate: 82,
      avgPower: 0,
      calories: 210,
      load: 18,
    } as typeof activityState.value;

    render(<Overview />);

    expect(screen.getAllByTestId("activity-summary-metric")).toHaveLength(6);
    expect(screen.getByText("activities.duration")).toBeVisible();
    expect(screen.getByText("Overview.stats.avgHeartRate")).toBeVisible();
    expect(
      screen.getByText("HeartRatePage.tooltip.minHeartRate"),
    ).toBeVisible();
    expect(screen.getByText("dashboard.calories")).toBeVisible();
    expect(screen.getByText("V2ActivitiesPage.common.load")).toBeVisible();
    expect(screen.queryByText("activities.distance")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Overview.stats.avgPace"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Overview.stats.avgPower"),
    ).not.toBeInTheDocument();
  });
});
