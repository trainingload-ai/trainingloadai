"use client";

import { ArrowRight, Search } from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useActivityMetricSummary,
  type SummaryMetricResponse,
} from "@/api/charts";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  ActivityTimelineItem,
  V2ActivityListItem,
} from "@/api/v2-activities";
import { getActivityTimeline, warmV2ActivitiesFeed } from "@/api/v2-activities";
import { useTranslations } from "next-intl";
import { ActivityUploadCard } from "@/components/activities/ActivityUploadCard";
import { ActivitiesEmptyState } from "@/components/activities/ActivitiesEmptyState";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityFeedCard } from "./components/ActivityFeedCard";
import { ExternalActivityMirrorCard } from "./components/ExternalActivityMirrorCard";
import { ActivityStatsPreviewCard } from "./components/ActivitiesStats/ActivityStatsPreviewCard";
import {
  V2_ACTIVITIES_FEED_MAX_ITEMS,
  V2_ACTIVITIES_FEED_PAGE_SIZE,
} from "./feed-config";
import {
  buildActivityStatsPreviewDays,
  type ActivityStatsPreviewRange,
} from "./activity-stats-preview-model";
import { cn } from "@/lib/utils";
import { useSportCatalog } from "@/api/sports";
import {
  DEV_EXTERNAL_ACTIVITY_MIRROR,
  DEV_EXTERNAL_ACTIVITY_MIRROR_ID,
  injectDevelopmentActivityFixture,
  isDevActivityFeedFixture,
} from "./dev-activity-feed-fixture";

function ActivitiesMiniMapFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full animate-pulse rounded-md bg-neutral-200/70 dark:bg-muted/70"
    />
  );
}

const ActivitiesMiniMap = dynamic(
  () =>
    import("./ActivitiesMiniMap").then((module) => module.ActivitiesMiniMap),
  {
    ssr: false,
    loading: ActivitiesMiniMapFallback,
  },
);

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function getPageScrollElement() {
  if (typeof document === "undefined") return null;
  const mainScrollElement = Array.from(
    document.querySelectorAll<HTMLElement>("main"),
  ).find((element) => element.classList.contains("overflow-y-auto"));
  return mainScrollElement ?? document.documentElement;
}

function isNearBottom(element: HTMLElement, threshold = 80) {
  return (
    element.scrollTop + element.clientHeight >= element.scrollHeight - threshold
  );
}

