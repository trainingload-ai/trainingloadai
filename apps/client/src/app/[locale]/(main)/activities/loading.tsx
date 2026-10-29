import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function ActivityCardSkeleton() {
  return (
    <article className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full bg-background/80 dark:bg-black/20" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36 bg-background/80 dark:bg-black/20" />
              <Skeleton className="h-3 w-24 bg-background/80 dark:bg-black/20" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
            <Skeleton className="h-10 bg-background/80 dark:bg-black/20" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
      <Skeleton className="mt-3 h-12 w-full bg-background/80 dark:bg-black/20" />
    </article>
  );
}

function MiniMapSkeleton() {
  return (
    <section className="overflow-hidden rounded-md bg-neutral-100 p-0 dark:bg-muted/45 md:p-3">
      <div className="mb-2 hidden items-center justify-between sm:flex">
        <Skeleton className="h-3 w-32 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-4 w-4 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
      <div className="relative h-[200px] overflow-hidden rounded-md bg-background/80 dark:bg-background/40 md:h-[150px]">
        <Skeleton className="absolute left-5 top-8 h-2 w-28 rotate-12 bg-neutral-200 dark:bg-muted" />
        <Skeleton className="absolute left-16 top-20 h-2 w-36 -rotate-6 bg-neutral-200 dark:bg-muted" />
        <Skeleton className="absolute bottom-8 right-8 h-12 w-12 rounded-full bg-neutral-200 dark:bg-muted" />
      </div>
    </section>
  );
}

function StatsPreviewSkeleton() {
  return (
    <section className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 bg-background/80 dark:bg-black/20" />
          <Skeleton className="h-3 w-32 bg-background/80 dark:bg-black/20" />
        </div>
        <Skeleton className="h-7 w-7 rounded-full bg-background/80 dark:bg-black/20" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-16 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-16 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-16 bg-background/80 dark:bg-black/20" />
        <Skeleton className="h-16 bg-background/80 dark:bg-black/20" />
      </div>
    </section>
  );
}

function UploadSkeleton() {
  return (
    <section className="hidden rounded-md bg-neutral-100 p-3 dark:bg-muted/45 md:block">
      <Skeleton className="h-4 w-28 bg-background/80 dark:bg-black/20" />
      <Skeleton className="mt-2 h-3 w-44 bg-background/80 dark:bg-black/20" />
      <Skeleton className="mt-4 h-28 w-full bg-background/80 dark:bg-black/20" />
      <Skeleton className="mt-3 h-9 w-full bg-background/80 dark:bg-black/20" />
    </section>
  );
}

export default function V2ActivitiesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:[grid-template-areas:'main_aside']">
        <aside className="order-1 flex min-w-0 flex-col gap-3 md:order-none md:[grid-area:aside]">
          <MiniMapSkeleton />
          <StatsPreviewSkeleton />
          <UploadSkeleton />
        </aside>

        <main className="order-3 flex min-w-0 flex-col gap-4 md:order-none md:min-h-0 md:[grid-area:main]">
          <section className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Skeleton className="h-4 w-36 bg-background/80 dark:bg-black/20" />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-2 md:h-[640px] md:overflow-hidden md:pr-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <ActivityCardSkeleton key={index} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
