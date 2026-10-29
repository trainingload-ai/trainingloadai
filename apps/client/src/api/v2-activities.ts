import { ApiFetchError } from "@/lib/api-error";
import { getPendingAuthFailure, handleUnauthorized } from "@/lib/auth-failure";

export type V2ActivitySourceProvider = string;

export type V2ActivityThirdPartyProvider = string;

export type V2ActivityThirdPartyMapping = {
  id: number;
  provider: V2ActivityThirdPartyProvider;
  externalId: string | null;
  syncDirection: "IMPORT" | "EXPORT" | "BIDIRECTIONAL" | null;
  isPrimary: boolean;
  lastSyncedAt: string | null;
};

export type V2ActivitySportType =
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "FITNESS"
  | "UNKNOWN";

export type V2ActivityStatus =
  | "PROCESSING"
  | "READY"
  | "PARTIAL_FAILED"
  | "FAILED"
  | "UNKNOWN";

export type V2ActivityLinkedPlanWorkout = {
  planId: string;
  workoutId: string;
  name: string | null;
  sportType: V2ActivitySportType;
  source: "MANUAL" | "AUTO" | "AI";
};

export type V2ActivityListItem = {
  id: number;
  hashId: string;
  title: string;
  sportType: V2ActivitySportType;
  /** Trainingload.ai 标准运动小类，例如 TRAIL_RUNNING。 */
  subSportType?: string | null;
  /** FIT Profile 原始 sub_sport 数字枚举。 */
  fitSubSport?: number | null;
  /** FIT SubSport 枚举整数值；非 FIT 或未写入时为 null */
  subSport?: number | null;
  startTime: string | null;
  /** 活动 IANA 时区；无则展示回落到档案 / 浏览器 */
  timezone?: string | null;
  duration: number | null;
  distance: number | null;
  load: number | null;
  ascent?: number | null;
  calories?: number | null;
  averageSpeed?: number | null;
  avgHeartRate?: number | null;
  avgPower?: number | null;
  avgCadence?: number | null;
  status: V2ActivityStatus;
  note: string | null;
  providers: V2ActivitySourceProvider[];
  primaryProvider: V2ActivitySourceProvider;
  thirdPartyMappings: V2ActivityThirdPartyMapping[];
  mapThumbnailUrl?: string | null;
  mapThumbnailDarkUrl?: string | null;
  /** 与训练计划课的关联（至多一条）；无则为 null */
  linkedPlanWorkout?: V2ActivityLinkedPlanWorkout | null;
  /**
   * 是否展示「关联训练」入口：有 ACTIVE 计划且活动开始日在计划起止日内。
   * 未返回时前端视为 false。
   */
  planLinkUiVisible?: boolean;
  /** 当前 ACTIVE 计划周期（YYYY-MM-DD，UTC）；调试用，无 ACTIVE 计划时为 null */
  planLinkActiveStartDate?: string | null;
  planLinkActiveEndDate?: string | null;
};

export type V2ActivitiesSummary = {
  count: number;
  totalDistance: number;
  totalLoad: number | null;
};

export type V2ExternalActivityMirror = {
  id: string;
  kind: "external_activity_mirror";
  title: string | null;
  startTime: string | null;
  discoveredVia: string;
  originProvider: string;
  status: "ROUTING" | "BLOCKED" | "NOT_FOUND";
  reason:
    | "UPSTREAM_DATA_UNAVAILABLE"
    | "ORIGIN_CONNECTION_REQUIRED"
    | "ORIGIN_IMPORT_DISABLED"
    | "ORIGIN_REAUTH_REQUIRED"
    | "ORIGIN_SCOPE_REQUIRED"
    | "ORIGIN_SYNC_PENDING"
    | "ORIGIN_SYNC_FAILED"
    | "ORIGIN_ACTIVITY_NOT_FOUND"
    | "ORIGIN_ACTIVITY_AMBIGUOUS"
    | null;
  action: "WAIT" | "MANAGE_CONNECTION" | "RETRY";
};

export type ActivityTimelineItem =
  | { kind: "activity"; activity: V2ActivityListItem }
  | {
      kind: "external_activity_mirror";
      mirror: V2ExternalActivityMirror;
    };