function SectionTitle({
  title,
  action,
  onActionHover,
  className,
}: {
  title: string;
  action?: string;
  onActionHover?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action ? (
        <Link
          href="/activities/search"
          onMouseEnter={onActionHover}
          onFocus={onActionHover}
          className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function timelineItemKey(item: ActivityTimelineItem) {
  return item.kind === "activity"
    ? `activity:${item.activity.id}:${item.activity.hashId}`
    : `mirror:${item.mirror.id}`;
}

function appendUniqueTimelineItems(
  previous: ActivityTimelineItem[],
  next: ActivityTimelineItem[],
) {
  // cursor 正常不会重复；这里仅防刷新与并发请求交界处出现同一身份。
  const seen = new Set(previous.map(timelineItemKey));
  const merged = [...previous];
  for (const item of next) {
    const key = timelineItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function injectDevelopmentTimelineFixture(items: ActivityTimelineItem[]) {
  if (process.env.NODE_ENV !== "development") return items;
  const activities = items.flatMap((item) =>
    item.kind === "activity" ? [item.activity] : [],
  );
  const injected = injectDevelopmentActivityFixture(activities);
  const existingIds = new Set(activities.map((activity) => activity.id));
  const fixtures = injected
    .filter((activity) => !existingIds.has(activity.id))
    .map((activity) => ({ kind: "activity" as const, activity }));
  const mirrorFixtures = items.some(
    (item) =>
      item.kind === "external_activity_mirror" &&
      item.mirror.id === DEV_EXTERNAL_ACTIVITY_MIRROR_ID,
  )
    ? []
    : [
        {
          kind: "external_activity_mirror" as const,
          mirror: DEV_EXTERNAL_ACTIVITY_MIRROR,
        },
      ];
  return [...mirrorFixtures, ...fixtures, ...items];
}

export function ActivitiesPageClient({
  initialItems,
  initialNextCursor,
  initialStatsPreview,
  statsPreviewRange,
}: {
  initialItems: ActivityTimelineItem[];
  initialNextCursor: string | null;
  initialStatsPreview: SummaryMetricResponse;
  statsPreviewRange: ActivityStatsPreviewRange;
}) {
  // 活动页使用服务端首屏数据 + 客户端虚拟列表，滚到底部再按 cursor 增量加载。
  const t = useTranslations("V2ActivitiesPage");
  useSetPageTitle(t("feed.title"));
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: sportCatalog = [] } = useSportCatalog();
  const [items, setItems] = React.useState<ActivityTimelineItem[]>(() =>
    injectDevelopmentTimelineFixture(initialItems),
  );
  const [nextCursor, setNextCursor] = React.useState<string | null>(
    initialNextCursor,
  );
  const [isFetchingMore, setIsFetchingMore] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [pullReady, setPullReady] = React.useState(false);
  const touchStartYRef = React.useRef<number | null>(null);
  const searchPrefetchedRef = React.useRef(false);
  const statsPrefetchedRef = React.useRef(false);

  const activityListRef = React.useRef<HTMLDivElement>(null);
  const statsPreviewParams = React.useMemo(
    () => ({
      start: statsPreviewRange.start,
      end: statsPreviewRange.end,
      mode: "range" as const,
    }),
    [statsPreviewRange.end, statsPreviewRange.start],
  );
  const { data: statsPreviewData, refetch: refetchStatsPreview } =
    useActivityMetricSummary("count", statsPreviewParams, {
      initialData: initialStatsPreview,
    });
  const statsPreviewDays = React.useMemo(
    () => buildActivityStatsPreviewDays(statsPreviewData?.rows),
    [statsPreviewData?.rows],
  );
  const handleOpenActivity = React.useCallback(
    (hashId: string) => {
      if (!hashId) return;
      router.push(`/activities/${hashId}`);
    },
    [router],
  );
  const handleDeletedActivity = React.useCallback(
    (hashId: string) => {
      setItems((prev) =>
        prev.filter(
          (item) => item.kind !== "activity" || item.activity.hashId !== hashId,
        ),
      );
      void refetchStatsPreview().catch(() => undefined);
    },
    [refetchStatsPreview],
  );

  const handlePlanLinkChange = React.useCallback(
    (hashId: string, linked: V2ActivityListItem["linkedPlanWorkout"]) => {
      setItems((prev) =>
        prev.map((item) =>
          item.kind === "activity" && item.activity.hashId === hashId
            ? {
                ...item,
                activity: { ...item.activity, linkedPlanWorkout: linked },
              }
            : item,
        ),
      );
    },
    [],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => activityListRef.current,
    estimateSize: () => 162,
    overscan: 8,
    measureElement:
      typeof window !== "undefined" && "HTMLElement" in window
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });
  const virtualItems = virtualizer.getVirtualItems();

  const refreshFeed = React.useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [res] = await Promise.all([
        getActivityTimeline(
          {
            limit: V2_ACTIVITIES_FEED_PAGE_SIZE,
          },
          { forceRefresh: true },
        ),
        refetchStatsPreview().catch(() => undefined),
      ]);
      setItems(injectDevelopmentTimelineFixture(res.items));
      setNextCursor(res.nextCursor);
      if (isMobile) {
        getPageScrollElement()?.scrollTo({ top: 0 });
      } else {
        activityListRef.current?.scrollTo({ top: 0 });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isMobile, isRefreshing, refetchStatsPreview]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    if (items.length >= V2_ACTIVITIES_FEED_MAX_ITEMS) return;

    setIsFetchingMore(true);
    try {
      const res = await getActivityTimeline({
        cursor: nextCursor,
        limit: V2_ACTIVITIES_FEED_PAGE_SIZE,
      });
      setItems((prev) => {
        const merged = appendUniqueTimelineItems(prev, res.items);
        if (merged.length >= V2_ACTIVITIES_FEED_MAX_ITEMS) {
          setNextCursor(null);
          return merged.slice(0, V2_ACTIVITIES_FEED_MAX_ITEMS);
        }
        setNextCursor(res.nextCursor);
        return merged;
      });
    } finally {
      setIsFetchingMore(false);
    }
  }, [items.length, isFetchingMore, nextCursor]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const container = activityListRef.current;
    const scrollTop = isMobile
      ? (getPageScrollElement()?.scrollTop ?? 0)
      : (container?.scrollTop ?? 0);
    if (!container || scrollTop > 0 || isRefreshing) return;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const container = activityListRef.current;
    const scrollTop = isMobile
      ? (getPageScrollElement()?.scrollTop ?? 0)
      : (container?.scrollTop ?? 0);
    if (!container || scrollTop > 0) return;
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const currentY = event.touches[0]?.clientY ?? startY;
    const delta = currentY - startY;
    if (delta <= 0) return;
    const distance = Math.min(88, Math.floor(delta * 0.4));
    setPullDistance(distance);
    setPullReady(distance >= 56);
  };

  const handleTouchEnd = () => {
    if (!isMobile) {
      touchStartYRef.current = null;
      setPullDistance(0);
      setPullReady(false);
      return;
    }
    touchStartYRef.current = null;
    const shouldRefresh = pullReady;
    setPullDistance(0);
    setPullReady(false);
    if (shouldRefresh) {
      void refreshFeed();
    }
  };

  const handleListScroll = () => {
    const container = activityListRef.current;
    if (!container || !nextCursor || isFetchingMore) return;
    if (isNearBottom(container)) {
      void loadMore();
    }
  };

  React.useEffect(() => {
    if (!isMobile || !nextCursor || isFetchingMore) return;
    const scrollElement = getPageScrollElement();
    if (!scrollElement) return;
    const handlePageScroll = () => {
      if (isNearBottom(scrollElement, 240)) {
        void loadMore();
      }
    };
    scrollElement.addEventListener("scroll", handlePageScroll, {
      passive: true,
    });
    handlePageScroll();
    return () => scrollElement.removeEventListener("scroll", handlePageScroll);
  }, [isFetchingMore, isMobile, loadMore, nextCursor]);

  const prefetchSearchPage = React.useCallback(() => {
    if (searchPrefetchedRef.current) return;
    searchPrefetchedRef.current = true;
    router.prefetch("/activities/search");
    warmV2ActivitiesFeed({
      page: 1,
      perPage: V2_ACTIVITIES_FEED_PAGE_SIZE,
    });
  }, [router]);

  const prefetchStatsPage = React.useCallback(() => {
    if (statsPrefetchedRef.current) return;
    statsPrefetchedRef.current = true;
    router.prefetch("/activities/stats");
  }, [router]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const maybeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof maybeWindow.requestIdleCallback === "function") {
      const idleId = maybeWindow.requestIdleCallback(
        () => prefetchSearchPage(),
        { timeout: 1200 },
      );
      return () => maybeWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(prefetchSearchPage, 600);
    return () => window.clearTimeout(timer);
  }, [prefetchSearchPage]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <div
        className={cn(
          "flex flex-col gap-3 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start",
          // 显式命名区域，避免「先占 col-2 再占 col-1」时主栏被排到第二行
          "pc:[grid-template-areas:'main_aside']",
        )}
      >
        {/* 桌面端：右侧一栏内纵向堆叠（地图 + 导入卡片），只占 grid 一列，避免多格 row 错位 */}
        <aside
          className={cn(
            "order-1 flex min-w-0 flex-col gap-3 pc:order-none",
            "pc:[grid-area:aside]",
          )}
        >
          <Panel className="overflow-hidden">
            <div className="overflow-hidden">
              <Link
                href="/map"
                className="group block h-[200px] overflow-hidden rounded-md bg-neutral-100 p-0 transition-colors hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted pc:p-3"
              >
                <div className="mb-2 hidden items-center justify-between pc:flex">
                  <p className="text-mobile-caption pc:text-xs text-muted-foreground">
                    {t("map.description")}
                  </p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="relative h-[200px] rounded-md bg-background/80 dark:bg-background/40 pc:h-[150px]">
                  <ActivitiesMiniMap />
                </div>
              </Link>
            </div>
          </Panel>

          <Panel>
            <ActivityStatsPreviewCard
              days={statsPreviewDays}
              onHover={prefetchStatsPage}
            />
          </Panel>

          <div id="import" className="scroll-mt-20">
            <Panel>
              {/* 屏蔽标题 */}
              {/* <SectionTitle title={t("import.title")} /> */}
              <ActivityUploadCard
                cardTitle={t("import.cardTitle")}
                description={t("import.description")}
                buttonLabel={t("import.selectFile")}
                onUploaded={() => void refreshFeed()}
              />
            </Panel>
          </div>
        </aside>

        <main
          className={cn(
            "order-3 flex min-w-0 flex-col gap-4 pc:order-none",
            "pc:[grid-area:main] pc:min-h-0",
          )}
        >
          <Panel>
            <Link
              href="/activities/search"
              onMouseEnter={prefetchSearchPage}
              onFocus={prefetchSearchPage}
              className="flex items-center gap-2 rounded-md bg-neutral-100 dark:bg-muted/45 px-3 py-2.5 transition-colors hover:bg-neutral-200 dark:hover:bg-muted"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("searchEntry")}
              </span>
            </Link>
          </Panel>

          <Panel>
            <SectionTitle
              title={t("feed.title")}
              action={t("feed.filter")}
              onActionHover={prefetchSearchPage}
              className="pb-2"
            />
            {items.length === 0 ? (
              <ActivitiesEmptyState
                title={t("empty.title")}
                description={t("empty.description")}
                uploadCardTitle={t("import.cardTitle")}
                uploadDescription={t("import.description")}
                uploadButtonLabel={t("import.selectFile")}
                onUploaded={() => void refreshFeed()}
              />
            ) : (
              <div
                ref={activityListRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onScroll={isMobile ? undefined : handleListScroll}
                className={cn(
                  isMobile ? "space-y-2" : "h-[640px] overflow-y-auto pr-1",
                )}
              >
                <div
                  className="flex h-0 items-end justify-center text-mobile-caption pc:text-[11px] text-muted-foreground transition-all"
                  style={{ height: pullDistance > 0 ? `${pullDistance}px` : 0 }}
                >
                  {isRefreshing
                    ? t("feed.refreshing")
                    : pullReady
                      ? t("feed.releaseToRefresh")
                      : t("feed.pullToRefresh")}
                </div>
                {isMobile ? (
                  <div className="space-y-2">
                    {items.map((item) =>
                      item.kind === "external_activity_mirror" ? (
                        <ExternalActivityMirrorCard
                          key={`mirror-${item.mirror.id}`}
                          mirror={item.mirror}
                          t={t}
                          onRetried={() => void refreshFeed()}
                        />
                      ) : (
                        <div key={`activity-${item.activity.id}`}>
                          <ActivityFeedCard
                            sportCatalog={sportCatalog}
                            activity={item.activity}
                            t={t}
                            previewOnly={isDevActivityFeedFixture(
                              item.activity,
                            )}
                            onOpen={handleOpenActivity}
                            onDeleted={handleDeletedActivity}
                            onPlanLinkChange={handlePlanLinkChange}
                          />
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div
                    className="relative w-full"
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                  >
                    {virtualItems.map((vi) => {
                      const item = items[vi.index];
                      if (!item) return null;
                      return (
                        <div
                          key={
                            item.kind === "activity"
                              ? `activity-${item.activity.id}`
                              : `mirror-${item.mirror.id}`
                          }
                          data-index={vi.index}
                          ref={virtualizer.measureElement}
                          className="absolute left-0 top-0 w-full pb-2"
                          style={{ transform: `translateY(${vi.start}px)` }}
                        >
                          {item.kind === "external_activity_mirror" ? (
                            <ExternalActivityMirrorCard
                              mirror={item.mirror}
                              t={t}
                              onRetried={() => void refreshFeed()}
                            />
                          ) : (
                            <ActivityFeedCard
                              sportCatalog={sportCatalog}
                              activity={item.activity}
                              t={t}
                              previewOnly={isDevActivityFeedFixture(
                                item.activity,
                              )}
                              onOpen={handleOpenActivity}
                              onDeleted={handleDeletedActivity}
                              onPlanLinkChange={handlePlanLinkChange}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {isFetchingMore ? (
                  <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                    {t("feed.loadingMore")}
                  </div>
                ) : !nextCursor && items.length > 0 ? (
                  <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                    {t("feed.noMore")}
                  </div>
                ) : null}
              </div>
            )}
          </Panel>
        </main>
      </div>
    </div>
  );
}
