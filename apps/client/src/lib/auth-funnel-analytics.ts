import { readSignUpAttribution } from "@/lib/app-entry-analytics";
import { trackProductFunnelEvent } from "@deployment/managed-ui";

export type AuthAnalyticsMethod = string;

const AUTH_FLOW_STORAGE_KEY = "analytics:auth-flow:v1";

type AuthFlowState = {
  completed: boolean;
  method: AuthAnalyticsMethod;
};

function readState(): AuthFlowState | undefined {
  try {
    const raw = window.sessionStorage.getItem(AUTH_FLOW_STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<AuthFlowState>;
    if (
      typeof value.completed !== "boolean" ||
      typeof value.method !== "string" ||
      value.method.length === 0
    ) {
      return undefined;
    }
    return value as AuthFlowState;
  } catch {
    return undefined;
  }
}

function writeState(state: AuthFlowState) {
  try {
    window.sessionStorage.setItem(AUTH_FLOW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-component ref in the completion page remains the fallback guard.
  }
}

export function beginAuthAnalyticsFlow(method: AuthAnalyticsMethod) {
  if (typeof window === "undefined") return;
  writeState({ completed: false, method });
}

export function getPendingAuthMethod() {
  if (typeof window === "undefined") return undefined;
  return readState()?.method;
}

export function finishAuthAnalyticsFlowWithoutSignup() {
  if (typeof window === "undefined") return;
  const state = readState();
  if (state) writeState({ ...state, completed: true });
}

export function trackSignUpCompleted(userId?: string | null) {
  if (typeof window === "undefined") return false;

  const state = readState();
  if (state?.completed) return false;
  if (userId) {
    try {
      const userKey = `analytics:sign-up-completed:v1:${userId}`;
      if (window.localStorage.getItem(userKey) === "1") {
        if (state) writeState({ ...state, completed: true });
        return false;
      }
      window.localStorage.setItem(userKey, "1");
    } catch {
      // Session flow state still protects the current browser tab.
    }
  }
  if (state) writeState({ ...state, completed: true });

  trackProductFunnelEvent("signup_completed", {
    method: state?.method,
    ...readSignUpAttribution(window.sessionStorage),
  });
  return true;
}
