import {
  ACTIVITY_TIMELINE_API_PATH,
  V2_ACTIVITIES_FEED_API_PATH,
  type ActivityTimelineQuery,
  type ActivityTimelineResponse,
  type V2ActivitiesFeedQuery,
  type V2ActivitiesFeedResponse,
} from "@/api/v2-activities";
import type {
  ActivityMetricSummaryParams,
  SummaryMetricKey,
  SummaryMetricResponse,
} from "@/api/charts";
import { getApiBaseUrl } from "@/lib/config";
import { headers } from "next/headers";
import { EMPTY_ACTIVITY_STATS_PREVIEW } from "./activity-stats-preview-model";

function toFeedUrl(query?: V2ActivitiesFeedQuery): string {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.sportType) params.set("sportType", query.sportType);
  if (query?.provider) params.set("provider", query.provider);
  if (typeof query?.page === "number") params.set("page", String(query.page));
  if (typeof query?.perPage === "number")
    params.set("perPage", String(query.perPage));
  if (query?.startDate) params.set("startDate", query.startDate);
  if (query?.endDate) params.set("endDate", query.endDate);
  if (query?.minDuration) params.set("minDuration", query.minDuration);
  if (query?.maxDuration) params.set("maxDuration", query.maxDuration);
  if (query?.minDistance) params.set("minDistance", query.minDistance);
  if (query?.maxDistance) params.set("maxDistance", query.maxDistance);
  if (query?.orderBy) params.set("orderBy", query.orderBy);
  if (query?.orderDirection) params.set("orderDirection", query.orderDirection);
  if (query?.timeZone) params.set("timeZone", query.timeZone);
  const qs = params.toString();
  return qs
    ? `${V2_ACTIVITIES_FEED_API_PATH}?${qs}`
    : V2_ACTIVITIES_FEED_API_PATH;
}

function toTimelineUrl(query?: ActivityTimelineQuery): string {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.sportType) params.set("sportType", query.sportType);
  if (query?.provider) params.set("provider", query.provider);
  if (query?.cursor) params.set("cursor", query.cursor);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (query?.startDate) params.set("startDate", query.startDate);
  if (query?.endDate) params.set("endDate", query.endDate);
  if (query?.minDuration) params.set("minDuration", query.minDuration);
  if (query?.maxDuration) params.set("maxDuration", query.maxDuration);
  if (query?.minDistance) params.set("minDistance", query.minDistance);
  if (query?.maxDistance) params.set("maxDistance", query.maxDistance);
  if (query?.timeZone) params.set("timeZone", query.timeZone);
  const value = params.toString();
  return value
    ? `${ACTIVITY_TIMELINE_API_PATH}?${value}`
    : ACTIVITY_TIMELINE_API_PATH;
}

function internalAppOrigin() {
  const configured = process.env.CLIENT_INTERNAL_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const port = process.env.PORT?.trim() || "3002";
  return `http://127.0.0.1:${port}`;
}

function emptyActivitiesFeed(): V2ActivitiesFeedResponse {
  return {
    items: [],
    externalActivityMirrors: [],
    nextPage: null,
    summary: { count: 0, totalDistance: 0, totalLoad: null },
  };
}

function emptyActivityTimeline(): ActivityTimelineResponse {
  return { items: [], nextCursor: null, totalActivities: 0 };
}

function logActivitiesServerError(
  stage: string,
  details: Record<string, unknown>,
  error?: unknown,
) {
  console.error(`[activities:ssr] ${stage}`, details, error ?? "");
}

function toActivityMetricSummaryUrl(
  key: SummaryMetricKey,
  params?: ActivityMetricSummaryParams,
): string {
  const search = new URLSearchParams();
  search.set("key", key);
  if (params?.start && params?.end) {
    search.set("start", params.start);
    search.set("end", params.end);
  }
  if (params?.mode) search.set("mode", params.mode);
  if (params?.sportType) search.set("sportType", params.sportType);
  if (params?.agg) search.set("agg", params.agg);
  return `/charts/summary/metric?${search.toString()}`;
}

function unwrapSummaryMetricResponse(payload: unknown): SummaryMetricResponse {
  const maybeWrapped = payload as { data?: unknown };
  const value = maybeWrapped?.data ?? payload;
  const candidate = value as Partial<SummaryMetricResponse> | null | undefined;
  if (!candidate || !Array.isArray(candidate.rows)) {
    return EMPTY_ACTIVITY_STATS_PREVIEW;
  }
  return {
    rows: candidate.rows
      .filter(
        (row): row is { time: string; value: number } =>
          typeof row?.time === "string" && typeof row?.value === "number",
      )
      .map((row) => ({ time: row.time, value: row.value })),
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? candidate.metadata
        : {},
  };
}

