import { useSyncExternalStore } from "react";
import { normalizeCoachSid } from "./coach-sid-model";
import { readSidFromBrowser } from "./ai-coach-utils";

const LAST_COACH_SID_STORAGE_KEY = "ai_coach_sid";

type CoachSidPendingFlags = {
  urlClearPending: boolean;
  urlApplyPending: boolean;
};

let sid = "";
let didInit = false;
let urlClearPending = false;
let urlApplyPending = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persistSid(next: string) {
  if (typeof window === "undefined") return;
  try {
    if (next) {
      window.localStorage.setItem(LAST_COACH_SID_STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(LAST_COACH_SID_STORAGE_KEY);
    }
  } catch {
    // Ignore private browsing / quota errors.
  }
}

export function subscribeCoachSid(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCoachSidSnapshot() {
  return sid;
}

export function getServerCoachSidSnapshot() {
  return "";
}

export function getCoachSidPendingFlags(): CoachSidPendingFlags {
  return { urlClearPending, urlApplyPending };
}

export function initCoachSidFromBrowser() {
  if (didInit || typeof window === "undefined") return;
  didInit = true;
  sid = readSidFromBrowser();
  if (sid) persistSid(sid);
}

export function writeCoachSid(next: string) {
  const normalized = normalizeCoachSid(next);
  persistSid(normalized);
  if (sid === normalized) return;
  sid = normalized;
  emit();
}

export function setCoachSidPendingFlags(flags: Partial<CoachSidPendingFlags>) {
  if (flags.urlClearPending !== undefined) {
    urlClearPending = flags.urlClearPending;
  }
  if (flags.urlApplyPending !== undefined) {
    urlApplyPending = flags.urlApplyPending;
  }
}

export function useSharedCoachSid() {
  initCoachSidFromBrowser();
  return useSyncExternalStore(
    subscribeCoachSid,
    getCoachSidSnapshot,
    getServerCoachSidSnapshot,
  );
}

/** 仅测试：重置模块状态，避免用例互相污染。 */
export function resetCoachSidStoreForTests() {
  sid = "";
  didInit = false;
  urlClearPending = false;
  urlApplyPending = false;
}
