import { describe, expect, it } from "vitest";
import { parseCoachPlanDraftData } from "@shared/ai-coach-schema";
import { draftToCreatePlanDto } from "../coach-plan-draft";
import { coachDecisionPreviewRows } from "@shared/coach-decision-preview";

describe("coach plan quality metadata and verified previews", () => {
  it("keeps the agreed availability, phases and preview date through parsing and saving", () => {
    const parsed = parseCoachPlanDraftData({
      title: "Base",
      periodWeeks: 2,
      qualityContract: {
        startDate: "2026-09-07",
        weekPhases: ["BUILD", "RECOVERY"],
        maxDailyMinutes: 60,
      },
      workouts: [
        { weekIndex: 1, dayIndex: 1, sportType: "RUN", text: "work 30m" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    const dto = draftToCreatePlanDto(parsed.data);
    expect(dto.sourceType).toBe("AI");
    expect(dto.generationMetadata).toEqual({
      qualityContract: parsed.data.qualityContract,
    });
  });
  it("rejects malformed contracts while accepting legacy drafts without one", () => {
    const draft = {
      title: "Base",
      periodWeeks: 1,
      workouts: [{ weekIndex: 1, dayIndex: 1, text: "work 30m" }],
    };
    expect(parseCoachPlanDraftData(draft).ok).toBe(true);
    expect(
      parseCoachPlanDraftData({
        ...draft,
        qualityContract: { startDate: "2026-02-30" },
      }).ok,
    ).toBe(false);
  });
  it("does not truncate a multi-week diff to the first few workouts or expose internal IDs", () => {
    const rows = coachDecisionPreviewRows({
      verifiedChanges: Array.from({ length: 20 }, (_, i) => ({
        workoutId: `private-${i}`,
        dto: { weekIndex: i + 1, dayIndex: 2 },
        diff: [{ field: "text", before: "work 30m", after: "work 20m" }],
      })),
    });
    expect(rows).toHaveLength(20);
    expect(rows[19].position).toBe("20 · 2 · 1");
    expect(JSON.stringify(rows)).not.toContain("private-");
  });
});
