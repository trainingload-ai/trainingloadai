"use client";

import { Bike, Dumbbell, Footprints, Route, Waves } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { V2ActivityListItem } from "@/api/v2-activities";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { MobilePullToRefresh } from "./MobilePullToRefresh";
import {
  isTallMobileMeTile,
  splitMobileMeMasonry,
} from "../models/mobile-me-model";
import { MOBILE_ME_FITNESS_DEFINITIONS } from "../models/mobile-me-dashboard-model";
import { useMobileMeActivityController } from "../hooks/use-mobile-me-activity-controller";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

function activityIcon(activity: V2ActivityListItem) {
  const definition = String(activity.subSportType ?? "").toUpperCase();
  return activity.sportType === "CYCLING"
    ? Bike
    : activity.sportType === "RUN"
      ? Footprints
      : activity.sportType === "SWIM"
        ? Waves
        : activity.sportType === "FITNESS" ||
            MOBILE_ME_FITNESS_DEFINITIONS.has(definition)
          ? Dumbbell
          : Route;
}

function ActivityThumbnail({
  activity,
  masonry = false,
  tall = false,
}: {
  activity: V2ActivityListItem;
  masonry?: boolean;
  tall?: boolean;
}) {
  const Icon = activityIcon(activity);
  const lightUrl = activity.mapThumbnailUrl;
  const darkUrl = activity.mapThumbnailDarkUrl ?? lightUrl;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted text-muted-foreground",
        masonry ? (tall ? "h-40 w-full" : "h-32 w-full") : "h-16 w-20",
      )}
    >
      {lightUrl ? (
        <>
          <span
            className="absolute inset-0 bg-cover bg-center dark:hidden"
            style={{ backgroundImage: `url(${JSON.stringify(lightUrl)})` }}
          />
          <span
            className="absolute inset-0 hidden bg-cover bg-center dark:block"
            style={{ backgroundImage: `url(${JSON.stringify(darkUrl)})` }}
          />
        </>
      ) : (
        <>
          <span className="absolute -right-5 -top-5 size-16 rounded-full border border-zinc-300/35 dark:border-white/[0.04]" />
          <span className="absolute -bottom-7 -left-7 size-16 rounded-full border border-zinc-300/30 dark:border-white/[0.04]" />
          <span className="relative grid size-10 place-items-center rounded-full border border-zinc-200/70 bg-white/60 text-emerald-700/55 dark:border-white/[0.08] dark:bg-zinc-900/60 dark:text-emerald-200/70">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        </>
      )}
    </span>
  );
}

function ActivityMeta({
  activity,
  date,
  sportLabel,
}: {
  activity: V2ActivityListItem;
  date: Intl.DateTimeFormat;
  sportLabel: string;
}) {
  const duration = (() => {
    if (activity.duration == null || !Number.isFinite(activity.duration)) {
      return null;
    }
    const seconds = Math.max(0, Math.floor(activity.duration));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
  })();
  return (
    <>
      {sportLabel}
      {activity.startTime
        ? ` · ${date.format(new Date(activity.startTime))}`
        : ""}
      {duration ? ` · ${duration}` : ""}
    </>
  );
}

