import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export function HomePageSkeleton() {
  const t = useTranslations("SharedUI");

  return (
    <div role="status" className="mx-auto w-full max-w-6xl">
      <span className="sr-only">{t("loadingEllipsis")}</span>
      <div aria-hidden="true" className="flex flex-col gap-3 pb-2">
        <div className="grid gap-2 px-1 py-1 pc:py-0 pc:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-3 pc:gap-1.5">
            <div className="flex h-8 items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="space-y-3 rounded-surface bg-muted/60 p-4 pc:min-h-[150px]">
              <Skeleton className="h-4 w-2/3 bg-background/80" />
              <Skeleton className="h-3 w-full bg-background/80" />
              <Skeleton className="h-3 w-5/6 bg-background/80" />
              <Skeleton className="h-3 w-3/4 bg-background/80" />
            </div>
          </div>
          <div className="hidden min-w-0 flex-col gap-1.5 pc:flex">
            <div className="flex h-8 items-center">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex min-h-[150px] flex-col gap-3 rounded-surface bg-muted/60 p-4">
              <Skeleton className="h-4 w-2/3 bg-background/80" />
              <Skeleton className="h-3 w-20 bg-background/80" />
              <Skeleton className="mt-auto h-4 w-28 bg-background/80" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[68px] w-full rounded-surface" />
            <Skeleton className="h-5 w-20" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-surface" />
              ))}
            </div>
            <Skeleton className="hidden h-48 w-full md:block" />
          </div>
          <div className="min-w-0 space-y-3">
            <Skeleton className="h-6 w-24" />
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[138px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
