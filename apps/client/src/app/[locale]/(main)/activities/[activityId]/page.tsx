"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useActivityId } from "@/hooks/useActivityId";
import { useGetActivity } from "@/hooks/useActivities";
import { useMobileViewport } from "@/hooks/use-mobile";
import {
  ActivityProcessingStatus,
  SportType,
  type Activity,
} from "@/api/activities";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { AlertCircle, ArrowLeft, BellRing, Loader2 } from "lucide-react";
import { getActivityDetailState } from "@shared/activity-detail";
import { ActivityHeader } from "./components/ActivityHeader";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import {
  toAnalyticsActivityType,
  trackProductFunnelEvent,
} from "@deployment/managed-ui";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

const CommonActivityDetail = dynamic(
  () => import("./components/common-activity"),
);
const SwimActivityDetail = dynamic(() => import("./components/swim-activity"));
const MobileActivityDetailPageContent = dynamic(
  () =>
    import(
      "@/app/[locale]/(main)/calendar/components/MobileActivityDetailSheetContent"
    ).then((module) => module.MobileActivityDetailSheetContent),
  {
    ssr: false,
    loading: () => <ActivityDetailLoading />,
  },
);

function ActivityDetailLoading() {
  const t = useTranslations("ActivityDetail");
  return (
    <div className="flex min-h-[55dvh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-foreground" />
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  );
}

function ProcessingPlaceholder({
  title,
  description,
  statusLabel,
  statusValue,
  note,
  activity,
  failed = false,
}: {
  title: string;
  description: string;
  statusLabel: string;
  statusValue: string;
  note: string;
  activity: Activity;
  failed?: boolean;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-4">
      <div className="w-full space-y-4 rounded-2xl border bg-card p-6 md:p-8">
        <div className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/activities")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        <ActivityHeader activity={activity} />

        <div className="space-y-4 border-t pt-4">
          <div className="flex items-start gap-3">
            {failed ? (
              <AlertCircle className="mt-0.5 h-6 w-6 text-red-600" />
            ) : (
              <div className="relative mt-0.5">
                <BellRing className="h-6 w-6 text-blue-600" />
                <Loader2 className="absolute -right-1 -top-1 h-3.5 w-3.5 animate-spin text-blue-500" />
              </div>
            )}
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="rounded-md border bg-neutral-100 dark:bg-muted/45 p-4">
            <div className="text-mobile-caption pc:text-xs text-muted-foreground">{statusLabel}</div>
            <div className="mt-1 text-sm font-medium">{statusValue}</div>
          </div>

          <div
            className={
              failed
                ? "rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-300"
                : "rounded-md border bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-950/40 dark:bg-blue-950/20 dark:text-blue-300"
            }
          >
            {note}
          </div>
        </div>
      </div>
    </div>
  );
}

const ActivityDetailPage = () => {
  const activityId = useActivityId();
  const { data: activity, isLoading } = useGetActivity(activityId || "");
  const t = useTranslations("ActivityDetail");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tMobile = useTranslations("MobileCalendarTimeline");
  const isMobile = useMobileViewport();
  const analysisTrackedRef = React.useRef(false);
  useMobileNavigation({
    title: tMobile("activityDetail"),
    backHref: "/activities",
  });
  const activityDisplayTitle = getLocalizedActivityTitle(
    activity,
    tActivityTitle,
    t("title"),
  );
  useEffect(() => {
    if (isLoading) {
      document.title = t("loading");
      return;
    }
    document.title = activityDisplayTitle;
  }, [activityDisplayTitle, isLoading, t]);
  const detailState = activity ? getActivityDetailState(activity) : null;
  const isReady = Boolean(detailState?.canShowEnhancedDetail);

  useEffect(() => {
    if (!activity || !isReady || analysisTrackedRef.current) return;
    analysisTrackedRef.current = true;
    trackProductFunnelEvent("analysis_viewed", {
      activity_type: toAnalyticsActivityType(activity.sportType),
      analysis_type: "activity",
    });
  }, [activity, isReady]);
  // 加载态
  if (isLoading || isMobile === undefined) {
    return <ActivityDetailLoading />;
  }

  // 无效路由或无数据
  if (!activityId || !activity) {
    notFound();
  }

  if (isMobile) {
    return <MobileActivityDetailPageContent previewActivity={activity} />;
  }

  // Activity existence was validated above; the state was derived before the
  // tracking effect so hooks remain unconditional.
  if (!detailState) notFound();
  const processingStatus = Object.values(ActivityProcessingStatus).includes(
    detailState.status as ActivityProcessingStatus,
  )
    ? (detailState.status as ActivityProcessingStatus)
    : ActivityProcessingStatus.RECEIVED;
  const isFailed = detailState.failed;

  if (!isReady) {
    return (
      <ProcessingPlaceholder
        title={
          isFailed ? t("processing.failedTitle") : t("processing.title")
        }
        description={
          isFailed
            ? t("processing.failedDescription")
            : t("processing.description")
        }
        statusLabel={t("processing.currentStatus")}
        statusValue={t(`processing.status.${processingStatus}`)}
        note={
          isFailed ? t("processing.failedNote") : t("processing.pendingNote")
        }
        activity={activity}
        failed={isFailed}
      />
    );
  }

  const sportType = (activity.sportType as SportType) || "UNKNOWN";

  // 根据类型渲染不同详情
  if (sportType === SportType.SWIM) {
    return <SwimActivityDetail />;
  }
  return <CommonActivityDetail />;
};

export default ActivityDetailPage;
