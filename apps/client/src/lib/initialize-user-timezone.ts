import { initializeTimezoneIfAbsent } from "@/api/timezone-prompt";

let pendingInitialization: ReturnType<
  typeof initializeTimezoneIfAbsent
> | null = null;

function detectBrowserTimezone(): string | undefined {
  if (typeof Intl === "undefined") return undefined;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function ensureUserTimezoneInitialized() {
  const pending =
    pendingInitialization ??
    initializeTimezoneIfAbsent(detectBrowserTimezone());
  pendingInitialization = pending;
  try {
    return await pending;
  } finally {
    if (pendingInitialization === pending) pendingInitialization = null;
  }
}
