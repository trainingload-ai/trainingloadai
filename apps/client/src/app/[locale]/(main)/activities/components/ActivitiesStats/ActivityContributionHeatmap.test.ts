import { describe, expect, it } from "vitest";
import { activityContributionLevelClass } from "./ActivityContributionHeatmap";

describe("activity contribution heatmap colors", () => {
  it("uses generated HSL token classes for showcase activity levels", () => {
    expect(activityContributionLevelClass(0, "showcase")).toContain(
      "--neutral-300",
    );
    expect(activityContributionLevelClass(1, "showcase")).toContain(
      "--emerald-200",
    );
    expect(activityContributionLevelClass(4, "showcase")).toContain(
      "--emerald-800",
    );
  });

  it("keeps the default heatmap on the blue scale", () => {
    expect(activityContributionLevelClass(1, "default")).toContain("--sky-300");
    expect(activityContributionLevelClass(4, "default")).toContain("--sky-950");
  });
});
