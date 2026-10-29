"use client";

import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getV2ActivitiesFeed,
  type V2ActivitiesFeedQuery,
  type V2ActivityListItem,
} from "@/api/v2-activities";
import { ActivitiesEmptyState } from "@/components/activities/ActivitiesEmptyState";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { MOBILE_MEDIA_QUERY, useIsMobile } from "@/hooks/use-mobile";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { V2_ACTIVITIES_FEED_PAGE_SIZE } from "../feed-config";
import { useSportCatalog } from "@/api/sports";

type QuickFilterId = "recent7d" | "recent30d" | "run" | "cycling" | "swim";

const quickFilters: QuickFilterId[] = [
  "recent7d",
  "recent30d",
  "run",
  "cycling",
  "swim",
];

function appendUniqueActivities(
  previous: V2ActivityListItem[],
  next: V2ActivityListItem[],
) {
  const seen = new Set(previous.map((item) => `${item.id}:${item.hashId}`));
  const merged = [...previous];
  for (const item of next) {
    const key = `${item.id}:${item.hashId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
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

function shouldUsePageScroll() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function quickFilterToQuery(item: QuickFilterId): {
  sportType?: string;
  startDate?: string;
  endDate?: string;
} {
  const today = new Date();
  const endDate = formatLocalDate(today);
  if (item === "recent7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return {
      startDate: formatLocalDate(start),
      endDate,
    };
  }
  if (item === "recent30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return {
      startDate: formatLocalDate(start),
      endDate,
    };
  }
  if (item === "run") return { sportType: "RUN" };
  if (item === "cycling") return { sportType: "CYCLING" };
  if (item === "swim") return { sportType: "SWIM" };
  return {};
}

function getFirstSearchValue(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && value.trim().length > 0 ? value : undefined;
}

function buildQueryFromSearchParams(
  params: URLSearchParams,
): Omit<V2ActivitiesFeedQuery, "page" | "perPage"> {
  return {
    sportType: getFirstSearchValue(params, "sportType") as
      | "RUN"
      | "CYCLING"
      | "SWIM"
      | "UNKNOWN"
      | "ALL"
      | undefined,
    provider: getFirstSearchValue(params, "provider"),
    startDate: getFirstSearchValue(params, "startDate"),
    endDate: getFirstSearchValue(params, "endDate"),
    minDuration: getFirstSearchValue(params, "minDuration"),
    maxDuration: getFirstSearchValue(params, "maxDuration"),
    minDistance: getFirstSearchValue(params, "minDistance"),
    maxDistance: getFirstSearchValue(params, "maxDistance"),
    orderBy: getFirstSearchValue(params, "orderBy"),
    orderDirection: getFirstSearchValue(params, "orderDirection") as
      | "asc"
      | "desc"
      | undefined,
  };
}

function appendFilterQueryParams(
  params: URLSearchParams,
  query: Omit<V2ActivitiesFeedQuery, "page" | "perPage">,
) {
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  if (query.minDuration) params.set("minDuration", query.minDuration);
  if (query.maxDuration) params.set("maxDuration", query.maxDuration);
  if (query.minDistance) params.set("minDistance", query.minDistance);
  if (query.maxDistance) params.set("maxDistance", query.maxDistance);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.orderDirection) params.set("orderDirection", query.orderDirection);
  if (query.provider) params.set("provider", query.provider);
}

function detectActiveQuickFilter(
  query: Omit<V2ActivitiesFeedQuery, "page" | "perPage">,
): QuickFilterId | null {
  if (query.sportType === "RUN") return "run";
  if (query.sportType === "CYCLING") return "cycling";
  if (query.sportType === "SWIM") return "swim";

  const today = new Date();
  const end = formatLocalDate(today);
  if (query.endDate === end && query.startDate) {
    const d7 = new Date(today);
    d7.setDate(d7.getDate() - 6);
    if (query.startDate === formatLocalDate(d7)) return "recent7d";

    const d30 = new Date(today);
    d30.setDate(d30.getDate() - 29);
    if (query.startDate === formatLocalDate(d30)) return "recent30d";
  }

  return null;
}

export function ActivitiesSearchPageClient() {
  const { data: sportCatalog = [] } = useSportCatalog();
  const t = useTranslations("V2ActivitiesSearchPage");
  const tCard = useTranslations("V2ActivitiesPage");
  useSetPageTitle(t("feed.title"));
  const router = useRouter();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const queryModel = React.useMemo(
    () => buildQueryFromSearchParams(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );
  const [items, setItems] = React.useState<V2ActivityListItem[]>([]);
  const [nextPage, setNextPage] = React.useState<number | null>(null);
  const [total, setTotal] = React.useState(0);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isFetchingMore, setIsFetchingMore] = React.useState(false);
  const [isFilterSwitching, setIsFilterSwitching] = React.useState(false);
  const [listHeight, setListHeight] = React.useState(560);
  const activityListRef = React.useRef<HTMLDivElement>(null);
  const handleOpenActivity = React.useCallback(
    (hashId: string) => {
      if (!hashId) return;
      router.push(`/activities/${hashId}`);
    },
    [router],
  );
  const handleDeletedActivity = React.useCallback((hashId: string) => {
    setItems((prev) => prev.filter((item) => item.hashId !== hashId));
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);
  const handlePlanLinkChange = React.useCallback(
    (hashId: string, linked: V2ActivityListItem["linkedPlanWorkout"]) => {
      setItems((prev) =>
        prev.map((item) =>
          item.hashId === hashId
            ? { ...item, linkedPlanWorkout: linked }
            : item,
        ),
      );
    },
    [],
  );
  const activeQuickFilter = React.useMemo(
    () => detectActiveQuickFilter(queryModel),
    [queryModel],
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

  React.useEffect(() => {
    let cancelled = false;
    setIsInitialLoading(true);
    setIsFetchingMore(false);
    void getV2ActivitiesFeed({
      ...queryModel,
      page: 1,
      perPage: V2_ACTIVITIES_FEED_PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setNextPage(res.nextPage);
        setTotal(res.summary.count);
        if (shouldUsePageScroll()) {
          getPageScrollElement()?.scrollTo({ top: 0 });
        } else {
          activityListRef.current?.scrollTo({ top: 0 });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitialLoading(false);
          setIsFilterSwitching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queryModel]);

  const loadMore = React.useCallback(async () => {
    if (isInitialLoading || !nextPage || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await getV2ActivitiesFeed({
        ...queryModel,
        page: nextPage,
        perPage: V2_ACTIVITIES_FEED_PAGE_SIZE,
      });
      setItems((prev) => appendUniqueActivities(prev, res.items));
      setNextPage(res.nextPage);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, isInitialLoading, nextPage, queryModel]);

  const handleListScroll = React.useCallback(() => {
    const container = activityListRef.current;
    if (!container) return;
    if (isNearBottom(container)) {
      void loadMore();
    }
  }, [loadMore]);

  const updateListHeight = React.useCallback(() => {
    if (isMobile) return;
    const container = activityListRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight;
    const bottomGap = 66;
    const nextHeight = Math.max(
      320,
      Math.floor(viewportHeight - top - bottomGap),
    );
    setListHeight(nextHeight);
  }, [isMobile]);

  React.useEffect(() => {
    if (typeof window === "undefined" || isMobile) return;
    const raf = window.requestAnimationFrame(updateListHeight);
    const onResize = () => updateListHeight();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [isMobile, updateListHeight]);

  React.useEffect(() => {
    if (isMobile || isInitialLoading || items.length === 0) return;
    const raf = window.requestAnimationFrame(updateListHeight);
    return () => window.cancelAnimationFrame(raf);
  }, [
    isInitialLoading,
    isMobile,
    items.length,
    isFilterSwitching,
    updateListHeight,
  ]);

  React.useEffect(() => {
    if (!isMobile || isInitialLoading || !nextPage || isFetchingMore) return;
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
  }, [isFetchingMore, isInitialLoading, isMobile, loadMore, nextPage]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3">
      <header className="hidden items-center justify-between gap-3 pc:flex">
        <Link
          href="/activities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
      </header>

      <section>
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                const nextFilter = activeQuickFilter === item ? null : item;
                setIsFilterSwitching(true);
                const params = new URLSearchParams();
                appendFilterQueryParams(params, queryModel);
                params.delete("sportType");
                params.delete("startDate");
                params.delete("endDate");
                if (nextFilter) {
                  const mapped = quickFilterToQuery(nextFilter);
                  if (mapped.sportType)
                    params.set("sportType", mapped.sportType);
                  if (mapped.startDate)
                    params.set("startDate", mapped.startDate);
                  if (mapped.endDate) params.set("endDate", mapped.endDate);
                }
                const qs = params.toString();
                router.push(
                  qs ? `/activities/search?${qs}` : "/activities/search",
                );
              }}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 text-mobile-caption pc:text-xs transition-colors ${
                activeQuickFilter === item
                  ? "bg-foreground text-background"
                  : "bg-neutral-200/45 dark:bg-muted/45 text-muted-foreground hover:bg-neutral-200 dark:hover:bg-muted"
              }`}
            >
              {t(`quickFilters.${item}`)}
            </button>
          ))}
        </div>
        {isFilterSwitching ? (
          <div className="mt-2 text-mobile-caption pc:text-[11px] text-muted-foreground">
            {t("feed.filtering")}
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("feed.title")}</h2>
          <span className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("feed.total", { count: total })}
          </span>
        </div>
        {isInitialLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("feed.loadingMore")}
          </div>
        ) : items.length === 0 ? (
          <ActivitiesEmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            uploadCardTitle={t("upload.cardTitle")}
            uploadDescription={t("upload.description")}
            uploadButtonLabel={t("upload.selectFile")}
          />
        ) : (
          <div
            ref={activityListRef}
            onScroll={isMobile ? undefined : handleListScroll}
            className={isMobile ? "space-y-2" : "overflow-y-auto pr-1"}
            style={isMobile ? undefined : { height: `${listHeight}px` }}
          >
            {isMobile ? (
              <div className="space-y-2">
                {items.map((activity) => (
                  <div key={activity.id}>
                    <ActivityFeedCard
                      sportCatalog={sportCatalog}
                      activity={activity}
                      t={tCard}
                      onOpen={handleOpenActivity}
                      onDeleted={handleDeletedActivity}
                      onPlanLinkChange={handlePlanLinkChange}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((vi) => {
                  const activity = items[vi.index];
                  if (!activity) return null;
                  return (
                    <div
                      key={activity.id}
                      data-index={vi.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 top-0 w-full pb-2"
                      style={{ transform: `translateY(${vi.start}px)` }}
                    >
                      <ActivityFeedCard
                        sportCatalog={sportCatalog}
                        activity={activity}
                        t={tCard}
                        onOpen={handleOpenActivity}
                        onDeleted={handleDeletedActivity}
                        onPlanLinkChange={handlePlanLinkChange}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {isFetchingMore ? (
              <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                {t("feed.loadingMore")}
              </div>
            ) : !nextPage && items.length > 0 ? (
              <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                {t("feed.noMore")}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
