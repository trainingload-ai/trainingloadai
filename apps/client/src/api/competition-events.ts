import { apiFetch } from "@/lib/api";

export type CompetitionImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CompetitionGoalType =
  | "FINISH"
  | "TARGET_TIME"
  | "PERFORMANCE"
  | "EXPERIENCE";
export type CompetitionStatus = "PLANNED" | "COMPLETED" | "CANCELLED";

export type CompetitionEvent = {
  id: string;
  title: string;
  sportType: "RUN" | "CYCLING" | "SWIM" | "STRETCHING" | "UNKNOWN";
  sportDefinitionCode: string | null;
  sportDefinition: { code: string; displayName: string } | null;
  distanceMeters: number | null;
  startDate: string;
  endDate: string | null;
  startTimeMinute: number | null;
  timezone: string | null;
  importance: CompetitionImportance;
  goalType: CompetitionGoalType;
  targetTimeSeconds: number | null;
  location: string | null;
  notes: string | null;
  status: CompetitionStatus;
  source: "MANUAL" | "AI" | "IMPORTED";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CompetitionEventWriteInput = {
  title: string;
  sportType: CompetitionEvent["sportType"];
  sportDefinitionCode?: string | null;
  distanceMeters?: number | null;
  startDate: string;
  endDate?: string | null;
  startTimeMinute?: number | null;
  timezone?: string | null;
  importance: CompetitionImportance;
  goalType: CompetitionGoalType;
  targetTimeSeconds?: number | null;
  location?: string | null;
  notes?: string | null;
};

export type CompetitionImpactLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CompetitionEventImpactAssessment = {
  eventId: string;
  relevant: boolean;
  confidence: number;
  currentImpactLevel: CompetitionImpactLevel;
  influenceWindow: {
    startDate: string;
    endDate: string;
    preEventWeeks: number;
    postEventWeeks: number;
  } | null;
  phases: Array<{
    type: string;
    startDate: string;
    endDate: string;
    impactLevel: CompetitionImpactLevel;
  }>;
  constraints: Array<{
    type: string;
    startDate: string;
    endDate: string;
    strength: CompetitionImpactLevel;
    parameters: Record<string, string | number | boolean | null>;
  }>;
  reasoningSummary: string;
  evidence: string[];
  assumptions: string[];
  riskFlags: string[];
};

export type CompetitionImpactResponse = {
  assessmentId: string | null;
  status: "SUCCESS" | "FALLBACK" | "FAILED" | "PENDING";
  cacheHit: boolean;
  assessedAt: string;
  confidence: number;
  fallbackVersion: string | null;
  events: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate: string | null;
    importance: CompetitionImportance;
    sportType: string;
    distanceMeters: number | null;
  }>;
  result: {
    eventAssessments: CompetitionEventImpactAssessment[];
    combinedImpact: {
      overallLevel: CompetitionImpactLevel;
      conflicts: Array<{
        eventIds: string[];
        type: string;
        severity: CompetitionImpactLevel;
        summary: string;
      }>;
      strategySummary: string;
    };
  };
};

export async function getCompetitionEvents(
  startDate: string,
  endDate: string,
  status?: CompetitionStatus,
) {
  const params = new URLSearchParams({ startDate, endDate });
  if (status) params.set("status", status);
  const response = await apiFetch<{ events: CompetitionEvent[] }>(
    `/competition-events?${params.toString()}`,
  );
  return response?.events ?? [];
}

export async function createCompetitionEvent(
  input: CompetitionEventWriteInput,
  idempotencyKey: string,
) {
  return apiFetch<CompetitionEvent>("/competition-events", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function updateCompetitionEvent(
  eventId: string,
  expectedVersion: number,
  input: Partial<CompetitionEventWriteInput>,
) {
  const response = await apiFetch<{
    event: CompetitionEvent;
    impactState: "STALE";
  }>(`/competition-events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, expectedVersion }),
  });
  return response?.event;
}

export async function cancelCompetitionEvent(
  eventId: string,
  expectedVersion: number,
) {
  return apiFetch<CompetitionEvent>(`/competition-events/${eventId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function restoreCompetitionEvent(
  eventId: string,
  expectedVersion: number,
) {
  return apiFetch<CompetitionEvent>(`/competition-events/${eventId}/restore`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function deleteCompetitionEvent(
  eventId: string,
  expectedVersion: number,
) {
  return apiFetch<CompetitionEvent>(`/competition-events/${eventId}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function resolveCompetitionImpact(input: {
  scopeType: "CALENDAR_RANGE" | "DAY_DECISION";
  scopeStartDate: string;
  scopeEndDate: string;
  anchorDate: string;
  locale: string;
  forceRefresh?: boolean;
}) {
  return apiFetch<CompetitionImpactResponse>("/competition-impact/resolve", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCurrentCompetitionImpact(input: {
  scopeType: "PLAN_EXECUTION" | "CALENDAR_RANGE" | "DAY_DECISION";
  scopeStartDate: string;
  scopeEndDate: string;
  anchorDate: string;
  locale: string;
}) {
  return apiFetch<CompetitionImpactResponse>("/competition-impact/current", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
