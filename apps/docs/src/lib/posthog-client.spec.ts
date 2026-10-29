import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
}));

vi.mock("posthog-js/dist/module.slim.js", () => ({
  default: {
    capture: mocks.capture,
    init: mocks.init,
  },
}));

describe("PostHog client loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "test-token");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    mocks.capture.mockReset();
    mocks.init.mockReset();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("loads the slim SDK once and reuses it for concurrent events", async () => {
    const { capturePostHogEvent } = await import("@/lib/posthog-client");

    capturePostHogEvent("$pageview", {
      app: "docs",
      page_path: "/en/tools",
    });
    capturePostHogEvent("tool_viewed", {
      app: "docs",
      page_path: "/en/tools",
    });

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));

    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.init).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({
        advanced_disable_feature_flags: true,
        api_host: "https://eu.i.posthog.com",
        autocapture: false,
        capture_pageleave: false,
        capture_pageview: false,
        cross_subdomain_cookie: true,
        disable_session_recording: true,
        person_profiles: "identified_only",
        respect_dnt: true,
      }),
    );
  });

  it("removes query and hash values from automatic URL properties", async () => {
    const { capturePostHogEvent } = await import("@/lib/posthog-client");

    capturePostHogEvent("$pageview", {
      app: "docs",
      page_path: "/en/tools",
    });

    await vi.waitFor(() => expect(mocks.init).toHaveBeenCalledOnce());

    const config = mocks.init.mock.calls[0]?.[1];
    const event = {
      properties: {
        $current_url: "https://www.trainingload.ai/en/tools?token=secret#x",
        $initial_referrer: "https://search.example/result?q=private#top",
        $referrer: "$direct",
      },
    };

    expect(config.before_send(event)).toEqual({
      properties: {
        $current_url: "https://www.trainingload.ai/en/tools",
        $initial_referrer: "https://search.example/result",
        $referrer: "$direct",
      },
    });
  });

  it("does not load PostHog when the production token is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    const { capturePostHogEvent } = await import("@/lib/posthog-client");

    capturePostHogEvent("$pageview", {
      app: "docs",
      page_path: "/en/tools",
    });

    await Promise.resolve();
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not load PostHog for self-host unless telemetry is explicit", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_HOST_MODE", "core-local");
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "false");
    const { capturePostHogEvent } = await import("@/lib/posthog-client");

    capturePostHogEvent("$pageview", {
      app: "docs",
      page_path: "/en/tools",
    });

    await Promise.resolve();
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
