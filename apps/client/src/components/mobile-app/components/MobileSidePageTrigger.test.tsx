import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOBILE_SIDE_PAGE_EVENT } from "./MobilePushSidePage";
import { MobileSidePageTrigger } from "./MobileSidePageTrigger";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MobileSidePageTrigger", () => {
  it("hides the leading icon while the shared side page is open", () => {
    render(
      <MobileSidePageTrigger onToggle={vi.fn()} openLabel="Open menu">
        <span>icon</span>
      </MobileSidePageTrigger>,
    );

    const closed = screen.getByRole("button", { name: "Open menu" });
    expect(closed).not.toHaveClass("opacity-0");

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MOBILE_SIDE_PAGE_EVENT, { detail: { open: true } }),
      );
    });

    expect(screen.getByRole("button", { name: "close" })).toHaveClass(
      "opacity-0",
    );
  });
});
