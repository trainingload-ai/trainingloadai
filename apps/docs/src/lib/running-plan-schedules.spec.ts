import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createCouchTo5kPlan,
  createDistanceTrainingPlan,
  createIntermediateFiveKPlan,
  type RunningPlan,
} from "./running-plan-pages";
import { getRunningPlanSchedule } from "./running-plan-schedules";

const baseFiveKPlan = {
  slug: "5k-training-plan",
  relatedLinks: [],
} as unknown as RunningPlan;

function localizedCouchPlan(locale: string) {
  const messagePath = new URL(
    `../../../../packages/messages/docs/${locale}.json`,
    import.meta.url,
  );
  const messages = JSON.parse(readFileSync(messagePath, "utf8"));
  return createCouchTo5kPlan(
    messages.runningPlanPages.plans["couch-to-5k-training-plan"] as RunningPlan,
    locale,
  );
}

function localizedDistancePlan(slug: "10k-training-plan", locale: string) {
  const messagePath = new URL(
    `../../../../packages/messages/docs/${locale}.json`,
    import.meta.url,
  );
  const messages = JSON.parse(readFileSync(messagePath, "utf8"));
  return createDistanceTrainingPlan(
    messages.runningPlanPages.plans[slug] as RunningPlan,
    locale,
  );
}

