import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileSidePage } from "./MobileSidePage";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MobileSidePage", () => {
  it("keeps close out of the side page chrome", () => {
    render(
      <MobileSidePage open onOpenChange={vi.fn()} title="All plans">
        <p>Side page content</p>
      </MobileSidePage>,
    );

    expect(screen.getByRole("button", { name: "close" })).toHaveClass(
      "sr-only",
    );
    expect(
      screen
        .getByRole("dialog")
        .querySelector("[data-mobile-top-bar-action]"),
    ).toBeNull();
  });

  it("always exposes an accessible description", () => {
    render(
      <MobileSidePage open onOpenChange={vi.fn()} title="All plans">
        <p>Side page content</p>
      </MobileSidePage>,
    );

    const dialog = screen.getByRole("dialog");
    const descriptionId = dialog.getAttribute("aria-describedby");

    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "All plans",
    );
  });

  it("does not turn a swipe-to-close gesture into a child click", () => {
    const onOpenChange = vi.fn();
    const onItemClick = vi.fn();
    render(
      <MobileSidePage
        open
        onOpenChange={onOpenChange}
        title="All plans"
      >
        <button type="button" onClick={onItemClick}>
          Plan one
        </button>
      </MobileSidePage>,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(dialog, {
      touches: [{ clientX: 240, clientY: 120 }],
      changedTouches: [{ clientX: 240, clientY: 120 }],
    });
    fireEvent.touchEnd(dialog, {
      touches: [{ clientX: 140, clientY: 124 }],
      changedTouches: [{ clientX: 140, clientY: 124 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Plan one" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onItemClick).not.toHaveBeenCalled();
  });
});
