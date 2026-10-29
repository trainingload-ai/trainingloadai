import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../../packages/messages/client-core/zh.json";
import { PaceZoneModel } from "@/api/settings";
import { UserPaceZoneTable } from "./UserPaceZoneTable";
import { formatZonePaceRange } from "./user-pace-zone-table-model";

const mock = vi.hoisted(() => ({ useZoneModelPreviews: vi.fn() }));
vi.mock("@/api/use-zone-model-previews", () => mock);
afterEach(cleanup);

function view(
  sport: "RUN" | "SWIM" = "RUN",
  model: PaceZoneModel = PaceZoneModel.DANIELS,
) {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      <UserPaceZoneTable sport={sport} model={model} />
    </NextIntlClientProvider>
  );
}

const models = {
  DANIELS: {
    benchmark: "VO2MAX",
    zones: [{ name: "Z3 Threshold (T)", order: 3, min: 0.3473, max: 0.3631 }],
  },
  FRIEL: {
    benchmark: "TP",
    zones: [{ name: "Z1 Super Oxygen Run", order: 1, min: 0.5, max: 0.6 }],
  },
};

describe("selected pace zone model preview", () => {
  it("immediately changes basis and ranges when the selection changes without saving", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: { models, hasSavedSetting: false },
    });
    const result = render(view());
    expect(screen.getByText("计算基准：最大摄氧量")).toBeInTheDocument();
    expect(screen.getByText("Z3 阈值跑")).toBeInTheDocument();
    expect(screen.getByText("5:47–6:03")).toBeInTheDocument();
    result.rerender(view("RUN", PaceZoneModel.FRIEL));
    expect(screen.getByText("计算基准：阈值配速")).toBeInTheDocument();
    expect(screen.getByText("8:20–10:00")).toBeInTheDocument();
    expect(screen.queryByText("5:47–6:03")).not.toBeInTheDocument();
    result.rerender(view());
    expect(screen.getByText("5:47–6:03")).toBeInTheDocument();
    expect(mock.useZoneModelPreviews).toHaveBeenCalledWith("RUN", "PACE");
  });

  it("uses the swimming profile and seconds per 100 meters", () => {
    mock.useZoneModelPreviews.mockReturnValue({ data: { models } });
    render(view("SWIM", PaceZoneModel.FRIEL));
    expect(mock.useZoneModelPreviews).toHaveBeenCalledWith("SWIM", "PACE");
    expect(screen.getByText("配速范围 (min/100m)")).toBeInTheDocument();
    expect(screen.getByText("0:50–1:00")).toBeInTheDocument();
  });

  it("does not show another model when the selected model lacks its metric", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: { models: { ...models, FRIEL: { benchmark: "TP", zones: [] } } },
    });
    render(view("RUN", PaceZoneModel.FRIEL));
    expect(screen.getByText(/暂无可用区间/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("identifies separately saved settings that take precedence over the preview", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: { models, hasSavedSetting: true },
    });
    render(view());
    expect(screen.getByRole("status")).toHaveTextContent("单独保存的区间配置");
  });

  it("distinguishes failed requests from missing metrics", () => {
    mock.useZoneModelPreviews.mockReturnValue({ isError: true });
    render(view());
    expect(screen.getByRole("alert")).toHaveTextContent("区间加载失败");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("handles open bounds, invalid values and minute rounding", () => {
    expect(formatZonePaceRange({ min: 0.3596 }, "RUN")).toBe("≥ 6:00");
    expect(formatZonePaceRange({ max: 1.2 }, "SWIM")).toBe("≤ 2:00");
    expect(formatZonePaceRange({ min: NaN, max: -1 }, "RUN")).toBe("—");
  });
});