export type ActivityTimelineResponse = {
  /** 已由服务端按开始时间稳定排序；客户端不得再次自行合排。 */
  items: ActivityTimelineItem[];
  nextCursor: string | null;
  /** 只统计正式 Activity，影子不进入业务统计。 */
  totalActivities: number;
};

export type V2ActivitiesFeedResponse = {
  items: V2ActivityListItem[];
  externalActivityMirrors: V2ExternalActivityMirror[];
  nextPage: number | null;
  summary: V2ActivitiesSummary;
};

/** Next Route：`app/api/v2/activities/feed/route.ts`（勿改成 `/api/activities/feed`，RSC 会 404） */
export const V2_ACTIVITIES_FEED_API_PATH = "/api/v2/activities/feed";
export const ACTIVITY_TIMELINE_API_PATH = "/api/activities/timeline";

export type V2ActivitiesFeedQuery = {
  q?: string;
  sportType?: "RUN" | "CYCLING" | "SWIM" | "FITNESS" | "UNKNOWN" | "ALL";
  provider?: string;
  page?: number;
  perPage?: number;
  startDate?: string;
  endDate?: string;
  minDuration?: string;
  maxDuration?: string;
  minDistance?: string;
  maxDistance?: string;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  /** IANA，默认在浏览器内取 Intl；用于服务端按当地日解析 UTC startTime */
  timeZone?: string;
};

export type ActivityTimelineQuery = Omit<
  V2ActivitiesFeedQuery,
  "page" | "perPage" | "orderBy" | "orderDirection"
> & {
  cursor?: string;
  limit?: number;
};

type FeedCacheEntry = {
  expiresAt: number;
  data?: V2ActivitiesFeedResponse;
  promise?: Promise<V2ActivitiesFeedResponse>;
};

type TimelineCacheEntry = {
  expiresAt: number;
  data?: ActivityTimelineResponse;
  promise?: Promise<ActivityTimelineResponse>;
};

type FeedFetchOptions = {
  forceRefresh?: boolean;
};

const FEED_CACHE_TTL_MS = 8_000;
const feedCache = new Map<string, FeedCacheEntry>();
const timelineCache = new Map<string, TimelineCacheEntry>();

function buildQueryString(query?: V2ActivitiesFeedQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sportType) params.set("sportType", query.sportType);
  if (query.provider) params.set("provider", query.provider);
  if (typeof query.page === "number") params.set("page", String(query.page));
  if (typeof query.perPage === "number")
    params.set("perPage", String(query.perPage));
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  if (query.minDuration) params.set("minDuration", query.minDuration);
  if (query.maxDuration) params.set("maxDuration", query.maxDuration);
  if (query.minDistance) params.set("minDistance", query.minDistance);
  if (query.maxDistance) params.set("maxDistance", query.maxDistance);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.orderDirection) params.set("orderDirection", query.orderDirection);
  if (query.timeZone) params.set("timeZone", query.timeZone);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function buildTimelineQueryString(query?: ActivityTimelineQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sportType) params.set("sportType", query.sportType);
  if (query.provider) params.set("provider", query.provider);
  if (query.cursor) params.set("cursor", query.cursor);
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  if (query.minDuration) params.set("minDuration", query.minDuration);
  if (query.maxDuration) params.set("maxDuration", query.maxDuration);
  if (query.minDistance) params.set("minDistance", query.minDistance);
  if (query.maxDistance) params.set("maxDistance", query.maxDistance);
  if (query.timeZone) params.set("timeZone", query.timeZone);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function getFeedCacheKey(query?: V2ActivitiesFeedQuery): string {
  return buildQueryString(query) || "?";
}

/** 浏览器：附带本机 IANA 时区，供后端把 UTC startTime 换算成当地日历日 */
function resolveFeedQuery(
  query?: V2ActivitiesFeedQuery,
): V2ActivitiesFeedQuery {
  const browserTz =
    typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined;
  return {
    ...(query ?? {}),
    timeZone: query?.timeZone ?? browserTz,
  };
}

function resolveTimelineQuery(
  query?: ActivityTimelineQuery,
): ActivityTimelineQuery {
  const browserTz =
    typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined;
  return {
    ...(query ?? {}),
    timeZone: query?.timeZone ?? browserTz,
  };
}

