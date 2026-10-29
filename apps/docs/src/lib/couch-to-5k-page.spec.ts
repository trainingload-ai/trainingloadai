import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createCouchTo5kPlan, type RunningPlan } from "./running-plan-pages";
import { getRunningPlanSchedule } from "./running-plan-schedules";

function localizedPlan(locale: string) {
  const path = new URL(
    `../../../../packages/messages/docs/${locale}.json`,
    import.meta.url,
  );
  const messages = JSON.parse(readFileSync(path, "utf8"));
  return createCouchTo5kPlan(
    messages.runningPlanPages.plans["couch-to-5k-training-plan"] as RunningPlan,
    locale,
  );
}

describe("Couch to 5K SEO page", () => {
  it("owns the free nine-week search intent and product boundary", () => {
    const plan = localizedPlan("en");
    expect(plan).toMatchObject({
      metaTitle: "Free Couch to 5K Training Plan: 9-Week Schedule",
      title:
        "Free Couch to 5K Training Plan: A Complete 9-Week Run-Walk Schedule",
      primaryCta: "Start Week 1",
      primaryCtaTarget: "schedule",
      secondaryCta: "Add to my calendar",
      secondaryCtaTarget: "app",
      templateSlug: "first-5k",
    });
    expect(plan.metaDescription.length).toBeLessThanOrEqual(160);
    expect(plan.keywords).toEqual(
      expect.arrayContaining([
        "couch to 5k",
        "free couch to 5k plan",
        "c25k plan",
      ]),
    );
    expect(plan.faq).toHaveLength(11);
    expect(plan.faq.at(-1)?.[0]).toMatch(/Couch to 5K AI/i);
    expect(plan.relatedLinks?.map((link) => link[1])).toEqual(
      expect.arrayContaining([
        "/5k-training-plan",
        "/ai-training-plan",
        "/training-load",
      ]),
    );
    expect(plan.planChooser?.options[0].href).toBeNull();
    expect(plan.planChooser?.options[1].href).toBe("/5k-training-plan");
  });

  it.each([
    ["de", "Kostenloser Couch-to-5K-Trainingsplan"],
    ["es", "Plan Couch to 5K gratis"],
    ["fr", "Programme Couch to 5K gratuit"],
    ["it", "Piano Couch to 5K gratis"],
    ["ko", "무료 Couch to 5K 훈련 계획"],
    ["pt-BR", "Plano Couch to 5K grátis"],
  ])("uses localized page copy for %s", (locale, title) => {
    const plan = localizedPlan(locale);
    expect(plan.title).toContain(title);
    expect(plan.metaTitle).toMatch(/Couch(?:-| )to(?:-| )5K/);
    expect(plan.keywords).toContain("couch to 5k");
    expect(plan.faq.length).toBeGreaterThanOrEqual(8);
    expect(plan.title).not.toContain("Free Couch to 5K Training Plan");
  });

  it("follows the indexed-locale policy instead of forcing every locale live", () => {
    const source = readFileSync(
      new URL(
        "../app/[lang]/(home)/couch-to-5k-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("isSeoIndexedLanguage(lang)");
    expect(source).toContain("absoluteAlternatesForPath(siteUrl, path)");
    expect(source).not.toContain("index: true");
    expect(source).not.toContain("i18n.languages");
  });

  it("cites Couch to 5K-specific sources", () => {
    const schedule = getRunningPlanSchedule("couch-to-5k-training-plan", "en");
    expect(schedule.updatedAt).toBe("2026-08-24");
    expect(schedule.sources.map((source) => source.name)).toEqual(
      expect.arrayContaining([
        "NHS Couch to 5K running plan",
        "NHS Get running with Couch to 5K",
      ]),
    );
  });
});
