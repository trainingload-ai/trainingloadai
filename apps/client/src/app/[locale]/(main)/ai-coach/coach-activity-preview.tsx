"use client";

import { useTranslations } from "next-intl";
import type { CoachActivityView } from "@shared/ai-coach-schema";
import { getActivityDetailState } from "@shared/activity-detail";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useGetActivity } from "@/hooks/useActivities";
import { ActivityDetailIdContext } from "@/hooks/useActivityId";
import { classifyApiError } from "@/lib/api-error";
import type { ActivityDetailSection } from "@/lib/activity-detail-policy";
import { ActivityHeader } from "../activities/[activityId]/components/ActivityHeader";
import { ActivityDetailContent } from "../activities/[activityId]/components/common-activity";

export type CoachActivityPreviewView = Omit<CoachActivityView, "section"> & {
  section: ActivityDetailSection;
};

export function CoachActivityPreview({
  view,
  onSectionChange,
}: {
  view: CoachActivityPreviewView;
  onSectionChange: (section: ActivityDetailSection) => void;
}) {
  const t = useTranslations();
  const { hashId, section, focus } = view;
  const query = useGetActivity(hashId);
  const activity = query.data;
  if (query.isPending) return <p role="status">{t("ActivityDetail.loading")}</p>;
  if (query.isError || !activity) {
    const unavailable = ["permission", "not-found", "authentication"].includes(
      classifyApiError(query.error),
    );
    return (
      <div className="space-y-2 p-3">
        <p role="status">{t(unavailable ? "Overview.noData" : "ActivityTimeline.error")}</p>
        {!unavailable ? (
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t("ActivityTimeline.retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  const state = getActivityDetailState(activity);
  const navigation = (
    <div className="flex justify-end">
      <Button asChild size="sm" variant="ghost">
        <Link href={`/activities/${hashId}`}>
          {t("MobileCalendarTimeline.viewFullActivity")}
        </Link>
      </Button>
    </div>
  );

  return (
    <ActivityDetailIdContext.Provider value={hashId}>
      {state.canShowEnhancedDetail ? (
        <ActivityDetailContent
          activity={activity}
          activityId={hashId}
          navigation={navigation}
          preview={{ section, onSectionChange, focus }}
        />
      ) : (
        <div className="space-y-3">
          {navigation}
          <ActivityHeader activity={activity} />
          <div role="status" className="space-y-1 rounded-md bg-muted p-3">
            <p className="text-sm font-medium">
              {t(state.failed ? "ActivityDetail.processing.failedTitle" : "ActivityDetail.processing.title")}
            </p>
            <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
              {t("ActivityTimeline.retry")}
            </Button>
          </div>
        </div>
      )}
    </ActivityDetailIdContext.Provider>
  );
}
