"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Components, ExtraProps } from "react-markdown";
import type { ReviewComparisonPoint } from "@/components/charts/review-period-comparison-chart";
import { MarkdownProse } from "@/components/MarkdownProse";
import { cn } from "@/lib/utils";

const ReviewPeriodComparisonChart = dynamic(
  () =>
    import("@/components/charts/review-period-comparison-chart").then(
      (module) => module.ReviewPeriodComparisonChart,
    ),
  { ssr: false },
);

const metrics = new Set([
  "sessions",
  "duration",
  "SLEEP_ASLEEP_SECONDS",
  "HRV_RMSSD_MS",
  "HRV_SDNN_MS",
  "RESTING_HEART_RATE_BPM",
]);

type Comparison = [metric: string, current: number, previous: number];
type MarkdownNode = {
  type: string;
  value?: string;
  identifier?: string;
  url?: string;
  title?: string;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
};

type ComparisonChart = {
  title: string;
  currentLabel: string;
  previousLabel: string;
  points: ReviewComparisonPoint[];
};

function readComparison({ type, identifier, url, title }: MarkdownNode) {
  if (
    type !== "definition" ||
    (identifier !== "review-comparison-training" &&
      identifier !== "review-comparison-recovery") ||
    url !== "#" ||
    !title ||
    title.length > 512
  )
    return;

  try {
    const rows: unknown = JSON.parse(title);
    if (
      Array.isArray(rows) &&
      rows.every(
        (row) =>
          row === null ||
          (Array.isArray(row) &&
            row.length === 3 &&
            typeof row[0] === "string" &&
            metrics.has(row[0]) &&
            row
              .slice(1)
              .every(
                (value) =>
                  typeof value === "number" &&
                  Number.isFinite(value) &&
                  value >= 0,
              )),
      )
    )
      return rows as (Comparison | null)[];
  } catch {
    // Invalid chart metadata leaves the readable table intact.
  }
}

function markdownText(node?: MarkdownNode): string {
  return node?.value ?? node?.children?.map(markdownText).join("") ?? "";
}

function remarkReviewComparisons() {
  return (tree: { children: MarkdownNode[] }) => {
    let chart: ComparisonChart | undefined;
    tree.children.forEach((node, index) => {
      const table = tree.children[index + 1];
      if (table?.type !== "table") return;
      const comparison = readComparison(node);
      const [header, ...rows] = table.children ?? [];
      if (
        !header?.children ||
        header.children.length !== 4 ||
        !comparison ||
        comparison.length !== rows.length
      )
        return;

      table.data = { hProperties: { dataReviewComparison: "true" } };
      const points = comparison.flatMap((pair, rowIndex) => {
        const cells = rows[rowIndex].children;
        if (!cells || cells.length !== 4 || !pair || pair[2] <= 0) return [];
        const [metric, currentValue, previousValue] = pair;
        const value = (currentValue - previousValue) / previousValue;
        if (!Number.isFinite(value)) return [];
        const [label, current, previous, change] = cells.map(markdownText);
        return [{ metric, label, value, current, previous, change }];
      });
      if (!points.length) return;
      chart ??= {
        title: markdownText(header.children[3]),
        currentLabel: markdownText(header.children[1]),
        previousLabel: markdownText(header.children[2]),
        points: [],
      };
      chart.points.push(...points);
    });

    if (!chart) return;
    const firstSection = tree.children.findIndex(
      ({ type }) => type === "heading" || type === "table",
    );
    tree.children.splice(Math.max(0, firstSection), 0, {
      type: "reviewComparisonCharts",
      data: {
        hName: "figure",
        hProperties: { dataReviewChart: JSON.stringify(chart) },
      },
    });
  };
}

function ReviewTable({ node, ...props }: ComponentProps<"table"> & ExtraProps) {
  const t = useTranslations("notifications");
  const comparison = node?.properties.dataReviewComparison === "true";
  return (
    <div
      className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      role="group"
      aria-label={t("templates.reviewDigest")}
      tabIndex={0}
      data-vaul-no-drag
    >
      <table
        {...props}
        className={cn(
          "my-0 pc:min-w-full",
          comparison
            ? "w-full table-fixed pc:table-auto [&_th:first-child]:w-[35%] [&_th:last-child]:w-[18%] pc:[&_th:first-child]:w-auto pc:[&_th:last-child]:w-auto [&_td:not(:first-child)]:font-mono [&_td:not(:first-child)]:tabular-nums"
            : "min-w-max",
        )}
      />
    </div>
  );
}

function ReviewChart({ node }: ComponentProps<"figure"> & ExtraProps) {
  const data = node?.properties.dataReviewChart;
  if (typeof data !== "string") return null;
  const chart = JSON.parse(data) as ComparisonChart;
  return (
    <figure
      className="not-prose mx-0 my-5"
      data-review-charts
      aria-label={chart.title}
    >
      <figcaption className="mb-2 text-sm font-semibold text-foreground">
        {chart.title}
      </figcaption>
      <ReviewPeriodComparisonChart {...chart} />
      <ul className="sr-only">
        {chart.points.map((point) => (
          <li key={point.metric}>
            {point.label} · {chart.currentLabel} {point.current} ·{" "}
            {chart.previousLabel} {point.previous} · {point.change}
          </li>
        ))}
      </ul>
    </figure>
  );
}

const reviewMarkdownComponents: Components = {
  table: ReviewTable,
  figure: ReviewChart,
};
const reviewRemarkPlugins = [remarkReviewComparisons];

export function hasReviewComparison(markdown: string) {
  return /^\[review-comparison-(?:training|recovery)\]: # '/m.test(markdown);
}

const reportInternalUrl = (url: string) =>
  /^\/(?![\/\\])/.test(url) ? url : "";

export function ReviewReportMarkdown({
  markdown,
  className,
  internalLinksOnly,
}: {
  markdown: string;
  className?: string;
  internalLinksOnly?: boolean;
}) {
  return (
    <MarkdownProse
      markdown={markdown}
      className={cn(
        "prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-base prose-h2:leading-6 prose-h3:mt-5 prose-h3:mb-1 prose-h3:text-sm prose-table:my-0",
        className,
      )}
      components={reviewMarkdownComponents}
      remarkPlugins={reviewRemarkPlugins}
      urlTransform={internalLinksOnly ? reportInternalUrl : undefined}
    />
  );
}
