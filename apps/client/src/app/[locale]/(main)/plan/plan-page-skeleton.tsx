import { Skeleton } from "@/components/ui/skeleton";

function HeaderSkeleton() {
  return (
    <header className="px-1 py-1">
      <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-28 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-6 w-52 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-4 w-40 bg-background/80 dark:bg-black/20" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-9 w-28 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-9 w-9 rounded-full bg-background/80 dark:bg-black/20" />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Skeleton className="h-14 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-14 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-14 bg-background/80 dark:bg-black/20" />
        </div>
      </section>
    </header>
  );
}

function TodayPanelSkeleton() {
  return (
    <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-3 w-28 bg-background/80 dark:bg-black/20" />
        </div>
        <Skeleton className="h-7 w-7 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
      <Skeleton className="mt-4 h-20 bg-background/80 dark:bg-black/20" />
      <Skeleton className="mt-3 h-9 w-full bg-background/80 dark:bg-black/20" />
    </section>
  );
}

function GoalPanelSkeleton() {
  return (
    <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
      <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
      </div>
    </section>
  );
}

function WeekStripSkeleton() {
  return (
    <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-4 w-16 bg-background/80 dark:bg-black/20" />
      </div>
      <div className="-mx-4 mt-3 overflow-hidden px-4 pb-1">
        <div className="flex min-w-max gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-40 w-[82px] shrink-0 bg-background/80 dark:bg-black/20"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function WeekLoadSkeleton() {
  return (
    <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
      <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
      <div className="mt-5 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex min-w-0 flex-col items-center gap-2">
            <Skeleton className="h-3 w-8 bg-background/80 dark:bg-black/20" />
            <Skeleton
              className="w-full bg-background/80 dark:bg-black/20"
              style={{ height: `${68 + ((index * 17) % 54)}px` }}
            />
            <Skeleton className="h-3 w-7 bg-background/80 dark:bg-black/20" />
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkoutListSkeleton() {
  return (
    <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-4 w-16 bg-background/80 dark:bg-black/20" />
      </div>
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-compact bg-background/80 px-2 py-1.5 dark:bg-black/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40 bg-neutral-200 dark:bg-muted" />
                <Skeleton className="h-3 w-28 bg-neutral-200 dark:bg-muted" />
              </div>
              <Skeleton className="h-4 w-12 bg-neutral-200 dark:bg-muted" />
            </div>
            <Skeleton className="mt-1.5 h-4 w-24 bg-neutral-200 dark:bg-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MobilePlanPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 pc:hidden">
      <section className="overflow-hidden rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-3 w-40 bg-background/80 dark:bg-black/20" />
          </div>
          <Skeleton className="size-10 shrink-0 rounded-lg bg-background/80 dark:bg-black/20" />
        </div>
        <Skeleton className="mt-4 h-5 w-full bg-background/80 dark:bg-black/20" />
        <Skeleton className="mt-2 h-5 w-4/5 bg-background/80 dark:bg-black/20" />
        <div className="mt-3 flex gap-1.5">
          <Skeleton className="h-6 w-20 rounded-compact bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-6 w-24 rounded-compact bg-background/80 dark:bg-black/20" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg bg-background px-3 py-2 dark:bg-black/20"
            >
              <Skeleton className="h-2.5 w-10 bg-neutral-200 dark:bg-muted" />
              <Skeleton className="mt-2 h-4 w-12 bg-neutral-200 dark:bg-muted" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-11 w-full rounded-lg bg-foreground/15" />
      </section>

      <section className="rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-control bg-background/80 dark:bg-black/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-3 w-4/5 bg-background/80 dark:bg-black/20" />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="rounded-surface border border-border/60 bg-neutral-100 p-3 dark:bg-muted/45">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-16 shrink-0 rounded-lg bg-background/80 dark:bg-black/20" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5 bg-background/80 dark:bg-black/20" />
              <Skeleton className="h-3 w-4/5 bg-background/80 dark:bg-black/20" />
              <Skeleton className="h-3 w-2/5 bg-background/80 dark:bg-black/20" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PlanPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      <MobilePlanPageSkeleton />
      <div className="hidden flex-col gap-3 pc:flex pc:gap-4">
        <HeaderSkeleton />
        <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 [grid-template-areas:'main_aside']">
          <aside className="flex min-w-0 flex-col gap-3 [grid-area:aside]">
            <TodayPanelSkeleton />
            <GoalPanelSkeleton />
            <GoalPanelSkeleton />
          </aside>
          <main className="flex min-h-0 min-w-0 flex-col gap-4 [grid-area:main]">
            <WeekStripSkeleton />
            <WeekLoadSkeleton />
            <WorkoutListSkeleton />
          </main>
        </div>
      </div>
    </div>
  );
}
