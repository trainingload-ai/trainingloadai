// ContentFreshness: small server component that renders a visible
// "Last updated" timestamp (and optional reviewer) so AI engines and
// readers can see when the page was last reviewed. See

type ContentFreshnessProps = {
  /** ISO date string (YYYY-MM-DD) for the last meaningful content update. */
  lastUpdated: string;
  /** Optional reviewer name shown after the date. */
  reviewedBy?: string;
  /** Optional CSS class to merge into the wrapper. */
  className?: string;
};

export function ContentFreshness({
  lastUpdated,
  reviewedBy,
  className,
}: ContentFreshnessProps) {
  const wrapperClass = [
    "text-muted-foreground/80 mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <p className={wrapperClass} data-geo-content-freshness="true">
      <span>
        Last updated: <time dateTime={lastUpdated}>{lastUpdated}</time>
      </span>
      {reviewedBy ? (
        <span aria-label="Reviewed by">Reviewed by {reviewedBy}</span>
      ) : null}
    </p>
  );
}
