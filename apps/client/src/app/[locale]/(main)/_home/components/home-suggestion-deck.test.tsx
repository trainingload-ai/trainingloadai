import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeSuggestionDeck } from "./home-suggestion-deck";

afterEach(cleanup);
function cards() {
  return ["First", "Second", "Advice"].map((label) => ({
    id: label,
    label,
    className: "bg-neutral-100",
    content: <span>{label}</span>,
    onOpen: vi.fn(),
  }));
}
function front() {
  return document.querySelector('[data-front="true"]') as HTMLButtonElement;
}

describe("home suggestion deck navigation", () => {
  it("cycles through every card by keyboard and moves focus without opening details", () => {
    const items = cards();
    render(<HomeSuggestionDeck cards={items} switchLabel="Switch" />);
    for (const expected of ["Second", "Advice", "First"]) {
      fireEvent.keyDown(front(), { key: "ArrowRight" });
      expect(front()).toHaveAttribute("aria-label", expected);
      expect(front()).toHaveFocus();
    }
    fireEvent.keyDown(front(), { key: "ArrowLeft" });
    expect(front()).toHaveAttribute("aria-label", "Advice");
    expect(items.every((item) => item.onOpen.mock.calls.length === 0)).toBe(
      true,
    );
    fireEvent.click(front());
    expect(items[2].onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps dot order stable and recovers when the active card is removed", () => {
    const items = cards();
    const { rerender } = render(
      <HomeSuggestionDeck cards={items} switchLabel="Switch" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch · 2 · Second" }),
    );
    expect(front()).toHaveAttribute("aria-label", "Second");
    expect(
      screen
        .getAllByRole("button", { name: /^Switch/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Switch · 1 · First",
      "Switch · 2 · Second",
      "Switch · 3 · Advice",
    ]);
    rerender(<HomeSuggestionDeck cards={[items[2]]} switchLabel="Switch" />);
    expect(front()).toHaveAttribute("aria-label", "Advice");
    expect(
      screen.queryByRole("button", { name: /^Switch/ }),
    ).not.toBeInTheDocument();
  });
});
