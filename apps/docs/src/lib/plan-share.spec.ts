import { describe, expect, it } from "vitest";
import {
  isPlanSharePublicId,
  planShareImportUrl,
  unwrapPlanSharePreview,
} from "./plan-share";
import { enduranceStructureToChartSegments } from "./plan-share-chart";

describe("plan share public helpers", () => {
  it("accepts 12-character public ids", () => {
    expect(isPlanSharePublicId("YznD7aM6MC7-")).toBe(true);
    expect(isPlanSharePublicId("bad")).toBe(false);
  });

  it("builds an app import URL with docs attribution", () => {
    expect(planShareImportUrl("zh", "YznD7aM6MC7-")).toBe(
      "https://app.trainingload.ai/zh/plans/import/share/YznD7aM6MC7-?from=docs-plan-share",
    );
    expect(planShareImportUrl("en", "YznD7aM6MC7-")).toContain("/en/plans/import/share/");
  });

  it("unwraps the Nest envelope", () => {
    const preview = unwrapPlanSharePreview(
      JSON.stringify({
        code: 200,
        message: "ok",
        data: {
          publicId: "YznD7aM6MC7-",
          lineagePublicId: "abcdefghijkl",
          title: "Base Build",
          workouts: [],
        },
      }),
    );
    expect(preview?.title).toBe("Base Build");
    expect(unwrapPlanSharePreview("not-json")).toBeNull();
  });
});

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
