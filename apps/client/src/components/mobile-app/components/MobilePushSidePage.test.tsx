import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MOBILE_SIDE_PAGE_EVENT,
  MobilePushSidePage,
  MobileSidePageScrim,
  requestMobileSidePageClose,
} from "./MobilePushSidePage";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MobilePushSidePage", () => {
  it("announces open state so the app shell can move beside it", () => {
    const listener = vi.fn();
    window.addEventListener(MOBILE_SIDE_PAGE_EVENT, listener);

    const { rerender } = render(
      <MobilePushSidePage open={false} onOpenChange={vi.fn()}>
        <p>Menu</p>
      </MobilePushSidePage>,
    );
    rerender(
      <MobilePushSidePage open onOpenChange={vi.fn()}>
        <p>Menu</p>
      </MobilePushSidePage>,
    );

    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { open: true } }),
    );
    window.removeEventListener(MOBILE_SIDE_PAGE_EVENT, listener);
  });

  it("closes on a left swipe without activating the touched row", () => {
    const onOpenChange = vi.fn();
    const onRowClick = vi.fn();
    render(
      <MobilePushSidePage open onOpenChange={onOpenChange}>
        <button type="button" onClick={onRowClick}>
          Account
        </button>
      </MobilePushSidePage>,
    );

    const row = screen.getByRole("button", { name: "Account" });
    const sidePage = row.closest("aside");
    expect(sidePage).not.toBeNull();
    fireEvent.touchStart(sidePage as HTMLElement, {
      touches: [{ clientX: 250, clientY: 120 }],
    });
    fireEvent.touchEnd(sidePage as HTMLElement, {
      changedTouches: [{ clientX: 150, clientY: 122 }],
    });
    fireEvent.click(row);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("fades the frost on the sliding page instead of popping it in place", () => {
    const { rerender } = render(<MobileSidePageScrim open={false} />);
    const overlay = screen.getByLabelText("close");

    expect(overlay).toHaveClass(
      "opacity-0",
      "duration-300",
      "ease-out",
      "backdrop-blur-md",
    );

    rerender(<MobileSidePageScrim open />);
    expect(overlay).toHaveClass("opacity-100");
  });

  it("closes the side page when the sliding frost is pressed", () => {
    const onOpenChange = vi.fn();
    render(
      <MobilePushSidePage open onOpenChange={onOpenChange}>
        <p>Menu</p>
      </MobilePushSidePage>,
    );

    requestMobileSidePageClose();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
