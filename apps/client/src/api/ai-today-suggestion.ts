import { apiFetch } from "@/lib/api";
import type { V2HomeWeatherContext } from "@/api/v2-home";
import type {
  TodaySuggestionInteractionInput,
  TodaySuggestionReminderResult,
  TodaySuggestionV2,
  TodaySuggestionWorkoutExecutionResult,
} from "@shared/ai-today-suggestion-contract";

export type AiTodaySuggestionWorkoutContext = {
  workoutId?: string;
  title: string;
  sport: string | null;
  duration: string | null;
  status: string;
  focus: string | null;
  expectedLoad?: number | null;
  linkedActivityCount?: number;
};

export type AiTodaySuggestionContext = {
  locale: string;
  date: string;
  weekday: string;
  timezone: string | null;
  factHash?: string;
  contextId?: string | null;
  dayCompletionState?: string;
  activePlan: {
    title: string;
    goal: string | null;
    periodWeeks: number;
    currentWeekIndex: number | null;
  } | null;
  todayWorkouts: AiTodaySuggestionWorkoutContext[];
  tomorrowWorkouts?: AiTodaySuggestionWorkoutContext[];
  load: {
    currentWeekLoad: number | null;
    previousWeekLoad: number | null;
    loadDrift: number | null;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
  };
  recentActivity: {
    title: string | null;
    sportType: string | null;
    startTime: string | null;
    durationMinutes: number | null;
    distanceKm: number | null;
    load: number | null;
    status?: string | null;
    linkedPlanWorkout?: {
      planId: string;
      workoutId: string;
      source: string;
      role: string;
    } | null;
  } | null;
  linkedActivities?: unknown[];
  unlinkedActivities?: unknown[];
  weather: V2HomeWeatherContext;
};

export type AiTodaySuggestionResponse = TodaySuggestionV2 & {
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

export type TodaySuggestionLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export async function readAuthorizedWeatherLocation(): Promise<TodaySuggestionLocation | null> {
  if (process.env.NEXT_PUBLIC_AI_TODAY_WEATHER_ENABLED !== "true") return null;
  if (
    typeof navigator === "undefined" ||
    !navigator.geolocation ||
    !navigator.permissions
  ) {
    return null;
  }
  try {
    const permission = await navigator.permissions.query({
      name: "geolocation",
    });
    if (permission.state !== "granted") return null;
    const position = await new Promise<GeolocationPosition | null>(
      (resolve) => {
        navigator.geolocation.getCurrentPosition(
          (value) => resolve(value),
          () => resolve(null),
          {
            enableHighAccuracy: false,
            maximumAge: 15 * 60_000,
            timeout: 2_000,
          },
        );
      },
    );
    if (!position) return null;
    return {
      latitude: Math.round(position.coords.latitude * 1_000) / 1_000,
      longitude: Math.round(position.coords.longitude * 1_000) / 1_000,
      accuracyMeters: Math.max(0, position.coords.accuracy),
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getAiTodaySuggestion(
  locale?: string,
  timezone?: string,
  location?: TodaySuggestionLocation | null,
) {
  return apiFetch<AiTodaySuggestionResponse>("/ai/today-suggestion", {
    method: "POST",
    body: JSON.stringify({
      ...(locale?.trim() ? { locale: locale.trim() } : {}),
      ...(timezone?.trim() ? { timezone: timezone.trim() } : {}),
      ...(location ? { location } : {}),
    }),
  });
}

export function recordTodaySuggestionInteraction(
  generationToken: string,
  input: TodaySuggestionInteractionInput,
) {
  return apiFetch(
    `/ai/today-suggestion/${encodeURIComponent(generationToken)}/interactions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createTodaySuggestionWorkout(generationToken: string) {
  return apiFetch<TodaySuggestionWorkoutExecutionResult>(
    `/ai/today-suggestion/${encodeURIComponent(generationToken)}/workout`,
    { method: "POST", suppressErrorToast: true },
  );
}

export function scheduleTodaySuggestionReminder(
  generationToken: string,
  remindAt: string,
) {
  return apiFetch<TodaySuggestionReminderResult>(
    `/ai/today-suggestion/${encodeURIComponent(generationToken)}/reminder`,
    { method: "POST", body: JSON.stringify({ remindAt }) },
  );
}

export function cancelTodaySuggestionReminder(generationToken: string) {
  return apiFetch<{ cancelled: boolean }>(
    `/ai/today-suggestion/${encodeURIComponent(generationToken)}/reminder`,
    { method: "DELETE" },
  );
}
