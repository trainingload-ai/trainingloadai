import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { CoachCardDetailsContext } from "./cards/CoachCard";
import { ProfileZoneRangesCard } from "./profile-zone-ranges-card";

afterEach(cleanup);

const payload = {
  kind: "profile_zone_ranges",
  sportType: "RUN",
  pace: { benchmark: "VO2MAX", zones: [{ order: 1, min: 0.35, max: 0.4 }] },
  heartRate: { benchmark: "LTHR", zones: [{ order: 1, min: 120, max: 140 }] },
};

describe("zone result headings", () => {
  it.each([
    { kind: "profile_zone_ranges", sportType: "RUN" },
    {
      kind: "profile_zone_ranges",
      sportType: "RUN",
      pace: { configured: false, zones: [] },
      heartRate: { configured: false, zones: [] },
      power: { configured: false, zones: [] },
    },
  ])(
    "renders an empty standalone result once without a disclosure",
    (empty) => {
      const { container } = render(
        <NextIntlClientProvider locale="zh" messages={messages}>
          <ProfileZoneRangesCard payload={empty} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText("跑步训练区间")).toBeVisible();
      expect(screen.getAllByText("当前运动暂无可用区间明细。")).toHaveLength(1);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
        container.querySelector('[data-coach-card="result"]'),
      ).toBeVisible();
      expect(
        container.querySelector('[data-coach-card="collapsible"]'),
      ).toBeNull();
    },
  );

  it("keeps one empty result inside the Timeline without an inner heading or toggle", () => {
    const { container } = render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachCardDetailsContext.Provider value={true}>
          <ProfileZoneRangesCard
            payload={{ kind: "profile_zone_ranges", sportType: "RUN" }}
          />
        </CoachCardDetailsContext.Provider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("region", { name: "跑步训练区间" })).toBeVisible();
    expect(screen.getAllByText("当前运动暂无可用区间明细。")).toHaveLength(1);
    expect(container.querySelector("header")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("restores the usual disclosure and metric tabs when an empty snapshot gains data", () => {
    const view = (value: unknown) => (
      <NextIntlClientProvider locale="zh" messages={messages}>
        <ProfileZoneRangesCard payload={value} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(
      view({ kind: "profile_zone_ranges", sportType: "RUN" }),
    );
    rerender(view(payload));
    expect(
      screen.queryByText("当前运动暂无可用区间明细。"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("基准：VO2MAX")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
  });

  it("omits redundant headings inside the Timeline while keeping accessible context and metric switching", () => {
    const { container } = render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachCardDetailsContext.Provider value={true}>
          <ProfileZoneRangesCard payload={payload} />
        </CoachCardDetailsContext.Provider>
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("header")).toBeNull();
    expect(screen.queryByText("跑步训练区间")).toBeNull();
    expect(screen.getByRole("region", { name: "跑步训练区间" })).toBeVisible();
    expect(screen.getByText("基准：VO2MAX")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "心率" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("基准：LTHR")).toBeVisible();
    expect(screen.getByRole("table")).toHaveTextContent("120");
  });

  it("keeps a single metric identifiable with an active tab and a separate benchmark", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <CoachCardDetailsContext.Provider value={true}>
          <ProfileZoneRangesCard payload={{ ...payload, pace: undefined }} />
        </CoachCardDetailsContext.Provider>
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    const tab = screen.getByRole("tab", { name: "心率" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "心率" })).toContainElement(
      screen.getByRole("table"),
    );
    const benchmark = screen.getByText("基准：LTHR");
    expect(benchmark.parentElement).toContainElement(
      screen.getByRole("tablist"),
    );
    expect(screen.getByRole("tabpanel")).not.toContainElement(benchmark);
  });

  it("keeps the standalone historical card title and disclosure", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <ProfileZoneRangesCard payload={payload} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("跑步训练区间")).toBeVisible();
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("table")).toBeVisible();
  });
});
