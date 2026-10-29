import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewAutomationSettings } from "./ReviewAutomationSettings";

const mocks = vi.hoisted(() => ({
  accessAllowed: false,
  consentGranted: true,
  reviewMode: JSON.stringify({
    activityReview: true,
    dailyReview: true,
    weeklyReview: true,
    monthlyReview: true,
    planReview: true,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { AI_REVIEW_MODE: mocks.reviewMode } }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/api/feature-access", () => ({
  useFeatureAccess: () => ({
    data: { allowed: mocks.accessAllowed },
  }),
  featureAllowed: (data: { allowed?: boolean } | undefined) =>
    data?.allowed === true,
}));

vi.mock("@/api/ai-data-consent", () => ({
  useAiDataConsent: () => ({
    data: { granted: mocks.consentGranted },
  }),
}));

vi.mock("@/api/settings", () => ({
  getUserSettings: vi.fn(),
  updateUserSetting: vi.fn(),
}));

describe("ReviewAutomationSettings feature access", () => {
  beforeEach(() => {
    mocks.accessAllowed = false;
    mocks.consentGranted = true;
  });

  it("disables controls when the instance policy denies access", () => {
    render(<ReviewAutomationSettings />);

    expect(
      screen.getByText("reviewAutomation.accessRequired"),
    ).toBeInTheDocument();
    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeDisabled();
    }
  });

  it("keeps controls available when the neutral feature policy grants access", () => {
    mocks.accessAllowed = true;

    render(<ReviewAutomationSettings />);

    expect(screen.queryByText("reviewAutomation.accessRequired")).toBeNull();
    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeEnabled();
    }
  });
});
