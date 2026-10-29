import { describe, expect, it } from "vitest";
import { getMcpTerminalCopy } from "./mcp-terminal-copy";

const expectedTools = [
  "get_training_snapshot",
  "compare_training_periods",
  "list_planned_workouts",
  "list_competitions",
  "get_plan_adherence",
  "get_training_readiness",
  "get_fitness_trends",
  "get_activity_statistics",
  "get_personal_bests",
];

describe("MCP terminal examples", () => {
  it.each(["en", "zh"])("keeps three complete %s scenarios", (lang) => {
    const copy = getMcpTerminalCopy(lang);

    expect(copy.scenarios).toHaveLength(3);
    expect(new Set(copy.scenarios.map((scenario) => scenario.question)).size).toBe(
      3,
    );
    expect(copy.scenarios.every((scenario) => scenario.calls.length === 3)).toBe(
      true,
    );
    expect(
      copy.scenarios.flatMap((scenario) =>
        scenario.calls.map(([name]) => name),
      ),
    ).toEqual(expectedTools);
  });
});
