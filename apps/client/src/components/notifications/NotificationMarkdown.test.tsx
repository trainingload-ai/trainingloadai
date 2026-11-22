import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationMarkdown } from "./NotificationMarkdown";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const item = {
  id: "notice",
  digestId: "digest",
  kind: "REVIEW_DIGEST",
  title: "Weekly review",
  createdAt: "2026-11-22T12:36:00Z",
};

const table = [
  "| Metric | This period | Last period | Change |",
  "| --- | ---: | ---: | ---: |",
  "| Sleep | 8 h | 6 h | +33.3% |",
  "| HRV | 52 ms | — | — |",
].join("\n");

describe("review comparison charts", () => {
  it("adds a zero-based bar pair only to the comparable row and preserves the table values", () => {
    render(<NotificationMarkdown item={item} markdown={`<!-- review-comparison:recovery:[[8,6],null] -->\n\n${table}`} />);
    const [sleep, hrv] = screen.getAllByRole("row").slice(1);
    const bars = sleep.querySelector("[data-review-comparison-bars]");
    expect(bars).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(bars?.querySelectorAll<HTMLElement>("[style]") ?? [], (bar) => bar.style.width))
      .toEqual(["100%", "75%"]);
    expect(hrv.querySelector("[data-review-comparison-bars]")).toBeNull();
    expect(screen.getByRole("cell", { name: "+33.3%" })).toBeVisible();
  });

  it("keeps the plain table if the chart metadata is invalid", () => {
    const { container } = render(<NotificationMarkdown item={item} markdown={`<!-- review-comparison:recovery:[[8,-6],null] -->\n\n${table}`} />);
    expect(container.querySelector("[data-review-comparison-bars]")).toBeNull();
    expect(screen.getByRole("table")).toBeVisible();
  });
});
