import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  COACH_SKILL_LABELS,
  COACH_TOOL_LABELS,
  coachSkillLabelKey,
  coachToolLabelKey,
} from "@shared/ai-coach-activity-catalog";
import { isCoachActivity } from "@shared/ai-coach-run-contract";

describe("Coach activity names", () => {
  it("maps canonical identities, not arbitrary labels or object prototype keys", () => {
    expect(coachSkillLabelKey("training-analytics")).toBe("trainingAnalytics");
    expect(coachSkillLabelKey("workout-generator")).toBe("workoutGenerator");
    expect(coachToolLabelKey("activity.recent")).toBe("activityRecent");
    for (const value of [
      undefined,
      "unknown.internal.id",
      "__proto__",
      "constructor",
      "<script>",
    ]) {
      expect(coachToolLabelKey(value)).toBeUndefined();
      expect(coachSkillLabelKey(value)).toBeUndefined();
    }
  });
  it("supports old records and validates optional skill identity", () => {
    const activity = {
      activityId: "a",
      runId: "r",
      attemptId: "t",
      seq: 0,
      revision: 1,
      kind: "skill",
      status: "completed",
      labelKey: "skill",
    };
    expect(isCoachActivity(activity)).toBe(true);
    expect(
      isCoachActivity({ ...activity, skillName: "training-analytics" }),
    ).toBe(true);
    expect(
      isCoachActivity({ ...activity, skillName: { prompt: "private" } }),
    ).toBe(false);
  });
  const directory = resolve(
    import.meta.dirname,
    "../../../../packages/messages/client-core",
  );
  for (const filename of readdirSync(directory).filter((name) =>
    name.endsWith(".json"),
  )) {
    it(`has all display names in ${filename}`, () => {
      const labels = JSON.parse(
        readFileSync(resolve(directory, filename), "utf8"),
      ).AiCoachPage.timeline;
      for (const key of Object.values(COACH_SKILL_LABELS))
        expect(labels.skills[key]).toEqual(expect.any(String));
      for (const key of Object.values(COACH_TOOL_LABELS))
        expect(labels.tools[key]).toEqual(expect.any(String));
    });
  }
});
