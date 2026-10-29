import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutRenderer } from "./WorkoutRenderer";

const mocks = vi.hoisted(() => ({
  chart: vi.fn(),
}));

vi.mock("@/components/workout/WorkoutPlanChart", () => ({
  WorkoutPlanChart: (props: Record<string, unknown>) => {
    mocks.chart(props);
    return <div data-testid="workout-chart" />;
  },
}));

beforeEach(() => {
  mocks.chart.mockReset();
});

describe("WorkoutRenderer", () => {
  it("lets compact charts fill a stretched parent", () => {
    render(
      <WorkoutRenderer
        workout={{
          text: "",
          sportType: "RUN",
          structureKind: "ENDURANCE",
          structure: { version: 1, kind: "ENDURANCE", blocks: [] },
        }}
        density="COMPACT"
        chartFillHeight
      />,
    );

    expect(mocks.chart).toHaveBeenCalledWith(
      expect.objectContaining({
        compact: true,
        fillHeight: true,
        height: 50,
      }),
    );
  });
});
