export function LazyChartFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-80 animate-pulse rounded-surface bg-neutral-100 dark:bg-muted/45"
    />
  );
}
