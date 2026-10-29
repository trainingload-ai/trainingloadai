import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityZoneTable } from "./activity-zone-table";

describe("ActivityZoneTable", () => {
  it("renders zone range, distribution, duration and average as separate columns", () => {
    render(
      <ActivityZoneTable
        rows={[
          {
            id: "z1",
            label: "Z1",
            range: "0–152 bpm",
            percent: 35.1,
            duration: 1557,
            color: "#ef4444",
            average: "138 bpm",
          },
        ]}
        zoneLabel="区间"
        rangeLabel="范围"
        distributionLabel="分布"
        durationLabel="时间"
        averageLabel="平均心率"
        emptyLabel="暂无区间数据"
      />,
    );

    expect(screen.getByText("范围")).toBeVisible();
    expect(screen.getByText("分布")).toBeVisible();
    expect(screen.getByText("0–152 bpm")).toBeVisible();
    expect(screen.getByText("138 bpm")).toBeVisible();
    expect(screen.getByRole("img", { name: "Z1 35.1%" })).toHaveStyle({
      width: "35.1%",
    });
  });
});
