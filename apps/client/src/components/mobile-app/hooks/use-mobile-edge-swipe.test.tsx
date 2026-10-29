import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMobileEdgeSwipe } from "./use-mobile-edge-swipe";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function SwipeMenuHarness() {
  const [open, setOpen] = useState(false);
  useMobileEdgeSwipe(() => setOpen(true), !open);

  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {open ? "open" : "closed"}
      </button>
      <div data-mobile-horizontal-scroll>metrics</div>
    </>
  );
}

describe("useMobileEdgeSwipe", () => {
  it("still lets the menu button close after an edge swipe opens it", () => {
    window.matchMedia = vi.fn(
      () => ({ matches: true }) as MediaQueryList,
    );
    render(<SwipeMenuHarness />);

    fireEvent.touchStart(window, {
      touches: [{ clientX: 8, clientY: 120 }],
    });
    fireEvent.touchMove(window, {
      touches: [{ clientX: 88, clientY: 124 }],
    });

    const menuButton = screen.getByRole("button", { name: "open" });
    fireEvent.click(menuButton);

    expect(screen.getByRole("button", { name: "closed" })).toBeVisible();
  });

  it("does not open the side menu while the metric row is scrolling", () => {
    window.matchMedia = vi.fn(
      () => ({ matches: true }) as MediaQueryList,
    );
    render(<SwipeMenuHarness />);

    const metricScroller = screen.getByText("metrics");
    fireEvent.touchStart(metricScroller, {
      touches: [{ clientX: 8, clientY: 120 }],
    });
    fireEvent.touchMove(metricScroller, {
      touches: [{ clientX: 88, clientY: 124 }],
    });

    expect(screen.getByRole("button", { name: "closed" })).toBeVisible();
  });
});
