import type {
  AthleteMemoryFact,
  AthleteMemoryPage,
  AthleteMemoryPreference,
} from "@shared/athlete-memory";
import { apiFetch } from "@/lib/api";

export function fetchAthleteMemoryPreference() {
  return apiFetch<AthleteMemoryPreference>("/athlete-memory/preference");
}

export function updateAthleteMemoryPreference(input: {
  enabled: boolean;
  clearHistory?: boolean;
}) {
  return apiFetch<AthleteMemoryPreference & { deleted?: number }>(
    "/athlete-memory/preference",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function fetchAthleteMemoryPage(cursor?: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<AthleteMemoryPage>(`/athlete-memory?${params.toString()}`);
}

export function correctAthleteMemoryFact(input: {
  factId: string;
  expectedVersion: number;
  claim: string;
  category?: string;
}) {
  return apiFetch<AthleteMemoryFact>(
    `/athlete-memory/${encodeURIComponent(input.factId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        claim: input.claim,
        ...(input.category ? { category: input.category } : {}),
      }),
    },
  );
}

export function deleteAthleteMemoryFact(factId: string) {
  return apiFetch<{ ok: true }>(
    `/athlete-memory/${encodeURIComponent(factId)}`,
    { method: "DELETE" },
  );
}

export function exportAthleteMemory() {
  return apiFetch<unknown>("/athlete-memory/export");
}
