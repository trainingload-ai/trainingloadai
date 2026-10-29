import { Skeleton } from "@/components/ui/skeleton";

function UsageMetricSkeleton({ prominent = false }: { prominent?: boolean }) {
  return (
    <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-20 bg-background/75 dark:bg-background/35" />
        <Skeleton className="h-3.5 w-3.5 bg-background/75 dark:bg-background/35" />
      </div>
      <Skeleton
        className={`${prominent ? "h-9 w-32" : "h-7 w-24"} mt-2 bg-background/75 dark:bg-background/35`}
      />
      <Skeleton className="mt-1.5 h-3 w-40 bg-background/75 dark:bg-background/35" />
    </div>
  );
}

function UsageChartSkeleton() {
  return (
    <section>
      <div className="mb-2">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="h-[180px] rounded-md bg-background p-3 dark:bg-black/20 md:h-[220px]">
        <div className="flex h-full items-end gap-2">
          {Array.from({ length: 14 }).map((_, index) => (
            <Skeleton
              key={index}
              className="flex-1 bg-neutral-100 dark:bg-muted/45"
              style={{ height: `${28 + ((index * 17) % 62)}%` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function UsageEventsSkeleton() {
  return (
    <section className="overflow-hidden">
      <div className="mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-8 w-64" />
        </div>
      </div>
      <div className="overflow-hidden rounded-md bg-neutral-100 dark:bg-muted/45">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px] gap-3 border-b border-border/70 px-3 py-2 md:grid">
          <Skeleton className="h-3 w-20 bg-background/75 dark:bg-background/35" />
          <Skeleton className="h-3 w-20 bg-background/75 dark:bg-background/35" />
          <Skeleton className="ml-auto h-3 w-14 bg-background/75 dark:bg-background/35" />
        </div>
        <div className="divide-y divide-border/70">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px] items-center gap-3 px-3 py-2.5"
            >
              <Skeleton className="h-4 w-full max-w-[220px] bg-background/75 dark:bg-background/35" />
              <Skeleton className="h-3 w-full max-w-[170px] bg-background/75 dark:bg-background/35" />
              <Skeleton className="ml-auto h-3 w-16 bg-background/75 dark:bg-background/35" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function UsageLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <header className="px-1 py-1">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <UsageMetricSkeleton />
          <UsageMetricSkeleton prominent />
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-2 md:gap-3">
        <UsageChartSkeleton />
        <UsageChartSkeleton />
      </div>

      <UsageEventsSkeleton />
    </div>
  );
}
