import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import coreMessages from "../../../../../packages/messages/client-core/en.json";
import { DatePickerWithRange } from "./date-range-picker";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

function mount(
  props: Partial<ComponentProps<typeof DatePickerWithRange>> = {},
) {
  const onDateChange = vi.fn();
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ SharedUI: coreMessages.SharedUI }}
    >
      <DatePickerWithRange popoverModal onDateChange={onDateChange} {...props} />
    </NextIntlClientProvider>,
  );
  return { onDateChange };
}

function dayButton(label: string) {
  const grids = screen.getAllByRole("grid");
  const match = within(grids[0]!)
    .getAllByRole("button")
    .find((btn) => btn.textContent?.trim() === label && !btn.hasAttribute("disabled"));
  if (!match) {
    throw new Error(`Missing day button ${label}`);
  }
  return match;
}

describe("DatePickerWithRange", () => {
  it("keeps the popover open after the first day click so a range end can be chosen", () => {
    const { onDateChange } = mount();
    fireEvent.click(screen.getByRole("button", { name: /pick a date/i }));

    expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);

    fireEvent.click(dayButton("10"));

    // Still open after the start day — react-day-picker v9 would otherwise
    // emit {from,to:same day} and the old close condition collapsed immediately.
    expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);
    expect(onDateChange).toHaveBeenCalled();
    const firstRange = onDateChange.mock.calls.at(-1)?.[0];
    expect(firstRange?.from).toBeInstanceOf(Date);
    expect(firstRange?.to).toBeUndefined();

    fireEvent.click(dayButton("15"));
    const secondRange = onDateChange.mock.calls.at(-1)?.[0];
    expect(secondRange?.from).toBeInstanceOf(Date);
    expect(secondRange?.to).toBeInstanceOf(Date);
    expect(screen.queryAllByRole("grid")).toHaveLength(0);
  });
});
