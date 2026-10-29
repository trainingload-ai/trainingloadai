import { NextRequest, NextResponse } from "next/server";

import type {
  ActivityTimelineItem,
  ActivityTimelineResponse,
} from "@/api/v2-activities";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";
import { buildBffServiceHeaders } from "@/lib/bff-upstream-headers";
import {
  mapV2ActivityListItem,
  mapV2ExternalActivityMirror,
} from "../../v2/activities/activity-feed-mapper";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function mapTimelineItem(value: unknown): ActivityTimelineItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind === "activity" && row.activity) {
    return {
      kind: "activity",
      activity: mapV2ActivityListItem(row.activity),
    };
  }
  if (row.kind === "external_activity_mirror" && row.mirror) {
    const mirror = mapV2ExternalActivityMirror(row.mirror);
    return mirror ? { kind: "external_activity_mirror", mirror } : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const source = new URL(request.url).searchParams;
  const upstreamQuery = new URLSearchParams();
  const limitRaw = Number(source.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;
  upstreamQuery.set("limit", String(limit));

  const passthrough = [
    ["q", "search"],
    ["sportType", "sportType"],
    ["provider", "thirdPartyProvider"],
    ["cursor", "cursor"],
    ["startDate", "startDate"],
    ["endDate", "endDate"],
    ["minDuration", "minDuration"],
    ["maxDuration", "maxDuration"],
    ["minDistance", "minDistance"],
    ["maxDistance", "maxDistance"],
    ["timeZone", "timeZone"],
  ] as const;
  for (const [clientKey, serverKey] of passthrough) {
    const value = source.get(clientKey);
    if (value) upstreamQuery.set(serverKey, value);
  }

  const upstream = await fetch(
    `${getServerApiBaseUrl()}/activities/timeline?${upstreamQuery.toString()}`,
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
    const message = await upstream.text().catch(() => "Upstream error");
    return NextResponse.json(
      { message: message || "Failed to fetch activity timeline" },
      { status: upstream.status },
    );
  }

  const raw = await upstream.text().catch(() => "");
  let payload: any = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { message: "Invalid upstream JSON from /activities/timeline" },
        { status: 502 },
      );
    }
  }
  const value = payload?.data ?? payload;
  const items = Array.isArray(value?.items)
    ? value.items
        .map(mapTimelineItem)
        .filter(
          (item: ActivityTimelineItem | null): item is ActivityTimelineItem =>
            item != null,
        )
    : [];
  const total = Number(value?.totalActivities ?? 0);
  const response: ActivityTimelineResponse = {
    items,
    nextCursor:
      typeof value?.nextCursor === "string" && value.nextCursor
        ? value.nextCursor
        : null,
    totalActivities: Number.isFinite(total) ? total : 0,
  };
  return NextResponse.json(response);
}
