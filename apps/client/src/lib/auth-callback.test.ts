import { beforeEach, describe, expect, it } from "vitest";

import {
  getAuthCompleteCallbackUrl,
  getOnboardingNextPathFromLocation,
  getOnboardingPath,
  getOnboardingUrlFromLocation,
  getSignupHrefWithCallback,
} from "./auth-callback";

describe("auth onboarding callback", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/en/activities");
  });

  it("keeps a local return path through signup and onboarding", () => {
    expect(getSignupHrefWithCallback("/activities")).toBe(
      "/signup?callbackURL=%2Factivities",
    );
    expect(getOnboardingPath("/activities")).toBe(
      "/onboarding?next=%2Factivities",
    );
  });

  it("restores the safe onboarding destination", () => {
    window.history.replaceState(
      {},
      "",
      "/en/onboarding?next=%2Factivities&step=intro",
    );

    expect(getOnboardingNextPathFromLocation()).toBe("/activities");
  });

  it("rejects an external onboarding destination", () => {
    window.history.replaceState(
      {},
      "",
      "/en/onboarding?next=https%3A%2F%2Fevil.example%2Fsteal",
    );

    expect(getOnboardingNextPathFromLocation()).toBe("/");
  });

  it("does not nest onboarding inside its own return path", () => {
    expect(getOnboardingPath("/onboarding?next=%2Fonboarding")).toBe(
      "/onboarding",
    );
  });

  it("escapes a recursively nested localized onboarding destination", () => {
    window.history.replaceState(
      {},
      "",
      "/zh/onboarding?next=%2Fonboarding%3Fnext%3D%252Fonboarding&step=ai-data-consent",
    );

    expect(getOnboardingNextPathFromLocation()).toBe("/");
  });

  it("keeps the managed auth completion route localized", () => {
    const result = new URL(getAuthCompleteCallbackUrl("/account", "zh"));

    expect(result.pathname).toBe("/zh/auth/complete");
    expect(result.searchParams.get("next")).toBe("/account");
    expect(result.searchParams.get("locale")).toBe("zh");
  });

  it("sends a new self-host owner directly to localized onboarding", () => {
    window.history.replaceState({}, "", "/zh/setup");

    const result = new URL(getOnboardingUrlFromLocation("zh"));

    expect(result.pathname).toBe("/zh/onboarding");
    expect(result.search).toBe("");
  });

  it("preserves a safe post-onboarding destination", () => {
    window.history.replaceState(
      {},
      "",
      "/zh/setup?callbackURL=%2Fzh%2Fsettings%3Ftab%3Dai",
    );

    const result = new URL(getOnboardingUrlFromLocation("zh"));

    expect(result.pathname).toBe("/zh/onboarding");
    expect(result.searchParams.get("next")).toBe("/settings?tab=ai");
  });
});
