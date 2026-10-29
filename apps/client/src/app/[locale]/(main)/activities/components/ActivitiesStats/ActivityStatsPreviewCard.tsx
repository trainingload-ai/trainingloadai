"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ActivityContributionHeatmap,
  type ActivityContributionDay,
} from "./ActivityContributionHeatmap";
import { ACTIVITY_STATS_PREVIEW_DAYS_BACK } from "../../activity-stats-preview-model";

export function ActivityStatsPreviewCard({
  days,
  onHover,
}: {
  days: ActivityContributionDay[];
  onHover?: () => void;
}) {
  const t = useTranslations("V2ActivitiesPage.statsCard");

  return (
    <Link
      href="/activities/stats"
      aria-label={t("open")}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="tap-feedback group flex min-h-[132px] items-center overflow-hidden rounded-md p-2 hover:bg-accent/60"
    >
      <ActivityContributionHeatmap
        days={days}
        daysBack={ACTIVITY_STATS_PREVIEW_DAYS_BACK}
        variant="showcase"
        className="w-full"
      />
    </Link>
  );
}
