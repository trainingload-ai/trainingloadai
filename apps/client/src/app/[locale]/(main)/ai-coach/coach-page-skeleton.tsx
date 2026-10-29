import { Skeleton } from "@/components/ui/skeleton";

function DesktopComposerSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-overlay p-3">
      <div className="mb-3 hidden items-center gap-2 sm:flex">
        <Skeleton className="h-3.5 w-3.5" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 min-w-0 flex-1 sm:h-20" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-full sm:hidden" />
      </div>
      <div className="mt-3 hidden items-center justify-between pt-3 sm:flex">
        <Skeleton className="hidden h-3 w-48 sm:block" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

function MobileCoachSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col pc:hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden px-3 pb-2 pt-4">
        <div className="rounded-overlay border border-amber-300/30 bg-amber-500/[0.06] p-4 dark:border-amber-500/20">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-full" />
            </div>
            <Skeleton className="size-4 shrink-0 rounded-full" />
          </div>
        </div>

        <div className="space-y-3">
          <section className="rounded-surface border border-border/60 bg-neutral-100 p-3 dark:bg-muted/45">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-compact bg-background/80 dark:bg-black/20" />
              <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
            </div>
            <div className="mt-2 space-y-2">
              <Skeleton className="h-10 w-full bg-background/80 dark:bg-black/20" />
              <Skeleton className="h-10 w-full bg-background/80 dark:bg-black/20" />
            </div>
          </section>
          <Skeleton className="h-3.5 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-5/6 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="shrink-0 bg-background/95 px-2 pb-safe-or-1 pt-2">
        <div className="mx-auto flex h-12 w-full max-w-lg items-center gap-2 rounded-overlay border border-border/70 p-2">
          <Skeleton className="h-7 min-w-0 flex-1" />
          <Skeleton className="size-8 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function DesktopCoachSkeleton() {
  return (
    <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 py-8 pc:flex">
      <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[920px] flex-col justify-center gap-5">
        <div className="space-y-5">
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-8 w-72" />
            <Skeleton className="mx-auto h-4 w-full max-w-xl" />
            <Skeleton className="mx-auto h-4 w-4/5 max-w-md" />
          </div>
          <DesktopComposerSkeleton />
          <div className="space-y-3 pt-2">
            <Skeleton className="mx-auto h-4 w-28" />
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-7 w-36" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiCoachPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <MobileCoachSkeleton />
      <DesktopCoachSkeleton />
    </div>
  );
}
