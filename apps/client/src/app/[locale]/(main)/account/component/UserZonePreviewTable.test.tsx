import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../../packages/messages/client-core/zh.json";
import { HeartRateZoneModel, PowerZoneModel } from "@/api/settings";
import { UserZonePreviewTable } from "./UserZonePreviewTable";
import { formatNumericZoneRange } from "./user-pace-zone-table-model";

const mock = vi.hoisted(() => ({ useZoneModelPreviews: vi.fn() }));
vi.mock("@/api/use-zone-model-previews", () => mock);
afterEach(cleanup);
function view(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="zh" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("heart rate and power live previews", () => {
  it("previews maximum heart rate and reports it when another model falls back", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: {
        models: {
          MHR: {
            benchmark: "MHR",
            zones: [{ name: "Z1", min: 100, max: 120 }],
          },
          KARVONEN: {
            benchmark: "MHR",
            zones: [{ name: "Z1", min: 100, max: 120 }],
          },
        },
      },
    });
    const result = render(
      view(
        <UserZonePreviewTable
          sport="RUN"
          zoneType="HEART_RATE"
          model={HeartRateZoneModel.MHR}
        />,
      ),
    );
    expect(screen.getByText("计算基准：最大心率")).toBeInTheDocument();
    expect(screen.getByText("100–120")).toBeInTheDocument();
    result.rerender(
      view(
        <UserZonePreviewTable
          sport="RUN"
          zoneType="HEART_RATE"
          model={HeartRateZoneModel.KARVONEN}
        />,
      ),
    );
    expect(screen.getByText("计算基准：最大心率")).toBeInTheDocument();
    expect(screen.queryByText("计算基准：储备心率")).not.toBeInTheDocument();
  });

  it("switches heart rate model, range and basis immediately, preserving Z5a labels", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: {
        models: {
          KARVONEN: {
            benchmark: "HRR",
            zones: [{ name: "Z1", min: 130, max: 144 }],
          },
          FRIEL: {
            benchmark: "LTHR",
            benchmarkSource: "ESTIMATED_MAX_HR",
            zones: [{ name: "Z5a SuperThreshold", min: 180, max: 184 }],
          },
        },
      },
    });
    const result = render(
      view(
        <UserZonePreviewTable
          sport="RUN"
          zoneType="HEART_RATE"
          model={HeartRateZoneModel.KARVONEN}
        />,
      ),
    );
    expect(screen.getByText("心率范围 (bpm)")).toBeInTheDocument();
    expect(screen.getByText("计算基准：储备心率")).toBeInTheDocument();
    expect(screen.getByText("130–144")).toBeInTheDocument();
    result.rerender(
      view(
        <UserZonePreviewTable
          sport="RUN"
          zoneType="HEART_RATE"
          model={HeartRateZoneModel.FRIEL}
        />,
      ),
    );
    expect(screen.getByText("计算基准：阈值心率（估算）")).toBeInTheDocument();
    expect(screen.getByText("Z5a 阈值以上")).toBeInTheDocument();
    expect(screen.getByText("180–184")).toBeInTheDocument();
    expect(screen.queryByText("130–144")).not.toBeInTheDocument();
    expect(mock.useZoneModelPreviews).toHaveBeenCalledWith("RUN", "HEART_RATE");
  });

  it("shows watts and actual CP basis for power, and switches model without saving", () => {
    mock.useZoneModelPreviews.mockReturnValue({
      data: {
        models: {
          FRIEL: {
            benchmark: "CP",
            zones: [{ name: "Active Recovery", order: 1, min: 0, max: 168 }],
          },
          STRYD: {
            benchmark: "CP",
            zones: [{ name: "Repetition", order: 5, min: 348 }],
          },
        },
      },
    });
    const result = render(
      view(
        <UserZonePreviewTable
          sport="CYCLING"
          zoneType="POWER"
          model={PowerZoneModel.FRIEL}
        />,
      ),
    );
    expect(screen.getByText("功率范围 (W)")).toBeInTheDocument();
    expect(screen.getByText("计算基准：临界功率")).toBeInTheDocument();
    expect(screen.getByText("Z1 主动恢复")).toBeInTheDocument();
    expect(screen.getByText("0–168")).toBeInTheDocument();
    result.rerender(
      view(
        <UserZonePreviewTable
          sport="CYCLING"
          zoneType="POWER"
          model={PowerZoneModel.STRYD}
        />,
      ),
    );
    expect(screen.getByText("≥ 348")).toBeInTheDocument();
    expect(screen.getByText("Z5 重复")).toBeInTheDocument();
    expect(screen.queryByText("0–168")).not.toBeInTheDocument();
    expect(mock.useZoneModelPreviews).toHaveBeenCalledWith("CYCLING", "POWER");
  });

  it("formats zero, open bounds, rounded values and invalid values", () => {
    expect(formatNumericZoneRange({ min: 0, max: 140 })).toBe("0–140");
    expect(formatNumericZoneRange({ min: 302.6 })).toBe("≥ 303");
    expect(formatNumericZoneRange({ max: 160 })).toBe("≤ 160");
    expect(formatNumericZoneRange({ min: -1, max: NaN })).toBe("—");
  });
});
