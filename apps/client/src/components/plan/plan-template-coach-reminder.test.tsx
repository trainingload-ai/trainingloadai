import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PlanTemplateCoachReminder,
  planTemplateBlocksBuild,
} from "./plan-template-coach-reminder";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
}));

describe("PlanTemplateCoachReminder", () => {
  it("shows a non-blocking warning for low but supported long-distance VO2 max", () => {
    const option = {
      slug: "finish-half-marathon",
      status: "ELIGIBLE_WITH_WARNING" as const,
      reasonCodes: ["VO2_MAX_LOW_FOR_LONG_DISTANCE"],
      missingInputs: [],
      reasonDetails: [
        {
          code: "VO2_MAX_LOW_FOR_LONG_DISTANCE",
          actual: 24,
          required: 25,
          unit: "ml_kg_min" as const,
        },
      ],
    };

    render(<PlanTemplateCoachReminder option={option} />);

    expect(screen.getByText("baseWarning")).toBeInTheDocument();
    expect(screen.getByText("vo2MaxLowForDistance:24:25")).toBeInTheDocument();
    expect(screen.getByLabelText("label")).toBeInTheDocument();
    expect(screen.queryByText("buildBlocked")).not.toBeInTheDocument();
    expect(planTemplateBlocksBuild(option)).toBe(false);
  });

  it("blocks generation when current capability input is required", () => {
    const option = {
      slug: "target-marathon",
      status: "INPUT_REQUIRED" as const,
      reasonCodes: ["VO2_MAX_BELOW_SUPPORTED_RANGE"],
      missingInputs: ["currentCapability"],
      reasonDetails: [
        {
          code: "VO2_MAX_BELOW_SUPPORTED_RANGE",
          actual: 18,
          required: 20,
          unit: "ml_kg_min" as const,
        },
      ],
    };

    render(<PlanTemplateCoachReminder option={option} />);

    expect(screen.getByText("inputRequired")).toBeInTheDocument();
    expect(screen.getByText("capabilityRequired")).toBeInTheDocument();
    expect(screen.getByText("buildBlocked")).toBeInTheDocument();
    expect(planTemplateBlocksBuild(option)).toBe(true);
  });

  it("collapses repeated unknown requirements into one fallback message", () => {
    const option = {
      slug: "finish-marathon",
      status: "NOT_ELIGIBLE" as const,
      reasonCodes: Array.from(
        { length: 7 },
        (_, index) => `UNKNOWN_REQUIREMENT_${index}`,
      ),
      missingInputs: [],
      reasonDetails: [],
    };

    render(<PlanTemplateCoachReminder option={option} variant="compact" />);

    expect(screen.getAllByText("genericRequirement")).toHaveLength(1);
    expect(screen.queryByText("buildBlocked")).not.toBeInTheDocument();
  });
});
