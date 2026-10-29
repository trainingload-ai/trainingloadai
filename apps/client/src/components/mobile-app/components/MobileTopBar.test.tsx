import { fireEvent, render, screen } from "@testing-library/react";
import { Menu } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import {
  MobileTopBar,
  MobileTopBarAction,
  MobileTopBarContent,
} from "./MobileTopBar";

describe("MobileTopBar", () => {
  it("owns the glass frame and its safe-area geometry", () => {
    render(
      <>
        <MobileTopBar
          title="My"
          leading={
            <MobileTopBarAction aria-label="Open menu" edge="leading">
              <Menu />
            </MobileTopBarAction>
          }
        />
        <MobileTopBarContent>Profile</MobileTopBarContent>
      </>,
    );

    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-mobile-top-bar");
    expect(header).toHaveClass(
      "bg-background/95",
      "supports-[backdrop-filter]:bg-background/65",
      "backdrop-blur-2xl",
      "backdrop-saturate-150",
      "h-[calc(env(safe-area-inset-top,0px)+56px)]",
    );
    expect(screen.getByRole("main")).toHaveClass(
      "pt-[calc(env(safe-area-inset-top,0px)+56px)]",
      "tablet:pt-0",
    );
  });

  it("uses the same 56px content height for screen and inline placements", () => {
    const { rerender } = render(<MobileTopBar title="Screen" />);

    expect(screen.getByRole("banner").firstElementChild).toHaveClass(
      "h-14",
      "top-[env(safe-area-inset-top,0px)]",
    );

    rerender(<MobileTopBar title="Side page" placement="inline" />);

    expect(screen.getByRole("banner")).toHaveClass(
      "pt-[env(safe-area-inset-top,0px)]",
    );
    expect(screen.getByRole("banner").firstElementChild).toHaveClass("h-14");
  });

  it("uses the same glass action for buttons and links", () => {
    const onClick = vi.fn();
    render(
      <>
        <MobileTopBarAction
          aria-label="Open menu"
          edge="leading"
          onClick={onClick}
        >
          <Menu />
        </MobileTopBarAction>
        <MobileTopBarAction asChild edge="trailing">
          <a href="#notifications">Notifications</a>
        </MobileTopBarAction>
      </>,
    );

    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveClass("size-11", "text-emerald-600");
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveClass(
      "size-11",
      "text-emerald-600",
    );

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
