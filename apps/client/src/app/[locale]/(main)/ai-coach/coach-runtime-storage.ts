const THINKING_ENABLED_STORAGE_KEY = "ai-coach-v2-thinking-enabled";
const COACH_SESSION_INTENT_STORAGE_KEY = "ai-coach-v2-session-intent";

export function readStoredSessionIntent(sid: string) {
  if (typeof window === "undefined" || !sid.trim()) return null;

  try {
    const raw = window.sessionStorage.getItem(COACH_SESSION_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sid?: string; intent?: string };
    if (parsed.sid !== sid.trim()) return null;
    return parsed.intent?.trim() || null;
  } catch {
    return null;
  }
}

export function writeStoredSessionIntent(sid: string, intent: string) {
  if (typeof window === "undefined" || !sid.trim() || !intent.trim()) return;

  try {
    window.sessionStorage.setItem(
      COACH_SESSION_INTENT_STORAGE_KEY,
      JSON.stringify({ sid: sid.trim(), intent: intent.trim() }),
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function readStoredThinkingEnabled() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(THINKING_ENABLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeStoredThinkingEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      THINKING_ENABLED_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}
