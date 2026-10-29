import { MainPageSkeleton } from "@/components/layout/MainPageSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

function MobileMePageSkeleton() {
  return (
    <div className="space-y-3 pb-6 pc:hidden">
      <div className="flex items-center gap-3 py-3">
        <Skeleton className="h-[42px] w-32 rounded-control" />
        <Skeleton className="ml-auto h-8 w-[170px] rounded-lg" />
      </div>

      <div className="grid grid-cols-4 rounded-control bg-muted p-0.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-8 rounded-compact bg-background/70 dark:bg-black/20"
          />
        ))}
      </div>

      <section className="overflow-hidden rounded-surface bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-end gap-1">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
        <div className="mt-4 flex h-36 items-end gap-2 overflow-hidden rounded-xl bg-muted/35 px-2 pb-2">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton
              key={index}
              className="flex-1 rounded-t-md"
              style={{ height: `${24 + ((index * 19) % 68)}%` }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[192, 160, 160, 192].map((height, index) => (
            <Skeleton
              key={index}
              className="rounded-surface"
              style={{ height }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function MePageSkeleton() {
  return (
    <div className="w-full">
      <MobileMePageSkeleton />
      <div className="hidden pc:block">
        <MainPageSkeleton />
      </div>
    </div>
  );
}
