import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import zhMessages from "../../../../../packages/messages/client-core/zh.json";
import itMessages from "../../../../../packages/messages/client-core/it.json";
import { PlanCycleProgressChart } from "./plan-cycle-progress-chart";

// SVG layout is verified in the browser; these tests exercise the surrounding UI.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: () => null,
  ChartTooltip: () => null,
}));

type ChartProps = ComponentProps<typeof PlanCycleProgressChart>;
type Locale = "zh" | "it";

const messagesByLocale = { zh: zhMessages, it: itMessages };

function chartUi(overrides: Partial<ChartProps> = {}, locale: Locale = "zh") {
  const messages = messagesByLocale[locale];
  const status = messages.V2PlanPage.workout.status;
  const weekLabel = messages.V2PlanPage.weekLoad.currentWeek;
  const data = [
    { completed: 2, missed: 1 },
    { missed: 2, skipped: 1 },
    { pending: 4 },
  ].map((counts, index) => ({
    key: String(index + 1),
    selectionKey: String(index + 1),
    label: weekLabel.replace("{week}", String(index + 1)),
    ...counts,
  }));

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PlanCycleProgressChart
        data={data}
        labels={{
          completed: status.done,
          missed: status.overdue,
          skipped: status.skipped,
          moved: status.moved,
          pending: status.planned,
        }}
        ariaLabel={messages.V2PlanPage.weekStrip.title}
        currentKey="2"
        selectedKey="1"
        onPointSelect={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe("PlanCycleProgressChart", () => {
  beforeEach(() => {
    // The shared Vitest setup does not define ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps live announcements out of the visible spacing flow", () => {
    render(chartUi());
    const group = screen.getByRole("group", { name: "周期进度" });
    expect(group).toHaveClass("flex", "flex-col", "gap-2");
    expect(group).not.toHaveClass("space-y-2");
    expect(group.querySelector('[aria-live="polite"]')).toHaveClass("sr-only");
  });

  it("keeps the current week distinct from the selected week", () => {
    const { rerender } = render(chartUi());

    const selectedWeek = screen.getByRole("button", {
      name: "查看第 1 周",
      pressed: true,
    });
    const currentWeek = screen.getByRole("button", {
      name: "查看第 2 周",
      pressed: false,
    });
    expect(selectedWeek).not.toHaveAttribute("aria-current");
    expect(currentWeek).toHaveAttribute("aria-current", "step");

    rerender(chartUi({ selectedKey: "3" }));

    expect(
      screen.getByRole("button", { name: "查看第 3 周", pressed: true }),
    ).not.toHaveAttribute("aria-current");
    expect(currentWeek).toHaveAttribute("aria-current", "step");
    expect(currentWeek).toHaveAttribute("aria-pressed", "false");
  });

  it("selects past, future and current weeks using their stable keys", () => {
    const onPointSelect = vi.fn();
    render(chartUi({ onPointSelect }));

    fireEvent.click(
      screen.getByRole("button", { name: "查看第 3 周", pressed: false }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "查看第 1 周", pressed: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "查看第 2 周", pressed: false }),
    );

    expect(onPointSelect.mock.calls).toEqual([["3"], ["1"], ["2"]]);
  });

  it("shows aggregate counts only for statuses present in the plan", () => {
    render(chartUi());

    expect(screen.getByText("已完成 2 / 共 10 节")).toBeInTheDocument();
    expect(screen.getByText("当前第 2 / 3 周")).toBeInTheDocument();

    for (const [label, total] of [
      ["已完成", 2],
      ["未完成", 3],
      ["已跳过", 1],
      ["待执行", 4],
    ] as const) {
      expect(screen.getByText(label, { exact: true })).toHaveTextContent(
        `${label}${total}`,
      );
    }
    expect(
      screen.queryByText("已推迟", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("课次")).toBeInTheDocument();
  });

  it.each([
    ["zh", "第 1 周", "查看第 1 周"],
    ["it", "Settimana 1", "Visualizza la settimana 1"],
  ] as const)("uses localized week labels in %s", (locale, label, action) => {
    render(chartUi({}, locale));

    expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: action, pressed: true }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^W\d+$/)).not.toBeInTheDocument();
  });

  it("renders an empty plan without current or selectable weeks", () => {
    render(chartUi({ data: [] }));

    expect(screen.getByRole("group", { name: "周期进度" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.queryByText("未完成", { exact: true }),
    ).not.toBeInTheDocument();
  });
});
