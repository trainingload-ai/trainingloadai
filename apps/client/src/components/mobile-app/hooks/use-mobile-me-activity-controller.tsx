"use client";

import dayjs from "dayjs";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  getV2ActivitiesFeed,
  type V2ActivitiesFeedQuery,
  type V2ActivityListItem,
} from "@/api/v2-activities";
import { useMobileViewport } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

import { MobileSheet } from "../components/MobileSheet";
import type {
  MobileMeLayout,
  MobileMeMetric,
  MobileMeRange,
} from "../models/mobile-me-model";
import type { MobileMeSport } from "../models/mobile-me-dashboard-model";
import { deleteMobileMeActivity } from "../services/mobile-me-activity-service";

export type MobileMeActivityController = {
  endDate: string;
  feedError: unknown;
  feedItems: V2ActivityListItem[];
  feedLoading: boolean;
  fetchNextPage: () => Promise<unknown>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  layout: MobileMeLayout;
  metric: MobileMeMetric;
  overviewError: unknown;
  overviewItems: V2ActivityListItem[];
  overviewLoading: boolean;
  refresh: () => Promise<unknown>;
  requestDelete: (activity: V2ActivityListItem) => void;
  requestDeleteMenu: (activity: V2ActivityListItem) => void;
  setLayout: (layout: MobileMeLayout) => void;
  setMetric: (metric: MobileMeMetric) => void;
  setSport: (sport: MobileMeSport) => void;
  setWeeks: (weeks: MobileMeRange) => void;
  sport: MobileMeSport;
  startDate: string;
  weeks: MobileMeRange;
};

const MobileMeActivityContext =
  createContext<MobileMeActivityController | null>(null);

export function MobileMeActivityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("MobileApp.meDashboard");
  const tActivityTitle = useTranslations("ActivityTitle");
  const isMobile = useMobileViewport();
  const [weeks, setWeeks] = useState<MobileMeRange>(4);
  const [metric, setMetric] = useState<MobileMeMetric>("count");
  const [sport, setSport] = useState<MobileMeSport>("ALL");
  const [layout, setLayout] = useState<MobileMeLayout>("masonry");
  const [deleteTarget, setDeleteTarget] = useState<V2ActivityListItem | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const startDate = dayjs()
    .subtract(weeks * 7 - 1, "day")
    .format("YYYY-MM-DD");
  const endDate = dayjs().format("YYYY-MM-DD");
  const baseQuery: V2ActivitiesFeedQuery = {
    startDate,
    endDate,
    sportType: sport,
    orderBy: "startTime",
    orderDirection: "desc",
  };
  const overview = useQuery({
    queryKey: ["mobile-me-activity-overview", weeks, sport],
    queryFn: () => getV2ActivitiesFeed({ ...baseQuery, page: 1, perPage: 80 }),
    enabled: isMobile === true,
  });
  const feed = useInfiniteQuery({
    queryKey: ["mobile-me-activity-feed", weeks, sport],
    queryFn: ({ pageParam }) =>
      getV2ActivitiesFeed({
        ...baseQuery,
        page: pageParam,
        perPage: 10,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: isMobile === true,
  });
  const overviewItems = overview.data?.items ?? [];
  const feedItems = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data?.pages],
  );
  const requestDelete = useCallback((activity: V2ActivityListItem) => {
    setDeleteTarget(activity);
    setDeleteConfirmOpen(true);
  }, []);
  const requestDeleteMenu = useCallback((activity: V2ActivityListItem) => {
    setDeleteTarget(activity);
    setDeleteConfirmOpen(false);
  }, []);
  const controller = useMemo<MobileMeActivityController>(
    () => ({
      endDate,
      feedError: feed.error,
      feedItems,
      feedLoading: feed.isLoading,
      fetchNextPage: feed.fetchNextPage,
      hasNextPage: feed.hasNextPage,
      isFetchingNextPage: feed.isFetchingNextPage,
      layout,
      metric,
      overviewError: overview.error,
      overviewItems,
      overviewLoading: overview.isLoading,
      refresh: async () => {
        await Promise.all([overview.refetch(), feed.refetch()]);
      },
      requestDelete,
      requestDeleteMenu,
      setLayout,
      setMetric,
      setSport,
      setWeeks,
      sport,
      startDate,
      weeks,
    }),
    [
      endDate,
      feed.error,
      feed.fetchNextPage,
      feed.hasNextPage,
      feed.isFetchingNextPage,
      feed.isLoading,
      feed.refetch,
      feedItems,
      layout,
      metric,
      overview.error,
      overview.isLoading,
      overview.refetch,
      overviewItems,
      requestDelete,
      requestDeleteMenu,
      sport,
      startDate,
      weeks,
    ],
  );

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMobileMeActivity(deleteTarget);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      await Promise.all([overview.refetch(), feed.refetch()]);
      toast.success(t("deleted"));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <MobileMeActivityContext.Provider value={controller}>
      {children}
      <MobileSheet
        open={deleteTarget != null && !deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title={getLocalizedActivityTitle(deleteTarget, tActivityTitle, "")}
      >
        <button
          type="button"
          disabled={deleting}
          onClick={() => setDeleteConfirmOpen(true)}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-left text-red-600 active:bg-red-50 disabled:opacity-45 dark:text-red-400 dark:active:bg-red-950/20"
        >
          <Trash2 className="size-[18px]" aria-hidden="true" />
          <span className="text-mobile-subtitle font-medium">
            {deleting ? t("deleting") : t("delete")}
          </span>
        </button>
      </MobileSheet>
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteConfirmOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileMeActivityContext.Provider>
  );
}

export function useMobileMeActivityController() {
  const controller = useContext(MobileMeActivityContext);
  if (!controller) {
    throw new Error("Mobile me activity components require their provider");
  }
  return controller;
}
