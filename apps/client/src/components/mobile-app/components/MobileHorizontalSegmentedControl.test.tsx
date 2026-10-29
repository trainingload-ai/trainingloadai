import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileHorizontalSegmentedControl } from "./MobileHorizontalSegmentedControl";

describe("MobileHorizontalSegmentedControl", () => {
  it("shares selection and horizontal centering behavior", () => {
    const onValueChange = vi.fn();
    const scrollTo = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    render(
      <MobileHorizontalSegmentedControl
        ariaLabel="Metric"
        value="count"
        options={[
          { value: "count", label: "次数" },
          { value: "distance", label: "距离" },
        ]}
        onValueChange={onValueChange}
      />,
    );

    const distance = screen.getByRole("button", { name: "距离" });
    const scroller = distance.parentElement?.parentElement;
    Object.defineProperty(scroller, "scrollTo", { value: scrollTo });

    expect(screen.getByRole("button", { name: "次数" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(distance);
    expect(onValueChange).toHaveBeenCalledWith("distance");
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });
});
