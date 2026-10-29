import type { FitnessStatusData, PMCExtremes } from "@/api/usePMC";
import type { UserProfile } from "@/api/settings";
import type { TrainingPlanDetail } from "@/api/plans";
import type { V2ActivityListItem } from "@/api/v2-activities";
import { ApiFetchError } from "@/lib/api-error";
import { getPendingAuthFailure, handleUnauthorized } from "@/lib/auth-failure";

export type V2HomePlanWorkout = {
  id: string;
  planId: string;
  /** API 课次名称（若有），不含结构化 text */
  name: string | null;
  /** 展示用短标题：name 或 notes，不含 text/DSL */
  title: string;
  /** 展示用可读说明；不包含结构化 text/DSL */
  description: string | null;
  text: string;
  notes: string | null;
  sportType: string;
  status: string;
  scheduledDate: string | null;
  dayOffset: number;
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  linkedActivityTitle: string | null;
  estimatedLoad: number | null;
};

export type V2HomeActivePlan = {
  id: string;
  title: string;
  description: string | null;
  goal: string | null;
  periodWeeks: number;
  startDate: string | null;
  endDate: string | null;
  currentWeekIndex: number | null;
  currentDayIndex: number | null;
  todayWorkouts: V2HomePlanWorkout[];
  currentWeekWorkouts: V2HomePlanWorkout[];
};

export type V2HomeRecentActivity = Pick<
  V2ActivityListItem,
  | "id"
  | "hashId"
  | "title"
  | "sportType"
  | "subSportType"
  | "startTime"
  | "duration"
  | "distance"
  | "load"
  | "status"
  | "mapThumbnailUrl"
  | "mapThumbnailDarkUrl"
>;

export type V2HomeWeatherContext = {
  status: "unavailable" | "available";
  summary: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  precipitationProbability: number | null;
  windKph: number | null;
  airQuality: string | null;
};

export type V2HomeTodayAdvice = {
  summary: string;
  tags: string[];
  source: "fallback" | "cache" | "generated";
  shouldRefresh: boolean;
  generatedAt: string | null;
  reason?: string;
  tone?: "neutral" | "warning" | "success";
  weatherAttribution?: {
    serviceName: string;
    modified: true;
    legalPageUrl?: string;
  };
};

export type HomeMetricSport = "RUN" | "CYCLING" | "SWIM";

export type V2HomeResponse = {
  activePlan: V2HomeActivePlan | null;
  recentActivity: V2HomeRecentActivity | null;
  fitnessStatus: FitnessStatusData | null;
  pmcExtremes: PMCExtremes | null;
  profile:
    | (Pick<
        UserProfile,
        | "maxHeartRate"
        | "restingHeartRate"
        | "ftp"
        | "cp"
        | "tp"
        | "cs"
        | "lthr"
        | "timezone"
      > & {
        ftpSport?: HomeMetricSport | null;
        cpSport?: HomeMetricSport | null;
        tpSport?: HomeMetricSport | null;
        csSport?: HomeMetricSport | null;
      })
    | null;
  weather: V2HomeWeatherContext;
  aiTodaySuggestion: V2HomeTodayAdvice | null;
};

/** Next Route：`app/api/v2/home/route.ts` */
export const V2_HOME_API_PATH = "/api/v2/home";

function toHomeUrl(locale?: string): string {
  if (!locale) return V2_HOME_API_PATH;
  const params = new URLSearchParams({ locale });
  return `${V2_HOME_API_PATH}?${params.toString()}`;
}

function internalAppOrigin() {
  const configured = process.env.CLIENT_INTERNAL_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const port = process.env.PORT?.trim() || "3002";
  return `http://127.0.0.1:${port}`;
}

function emptyV2HomeResponse(): V2HomeResponse {
  return {
    activePlan: null,
    recentActivity: null,
    fitnessStatus: null,
    pmcExtremes: null,
    profile: null,
    weather: emptyHomeWeatherContext(),
    aiTodaySuggestion: null,
  };
}

function logHomeServerError(
  stage: string,
  details: Record<string, unknown>,
  error?: unknown,
) {
  console.error(`[home:ssr] ${stage}`, details, error ?? "");
}

