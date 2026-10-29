import { apiFetch } from "@/lib/api";

export type TimezonePromptResponse = {
  shouldPrompt: boolean;
  suggestedTimezone: string | null;
  consecutiveCount: number;
  profileTimezone: string | null;
};

export async function getTimezonePrompt() {
  return await apiFetch<TimezonePromptResponse>("/users/me/timezone-prompt");
}

export type TimezoneInitializationResponse = {
  timezone: string | null;
  initialized: boolean;
  source: "EXISTING" | "ACTIVITY_COORDINATES" | "CLIENT" | "NONE";
};

export async function initializeTimezoneIfAbsent(clientTimezone?: string) {
  return await apiFetch<TimezoneInitializationResponse>(
    "/users/me/timezone-initialize",
    {
      method: "POST",
      body: JSON.stringify({ clientTimezone: clientTimezone || null }),
    },
  );
}
