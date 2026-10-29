import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ManualPlanMetaForm } from "./manual-plan-meta-form";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useMobileViewport: () => true,
}));

describe("ManualPlanMetaForm mobile inputs", () => {
  it("uses a plain textarea and submits its text without mounting TipTap", async () => {
    const onSubmit = vi.fn();
    render(
      <ManualPlanMetaForm
        defaultValues={{
          name: "Base plan",
          weeks: 4,
          description: "<p>Hello <strong>mobile</strong></p>",
        }}
        submitLabel="Continue"
        onSubmit={onSubmit}
      />,
    );

    const description = screen.getByLabelText(
      "PlanCreatePage.baseInfo.fields.description",
    );
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveValue("Hello mobile");
    expect(document.querySelector(".ProseMirror")).toBeNull();

    fireEvent.change(
      screen.getByLabelText("PlanCreatePage.baseInfo.fields.name"),
      { target: { value: "Fast mobile plan" } },
    );
    fireEvent.change(description, {
      target: { value: "A lightweight description" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          name: "Fast mobile plan",
          weeks: 4,
          description: "A lightweight description",
        },
        expect.anything(),
      ),
    );
  });
});
