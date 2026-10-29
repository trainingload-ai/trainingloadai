"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { getLoginHrefWithCallback } from "@/lib/auth-callback";
import { resolveUserDisplayTimezone } from "@/lib/user-timezone";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  fetchCoachSessionsPage,
  type CoachSessionListItem,
} from "@/api/ai-coach";
import { useAiDataConsent } from "@/api/ai-data-consent";
import { AiDataConsentPrompt } from "@/components/ai-consent/AiDataConsentPrompt";
import { Button } from "@/components/ui/button";
import {
  formatReviewSessionListPrimaryLine,
  type ReviewScope,
} from "./coach-review-session-meta";
import { getCoachHistoryLineText } from "./coach-history-list-model";
import { queryKeys } from "@/lib/query-keys";

const PAGE_TAKE = 25;

/** 列表行卡片固定高度（与 estimate 一致；line-clamp-2 + 双行主信息） */
const REVIEW_LIST_ROW_HEIGHT_PX = 92;
/** 行间间距 */
const REVIEW_LIST_ROW_GAP_PX = 12;

function listTypeToScope(type: string | null): ReviewScope | null {
  if (type === "day") return "daily";
  if (type === "week") return "weekly";
  if (type === "month") return "monthly";
  return null;
}

export function CoachReviewSessionsListPage() {
  const t = useTranslations("AiCoachPage.reviews");
  const tHist = useTranslations("AiCoachPage.history");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const scope = listTypeToScope(typeParam);

  const { data: authSession } = useViewerSession();
  const consent = useAiDataConsent({ enabled: Boolean(authSession?.user?.id) });
  const hasAiDataConsent = consent.data?.granted === true;
  const { data: profile } = useUserProfile();
  const userTimeZone = useMemo(
    () => resolveUserDisplayTimezone(profile?.timezone),
    [profile?.timezone],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullReady, setPullReady] = useState(false);
  const touchStartYRef = useRef<number | null>(null);

  const sectionTitle = useMemo(() => {
    if (scope === "daily") return t("daily");
    if (scope === "weekly") return t("weekly");
    if (scope === "monthly") return t("monthly");
    return t("title");
  }, [scope, t]);

  useEffect(() => {
    const prev = document.title;
    if (scope) {
      document.title = `${sectionTitle} — ${t("title")}`;
    }
    return () => {
      document.title = prev;
    };
  }, [scope, sectionTitle, t]);

  const infinite = useInfiniteQuery({
    queryKey: queryKeys.aiCoach.reviewSessionsInfinite(scope),
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      if (!scope) {
        return { items: [] as CoachSessionListItem[], nextOffset: null };
      }
      const page = await fetchCoachSessionsPage(
        pageParam,
        PAGE_TAKE,
        "review",
        scope,
      );
      return page ?? { items: [], nextOffset: null };
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.nextOffset != null ? last.nextOffset : undefined,
    enabled: Boolean(
      authSession?.user?.id &&
      !consent.isLoading &&
      hasAiDataConsent &&
      scope,
    ),
  });

  const sessions = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.items) ?? [],
    [infinite.data?.pages],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scope]);

  const rowStride = REVIEW_LIST_ROW_HEIGHT_PX + REVIEW_LIST_ROW_GAP_PX;

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      index < sessions.length - 1 ? rowStride : REVIEW_LIST_ROW_HEIGHT_PX,
    overscan: 8,
  });

  const handleRefresh = useCallback(async () => {
    if (!scope || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.resetQueries({
        queryKey: queryKeys.aiCoach.reviewSessionsInfinite(scope),
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.aiCoach.reviewSessionsHub(scope),
        exact: true,
      });
      scrollRef.current?.scrollTo({ top: 0 });
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, queryClient, scope]);

  const fetchNextPage = infinite.fetchNextPage;
  const hasNextPage = infinite.hasNextPage;
  const isFetchingNextPage = infinite.isFetchingNextPage;

  const handleListScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 80;
    if (nearBottom && hasNextPage && !isFetchingNextPage && !isRefreshing) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isRefreshing]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container || container.scrollTop > 0 || isRefreshing) return;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container || container.scrollTop > 0) return;
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
    touchStartYRef.current = null;
    const shouldRefresh = pullReady;
    setPullDistance(0);
    setPullReady(false);
    if (shouldRefresh) {
      void handleRefresh();
    }
  };

  if (!authSession?.user?.id) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
        <p>{tHist("loginToView")}</p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={getLoginHrefWithCallback()}>{tHist("goSignIn")}</Link>
        </Button>
      </div>
    );
  }

  if (!scope) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">{t("listInvalidType")}</p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/ai-coach">{t("listBack")}</Link>
        </Button>
      </div>
    );
  }

  if (!consent.isLoading && !hasAiDataConsent) {
    return (
      <div className="grid min-h-[40vh] place-items-center p-4">
        <AiDataConsentPrompt source="COACH" className="w-full max-w-lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-2 sm:px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          asChild
        >
          <Link href="/ai-coach" aria-label={t("listBack")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground">
          {sectionTitle}
        </h1>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleListScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto w-full max-w-lg px-3 py-3 sm:max-w-2xl sm:px-5">
          {infinite.isPending && sessions.length === 0 ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <LoaderCircle className="h-7 w-7 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <>
              <div
                className="flex w-full shrink-0 items-center justify-center overflow-hidden text-mobile-caption pc:text-[11px] text-muted-foreground transition-[height] duration-150 ease-out"
                style={{
                  height: isRefreshing
                    ? 32
                    : pullDistance > 0
                      ? pullDistance
                      : 0,
                }}
              >
                {(pullDistance > 0 || isRefreshing) && (
                  <span className="line-clamp-1 px-1 text-center">
                    {isRefreshing
                      ? t("listRefreshing")
                      : pullReady
                        ? t("listReleaseToRefresh")
                        : t("listPullToRefresh")}
                  </span>
                )}
              </div>
              <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const session = sessions[vi.index];
                  if (!session) return null;
                  const primary = formatReviewSessionListPrimaryLine(
                    scope,
                    session,
                    locale,
                    userTimeZone,
                  );
                  const preview = getCoachHistoryLineText(
                    session,
                    tHist("untitled"),
                  );
                  const isLast = vi.index >= sessions.length - 1;
                  return (
                    <div
                      key={session.id}
                      className="absolute left-0 top-0 box-border w-full"
                      style={{
                        height: isLast ? REVIEW_LIST_ROW_HEIGHT_PX : rowStride,
                        transform: `translateY(${vi.start}px)`,
                      }}
                    >
                      <Link
                        href={`/ai-coach?sid=${encodeURIComponent(session.id)}`}
                        className={cn(
                          "flex flex-col justify-center rounded-lg border border-border/60 bg-background px-3 py-2.5 transition-[background-color,box-shadow]",
                          "hover:bg-neutral-100 dark:hover:bg-muted/40",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        )}
                        style={{
                          height: REVIEW_LIST_ROW_HEIGHT_PX,
                          marginBottom: isLast ? 0 : REVIEW_LIST_ROW_GAP_PX,
                        }}
                      >
                        <div className="line-clamp-1 text-sm font-medium text-foreground">
                          {primary}
                        </div>
                        <div className="mt-1 line-clamp-2 text-mobile-caption pc:text-xs leading-snug text-muted-foreground">
                          {preview}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
              {infinite.isFetchingNextPage ? (
                <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                  <LoaderCircle className="mx-auto mb-1 h-4 w-4 animate-spin" />
                  {t("listLoadingMore")}
                </div>
              ) : !infinite.hasNextPage && sessions.length > 0 ? (
                <div className="py-3 text-center text-mobile-caption pc:text-[11px] text-muted-foreground">
                  {t("listNoMore")}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
