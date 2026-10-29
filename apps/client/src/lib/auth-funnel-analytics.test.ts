const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({ track }));

import {
  beginAuthAnalyticsFlow,
  finishAuthAnalyticsFlowWithoutSignup,
  getPendingAuthMethod,
  trackSignUpCompleted,
} from "@/lib/auth-funnel-analytics";
import { APP_ENTRY_ATTRIBUTION_STORAGE_KEY } from "@/lib/app-entry-analytics";

describe("auth funnel analytics", () => {
  const localValues = new Map<string, string>();

  beforeEach(() => {
    track.mockClear();
    window.sessionStorage.clear();
    localValues.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => localValues.get(key) ?? null,
        setItem: (key: string, value: string) => localValues.set(key, value),
      },
    });
  });

  it("tracks a successful signup once with its original tool attribution", () => {
    window.sessionStorage.setItem(
      APP_ENTRY_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        cta_name: "start_free",
        signup_source: "docs_tool",
        source_context: "tool_page",
        source_page: "/en/signup",
        tool_name: "fit_file_viewer",
      }),
    );
    beginAuthAnalyticsFlow("google");

    expect(trackSignUpCompleted("user-1")).toBe(true);
    expect(trackSignUpCompleted("user-1")).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("signup_completed", {
      cta_name: "start_free",
      method: "google",
      signup_source: "docs_tool",
      source_context: "tool_page",
      source_page: "/en/signup",
      tool_name: "fit_file_viewer",
    });
  });

  it("does not turn an existing-user login into a signup", () => {
    beginAuthAnalyticsFlow("email");
    expect(getPendingAuthMethod()).toBe("email");
    finishAuthAnalyticsFlowWithoutSignup();

    expect(trackSignUpCompleted("user-1")).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });
});
