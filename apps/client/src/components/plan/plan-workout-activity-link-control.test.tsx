import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanWorkoutActivityLinkControl } from "./plan-workout-activity-link-control";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/api/activity-plan-link", () => ({
  removeActivityPlanLink: vi.fn(),
  replaceActivityPlanLink: vi.fn(),
}));

vi.mock("@/api/v2-activities", () => ({
  getV2ActivitiesFeed: vi.fn(),
}));

describe("PlanWorkoutActivityLinkControl", () => {
  it("centers the mobile action icon and label as one group", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PlanWorkoutActivityLinkControl
          workoutId="workout-one"
          sportType="RUN"
          scheduledDateKey="2026-08-11"
          links={[]}
          mobileAction
        />
      </QueryClientProvider>,
    );

    const label = screen.getByText("linkActivityAction");
    expect(label).toHaveClass("text-center");
    expect(label).not.toHaveClass("flex-1", "text-left");
    expect(label.parentElement).toHaveClass("justify-center");
  });
});
