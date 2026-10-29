import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAiPlanCreateSheet } from "./mobile-ai-plan-create-sheet";

vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values?.value != null ? `${key} ${values.value}` : key,
}));

const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
});

afterAll(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
});

describe("MobileAiPlanCreateSheet", () => {
  it("keeps the AI brief flow inside the sheet and emits seed params", async () => {
    const onGenerate = vi.fn();

    render(
      <MobileAiPlanCreateSheet
        open
        onOpenChange={vi.fn()}
        onBackToMode={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    expect(
      await screen.findByTestId("mobile-ai-plan-create-sheet"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "header.title" })).toBeVisible();

    const intentValue = screen.getByText("intent.racePrep.title");
    fireEvent.click(intentValue.closest("button") as HTMLButtonElement);
    expect(
      screen.getByRole("heading", { name: "trainingIntent.title" }),
    ).toBeVisible();

    fireEvent.click(screen.getByText("intent.fitnessBuild.title"));
    expect(screen.getByRole("heading", { name: "header.title" })).toBeVisible();

    fireEvent.click(screen.getByTestId("mobile-ai-plan-generate"));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const params = onGenerate.mock.calls[0][0] as URLSearchParams;
    expect(params.get("planIntent")).toBe("fitnessBuild");
    expect(params.get("sports")).toBe("run");
    expect(params.get("weeks")).toBe("12");
    expect(params.get("days")).toBe("5");
    expect(params.get("mins")).toBe("70");
    expect(params.has("raceD")).toBe(false);
    expect(params.has("raceDist")).toBe(false);
  });
});
