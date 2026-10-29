import type {
  V2ActivityLinkedPlanWorkout,
  V2ActivitySportType,
} from "@/api/v2-activities";
import { apiFetch } from "@/lib/api";

export type ActivityPlanLinkWorkout = V2ActivityLinkedPlanWorkout & {
  actualLoad?: number | null;
  actualLoadSource?: string | null;
  completedAt?: string | null;
  expectedDurationSec?: number | null;
  notes?: string | null;
  plannedLoad?: number | null;
  planTitle?: string | null;
  scheduledDate?: string | null;
  status?: string | null;
  structureKind?: string | null;
};

export type ActivityPlanCandidate = {
  workoutId: string;
  planId: string;
  name: string | null;
  sportType: V2ActivitySportType;
  sessionIndex: number;
  expectedDurationSec: number | null;
  occupiedBy?: {
    activityId: number;
    hashId: string;
    title: string;
  } | null;
};

export async function getActivityPlanLink(hashId: string) {
  return apiFetch<{ linkedPlanWorkout: ActivityPlanLinkWorkout | null }>(
    `/activities/${encodeURIComponent(hashId)}/plan-workout/link`,
    { method: "GET" },
  );
}

export async function getActivityPlanCandidates(hashId: string) {
  const tz =
    typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined;
  const qs = tz ? `?timeZone=${encodeURIComponent(tz)}` : "";
  return apiFetch<{ candidates: ActivityPlanCandidate[] }>(
    `/activities/${encodeURIComponent(hashId)}/plan-workout/candidates${qs}`,
    { method: "GET" },
  );
}

export async function replaceActivityPlanLink(
  hashId: string,
  workoutId: string,
) {
  return apiFetch<{ linkedPlanWorkout: V2ActivityLinkedPlanWorkout }>(
    `/activities/${encodeURIComponent(hashId)}/plan-workout/link`,
    {
      method: "POST",
      body: JSON.stringify({ workoutId }),
    },
  );
}

export async function removeActivityPlanLink(hashId: string) {
  return apiFetch<{ success: true }>(
    `/activities/${encodeURIComponent(hashId)}/plan-workout/link`,
    { method: "DELETE" },
  );
}
