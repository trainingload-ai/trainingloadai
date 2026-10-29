import { Skeleton } from "@/components/ui/skeleton";

function FitnessMetricSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={
        wide
          ? "rounded-md bg-neutral-100 p-3 dark:bg-muted/45 sm:col-span-2"
          : "rounded-md bg-neutral-100 p-3 dark:bg-muted/45"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-6 w-6 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
      <div className="mt-6 flex items-end gap-2">
        <Skeleton className="h-8 w-24 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-4 w-10 bg-background/80 dark:bg-black/20" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-5 w-5 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
    </div>
  );
}

function ChartSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <section
      className={
        wide
          ? "rounded-md bg-neutral-100 p-4 dark:bg-muted/45 md:col-span-2"
          : "rounded-md bg-neutral-100 p-4 dark:bg-muted/45"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-3 w-20 bg-background/80 dark:bg-black/20" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-7 w-7 rounded-full bg-background/80 dark:bg-black/20" />
        </div>
      </div>
      <div className="mt-6 flex h-[210px] items-end gap-2 md:h-[240px]">
        {Array.from({ length: 18 }).map((_, index) => (
          <Skeleton
            key={index}
            className="flex-1 bg-background/80 dark:bg-black/20"
            style={{ height: `${32 + ((index * 13) % 58)}%` }}
          />
        ))}
      </div>
    </section>
  );
}

export default function DashboardLoading() {
  return (
    <div className="flex h-full flex-col gap-2 lg:gap-2">
      <div className="mb-1">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-100 px-2.5 py-2 dark:bg-muted/45">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="h-8 w-24 bg-background/80 dark:bg-black/20" />
            <Skeleton className="hidden h-8 w-20 bg-background/80 dark:bg-black/20 sm:block" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-8 w-8 rounded-full bg-background/80 dark:bg-black/20" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FitnessMetricSkeleton />
          <FitnessMetricSkeleton />
          <FitnessMetricSkeleton />
          <FitnessMetricSkeleton />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartSkeleton wide />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </section>
      </div>
    </div>
  );
}
