import { describe, expect, it } from "vitest";
import { getMcpTerminalCopy } from "./mcp-terminal-copy";

const supportedLocales = [
  "en",
  "zh",
  "zh-hant",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "it",
  "pt-BR",
] as const;

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
  it.each(supportedLocales)("keeps three complete %s scenarios", (lang) => {
    const copy = getMcpTerminalCopy(lang);
    const english = getMcpTerminalCopy("en");

    expect(copy.demoLabel.trim().length).toBeGreaterThan(0);
    expect(copy.connectedLabel.trim().length).toBeGreaterThan(0);
    expect(copy.accessibleSummary.trim().length).toBeGreaterThan(0);
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

    if (lang !== "en") {
      expect(copy.scenarios[0].question).not.toBe(
        english.scenarios[0].question,
      );
      expect(copy.accessibleSummary).not.toBe(english.accessibleSummary);
    }
  });
});
