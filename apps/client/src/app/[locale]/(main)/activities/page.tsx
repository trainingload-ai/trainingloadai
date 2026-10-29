import { ActivitiesPageClient } from "./ActivitiesPageClient";
import {
  getActivityMetricSummaryServer,
  getActivityTimelineServer,
} from "./activities-data";
import { getActivityStatsPreviewRange } from "./activity-stats-preview-model";
import { V2_ACTIVITIES_FEED_PAGE_SIZE } from "./feed-config";

export default async function V2ActivitiesPage() {
  try {
    const statsPreviewRange = getActivityStatsPreviewRange();
    const [feed, initialStatsPreview] = await Promise.all([
      getActivityTimelineServer({
        limit: V2_ACTIVITIES_FEED_PAGE_SIZE,
      }),
      getActivityMetricSummaryServer("count", {
        start: statsPreviewRange.start,
        end: statsPreviewRange.end,
        mode: "range",
      }),
    ]);
    return (
      <ActivitiesPageClient
        initialItems={feed.items}
        initialNextCursor={feed.nextCursor}
        initialStatsPreview={initialStatsPreview}
        statsPreviewRange={statsPreviewRange}
      />
    );
  } catch (error) {
    console.error("[activities:page] server render failed", error);
    throw error;
  }
}
