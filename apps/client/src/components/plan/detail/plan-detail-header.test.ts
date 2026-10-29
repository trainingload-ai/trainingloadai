import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { TranslateFn } from "./plan-detail-utils";
import { getPlanGoalLabel } from "./plan-detail-header";

vi.mock("@/i18n/navigation", () => ({
  Link: "a",
}));

vi.mock("@/components/plan/plan-description-rich", () => ({
  PlanDescriptionRich: () => null,
}));

const translations: Record<string, string> = {
  "goal.HALF_MARATHON": "半马",
  "goal.MARATHON": "全马",
};

const t = ((key: string) => translations[key] ?? key) as TranslateFn;

describe("getPlanGoalLabel", () => {
  it("localizes official plan goal enums", () => {
    expect(getPlanGoalLabel(t, "MARATHON")).toBe("全马");
    expect(getPlanGoalLabel(t, " half_marathon ")).toBe("半马");
  });

  it("preserves custom plan goals", () => {
    expect(getPlanGoalLabel(t, "秋季提升耐力")).toBe("秋季提升耐力");
  });
});
