import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreatePlanModeDialog } from "./create-plan-mode-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

describe("CreatePlanModeDialog", () => {
  it("uses the standard dialog surface and background-separated options on mobile", () => {
    render(
      <CreatePlanModeDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("bg-background");
    expect(dialog).not.toHaveClass("bg-muted", "rounded-t-overlay");

    expect(screen.getByText("options.ai.title").closest("button")).toHaveClass(
      "rounded-md",
      "bg-muted/55",
    );
    expect(
      screen.getByText("options.ai.title").closest("button"),
    ).not.toHaveClass("border", "shadow-xs");
    expect(screen.queryByText("options.ai.badge")).not.toBeInTheDocument();
    expect(
      screen.getByText("options.manual.title").closest("button"),
    ).toHaveClass("rounded-md", "bg-muted/55");
  });
});
