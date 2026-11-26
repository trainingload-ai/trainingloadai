"use client";

import { useTranslations } from "next-intl";
import type { CoachActivityView } from "@shared/ai-coach-schema";
import { getActivityDetailState } from "@shared/activity-detail";
import { Button } from "@/components/ui/button";
import { useGetActivity } from "@/hooks/useActivities";
import { ActivityDetailIdContext } from "@/hooks/useActivityId";
import type { ActivityDetailSection } from "@/lib/activity-detail-policy";
import { ActivityHeader } from "../activities/[activityId]/components/ActivityHeader";
import { ActivityDetailContent } from "../activities/[activityId]/components/common-activity";
import { LoadErrorState } from "@/components/ui/load-error-state";

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
  const query = useGetActivity(hashId, { errorSurface: "inline" });
  if (query.isError) return <LoadErrorState retrying={query.isFetching}
    onRetry={() => void query.refetch({ cancelRefetch: false })} />;
  if (query.isPending) return (
    <p className="grid min-h-80 place-items-center text-sm text-muted-foreground">
      {t("ActivityDetail.loading")}
    </p>
  );

  const activity = query.data;
  const state = getActivityDetailState(activity);
  return (
    <ActivityDetailIdContext.Provider value={hashId}>
      {state.canShowEnhancedDetail ? (
        <ActivityDetailContent
          activity={activity}
          activityId={hashId}
          preview={{ section, onSectionChange, focus }}
        />
      ) : (
        <div className="space-y-3">
          <ActivityHeader activity={activity} readOnly />
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
