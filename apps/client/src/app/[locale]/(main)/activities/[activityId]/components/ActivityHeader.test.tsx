import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityHeader } from "./ActivityHeader";
import type { Activity } from "@/api/activities";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: (namespace?: string) => (key: string) => {
    if (!namespace && key === "activityDetails.editSportType") {
      return "编辑运动类型";
    }
    if (namespace === "ActivityDetail" && key === "source") return "来源";
    if (namespace === "ActivityDetail" && key === "sourceUpload") {
      return "手动上传";
    }
    if (namespace === "ActivityDetail" && key === "untitledActivity") {
      return "未命名活动";
    }
    if (!namespace && key === "activities.startTime") return "开始时间";
    return namespace ? `${namespace}.${key}` : key;
  },
}));

vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ data: { timezone: "Asia/Shanghai" } }),
}));

vi.mock("@/lib/store", () => ({
  useStore: () => ({ timeFormat: "24h" }),
}));

vi.mock("@/api/sports", () => ({
  useSportCatalog: () => ({
    data: [
      {
        code: "ROAD_RUNNING",
        family: "RUN",
        displayName: "跑步",
        isDefaultForFamily: true,
      },
      {
        code: "ROAD_CYCLING",
        family: "CYCLING",
        displayName: "骑行",
        isDefaultForFamily: true,
      },
    ],
  }),
  getSportDisplayName: () => "跑步",
  getLocalizedSportDefinitionName: (sport: { displayName?: string }) =>
    sport.displayName ?? "跑步",
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("./ActivitySessionRpeControl", () => ({
  ActivitySessionRpeControl: () => <div>RPE</div>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const runActivity = {
  hashId: "activity-1",
  activityName: "晚间跑步",
  sportType: "RUN",
  subSportType: "ROAD_RUNNING",
  startTime: "2026-08-25T13:34:00.000Z",
  timezone: "Asia/Shanghai",
  thirdPartyProvider: "upload",
} as Activity;

describe("ActivityHeader sport type chip", () => {
  it("renders a quiet editable chip and compact activity metadata", () => {
    render(<ActivityHeader activity={runActivity} />);

    const chip = screen.getByRole("button", { name: "编辑运动类型: 跑步" });
    expect(chip).toBeVisible();
    expect(chip).toHaveTextContent("跑步");
    expect(chip.className).not.toContain("border-border");
    expect(chip.className).toContain("bg-muted");
    expect(chip.className).not.toMatch(/emerald|cyan|orange|violet|ring-2/);
    expect(chip.querySelector(".lucide-footprints")).not.toBeNull();
    expect(chip.querySelector(".lucide-pencil")).not.toBeNull();
    expect(screen.getByText("手动上传")).toBeVisible();
    expect(screen.getByText(/2026年8月25日/)).toBeVisible();
  });

  it("opens the sport type select when the chip is activated", () => {
    render(<ActivityHeader activity={runActivity} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑运动类型: 跑步" }));

    expect(
      screen.getByRole("combobox", { name: "编辑运动类型" }),
    ).toBeVisible();
  });
});
