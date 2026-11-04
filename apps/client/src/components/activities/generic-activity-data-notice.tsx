"use client";

import type { ActivitySportIdentity } from "@/lib/activity-presentation";
import { isGenericActivityClassification } from "@/lib/activity-presentation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function GenericActivityDataNotice({
  activity,
  className,
}: {
  activity: ActivitySportIdentity;
  className?: string;
}) {
  const t = useTranslations("ActivityDetail.genericDataNotice");
  if (!isGenericActivityClassification(activity)) return null;

  return (
    <aside
      className={cn("rounded-md bg-muted/55 px-4 py-3", className)}
      data-testid="generic-activity-data-notice"
    >
      <h2 className="text-sm font-medium text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {t("description")}
      </p>
    </aside>
  );
}