export function ActivityMasonry({
  items,
  date,
  onDeleteRequest,
  sportLabel,
}: {
  items: V2ActivityListItem[];
  date: Intl.DateTimeFormat;
  onDeleteRequest: (activity: V2ActivityListItem) => void;
  sportLabel: (activity: V2ActivityListItem) => string;
}) {
  const columns = useMemo(() => splitMobileMeMasonry(items), [items]);
  return (
    <div className="grid grid-cols-2 gap-3">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="min-w-0">
          {column.map((activity, index) => (
            <ActivityMasonryTile
              key={`${activity.id}-${activity.hashId}`}
              activity={activity}
              date={date}
              onDeleteRequest={onDeleteRequest}
              sportLabel={sportLabel(activity)}
              tall={isTallMobileMeTile(index, columnIndex)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ActivityMasonryTile({
  activity,
  date,
  onDeleteRequest,
  sportLabel,
  tall,
}: {
  activity: V2ActivityListItem;
  date: Intl.DateTimeFormat;
  onDeleteRequest: (activity: V2ActivityListItem) => void;
  sportLabel: string;
  tall: boolean;
}) {
  const t = useTranslations("MobileApp.meDashboard");
  const tActivityTitle = useTranslations("ActivityTitle");
  const press = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    [],
  );
  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    clearPress();
    suppressClick.current = false;
    press.current = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        suppressClick.current = true;
        onDeleteRequest(activity);
      }, 360),
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (
      press.current &&
      (Math.abs(event.clientX - press.current.x) > 10 ||
        Math.abs(event.clientY - press.current.y) > 10)
    ) {
      clearPress();
    }
  };

  return (
    <Link
      href={`/activities/${activity.hashId || activity.id}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(event) => {
        event.preventDefault();
        clearPress();
        suppressClick.current = true;
        onDeleteRequest(activity);
      }}
      onClick={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        suppressClick.current = false;
      }}
      className="mb-3 block touch-pan-y rounded-surface bg-muted/85 p-2 transition-opacity active:opacity-70"
    >
      <ActivityThumbnail activity={activity} masonry tall={tall} />
      <span className="mt-2 line-clamp-2 block text-mobile-control font-semibold leading-5">
        {getLocalizedActivityTitle(activity, tActivityTitle, t("untitled"))}
      </span>
      <span className="mt-1 line-clamp-2 block text-mobile-caption text-muted-foreground">
        <ActivityMeta activity={activity} date={date} sportLabel={sportLabel} />
      </span>
    </Link>
  );
}

export function ActivityList({
  items,
  date,
  number,
  loadLabel,
  onDeleteRequest,
  sportLabel,
}: {
  items: V2ActivityListItem[];
  date: Intl.DateTimeFormat;
  number: Intl.NumberFormat;
  loadLabel: string;
  onDeleteRequest: (activity: V2ActivityListItem) => void;
  sportLabel: (activity: V2ActivityListItem) => string;
}) {
  return (
    <div className="space-y-2">
      {items.map((activity) => (
        <ActivityListRow
          key={`${activity.id}-${activity.hashId}`}
          activity={activity}
          date={date}
          loadLabel={loadLabel}
          number={number}
          onDeleteRequest={onDeleteRequest}
          sportLabel={sportLabel(activity)}
        />
      ))}
    </div>
  );
}

function ActivityListRow({
  activity,
  date,
  loadLabel,
  number,
  onDeleteRequest,
  sportLabel,
}: {
  activity: V2ActivityListItem;
  date: Intl.DateTimeFormat;
  loadLabel: string;
  number: Intl.NumberFormat;
  onDeleteRequest: (activity: V2ActivityListItem) => void;
  sportLabel: string;
}) {
  const t = useTranslations("MobileApp.meDashboard");
  const tActivityTitle = useTranslations("ActivityTitle");
  const [offset, setOffset] = useState(0);
  const swipe = useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    swipe.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    if (dy > Math.abs(dx)) return;
    if (Math.abs(dx) > 6) start.moved = true;
    setOffset(Math.max(-80, Math.min(0, dx)));
  };
  const finishSwipe = () => {
    const moved = swipe.current?.moved === true;
    swipe.current = moved ? { ...swipe.current!, moved: true } : null;
    setOffset((current) => (current < -42 ? -80 : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-surface bg-red-500">
      <button
        type="button"
        onClick={() => {
          setOffset(0);
          onDeleteRequest(activity);
        }}
        aria-label={t("delete")}
        aria-hidden={offset === 0}
        tabIndex={offset < 0 ? 0 : -1}
        className="absolute inset-y-0 right-0 flex w-20 items-center justify-center text-mobile-body font-semibold text-white active:bg-red-600"
      >
        {t("delete")}
      </button>
      <Link
        href={`/activities/${activity.hashId || activity.id}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onClick={(event) => {
          if (swipe.current?.moved || offset < 0) {
            event.preventDefault();
            setOffset(0);
          }
          swipe.current = null;
        }}
        className="relative flex min-h-[82px] touch-pan-y items-center gap-3 bg-white px-3 py-2.5 transition-transform duration-200 active:bg-zinc-100 dark:bg-zinc-900 dark:active:bg-zinc-800"
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
      >
        <ActivityThumbnail activity={activity} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-mobile-body font-semibold">
            {getLocalizedActivityTitle(
              activity,
              tActivityTitle,
              t("untitled"),
            )}
          </span>
          <span className="mt-1 block truncate text-mobile-caption text-muted-foreground">
            <ActivityMeta
              activity={activity}
              date={date}
              sportLabel={sportLabel}
            />
          </span>
          {activity.distance != null ? (
            <span className="mt-1 block truncate text-mobile-caption text-muted-foreground/75">
              {number.format(activity.distance / 1000)} km
            </span>
          ) : null}
        </span>
        {activity.load != null ? (
          <span className="shrink-0 text-right">
            <span className="block text-mobile-headline font-semibold tabular-nums">
              {Math.round(activity.load)}
            </span>
            <span className="block text-mobile-micro text-muted-foreground">
              {loadLabel}
            </span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}

export function MobileMeLoadMore() {
  const t = useTranslations("MobileApp.meDashboard");
  const { feedItems, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMobileMeActivityController();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "260px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div ref={loadMoreRef} className="grid min-h-8 place-items-center">
      {isFetchingNextPage ? (
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      ) : feedItems.length > 0 && !hasNextPage ? (
        <span className="text-mobile-caption text-muted-foreground">
          {t("noMore")}
        </span>
      ) : null}
    </div>
  );
}

export function useMobileMeActivityFormatting() {
  const t = useTranslations("MobileApp.meDashboard");
  const locale = useLocale();
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );
  const number = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }),
    [locale],
  );
  const sportLabel = (activity: V2ActivityListItem) => {
    const definition = String(activity.subSportType ?? "").toUpperCase();
    if (
      activity.sportType === "FITNESS" ||
      MOBILE_ME_FITNESS_DEFINITIONS.has(definition)
    ) {
      return t("sports.FITNESS");
    }
    if (activity.sportType === "RUN") return t("sports.RUN");
    if (activity.sportType === "CYCLING") return t("sports.CYCLING");
    if (activity.sportType === "SWIM") return t("sports.SWIM");
    return t("training");
  };
  return { date, number, sportLabel };
}

export function MobileMeActivitiesPanel() {
  const t = useTranslations("MobileApp.meDashboard");
  const { feedItems, feedLoading, refresh, requestDelete } =
    useMobileMeActivityController();
  const { date, number, sportLabel } = useMobileMeActivityFormatting();

  return (
    <MobilePullToRefresh className="-mx-4" onRefresh={refresh}>
      <div className="space-y-3 pb-3">
        {feedLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-[82px] animate-pulse rounded-surface bg-muted"
              />
            ))}
          </div>
        ) : feedItems.length ? (
          <ActivityList
            items={feedItems}
            date={date}
            number={number}
            loadLabel={t("metrics.load")}
            onDeleteRequest={requestDelete}
            sportLabel={sportLabel}
          />
        ) : (
          <p className="px-4 py-8 text-mobile-control text-muted-foreground">
            {t("empty")}
          </p>
        )}
        <MobileMeLoadMore />
      </div>
    </MobilePullToRefresh>
  );
}
