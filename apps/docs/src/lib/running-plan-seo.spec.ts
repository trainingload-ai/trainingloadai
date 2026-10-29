import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDistanceTrainingPlan,
  createIntermediateFiveKPlan,
  type PlanCollectionCopy,
  type RunningPlan,
} from "./running-plan-pages";

const distanceSlugs = [
  "5k-training-plan",
  "10k-training-plan",
  "half-marathon-training-plan",
  "marathon-training-plan",
] as const;

function messages(locale: string) {
  const path = new URL(
    `../../../../packages/messages/docs/${locale}.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

function distancePlan(slug: (typeof distanceSlugs)[number], locale = "en") {
  return createDistanceTrainingPlan(
    messages(locale).runningPlanPages.plans[slug] as RunningPlan,
    locale,
  );
}

describe("running plan SEO ownership", () => {
  it("assigns one distinct English search intent to every distance page", () => {
    const plans = distanceSlugs.map((slug) => distancePlan(slug));

    expect(plans.map((plan) => plan.metaTitle)).toEqual([
      "Free 8-Week 5K Training Plan for Beginners",
      "10K Training Plan | Free 10-Week Beginner Schedule",
      "Half Marathon Training Plan: Free 14-Week Beginner Schedule",
      "Marathon Training Plan | Free 18-Week Beginner Schedule",
    ]);
    expect(new Set(plans.map((plan) => plan.metaTitle)).size).toBe(4);
    expect(plans.every((plan) => plan.metaDescription.length <= 160)).toBe(
      true,
    );
    expect(
      plans.every((plan) => !plan.metaTitle.includes("Trainingload")),
    ).toBe(true);
    expect(plans[0].keywords).not.toContain("couch to 5k");
  });

  it.each(["en", "zh", "zh-hant", "ja"])(
    "publishes free-plan proof and complete schedules for %s",
    (locale) => {
      for (const slug of distanceSlugs) {
        const plan = distancePlan(slug, locale);
        expect(plan.trustItems).toHaveLength(4);
        expect(plan.routePath).toBe(`/${slug}`);
        expect(plan.metaTitle).not.toContain("Trainingload.ai");
      }
    },
  );

  it("positions the plan hub as the free portfolio rather than a login gate", () => {
    const copy = messages("en").runningPlanPages
      .collection as PlanCollectionCopy;

    expect(copy.metaTitle).toBe("Free Running Training Plans: 5K to Marathon");
    expect(copy.primary).toBe("Choose a free plan");
    expect(copy.cardPrimary).toBe("View free schedule");
    expect(copy.trustItems).toHaveLength(4);
    expect(copy.faq).toHaveLength(4);
    expect(`${copy.title} ${copy.subtitle}`).not.toMatch(/log in/i);
  });

  it("keeps one primary intent per URL and links the product loop", () => {
    const half = distancePlan("half-marathon-training-plan");
    const fiveK = distancePlan("5k-training-plan");
    const tenK = distancePlan("10k-training-plan");
    const marathon = distancePlan("marathon-training-plan");
    const loopHrefs = [
      "/ai-training-plan",
      "/vdot-calculator",
      "/running-pace-calculator",
      "/race-time-predictor",
      "/training-load",
    ];

    expect(half.metaTitle).toBe(
      "Half Marathon Training Plan: Free 14-Week Beginner Schedule",
    );
    expect(half.metaTitle).toContain("Half Marathon Training Plan");
    expect(half.metaTitle).toContain("14-Week");
    expect(half.metaTitle).toMatch(/beginner/i);
    expect(half.title).toBe(
      "Half Marathon Training Plan: 14-Week Beginner Schedule",
    );
    expect(half.title.toLowerCase()).toContain("half marathon training plan");
    expect(half.faq.map(([question]) => question).join(" ")).toMatch(
      /14 week|beginner/i,
    );
    expect(fiveK.keywords).not.toContain("intermediate 5k training plan");
    expect(tenK.metaTitle).toBe(
      "10K Training Plan | Free 10-Week Beginner Schedule",
    );
    expect(tenK.title.toLowerCase()).toContain("10k training plan");
    expect(tenK.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([
        ...loopHrefs,
        "/10k-training-plan/improve",
        "/10k-training-plan/target",
        "/workout-editor",
        "/free-ai-workout-review",
        "/half-marathon-training-plan",
      ]),
    );
    expect(half.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([
        ...loopHrefs,
        "/ai-half-marathon-training-plan",
        "/workout-editor",
        "/marathon-training-plan",
      ]),
    );
    expect(marathon.metaTitle).toBe(
      "Marathon Training Plan | Free 18-Week Beginner Schedule",
    );
    expect(marathon.metaTitle.startsWith("Marathon Training Plan")).toBe(true);
    expect(marathon.title.toLowerCase()).toContain("marathon training plan");
    expect(marathon.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([
        ...loopHrefs,
        "/ai-marathon-training-plan",
        "/workout-editor",
        "/free-ai-workout-review",
        "/half-marathon-training-plan",
      ]),
    );
    expect(fiveK.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([...loopHrefs, "/10k-training-plan"]),
    );
  });

  it("keeps intermediate 5K ownership off the beginner hub", () => {
    const improve = createIntermediateFiveKPlan(
      messages("en").runningPlanPages.plans["5k-training-plan"] as RunningPlan,
      "en",
    );

    expect(improve.metaTitle).toBe(
      "Intermediate 5K Training Plan: Free 8-Week Schedule",
    );
    expect(improve.faq.map(([question]) => question).join(" ")).toMatch(
      /intermediate/i,
    );
    expect(improve.faq.map(([question]) => question).join(" ")).not.toMatch(
      /Is this a beginner 5K plan/i,
    );
    expect(improve.keywords).toEqual(
      expect.arrayContaining([
        "5k training plan intermediate",
        "faster 5k training plan",
        "5k training plan sub 25",
      ]),
    );
    expect(improve.faq.map(([question]) => question).join(" ")).toMatch(
      /sub-25/i,
    );
    expect(improve.planChooser?.options[2].href).toBeNull();
    expect(improve.planChooser?.options[1].href).toBe("/5k-training-plan");
    expect(improve.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([
        "/5k-training-plan",
        "/ai-training-plan",
        "/vdot-calculator",
        "/running-pace-calculator",
        "/training-load",
      ]),
    );
  });

  it("uses one shared 5K experience while keeping a distinct intent on each route", () => {
    const couchRoute = readFileSync(
      new URL(
        "../app/[lang]/(home)/couch-to-5k-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const intermediateRoute = readFileSync(
      new URL(
        "../app/[lang]/(home)/5k-training-plan/intermediate/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(couchRoute).toContain("<FiveKPlanExperience");
    expect(intermediateRoute).toContain("<FiveKPlanExperience");
    expect(couchRoute).not.toContain("<RunningPlanPage");
    expect(intermediateRoute).not.toContain("<RunningPlanPage");
  });

  it("keeps race-distance SEO copy in next-intl messages, not TS overlays", () => {
    const overlays = [
      "./half-marathon-training-plan-copy.ts",
      "./marathon-training-plan-copy.ts",
      "./ten-k-training-plan-copy.ts",
      "./running-plan-pages.ts",
    ];
    for (const file of overlays) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(
        /halfMarathonPlanCopy|marathonPlanCopy|tenKPlanCopy/,
      );
      if (file.endsWith("-copy.ts")) {
        expect(source).not.toContain("metaTitle");
        expect(source).not.toContain("metaDescription");
      }
    }
  });
});
