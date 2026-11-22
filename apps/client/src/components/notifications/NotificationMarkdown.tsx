"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps, CSSProperties } from "react";
import type { Components, ExtraProps } from "react-markdown";
import type { NotificationItem } from "@/api/notifications";
import { MarkdownProse } from "@/components/MarkdownProse";
import { getMetricColorRule } from "@/lib/chart-data-utils";
import { cn } from "@/lib/utils";

export function isReviewReport(item: NotificationItem | null) {
  return item?.kind === "REVIEW_DIGEST" && Boolean(item.digestId);
}

function ReviewTable({
  node,
  ...props
}: ComponentProps<"table"> & ExtraProps) {
  const t = useTranslations("notifications");
  const kind = node?.properties.dataReviewComparison;
  const palette =
    kind === "training" || kind === "recovery"
      ? getMetricColorRule(kind === "training" ? "duration" : "sleep")
      : null;
  const style = palette
    ? ({
        ...props.style,
        "--review-color-current": palette.color,
        "--review-color-previous": palette.comparisonColor,
      } as CSSProperties)
    : props.style;
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
        style={style}
        className={cn(
          "my-0 min-w-max pc:min-w-full",
          palette && "[&_td:not(:first-child)]:font-mono [&_td:not(:first-child)]:tabular-nums",
        )}
      />
    </div>
  );
}

const comparisonMarker = "<!-- review-comparison:";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string> };
};

function readComparison(value: string) {
  if (!value.startsWith(comparisonMarker) || !value.endsWith(" -->") || value.length > 512) {
    return;
  }
  try {
    const [kind, payload] = value.slice(comparisonMarker.length, -4).split(":", 2);
    if (kind !== "training" && kind !== "recovery") return;
    const pairs: unknown = JSON.parse(payload);
    if (
      Array.isArray(pairs) &&
      pairs.every((pair) =>
        pair === null ||
        (Array.isArray(pair) && pair.length === 2 &&
          pair.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)),
      )
    ) {
      return { kind, pairs: pairs as ([number, number] | null)[] };
    }
  } catch {
    // Invalid chart metadata leaves the readable table intact.
  }
}

function remarkReviewComparisons() {
  return (tree: { children: MarkdownNode[] }) => {
    tree.children.forEach((node, index) => {
      const table = tree.children[index + 1];
      if (node.type !== "html" || table?.type !== "table") return;
      const comparison = readComparison(node.value ?? "");
      const [header, ...rows] = table.children ?? [];
      if (!header?.children || !comparison || comparison.pairs.length !== rows.length) return;

      table.data = { hProperties: { dataReviewComparison: comparison.kind } };
      comparison.pairs.forEach((pair, rowIndex) => {
        const metric = rows[rowIndex].children?.[0];
        const max = pair ? Math.max(...pair) : 0;
        if (!metric || !pair || max === 0) return;
        metric.data = { hProperties: {
          dataReviewBars: pair.map((value) => (value / max) * 100).join(","),
        } };
      });
      [header.children[1], header.children[2]].forEach((cell, period) => {
        if (cell) cell.data = { hProperties: { dataReviewPeriod: String(period) } };
      });
    });
  };
}

const currentFill = "bg-[var(--review-color-current)]";
const previousFill = "bg-[var(--review-color-previous)] opacity-70";

function ReviewHeader({ node, children, ...props }: ComponentProps<"th"> & ExtraProps) {
  const period = node?.properties.dataReviewPeriod;
  return (
    <th {...props}>
      {period === "0" || period === "1" ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-micro", period === "0" ? currentFill : previousFill)} />
          {children}
        </span>
      ) : children}
    </th>
  );
}

function ReviewCell({ node, children, ...props }: ComponentProps<"td"> & ExtraProps) {
  const data = node?.properties.dataReviewBars;
  const widths = typeof data === "string" ? data.split(",").map(Number) : null;
  return (
    <td {...props}>
      {children}
      {widths ? (
        <span aria-hidden className="mt-2 grid w-24 max-w-full gap-1 pc:w-40" data-review-comparison-bars>
          {widths.map((width, index) => (
            <span key={index} className="block h-1.5 rounded-micro bg-muted">
              {width > 0 ? (
                <span
                  className={cn("block h-full rounded-micro", index === 0 ? currentFill : previousFill)}
                  style={{ width: `${width}%` }}
                />
              ) : null}
            </span>
          ))}
        </span>
      ) : null}
    </td>
  );
}

const reviewMarkdownComponents: Components = {
  table: ReviewTable,
  th: ReviewHeader,
  td: ReviewCell,
};
const reviewRemarkPlugins = [remarkReviewComparisons];

export function NotificationMarkdown({
  item,
  markdown,
}: {
  item: NotificationItem;
  markdown: string;
}) {
  const review = isReviewReport(item);
  return (
    <MarkdownProse
      markdown={markdown}
      components={review ? reviewMarkdownComponents : undefined}
      remarkPlugins={review ? reviewRemarkPlugins : undefined}
    />
  );
}