export async function getActivityTimeline(
  query?: ActivityTimelineQuery,
  options?: FeedFetchOptions,
): Promise<ActivityTimelineResponse> {
  const pendingAuthFailure =
    typeof window === "undefined" ? undefined : getPendingAuthFailure();
  if (pendingAuthFailure) return pendingAuthFailure;

  const forceRefresh = options?.forceRefresh === true;
  const effectiveQuery = resolveTimelineQuery(query);
  const queryString = buildTimelineQueryString(effectiveQuery);
  const cacheKey = queryString || "?";
  const now = Date.now();
  if (!forceRefresh) {
    const cached = timelineCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.data) return cached.data;
      if (cached.promise) return cached.promise;
    }
  }

  const request = fetch(`${ACTIVITY_TIMELINE_API_PATH}${queryString}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  }).then(async (response) => {
    if (response.status === 401) {
      const error = new ApiFetchError("Unauthorized", 401, "UNAUTHORIZED");
      if (typeof window !== "undefined") return handleUnauthorized(error);
      throw error;
    }
    if (!response.ok) {
      throw new ApiFetchError(
        `Failed to fetch activity timeline (${response.status})`,
        response.status,
      );
    }
    const raw = await response.text();
    if (!raw.trim()) {
      return { items: [], nextCursor: null, totalActivities: 0 };
    }
    return JSON.parse(raw) as ActivityTimelineResponse;
  });

  if (!forceRefresh) {
    timelineCache.set(cacheKey, {
      expiresAt: now + FEED_CACHE_TTL_MS,
      promise: request,
    });
  }
  try {
    const data = await request;
    if (!forceRefresh) {
      timelineCache.set(cacheKey, {
        expiresAt: Date.now() + FEED_CACHE_TTL_MS,
        data,
      });
    }
    return data;
  } catch (error) {
    if (!forceRefresh) timelineCache.delete(cacheKey);
    throw error;
  }
}

export async function getV2ActivitiesFeed(
  query?: V2ActivitiesFeedQuery,
  options?: FeedFetchOptions,
): Promise<V2ActivitiesFeedResponse> {
  const pendingAuthFailure =
    typeof window === "undefined" ? undefined : getPendingAuthFailure();
  if (pendingAuthFailure) return pendingAuthFailure;

  const forceRefresh = options?.forceRefresh === true;
  const effectiveQuery = resolveFeedQuery(query);
  const cacheKey = getFeedCacheKey(effectiveQuery);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = feedCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.data) return cached.data;
      if (cached.promise) return cached.promise;
    }
  }

  const request = fetch(
    `${V2_ACTIVITIES_FEED_API_PATH}${buildQueryString(effectiveQuery)}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    },
  ).then(async (response) => {
    if (response.status === 401) {
      const error = new ApiFetchError("Unauthorized", 401, "UNAUTHORIZED");
      if (typeof window !== "undefined") return handleUnauthorized(error);
      throw error;
    }
    if (!response.ok) {
      throw new ApiFetchError(
        `Failed to fetch v2 activities feed (${response.status})`,
        response.status,
      );
    }
    const raw = await response.text();
    if (!raw.trim()) {
      return {
        items: [],
        externalActivityMirrors: [],
        nextPage: null,
        summary: { count: 0, totalDistance: 0, totalLoad: null },
      };
    }
    return JSON.parse(raw) as V2ActivitiesFeedResponse;
  });

  if (!forceRefresh) {
    feedCache.set(cacheKey, {
      expiresAt: now + FEED_CACHE_TTL_MS,
      promise: request,
    });
  }

  try {
    const data = await request;
    if (!forceRefresh) {
      feedCache.set(cacheKey, {
        expiresAt: Date.now() + FEED_CACHE_TTL_MS,
        data,
      });
    }
    return data;
  } catch (error) {
    if (!forceRefresh) {
      feedCache.delete(cacheKey);
    }
    throw error;
  }
}

export function warmV2ActivitiesFeed(query?: V2ActivitiesFeedQuery): void {
  void getV2ActivitiesFeed(query).catch(() => {});
}
