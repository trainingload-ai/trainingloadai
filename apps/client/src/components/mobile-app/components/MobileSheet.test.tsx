import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileSheet } from "./MobileSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

describe("MobileSheet", () => {
  it("renders an explicit top-right close action", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <MobileSheet open onOpenChange={onOpenChange} title="Day details">
        <p>Sheet content</p>
      </MobileSheet>,
    );

    expect(
      await screen.findByRole("heading", { name: "Day details" }),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveClass(
      "bg-background",
      "text-foreground",
      "overscroll-contain",
    );
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports the grouped canvas used by My sidebar pages", async () => {
    render(
      <MobileSheet
        open
        onOpenChange={vi.fn()}
        title="Profile"
        backgroundVariant="grouped"
      >
        <p>Grouped content</p>
      </MobileSheet>,
    );

    expect(await screen.findByRole("dialog")).toHaveClass(
      "bg-neutral-100",
      "dark:bg-[#202221]",
    );
  });
});
