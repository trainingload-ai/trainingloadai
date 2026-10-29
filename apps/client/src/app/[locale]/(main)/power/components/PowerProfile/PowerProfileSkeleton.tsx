"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

function ProfileTableSkeleton() {
  const t = useTranslations("PowerProfile");
  return (
    <div className="overflow-hidden rounded-md">
      <div className="px-3 py-2 text-sm font-medium">
        <Skeleton className="h-4 w-20 bg-neutral-100 dark:bg-muted/45" />
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-5 gap-2 py-2">
          <div>
            <Skeleton className="h-3 w-14 bg-neutral-100 dark:bg-muted/45" />
          </div>
          <div className="justify-self-center">
            <Skeleton className="h-3 w-8 bg-neutral-100 dark:bg-muted/45" />
          </div>
          <div className="justify-self-center">
            <Skeleton className="h-3 w-8 bg-neutral-100 dark:bg-muted/45" />
          </div>
          <div className="justify-self-center">
            <Skeleton className="h-3 w-8 bg-neutral-100 dark:bg-muted/45" />
          </div>
          <div className="justify-self-center">
            <Skeleton className="h-3 w-10 bg-neutral-100 dark:bg-muted/45" />
          </div>
        </div>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-2 items-center py-3">
            <Skeleton className="h-3 w-24 bg-neutral-100 dark:bg-muted/45" />
            <div className="justify-self-center">
              <Skeleton className="h-3 w-10 bg-neutral-100 dark:bg-muted/45" />
            </div>
            <div className="justify-self-center">
              <Skeleton className="h-3 w-10 bg-neutral-100 dark:bg-muted/45" />
            </div>
            <div className="justify-self-center">
              <Skeleton className="h-3 w-10 bg-neutral-100 dark:bg-muted/45" />
            </div>
            <div className="justify-self-center">
              <Skeleton className="h-3 w-10 bg-neutral-100 dark:bg-muted/45" />
            </div>
          </div>
        ))}
        <div className="sr-only">{t("table.level")}</div>
      </div>
    </div>
  );
}

export function PowerProfileSkeleton() {
  const t = useTranslations("PowerProfile");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <ProfileTableSkeleton />
      </div>
      <div className="rounded-md bg-neutral-100 dark:bg-muted/45 px-3 py-2">
        <div className="text-sm font-medium">{t("interpretation.title")}</div>
        <div className="mt-2 space-y-2">
          <Skeleton className="h-4 w-48 bg-neutral-100 dark:bg-muted/45" />
          <Skeleton className="h-3 w-full bg-neutral-100 dark:bg-muted/45" />
          <Skeleton className="h-3 w-5/6 bg-neutral-100 dark:bg-muted/45" />
        </div>
      </div>
    </div>
  );
}

