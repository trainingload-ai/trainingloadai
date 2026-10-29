import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "./analytics";

describe("self-host operation analytics", () => {
  beforeEach(() => {
    window.__trainingloadTelemetryConsent = true;
    window.gtag = vi.fn();
    window.history.replaceState({}, "", "/zh/activities/private-activity-id");
  });

  it("drops every call-site property and route value", () => {
    track("onboarding_step_completed", {
      activityId: "private-activity-id",
      ftp: 300,
      email: "athlete@example.com",
    });

    expect(window.gtag).toHaveBeenCalledWith(
      "event",
      "onboarding_step_completed",
      {
        deployment: "self_host",
        page_location: "https://self-host.invalid/",
        page_referrer: "",
      },
    );
  });

  it("does not send unknown events", () => {
    track("activity_private-activity-id_opened");
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("does not send anything without explicit consent", () => {
    window.__trainingloadTelemetryConsent = false;
    track("onboarding_started");
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