describe("shared official schedules in Docs", () => {
  it.each([
    ["couch-to-5k-training-plan", 9, 3],
    ["5k-training-plan", 8, 4],
    ["5k-training-plan-intermediate", 8, 4],
    ["10k-training-plan", 10, 3],
    ["half-marathon-training-plan", 14, 4],
    ["marathon-training-plan", 18, 4],
  ] as const)(
    "renders %s as a complete seven-day SSR schedule",
    (slug, weeks, sessions) => {
      const schedule = getRunningPlanSchedule(slug, "zh");
      expect(schedule.weeks).toHaveLength(weeks);
      for (const week of schedule.weeks) {
        expect(week.days).toHaveLength(7);
        expect(week.dayKinds).toHaveLength(7);
        expect(week.structures).toHaveLength(7);
        expect(
          week.days.filter((day) => !day.includes("休息")).length,
        ).toBeGreaterThanOrEqual(week.week === weeks ? sessions - 1 : sessions);
      }
      expect(schedule.coachFlow).toMatchObject({
        runtimeAiCalled: false,
        aiTokensConsumed: false,
      });
    },
  );

  it("uses structured template titles with executable detail", () => {
    const schedule = getRunningPlanSchedule("couch-to-5k-training-plan", "en");
    expect(schedule.weeks[0].days.join(" ")).toContain("6×");
    expect(schedule.weeks[0].days.join(" ")).toContain("Warm up");
    expect(schedule.weeks[8].days.join(" ")).toContain("5K completion run");
    expect(schedule.updatedAt).toBe("2026-08-24");
    expect(schedule.sources.map((source) => source.name)).toEqual(
      expect.arrayContaining([
        "NHS Couch to 5K running plan",
        "NHS Get running with Couch to 5K",
      ]),
    );
  });

  it("renders the frozen 10K progression from the active shared template", () => {
    const schedule = getRunningPlanSchedule("10k-training-plan", "en");
    expect(schedule.weeks).toHaveLength(10);
    expect(
      schedule.weeks
        .flatMap((week) => week.days)
        .filter((day) => day.includes("Controlled steady run")),
    ).toHaveLength(3);
    expect(schedule.weeks[6].days.join(" ")).toContain("Long 65 min");
    expect(schedule.weeks[9].days.join(" ")).toContain("10K completion");
    expect(schedule.description).toContain("No threshold");
    expect(schedule.sources.map((source) => source.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Hal Higdon"),
        expect.stringContaining("B.A.A."),
        expect.stringContaining("ACSM"),
      ]),
    );
    expect(schedule.coachFlow).toMatchObject({
      runtimeAiCalled: false,
      aiTokensConsumed: false,
    });
  });

  it("renders the reviewed Finish long-run progression", () => {
    const schedule = getRunningPlanSchedule("5k-training-plan", "en");
    const sunday = schedule.weeks.map((week) => week.days[6]);
    expect(sunday.slice(0, 7).join(" ")).toMatch(
      /25 min.*30 min.*35 min.*30 min.*40 min.*45 min.*30 min/,
    );
    expect(sunday[7]).toContain("5K completion run");
    expect(schedule.weeks.map((week) => week.phase)).toEqual([
      "Base",
      "Base",
      "Build",
      "Recovery",
      "Build",
      "Peak",
      "Taper",
      "Race week",
    ]);
  });

  it("uses localized generated copy and exposes parsed workout structures", () => {
    for (const slug of [
      "10k-training-plan",
      "half-marathon-training-plan",
      "marathon-training-plan",
    ] as const) {
      const schedule = getRunningPlanSchedule(slug, "zh");
      const workoutCopy = schedule.weeks.flatMap((week) =>
        week.days.filter((day) => !day.includes("休息")),
      );
      expect(workoutCopy.join(" ")).not.toMatch(
        /\b(?:warmup|work|recovery|cooldown|easy|long run|steady|threshold|intervals?|conversational|effort)\b/i,
      );
      expect(
        schedule.weeks.flatMap((week) => week.structures).filter(Boolean),
      ).not.toHaveLength(0);
    }
  });

  it("renders alternating reviewed Improve quality sessions", () => {
    const schedule = getRunningPlanSchedule(
      "5k-training-plan-intermediate",
      "en",
    );
    const quality = schedule.weeks.map((week) => week.days[2]);
    expect(quality[0]).toContain("6×");
    expect(quality[0]).toContain("1 min work");
    expect(quality[1]).toContain("15 min");
    expect(quality[2]).toContain("5×");
    expect(quality[7]).toContain("10 min");
  });

  it.each([
    ["en", "first 5K"],
    ["zh", "第一个 5K"],
    ["zh-hant", "第一個 5K"],
    ["ja", "最初の5K"],
  ])("uses reviewed First 5K copy for %s", (locale, expectedTitle) => {
    const schedule = getRunningPlanSchedule(
      "couch-to-5k-training-plan",
      locale,
    );
    expect(schedule.description).toContain(expectedTitle);
    expect(schedule.weeks).toHaveLength(9);
    expect(
      schedule.weeks[8].days.filter((day) => day.includes("RPE")),
    ).toHaveLength(3);
  });

  it.each(["en", "zh", "zh-hant", "ja"])(
    "keeps all three %s SEO pages distinct and cross-linked",
    (locale) => {
      const first = localizedCouchPlan(locale);
      const finish = createDistanceTrainingPlan(baseFiveKPlan, locale);
      const improve = createIntermediateFiveKPlan(baseFiveKPlan, locale);
      expect([
        first.templateSlug,
        finish.templateSlug,
        improve.templateSlug,
      ]).toEqual(["first-5k", "finish-5k", "improve-5k"]);
      expect([first.routePath, finish.routePath, improve.routePath]).toEqual([
        "/couch-to-5k-training-plan",
        "/5k-training-plan",
        "/5k-training-plan/intermediate",
      ]);
      expect(new Set([first.title, finish.title, improve.title]).size).toBe(3);
      expect(first.relatedLinks?.map((link) => link[1])).toContain(
        "/5k-training-plan",
      );
      expect(finish.relatedLinks?.map((link) => link[1])).toEqual(
        expect.arrayContaining([
          "/couch-to-5k-training-plan",
          "/5k-training-plan/intermediate",
        ]),
      );
      expect(improve.relatedLinks?.map((link) => link[1])).toEqual(
        expect.arrayContaining([
          "/5k-training-plan",
          "/vdot-calculator",
          "/training-load",
        ]),
      );
    },
  );

  it("uses the dedicated free Couch to 5K search intent and product boundary", () => {
    const plan = localizedCouchPlan("en");
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
    expect(plan.subtitle).toContain(
      "add the official plan to your calendar for free",
    );
    expect(plan.subtitle).not.toContain("free account");
    expect(plan.subtitle).toContain("AI Coach");
    expect(plan.subtitle).not.toMatch(/Plus|Pro|free account/i);
    expect(plan.faq).toHaveLength(11);
    expect(plan.faq.at(-1)?.[0]).toMatch(/Couch to 5K AI/i);
  });

  it.each([
    ["de", "Kostenloser Couch-to-5K-Trainingsplan"],
    ["es", "Plan Couch to 5K gratis"],
    ["fr", "Programme Couch to 5K gratuit"],
    ["it", "Piano Couch to 5K gratis"],
    ["ko", "무료 Couch to 5K 훈련 계획"],
    ["pt-BR", "Plano Couch to 5K grátis"],
  ])("uses localized Couch to 5K page copy for %s", (locale, title) => {
    const plan = localizedCouchPlan(locale);
    expect(plan.title).toContain(title);
    expect(plan.metaTitle).toMatch(/Couch(?:-| )to(?:-| )5K/);
    expect(plan.keywords).toContain("couch to 5k");
    expect(plan.primaryCtaTarget).toBe("schedule");
    expect(plan.secondaryCtaTarget).toBe("app");
    expect(plan.faq).toHaveLength(8);
    expect(plan.title).not.toContain("Free Couch to 5K Training Plan");
  });

  it.each(["en", "zh", "zh-hant", "ja"])(
    "maps the %s 10K landing page to the active shared template",
    (locale) => {
      const plan = localizedDistancePlan("10k-training-plan", locale);
      expect(plan).toMatchObject({
        slug: "10k-training-plan",
        routePath: "/10k-training-plan",
        templateSlug: "finish-10k",
      });
      expect(plan.weeks).toMatch(/10/);
      expect(plan.weeklyVolume).toMatch(/3|三/);
      expect(plan.subtitle).toMatch(
        /No threshold|不要求阈值|不要求閾值|閾値走.*不要/,
      );
      expect(plan.subtitle).not.toMatch(
        /add controlled threshold|加入可控阈值|制御された閾値/i,
      );
    },
  );
});
