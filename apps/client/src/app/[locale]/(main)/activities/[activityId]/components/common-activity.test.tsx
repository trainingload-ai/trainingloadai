import React, { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommonActivityDetail from "./common-activity";
const state = vi.hoisted(() => ({
  timeline: null as Promise<{ default: React.ComponentType }> | null,
  resolve: null as ((value: { default: React.ComponentType }) => void) | null,
  mounts: 0,
}));
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options?: { loading?: React.ComponentType }) => {
    const Lazy = React.lazy(() => state.timeline!);
    const Loading = options?.loading;
    return (props: Record<string, unknown>) =>
      Loading ? (
        <Suspense fallback={<Loading />}>
          <Lazy {...props} />
        </Suspense>
      ) : (
        <Lazy {...props} />
      );
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/routing", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useActivityId", () => ({ useActivityId: () => "activity-1" }));
vi.mock("@/hooks/useActivities", () => ({
  useGetActivity: () => ({
    data: { sportType: "RUN", laps: [] },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useActivityDataChartConfig", () => ({
  useActivityDataChartConfig: () => ({ charts: [] }),
}));
vi.mock("@/lib/activity-data-charts", () => ({
  getActivityDataChartsForSport: () => [],
  getVisibleActivityDataCharts: () => [],
}));
vi.mock("@/lib/activity-detail-policy", () => ({
  getActivityDetailPolicy: () => ({ group: "RUN", showMap: true }),
  isActivityDataChartAllowed: () => true,
  isActivityDetailTabVisible: () => true,
}));
vi.mock("@/api/useActivityMetric", () => ({
  useActivityMetricAvailability: () => ({
    availableMetrics: new Set(),
    isLoading: false,
  }),
}));
vi.mock("./Overview", () => ({
  default: () => <div data-testid="summary">活动摘要</div>,
}));
vi.mock("./ActivityMap", () => ({
  default: () => <div data-testid="map">活动地图</div>,
}));
vi.mock("./ActivityHeader", () => ({
  ActivityHeader: () => <h1>上午跑步</h1>,
}));
vi.mock("./AIAnalysis", () => ({
  default: function Review() {
    React.useEffect(() => {
      state.mounts++;
    }, []);
    return <div data-testid="review">正在分析运动数据</div>;
  },
}));
vi.mock("./activity-analysis-link-context", () => ({
  ActivityAnalysisLinkProvider: ({ children }: React.PropsWithChildren) =>
    children,
}));
vi.mock("./heartRate/heartRatePage", () => ({ default: () => null }));
vi.mock("./power/power", () => ({ default: () => null }));
vi.mock("./pace/PacePage", () => ({ default: () => null }));
vi.mock("./slope/SlopeAnalysis", () => ({ default: () => null }));
vi.mock("./laps/ActivityLaps", () => ({ ActivityLaps: () => null }));
vi.mock("./ActivityConfigDialog", () => ({ ActivityConfigDialog: () => null }));
vi.mock("./ActivityDataChart", () => ({ ActivityDataChart: () => null }));
vi.mock("./ActivityStrengthSection", () => ({
  ActivityStrengthSection: () => null,
}));
vi.mock("./ActivityWeatherCard", () => ({ ActivityWeatherCard: () => null }));
vi.mock("./running-dynamics/RunningDynamicsPage", () => ({
  default: () => null,
}));
vi.mock("./BestIntervals", () => ({ BestIntervals: () => null }));
vi.mock("@/components/activities/generic-activity-data-notice", () => ({
  GenericActivityDataNotice: () => null,
}));
describe("activity analysis tab loading boundary", () => {
  beforeEach(() => {
    state.mounts = 0;
    state.timeline = new Promise((resolve) => {
      state.resolve = resolve;
    });
  });
  it("keeps summary, map and review mounted while the first timeline chunk loads", async () => {
    render(
      <Suspense fallback={<div>whole-page-loading</div>}>
        <CommonActivityDetail />
      </Suspense>,
    );
    const summary = screen.getByTestId("summary"),
      map = screen.getByTestId("map"),
      review = screen.getByTestId("review");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "tabs.timeline" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("status")).toHaveTextContent("loading");
    expect(screen.queryByText("whole-page-loading")).not.toBeInTheDocument();
    expect(summary).toBeVisible();
    expect(map).toBeVisible();
    expect(review).toBeVisible();
    await act(async () => {
      state.resolve!({ default: () => <div>timeline-ready</div> });
    });
    expect(screen.getByText("timeline-ready")).toBeVisible();
    expect(screen.getByTestId("summary")).toBe(summary);
    expect(screen.getByTestId("map")).toBe(map);
    expect(screen.getByTestId("review")).toBe(review);
    expect(state.mounts).toBe(1);
  });
});
