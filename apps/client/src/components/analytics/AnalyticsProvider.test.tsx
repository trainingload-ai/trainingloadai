import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";

const analytics = vi.hoisted(() => ({
  identify: vi.fn(),
  isAnalyticsEnabled: vi.fn(() => true),
  resetAnalytics: vi.fn(),
  track: vi.fn(),
  trackPageView: vi.fn(),
}));
const searchParams = new URLSearchParams(
  "from=docs-tool&tool=free_ai_workout_review&cta=result_sidebar",
);

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/signup",
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/auth", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "user-1" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/analytics", () => analytics);

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";

describe("AnalyticsProvider", () => {
  beforeEach(() => {
    Object.values(analytics).forEach((mock) => mock.mockClear());
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/en/signup?token=private");
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://www.trainingload.ai/en/free-ai-workout-review?private=1",
    });
  });

  it("identifies the user and records one system entry in Strict Mode", async () => {
    render(
      <StrictMode>
        <AnalyticsProvider />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(analytics.track).toHaveBeenCalledTimes(1);
    });

    expect(analytics.identify).toHaveBeenCalledWith("user-1", {
      locale: "en",
    });
    expect(analytics.track).toHaveBeenCalledWith("app_session_started", {
      event_schema_version: "1.0",
      landing_path: "/en/signup",
      auth_state: "authenticated",
      entry_source: "docs_tool",
      source_tool_id: "free_ai_workout_review",
      cta_placement: "result_sidebar",
    });
  });
});
