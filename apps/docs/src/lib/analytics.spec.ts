import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  capture: vi.fn(),
  postHogEnabled: true,
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: mocks.addBreadcrumb,
}));

vi.mock("@/lib/posthog-client", () => ({
  capturePostHogEvent: mocks.capture,
  isPostHogEnabled: () => mocks.postHogEnabled,
}));

import { trackMarketingEvent, trackMarketingPageView } from "@/lib/analytics";

describe("marketing analytics routing", () => {
  const gtag = vi.fn();
  const dataLayer: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
    gtag.mockReset();
    dataLayer.length = 0;
    mocks.addBreadcrumb.mockReset();
    mocks.capture.mockReset();
    mocks.postHogEnabled = true;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dataLayer,
        gtag,
        location: {
          pathname: "/en/ftp-calculator",
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("sends the same safe custom event to every configured sink", () => {
    trackMarketingEvent("tool_started", {
      app: "untrusted-caller",
      event_schema_version: "1.0",
      page_path: "/should-not-win?secret=value",
      tool_id: "ftp_calculator",
    });

    const expectedPayload = {
      app: "docs",
      event_schema_version: "1.0",
      page_path: "/en/ftp-calculator",
      tool_id: "ftp_calculator",
    };

    expect(gtag).toHaveBeenCalledWith("event", "tool_start", {
      locale: "en",
      page_path: "/en/ftp-calculator",
      tool_category: "calculator",
      tool_name: "ftp_calculator",
    });
    expect(dataLayer).toEqual([]);
    expect(mocks.capture).toHaveBeenCalledWith("tool_started", expectedPayload);
    expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "marketing",
        data: expectedPayload,
        message: "tool_started",
      }),
    );
  });

  it("keeps PostHog working when another analytics sink throws", () => {
    gtag.mockImplementationOnce(() => {
      throw new Error("gtag unavailable");
    });

    trackMarketingEvent("tool_completed", {
      tool_id: "ftp_calculator",
    });

    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(dataLayer).toHaveLength(0);
  });

  it("sends explicit pageviews only to PostHog", () => {
    trackMarketingPageView({
      locale: "en",
      page_path: "/en/ftp-calculator",
    });

    expect(mocks.capture).toHaveBeenCalledWith("$pageview", {
      app: "docs",
      locale: "en",
      page_path: "/en/ftp-calculator",
    });
    expect(gtag).not.toHaveBeenCalled();
    expect(dataLayer).toHaveLength(0);
    expect(mocks.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("does not call PostHog when the production token is absent", () => {
    mocks.postHogEnabled = false;

    trackMarketingEvent("tool_started", {
      tool_id: "ftp_calculator",
    });

    expect(mocks.capture).not.toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledOnce();
    expect(dataLayer).toHaveLength(0);
  });

  it("maps canonical tool completion and errors to the GA4 funnel schema", () => {
    trackMarketingEvent("tool_completed", {
      output_format: "fit",
      tool_id: "activity_file_converter_gpx-to-fit",
    });
    trackMarketingEvent("tool_failed", {
      error_code: "file_type_unsupported",
      tool_id: "activity_file_converter",
    });

    expect(gtag).toHaveBeenNthCalledWith(1, "event", "tool_success", {
      locale: "en",
      page_path: "/en/ftp-calculator",
      result_type: "fit",
      tool_category: "file_tool",
      tool_name: "gpx_to_fit",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "tool_error", {
      error_code: "unsupported_format",
      locale: "en",
      page_path: "/en/ftp-calculator",
      tool_category: "file_tool",
      tool_name: "file_converter",
    });
  });

  it("preserves lactate sample isolation across GA4 outcomes and CTA mapping", () => {
    for (const name of [
      "tool_started",
      "tool_completed",
      "tool_no_result",
      "tool_input_rejected",
      "tool_failed",
      "tool_app_cta_clicked",
    ]) {
      trackMarketingEvent(name, {
        tool_id: "lactate_curve_calculator",
        input_origin: "example_edited",
        input_method: "manual",
        engine_version: "1.0.0",
        status: "partial",
        reason_code: "no_applicable_method",
        stage: "analysis",
        destination: "signup",
        cta_placement: "result",
      });
    }
    expect(gtag.mock.calls.map((row) => row[1])).toEqual([
      "tool_start",
      "tool_success",
      "tool_no_result",
      "tool_input_rejected",
      "tool_error",
      "signup_click",
    ]);
    for (const [, , properties] of gtag.mock.calls) {
      expect(properties).toMatchObject({
        tool_name: "lactate_curve_calculator",
        input_origin: "example_edited",
        input_method: "manual",
        engine_version: "1.0.0",
        status: "partial",
      });
    }
    expect(mocks.capture).toHaveBeenCalledTimes(6);
  });

  it("does not report a clipboard failure as a business-level tool error", () => {
    trackMarketingEvent("tool_failed", {
      error_code: "clipboard_failed",
      tool_id: "critical_power_calculator",
    });

    expect(gtag).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledOnce();
  });
});