export async function getV2Home(locale?: string): Promise<V2HomeResponse> {
  const pendingAuthFailure =
    typeof window === "undefined" ? undefined : getPendingAuthFailure();
  if (pendingAuthFailure) return pendingAuthFailure;

  const response = await fetch(toHomeUrl(locale), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    const error = new ApiFetchError("Unauthorized", 401, "UNAUTHORIZED");
    if (typeof window !== "undefined") return handleUnauthorized(error);
    throw error;
  }

  if (!response.ok) {
    throw new ApiFetchError(
      `Failed to fetch v2 home (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as V2HomeResponse;
}

export async function getV2HomeServer(
  requestHeaders: Pick<Headers, "get"> | null,
): Promise<V2HomeResponse> {
  const locale = requestHeaders?.get("x-lang") ?? "en";
  const homePath = toHomeUrl(locale);
  let homeUrl: string;
  try {
    homeUrl = new URL(homePath, internalAppOrigin()).toString();
  } catch (error) {
    logHomeServerError(
      "invalid internal app origin",
      { origin: internalAppOrigin(), homePath },
      error,
    );
    return emptyV2HomeResponse();
  }

  let response: Response;
  try {
    response = await fetch(homeUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: requestHeaders?.get("cookie") ?? "",
        "x-lang": requestHeaders?.get("x-lang") ?? "en",
        "x-region": requestHeaders?.get("x-region") ?? "international",
      },
    });
  } catch (error) {
    logHomeServerError("home request failed", { homePath }, error);
    return emptyV2HomeResponse();
  }

  if (!response.ok) {
    if (response.status >= 500) {
      logHomeServerError("home returned an error", {
        homePath,
        status: response.status,
        contentType: response.headers.get("content-type"),
      });
    }
    return emptyV2HomeResponse();
  }

  const raw = await response.text().catch((error) => {
    logHomeServerError("home body read failed", { homePath }, error);
    return "";
  });
  if (!raw.trim()) return emptyV2HomeResponse();

  try {
    return JSON.parse(raw) as V2HomeResponse;
  } catch (error) {
    logHomeServerError(
      "home returned invalid JSON",
      {
        homePath,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyLength: raw.length,
      },
      error,
    );
    return emptyV2HomeResponse();
  }
}

export function emptyHomeWeatherContext(): V2HomeWeatherContext {
  return {
    status: "unavailable",
    summary: null,
    temperatureC: null,
    feelsLikeC: null,
    precipitationProbability: null,
    windKph: null,
    airQuality: null,
  };
}

export function mapTrainingPlanToHomePlan(
  plan: TrainingPlanDetail,
  todayKey: string,
): V2HomeActivePlan {
  const planStart = plan.startDate ? new Date(plan.startDate) : null;
  const workouts = plan.workouts.map((workout) => {
    let scheduledDate = workout.scheduledDate
      ? String(workout.scheduledDate).slice(0, 10)
      : null;
    if (!scheduledDate && planStart) {
      const date = new Date(planStart);
      date.setDate(date.getDate() + workout.dayOffset);
      scheduledDate = date.toISOString().slice(0, 10);
    }
    const firstLink = workout.links?.find((link) => !link.unlinkedAt);
    const nameTrim =
      typeof workout.name === "string" ? workout.name.trim() : "";
    const notesTrim =
      typeof workout.notes === "string" ? workout.notes.trim() : "";
    /** 展示用短标题：只用人读字段，不把结构化 text/DSL 塞进 title */
    const displayTitle = nameTrim || notesTrim || "";
    return {
      id: workout.id,
      planId: workout.planId ?? plan.id,
      name: nameTrim || null,
      title: displayTitle,
      description: nameTrim && notesTrim ? notesTrim : null,
      text: workout.text,
      notes: workout.notes ?? null,
      sportType: workout.sportType,
      status: workout.status,
      scheduledDate,
      dayOffset: workout.dayOffset,
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sessionIndex: workout.sessionIndex,
      linkedActivityTitle: firstLink ? `#${firstLink.activityId}` : null,
      estimatedLoad: workout.estimatedLoad ?? null,
    } satisfies V2HomePlanWorkout;
  });

  const currentWeek = plan.currentWeekIndex ?? 1;

  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? null,
    goal: plan.goal ?? null,
    periodWeeks: plan.periodWeeks,
    startDate: plan.startDate,
    endDate: plan.endDate,
    currentWeekIndex: plan.currentWeekIndex,
    currentDayIndex: plan.currentDayIndex,
    todayWorkouts: workouts
      .filter((workout) => workout.scheduledDate === todayKey)
      .sort((a, b) => a.sessionIndex - b.sessionIndex),
    currentWeekWorkouts: workouts
      .filter((workout) => workout.weekIndex === currentWeek)
      .sort(
        (a, b) => a.dayIndex - b.dayIndex || a.sessionIndex - b.sessionIndex,
      ),
  };
}
