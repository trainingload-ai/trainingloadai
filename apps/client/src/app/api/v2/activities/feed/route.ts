import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";
import { buildBffServiceHeaders } from "@/lib/bff-upstream-headers";
import type {
  V2ActivitiesFeedResponse,
  V2ActivityListItem,
  V2ExternalActivityMirror,
} from "@/api/v2-activities";
import {
  mapV2ActivityListItem,
  mapV2ExternalActivityMirror,
} from "../activity-feed-mapper";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const sportType = url.searchParams.get("sportType") ?? undefined;
  const provider = url.searchParams.get("provider") ?? undefined;
  const startDate = url.searchParams.get("startDate") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? undefined;
  const minDuration = url.searchParams.get("minDuration") ?? undefined;
  const maxDuration = url.searchParams.get("maxDuration") ?? undefined;
  const minDistance = url.searchParams.get("minDistance") ?? undefined;
  const maxDistance = url.searchParams.get("maxDistance") ?? undefined;
  const orderBy = url.searchParams.get("orderBy") ?? undefined;
  const orderDirection = url.searchParams.get("orderDirection") ?? undefined;
  const timeZone = url.searchParams.get("timeZone") ?? undefined;
  const pageRaw = Number(url.searchParams.get("page") ?? 1);
  const perPageRaw = Number(url.searchParams.get("perPage") ?? DEFAULT_LIMIT);
  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const perPage = Number.isFinite(perPageRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(perPageRaw)))
    : DEFAULT_LIMIT;
  const safePage = page;
  const safePerPage = perPage;

  const upstreamQuery = new URLSearchParams();
  upstreamQuery.set("page", String(safePage));
  upstreamQuery.set("perPage", String(safePerPage));
  if (q) upstreamQuery.set("search", q);
  if (sportType && sportType !== "ALL")
    upstreamQuery.set("sportType", sportType);
  if (provider && provider !== "all") {
    upstreamQuery.set("thirdPartyProvider", provider);
  }
  if (startDate) upstreamQuery.set("startDate", startDate);
  if (endDate) upstreamQuery.set("endDate", endDate);
  if (minDuration) upstreamQuery.set("minDuration", minDuration);
  if (maxDuration) upstreamQuery.set("maxDuration", maxDuration);
  if (minDistance) upstreamQuery.set("minDistance", minDistance);
  if (maxDistance) upstreamQuery.set("maxDistance", maxDistance);
  if (orderBy) upstreamQuery.set("orderBy", orderBy);
  if (orderDirection) upstreamQuery.set("orderDirection", orderDirection);
  if (timeZone) upstreamQuery.set("timeZone", timeZone);

  const upstream = await fetch(
    `${getServerApiBaseUrl()}/activities?${upstreamQuery.toString()}`,
    {
      method: "GET",
      headers: buildBffServiceHeaders(request.headers, {
        cookie: request.headers.get("cookie") || "",
        "x-lang": request.headers.get("x-lang") || "en",
        "X-Region": request.headers.get("x-region") || "international",
      }),
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "Upstream error");
    return NextResponse.json(
      { message: text || "Failed to fetch activities feed" },
      { status: upstream.status },
    );
  }

  const upstreamRaw = await upstream.text().catch(() => "");
  let payload: any = {};
  if (upstreamRaw.trim()) {
    try {
      payload = JSON.parse(upstreamRaw) as any;
    } catch {
      return NextResponse.json(
        { message: "Invalid upstream JSON from /activities" },
        { status: 502 },
      );
    }
  }
  const rows = Array.isArray(payload?.data?.activities)
    ? payload.data.activities
    : Array.isArray(payload?.activities)
      ? payload.activities
      : [];
  const totalRaw = payload?.data?.total ?? payload?.total ?? rows.length;
  const mirrorRows: unknown[] = Array.isArray(
    payload?.data?.externalActivityMirrors,
  )
    ? payload.data.externalActivityMirrors
    : Array.isArray(payload?.externalActivityMirrors)
      ? payload.externalActivityMirrors
      : [];
  const totalNum = Number(totalRaw);
  const total = Number.isFinite(totalNum) ? totalNum : rows.length;
  const items: V2ActivityListItem[] = rows.map((row: any) =>
    mapV2ActivityListItem(row),
  );
  const externalActivityMirrors = mirrorRows
    .map(mapV2ExternalActivityMirror)
    .filter((row): row is V2ExternalActivityMirror => row != null);
  const hasMore = safePage * safePerPage < total;

  const summaryDistance = items.reduce(
    (acc, item) => acc + (item.distance ?? 0),
    0,
  );
  const loadValues = items
    .map((item) => item.load)
    .filter((value): value is number => typeof value === "number");

  const response: V2ActivitiesFeedResponse = {
    items,
    externalActivityMirrors,
    nextPage: hasMore ? safePage + 1 : null,
    summary: {
      count: total,
      totalDistance: summaryDistance,
      totalLoad: loadValues.length
        ? loadValues.reduce((acc, value) => acc + value, 0)
        : null,
    },
  };

  return NextResponse.json(response);
}
