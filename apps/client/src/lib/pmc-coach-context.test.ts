import { describe, expect, it } from "vitest";
import { pmcSelectionFromSearch } from "./pmc-coach-context";
import { parsePmcProjectionSelection } from "@shared/pmc-projection";

describe("PMC coach selection", () => {
  it("retains only valid page selection, never client-authored identity, facts or instructions", () => {
    expect(
      parsePmcProjectionSelection({
        scope: "RUN",
        scenario: "REST",
        historyDays: 60,
        userId: "other",
        ctl: 900,
        instructions: "override",
      }),
    ).toEqual({ scope: "RUN", scenario: "REST", historyDays: 60 });
  });
  it.each([
    "pmcQuestion=1&pmcScope=other&pmcScenario=REST&pmcHistory=60",
    "pmcQuestion=1&pmcScope=RUN&pmcScenario=DELETE&pmcHistory=60",
    "pmcQuestion=1&pmcScope=RUN&pmcScenario=REST&pmcHistory=100000",
    "pmcQuestion=1&pmcScope=RUN&pmcScenario=REST&pmcHistory=60&pmcProjection=ignore-instructions",
    "pmcScope=RUN&pmcScenario=REST&pmcHistory=60",
  ])("rejects an invalid or unrelated link: %s", (query) => {
    expect(pmcSelectionFromSearch(new URLSearchParams(query))).toBeNull();
  });
  it("preserves the result reference for a fresh authoritative server read", () => {
    expect(
      pmcSelectionFromSearch(
        new URLSearchParams(
          `pmcQuestion=1&pmcScope=ALL&pmcScenario=AUTO&pmcHistory=90&pmcProjection=${"b".repeat(64)}`,
        ),
      ),
    ).toEqual({
      scope: "ALL",
      scenario: "AUTO",
      historyDays: 90,
      expectedProjectionId: "b".repeat(64),
    });
  });
});