export async function getV2ActivitiesFeedServer(
  query?: V2ActivitiesFeedQuery,
): Promise<V2ActivitiesFeedResponse> {
  let requestHeaders: Headers | null = null;
  try {
    requestHeaders = await headers();
  } catch {
    requestHeaders = null;
  }

  const feedPath = toFeedUrl(query);
  let feedUrl: string;
  try {
    feedUrl = new URL(feedPath, internalAppOrigin()).toString();
  } catch (error) {
    logActivitiesServerError(
      "invalid internal app origin",
      { origin: internalAppOrigin(), feedPath },
      error,
    );
    return emptyActivitiesFeed();
  }

  let response: Response;
  try {
    response = await fetch(feedUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: requestHeaders?.get("cookie") ?? "",
        "x-lang": requestHeaders?.get("x-lang") ?? "en",
        "x-region": requestHeaders?.get("x-region") ?? "international",
      },
    });
  } catch (error) {
    logActivitiesServerError("feed request failed", { feedPath }, error);
    return emptyActivitiesFeed();
  }

  if (!response.ok) {
    if (response.status >= 500) {
      logActivitiesServerError("feed returned an error", {
        feedPath,
        status: response.status,
        contentType: response.headers.get("content-type"),
      });
    }
    return emptyActivitiesFeed();
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    logActivitiesServerError("feed body read failed", { feedPath }, error);
    return emptyActivitiesFeed();
  }
  if (!raw.trim()) {
    return emptyActivitiesFeed();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<V2ActivitiesFeedResponse>;
    if (!Array.isArray(parsed.items)) {
      logActivitiesServerError("feed returned an invalid payload", {
        feedPath,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyLength: raw.length,
      });
      return emptyActivitiesFeed();
    }
    return parsed as V2ActivitiesFeedResponse;
  } catch (error) {
    logActivitiesServerError(
      "feed returned invalid JSON",
      {
        feedPath,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyLength: raw.length,
      },
      error,
    );
    return emptyActivitiesFeed();
  }
}

export async function getActivityTimelineServer(
  query?: ActivityTimelineQuery,
): Promise<ActivityTimelineResponse> {
  let requestHeaders: Headers | null = null;
  try {
    requestHeaders = await headers();
  } catch {
    requestHeaders = null;
  }

  const timelinePath = toTimelineUrl(query);
  let timelineUrl: string;
  try {
    timelineUrl = new URL(timelinePath, internalAppOrigin()).toString();
  } catch (error) {
    logActivitiesServerError(
      "invalid timeline app origin",
      { origin: internalAppOrigin(), timelinePath },
      error,
    );
    return emptyActivityTimeline();
  }

  const response = await fetch(timelineUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: requestHeaders?.get("cookie") ?? "",
      "x-lang": requestHeaders?.get("x-lang") ?? "en",
      "x-region": requestHeaders?.get("x-region") ?? "international",
    },
  }).catch((error) => {
    logActivitiesServerError(
      "timeline request failed",
      { timelinePath },
      error,
    );
    return null;
  });
  if (!response?.ok) return emptyActivityTimeline();

  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return emptyActivityTimeline();
  try {
    const parsed = JSON.parse(raw) as Partial<ActivityTimelineResponse>;
    return Array.isArray(parsed.items)
      ? (parsed as ActivityTimelineResponse)
      : emptyActivityTimeline();
  } catch (error) {
    logActivitiesServerError(
      "timeline returned invalid JSON",
      { timelinePath, bodyLength: raw.length },
      error,
    );
    return emptyActivityTimeline();
  }
}

export async function getActivityMetricSummaryServer(
  key: SummaryMetricKey,
  params?: ActivityMetricSummaryParams,
): Promise<SummaryMetricResponse> {
  let requestHeaders: Headers | null = null;
  try {
    requestHeaders = await headers();
  } catch {
    requestHeaders = null;
  }

  const response = await fetch(
    `${getApiBaseUrl()}${toActivityMetricSummaryUrl(key, params)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: requestHeaders?.get("cookie") ?? "",
        "x-lang": requestHeaders?.get("x-lang") ?? "en",
        "X-Region": requestHeaders?.get("x-region") ?? "international",
      },
    },
  ).catch(() => null);

  if (!response?.ok) {
    return EMPTY_ACTIVITY_STATS_PREVIEW;
  }

  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return EMPTY_ACTIVITY_STATS_PREVIEW;

  try {
    return unwrapSummaryMetricResponse(JSON.parse(raw));
  } catch {
    return EMPTY_ACTIVITY_STATS_PREVIEW;
  }
}
