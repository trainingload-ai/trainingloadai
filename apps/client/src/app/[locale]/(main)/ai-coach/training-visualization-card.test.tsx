import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TrainingVisualizationV1 } from "@shared/training-visualization";
import zhMessages from "../../../../../../../packages/messages/client-core/zh.json";
import { TrainingVisualizationCard } from "./training-visualization-card";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const react = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      react.isValidElement(children)
        ? react.cloneElement(
            children as ReactElement<{ height?: number; width?: number }>,
            { height: 220, width: 640 },
          )
        : null,
  };
});

const fixture = (): TrainingVisualizationV1 => ({
  kind: "training_visualization",
  schemaVersion: 1,
  title: "近 30 天训练",
  intent: "LOOKUP",
  view: "METRIC_STRIP",
  x: { key: "label", type: "TIME" },
  series: [
    { key: "ACTIVITY_COUNT", unit: "count" },
    { key: "DURATION_MIN", unit: "min" },
  ],
  rows: [
    {
      key: "2026-09",
      label: "2026-09",
      values: { ACTIVITY_COUNT: 12, DURATION_MIN: 486.5 },
    },
  ],
  summary: { ACTIVITY_COUNT: 12, DURATION_MIN: 486.5 },
  provenance: {
    source: "ACTIVITIES",
    from: "2026-09-01",
    to: "2026-09-30",
    timezone: "Asia/Shanghai",
    groupBy: "MONTH",
    sportTypes: [],
    complete: true,
    truncated: false,
    coverage: { ACTIVITY_COUNT: 1, DURATION_MIN: 1 },
    fingerprint: "fixture",
  },
});

describe("TrainingVisualizationCard", () => {
  it("renders metric and body history with localized units and source, preserving the requested measure", () => {
    const value: TrainingVisualizationV1 = {
      ...fixture(),
      title: "体能与身体记录",
      intent: "TREND",
      view: "TABLE",
      series: [
        { key: "VO2_MAX", unit: "ml/kg/min" },
        { key: "HEIGHT", unit: "cm" },
        { key: "WEIGHT", unit: "kg" },
      ],
      rows: [
        {
          key: "2026-09-26",
          label: "2026-09-26",
          values: { VO2_MAX: 45.8, HEIGHT: 178, WEIGHT: 73.1 },
        },
      ],
      provenance: {
        ...fixture().provenance,
        source: "METRICS",
        metricSource: "ESTIMATED",
      },
    };
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={value} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("45.8 ml/kg/min")).toBeVisible();
    expect(screen.getByText("178 cm")).toBeVisible();
    expect(screen.getByText("73.1 kg")).toBeVisible();
    expect(screen.getByText(/历史估算/)).toBeVisible();
    expect(screen.queryByText("CTL")).not.toBeInTheDocument();
  });

  it("renders a server-owned metric strip with localized labels", () => {
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={fixture()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("近 30 天训练")).toBeVisible();
    expect(screen.getByText("运动次数")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("486.5 min")).toBeVisible();
  });

  it("rejects an unversioned arbitrary chart payload", () => {
    const { container } = render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard
          payload={{ kind: "training_visualization", rows: [{ value: 999 }] }}
        />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mounts axes and grid as direct Recharts children for trend charts", () => {
    const value: TrainingVisualizationV1 = {
      ...fixture(),
      intent: "TREND",
      view: "LINE",
      x: { key: "label", type: "TIME", label: "周" },
      series: [
        { key: "ATL", label: "ATL", unit: "load" },
        { key: "CTL", label: "CTL", unit: "load" },
      ],
      rows: [
        { key: "w1", label: "9/7", values: { ATL: 40, CTL: 43 } },
        { key: "w2", label: "9/14", values: { ATL: 48, CTL: 44 } },
      ],
      summary: { ATL: 48, CTL: 44 },
    };
    const { container } = render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={value} />
      </NextIntlClientProvider>,
    );

    expect(container.querySelector(".recharts-xAxis")).toBeInTheDocument();
    expect(container.querySelector(".recharts-yAxis")).toBeInTheDocument();
    expect(
      container.querySelector(".recharts-cartesian-grid"),
    ).toBeInTheDocument();
  });

  it("paginates large data tables instead of mounting every row", () => {
    const value: TrainingVisualizationV1 = {
      ...fixture(),
      view: "TABLE",
      x: { key: "label", type: "TIME", label: "日期" },
      series: [{ key: "ACTIVITY_COUNT", unit: "count" }],
      rows: Array.from({ length: 25 }, (_, index) => ({
        key: `row-${index + 1}`,
        label: `第 ${index + 1} 条`,
        values: { ACTIVITY_COUNT: index + 1 },
      })),
      summary: { ACTIVITY_COUNT: 25 },
    };
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={value} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("第 20 条")).toBeVisible();
    expect(screen.queryByText("第 21 条")).not.toBeInTheDocument();
    expect(screen.getByText("1–20 / 共 25 条")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.queryByText("第 1 条")).not.toBeInTheDocument();
    expect(screen.getByText("第 21 条")).toBeVisible();
    expect(screen.getByText("21–25 / 共 25 条")).toBeVisible();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("labels truncated results as partial data", () => {
    const value: TrainingVisualizationV1 = {
      ...fixture(),
      provenance: {
        ...fixture().provenance,
        complete: false,
        truncated: true,
      },
    };
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={value} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(
        "当前结果达到数据读取上限，仅展示已读取部分。请缩小时间范围后重新查看完整结果。",
      ),
    ).toBeVisible();
  });

  it("samples dense chart geometry while retaining every returned table row", () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({
      key: `day-${index + 1}`,
      label: `D${index + 1}`,
      values: { DAILY_LOAD: index + 1 },
    }));
    const value: TrainingVisualizationV1 = {
      ...fixture(),
      intent: "TREND",
      view: "LINE",
      series: [{ key: "DAILY_LOAD", unit: "load" }],
      rows,
      summary: { DAILY_LOAD: 200 },
    };
    render(
      <NextIntlClientProvider
        locale="zh"
        messages={zhMessages}
        timeZone="Asia/Shanghai"
      >
        <TrainingVisualizationCard payload={value} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(
        "图表抽样显示 160/200 个数据点；数据表保留此次返回的全部行。",
      ),
    ).toBeVisible();
    expect(screen.getByText("1–20 / 共 200 条")).toBeInTheDocument();
  });
});
