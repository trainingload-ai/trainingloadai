"use client";

import type { NotificationItem } from "@/api/notifications";
import { MarkdownProse } from "@/components/MarkdownProse";
import { ReviewReportMarkdown } from "@/components/review-report-markdown";

export function isReviewReport(item: NotificationItem | null) {
  return item?.kind === "REVIEW_DIGEST" && Boolean(item.digestId);
}

export function NotificationMarkdown({
  item,
  markdown,
}: {
  item: NotificationItem;
  markdown: string;
}) {
  return isReviewReport(item) ? (
    <ReviewReportMarkdown markdown={markdown} />
  ) : (
    <MarkdownProse markdown={markdown} />
  );
}
