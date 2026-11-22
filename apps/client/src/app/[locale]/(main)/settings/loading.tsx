import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  const t = useTranslations("SharedUI");
  return (
    <div role="status">
      <span className="sr-only">{t("loadingEllipsis")}</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="space-y-2 px-1">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4">
          <Skeleton className="h-[68px] md:col-start-2 md:row-start-1" />
          <div className="min-w-0 space-y-3 md:col-start-1 md:row-start-1">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-md bg-muted/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="size-8 shrink-0 bg-background/80" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-4 w-20 bg-background/80" />
                    <Skeleton className="h-3 w-32 max-w-full bg-background/80" />
                  </div>
                </div>
                <Skeleton className="h-9 w-full bg-background/80 sm:w-[48%] sm:max-w-80" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
