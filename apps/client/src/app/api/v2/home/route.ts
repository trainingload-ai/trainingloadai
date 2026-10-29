import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";
import {
  buildBffInternalHeaders,
  buildBffServiceHeaders,
} from "@/lib/bff-upstream-headers";
import type { ActivePlanResponse } from "@/api/plans";
import type { FitnessStatusData, PMCExtremes } from "@/api/usePMC";
import type { UserProfile } from "@/api/settings";
import {
  emptyHomeWeatherContext,
  mapTrainingPlanToHomePlan,
  type V2HomeResponse,
} from "@/api/v2-home";
import {
  V2_ACTIVITIES_FEED_API_PATH,
  type V2ActivitiesFeedResponse,
  type V2ActivityListItem,
} from "@/api/v2-activities";
import { isBetterAuthSessionCookieName } from "@/lib/auth-cookie-name";
import { PUBLIC_DEMO_TOKEN_COOKIE } from "@shared/public-demo-policy";

type ApiEnvelope<T> = { data?: T; message?: string };
type HomeSportType = "RUN" | "CYCLING" | "SWIM";

class UpstreamUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UpstreamUnauthorizedError";
  }
}

function hasSupportedSessionCookie(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  return cookieHeader.split(";").some((cookie) => {
    const name = cookie.trim().split("=", 1)[0];
    return (
      name === PUBLIC_DEMO_TOKEN_COOKIE || isBetterAuthSessionCookieName(name)
    );
  });
}

function pickPositiveWithSource(
  pairs: Array<{ sport: HomeSportType; value: number | null | undefined }>,
) {
  for (const pair of pairs) {
    if (
      typeof pair.value === "number" &&
      Number.isFinite(pair.value) &&
      pair.value > 0
    ) {
      return { value: pair.value, sport: pair.sport };
    }
  }
  return { value: undefined, sport: undefined as HomeSportType | undefined };
}

function todayKey(timezone?: string | null) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

async function fetchServerData<T>(
  request: NextRequest,
  path: string,
): Promise<T | null> {
  const response = await fetch(`${getServerApiBaseUrl()}${path}`, {
    method: "GET",
    headers: buildBffServiceHeaders(request.headers, {
      cookie: request.headers.get("cookie") || "",
      "x-lang": request.headers.get("x-lang") || "en",
      "X-Region": request.headers.get("x-region") || "international",
    }),
    cache: "no-store",
  });

  if (response.status === 401) throw new UpstreamUnauthorizedError();
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | T
    | null;
  if (!payload) return null;
  if (typeof payload === "object" && "data" in payload) {
    return payload.data ?? null;
  }
  return payload as T;
}

function toRecentActivity(item: V2ActivityListItem | undefined) {
  if (!item) return null;
  return {
    id: item.id,
    hashId: item.hashId,
    title: item.title,
    sportType: item.sportType,
    subSportType: item.subSportType,
    startTime: item.startTime,
    duration: item.duration,
    distance: item.distance,
    load: item.load,
    status: item.status,
    mapThumbnailUrl: item.mapThumbnailUrl,
    mapThumbnailDarkUrl: item.mapThumbnailDarkUrl,
  };
}

export async function GET(request: NextRequest) {
  if (!hasSupportedSessionCookie(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  let homeSources;
  try {
    homeSources = await Promise.all([
      fetchServerData<ActivePlanResponse>(request, "/plans/active"),
      fetch(
        `${origin}${V2_ACTIVITIES_FEED_API_PATH}?page=1&perPage=1&orderBy=startTime&orderDirection=desc`,
        {
          method: "GET",
          headers: buildBffInternalHeaders(request.headers, {
            cookie: request.headers.get("cookie") || "",
            "x-lang": request.headers.get("x-lang") || "en",
            "x-region": request.headers.get("x-region") || "international",
          }),
          cache: "no-store",
        },
      )
        .then((response) => {
          if (response.status === 401) throw new UpstreamUnauthorizedError();
          return response.ok
            ? (response.json() as Promise<V2ActivitiesFeedResponse>)
            : null;
        })
        .catch((error) => {
          if (error instanceof UpstreamUnauthorizedError) throw error;
          return null;
        }),
      fetchServerData<FitnessStatusData>(request, "/pmc/status"),
      fetchServerData<PMCExtremes>(request, "/pmc/extremes"),
      fetchServerData<UserProfile>(request, "/users/profile?sport=CYCLING"),
      fetchServerData<UserProfile>(request, "/users/profile?sport=RUN"),
      fetchServerData<UserProfile>(request, "/users/profile?sport=SWIM"),
    ] as const);
  } catch (error) {
    if (error instanceof UpstreamUnauthorizedError) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
  const [
    activePlan,
    activitiesFeed,
    fitnessStatus,
    pmcExtremes,
    cyclingProfile,
    runProfile,
    swimProfile,
  ] = homeSources;
  const profileForDate = cyclingProfile ?? runProfile ?? swimProfile ?? null;
  const ftpPicked = pickPositiveWithSource([
    { sport: "CYCLING", value: cyclingProfile?.ftp },
    { sport: "RUN", value: runProfile?.ftp },
  ]);
  const cpPicked = pickPositiveWithSource([
    { sport: "CYCLING", value: cyclingProfile?.cp },
    { sport: "RUN", value: runProfile?.cp },
  ]);
  const tpPicked = pickPositiveWithSource([
    { sport: "RUN", value: runProfile?.tp },
    { sport: "SWIM", value: swimProfile?.tp },
  ]);
  const csPicked = pickPositiveWithSource([
    { sport: "RUN", value: runProfile?.cs },
    { sport: "SWIM", value: swimProfile?.cs },
  ]);

  const response: V2HomeResponse = {
    activePlan: activePlan?.plan
      ? mapTrainingPlanToHomePlan(
          activePlan.plan,
          todayKey(profileForDate?.timezone),
        )
      : null,
    recentActivity: toRecentActivity(activitiesFeed?.items?.[0]),
    fitnessStatus,
    pmcExtremes,
    profile: profileForDate
      ? {
          maxHeartRate: profileForDate.maxHeartRate,
          restingHeartRate: profileForDate.restingHeartRate,
          ftp: ftpPicked.value,
          cp: cpPicked.value,
          tp: tpPicked.value,
          cs: csPicked.value,
          ftpSport: ftpPicked.sport ?? null,
          cpSport: cpPicked.sport ?? null,
          tpSport: tpPicked.sport ?? null,
          csSport: csPicked.sport ?? null,
          lthr: profileForDate.lthr,
          timezone: profileForDate.timezone,
        }
      : null,
    weather: emptyHomeWeatherContext(),
    aiTodaySuggestion: null,
  };

  return NextResponse.json(response);
}
