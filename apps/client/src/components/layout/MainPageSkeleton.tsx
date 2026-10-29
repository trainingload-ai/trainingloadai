import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function PanelSkeleton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md p-3", className)}>{children}</section>
  );
}

function MetricBlockSkeleton() {
  return (
    <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
      <Skeleton className="h-3 w-20 bg-background/75 dark:bg-background/35" />
      <Skeleton className="mt-2 h-6 w-16 bg-background/75 dark:bg-background/35" />
    </div>
  );
}

function ListItemSkeleton() {
  return (
    <div className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 bg-background/75 dark:bg-background/35" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-2/3 bg-background/75 dark:bg-background/35" />
          <Skeleton className="mt-2 h-3 w-full bg-background/75 dark:bg-background/35" />
          <Skeleton className="mt-2 h-3 w-4/5 bg-background/75 dark:bg-background/35" />
        </div>
      </div>
    </div>
  );
}

export function MainPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      <header className="px-1 py-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
      </header>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4">
        <PanelSkeleton className="order-1 md:col-start-2 md:row-start-1 md:order-none">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="grid gap-2 sm:grid-cols-2">
            <MetricBlockSkeleton />
            <MetricBlockSkeleton />
          </div>
        </PanelSkeleton>

        <div className="order-2 md:hidden">
          <Skeleton className="h-11 w-full rounded-md" />
        </div>

        <main className="order-3 flex min-w-0 flex-col gap-3 md:gap-4 md:col-start-1 md:row-span-3 md:row-start-1 md:order-none">
          <PanelSkeleton>
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <MetricBlockSkeleton />
              <MetricBlockSkeleton />
              <MetricBlockSkeleton />
            </div>
          </PanelSkeleton>

          <PanelSkeleton>
            <Skeleton className="mb-3 h-4 w-28" />
            <div className="grid gap-2 sm:grid-cols-2">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          </PanelSkeleton>
        </main>

        <PanelSkeleton className="order-4 md:col-start-2 md:row-start-2 md:order-none">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="space-y-2">
            <ListItemSkeleton />
            <ListItemSkeleton />
          </div>
        </PanelSkeleton>

        <PanelSkeleton className="order-5 hidden md:block md:col-start-2 md:row-start-3 md:order-none">
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        </PanelSkeleton>
      </div>
    </div>
  );
}

export function CalendarPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <section className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] overflow-hidden border-y border-border/70 bg-background pc:hidden">
        <div className="flex h-full w-12 flex-col items-center justify-center gap-2 border-r border-border/70 bg-muted/55">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-3 rounded-sm" />
          ))}
        </div>
        <div className="min-h-0 overflow-hidden">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="grid h-[90px] grid-cols-[86px_minmax(0,1fr)]"
            >
              <div className="border-b border-r border-border/70 bg-muted/45 px-3 py-3">
                <Skeleton className="h-3 w-9" />
                <Skeleton className="mt-2 h-7 w-8" />
                {index === 2 ? (
                  <Skeleton className="mt-2 h-0.5 w-5 rounded-none" />
                ) : null}
              </div>
              <div className="flex items-start gap-2 border-b border-border/70 px-3 py-3">
                {index % 3 === 0 ? (
                  <>
                    <Skeleton className="h-6 w-28 rounded-compact" />
                    <Skeleton className="h-6 w-20 rounded-compact" />
                  </>
                ) : index % 3 === 1 ? (
                  <Skeleton className="h-6 w-36 rounded-compact" />
                ) : (
                  <Skeleton className="h-3.5 w-12" />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="hidden h-full w-full flex-col gap-3 pc:flex">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 pc:grid-cols-[minmax(0,1.24fr)_minmax(220px,260px)] xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,280px)]">
          <section className="min-h-[520px] rounded-md p-0">
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square min-h-16" />
              ))}
            </div>
          </section>

          <section className="rounded-md p-0">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-20 w-full" />
            <Skeleton className="mt-2 h-16 w-full" />
            <Skeleton className="mt-2 h-16 w-5/6" />
          </section>
        </div>
      </div>
    </div>
  );
}
