import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewComparisonPoint } from "@/components/charts/review-period-comparison-chart";
import { NotificationMarkdown } from "./NotificationMarkdown";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/charts/review-period-comparison-chart", () => ({
  ReviewPeriodComparisonChart: ({
    points,
  }: {
    points: ReviewComparisonPoint[];
  }) => <div data-testid="comparison-plot">{JSON.stringify(points)}</div>,
}));

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
  it("renders percentage changes in a standalone chart before the plain data table", async () => {
    render(
      <NotificationMarkdown
        item={item}
        markdown={`[review-comparison-recovery]: # '[["SLEEP_ASLEEP_SECONDS",8,6],null]'\n\n${table}`}
      />,
    );
    const chart = screen.getByRole("figure", { name: "Change" });
    const plot = await screen.findByTestId("comparison-plot");
    const points = JSON.parse(
      plot.textContent ?? "[]",
    ) as ReviewComparisonPoint[];
    expect(points).toHaveLength(1);
    expect(points[0].label).toBe("Sleep");
    expect(points[0].value).toBeCloseTo(1 / 3);
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Sleep · This period 8 h · Last period 6 h · +33.3%",
    );
    const dataTable = screen.getByRole("table");
    expect(dataTable.contains(plot)).toBe(false);
    expect(chart.compareDocumentPosition(dataTable)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("cell", { name: "52 ms" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "+33.3%" })).toBeVisible();
    expect(
      screen.queryByText(/review-comparison-recovery/),
    ).not.toBeInTheDocument();
  });

  it("keeps the plain table if the chart metadata is invalid", () => {
    const { container } = render(
      <NotificationMarkdown
        item={item}
        markdown={`[review-comparison-recovery]: # '[["SLEEP_ASLEEP_SECONDS",8,-6],null]'\n\n${table}`}
      />,
    );
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeVisible();
    expect(container).not.toHaveTextContent("review-comparison-recovery");
  });

  it("keeps a zero-baseline metric only in the data table", () => {
    render(
      <NotificationMarkdown
        item={item}
        markdown={`[review-comparison-recovery]: # '[["SLEEP_ASLEEP_SECONDS",8,0],null]'\n\n${table.replace("6 h | +33.3%", "0 h | —")}`}
      />,
    );
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0 h" })).toBeVisible();
  });
});
