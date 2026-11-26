import { describe, expect, it } from "vitest";
import { enduranceStructureToChartSegments } from "./plan-share-chart";

describe("enduranceStructureToChartSegments", () => {
  it("flattens work and repeat blocks into stepped segments", () => {
    const segments = enduranceStructureToChartSegments({
      kind: "ENDURANCE",
      version: 1,
      blocks: [
        {
          type: "work",
          steps: [{ duration: 600, stepKind: "WARMUP" }],
        },
        {
          type: "repeat",
          count: 2,
          children: [
            {
              type: "work",
              steps: [{ duration: 300, stepKind: "WORK" }],
            },
          ],
        },
      ],
    });
    expect(segments).toEqual([
      { t0: 0, t1: 600, displayY: 34, color: "#60a5fa" },
      { t0: 600, t1: 900, displayY: 72, color: "#6366f1" },
      { t0: 900, t1: 1200, displayY: 72, color: "#6366f1" },
    ]);
  });

  it("uses heart-rate zone colors when the step has a zone target", () => {
    const segments = enduranceStructureToChartSegments({
      kind: "ENDURANCE",
      version: 1,
      blocks: [
        {
          type: "work",
          steps: [
            {
              duration: 300,
              stepKind: "WARMUP",
            },
            {
              duration: 1500,
              stepKind: "WORK",
              primaryTargetMeta: {
                kind: "HEART_RATE_ZONE",
                zoneIndex: 2,
              },
            },
            {
              duration: 180,
              stepKind: "WORK",
              primaryTargetMeta: {
                kind: "HEART_RATE_ZONE",
                zoneIndex: 3,
              },
            },
          ],
        },
      ],
    });
    expect(segments.map((segment) => segment.color)).toEqual([
      "#60a5fa",
      "#3b82f6",
      "#10b981",
    ]);
  });
});
