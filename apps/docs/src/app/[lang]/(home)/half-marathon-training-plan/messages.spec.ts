import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDistanceTrainingPlan,
  type RunningPlan,
} from "@/lib/running-plan-pages";
import { HALF_MARATHON_PLAN_FACTS } from "@/lib/half-marathon-training-plan-copy";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";

const PRIMARY = {
  en: "half marathon training plan",
  zh: "半马训练计划",
  ja: "ハーフマラソン 練習メニュー",
  "zh-hant": "半馬訓練課表",
} as const;

function messages(locale: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../../../../../../packages/messages/docs/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );
}

function plan(locale: string) {
  return createDistanceTrainingPlan(
    messages(locale).runningPlanPages.plans[
      "half-marathon-training-plan"
    ] as RunningPlan,
    locale,
  );
}

function blob(value: RunningPlan) {
  return JSON.stringify(value);
}

describe("half marathon training plan keyword locks", () => {
  it("leads English metadata with the head term while keeping 14-week beginner/free", () => {
    const copy = plan("en");
    expect(copy.metaTitle).toBe(
      "Half Marathon Training Plan: Free 14-Week Beginner Schedule",
    );
    expect(copy.metaTitle.startsWith("Half Marathon Training Plan")).toBe(true);
    expect(copy.metaTitle.toLowerCase()).toContain("free");
    expect(copy.metaTitle).toContain("14-Week");
    expect(copy.metaTitle.toLowerCase()).toContain("beginner");
    expect(copy.title).toBe(
      "Half Marathon Training Plan: 14-Week Beginner Schedule",
    );
    expect(copy.title.toLowerCase()).toContain("half marathon training plan");
    expect(copy.title.toLowerCase()).toMatch(/beginner/);
    expect(copy.keywords).toContain("half marathon training plan");
    expect(copy.keywords).not.toContain("AI half marathon training plan");
    expect(copy.metaTitle.toLowerCase()).not.toContain("ai half");
    expect(copy.subtitle.toLowerCase()).toMatch(/week-by-week|schedule|program/);
    expect(blob(copy).toLowerCase()).toMatch(/12|16 week/);
    expect(blob(copy).toLowerCase()).toContain("sub-2");
    expect(blob(copy).toLowerCase()).toMatch(/runs per week|four runs/);
    expect(blob(copy).toLowerCase()).toMatch(/pace calculator|workout editor/);
  });

  it("locks Simplified Chinese to 半马训练计划 without calques", () => {
    const copy = plan("zh");
    expect(copy.metaTitle.startsWith("半马训练计划")).toBe(true);
    expect(copy.metaTitle).toMatch(/免费.?14\s*周/);
    expect(copy.metaTitle).toMatch(/逐周课表|新手/);
    expect(copy.title).toContain("半马训练计划");
    expect(copy.title).toMatch(/免费 14 周|免费14周/);
    expect(copy.title).toMatch(/逐周课表|新手/);
    expect(blob(copy)).toContain("半程马拉松训练计划");
    expect(blob(copy)).not.toContain("培训计划");
    expect(blob(copy)).not.toContain("破三");
    expect(copy.faq.map(([question]) => question).join(" ")).toMatch(
      /新手|每周跑几次|最长|破二|14/,
    );
  });

  it("locks Japanese to 練習メニュー instead of a plan-only H1", () => {
    const copy = plan("ja");
    expect(copy.metaTitle).toContain("ハーフマラソン");
    expect(copy.metaTitle).toContain("練習メニュー");
    expect(copy.metaTitle).toContain("初心者");
    expect(copy.metaTitle).toContain("14週間");
    expect(copy.metaTitle).toMatch(/週別メニュー|完走/);
    expect(copy.title).toContain("初心者");
    expect(copy.title).toContain("練習メニュー");
    expect(copy.title).toContain("14週間");
    expect(copy.title).toMatch(/週別メニュー|完走/);
    expect(copy.title).not.toMatch(/トレーニングプラン/);
    expect(copy.metaTitle).not.toMatch(/トレーニングプラン/);
    expect(blob(copy)).toContain("トレーニングプラン");
    expect(copy.faq.map(([question, answer]) => `${question}${answer}`).join(" ")).toMatch(
      /週何回|最長|サブ2|完走/,
    );
    expect(blob(copy)).not.toMatch(/サブ3|サブ4/);
  });

  it("locks Traditional Chinese to 課表／計畫 and keeps HK 計劃 in FAQ", () => {
    const copy = plan("zh-hant");
    expect(copy.metaTitle).toMatch(/半馬訓練課表/);
    expect(copy.metaTitle).toContain("免費14週");
    expect(copy.metaTitle).toMatch(/逐週課表|新手/);
    expect(copy.title).toMatch(/課表/);
    expect(copy.title).toMatch(/計畫/);
    expect(copy.title).toContain("免費 14 週");
    expect(copy.title).toMatch(/逐週課表|新手/);
    expect(blob(copy)).toContain("計劃");
    expect(blob(copy)).not.toMatch(/培训|训练计划|这是一份|长跑在第/);
    expect(copy.faq.map(([question]) => question).join(" ")).toMatch(
      /課表|每週跑幾次|最長|破二/,
    );
  });

  it.each(SEO_INDEXED_LANGUAGES)(
    "keeps %s metadata in snippet range after optimizeSeoText",
    (locale) => {
      const copy = plan(locale);
      const seo = optimizeSeoText({
        locale,
        context: "plan",
        title: copy.metaTitle,
        description: copy.metaDescription,
      });
      expect(seo.title.toLowerCase()).toContain(
        PRIMARY[locale].split(" ")[0]!.toLowerCase(),
      );
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(70);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      expect(copy.howToSteps).toHaveLength(4);
      expect(copy.howToTotalTime).toBe(HALF_MARATHON_PLAN_FACTS.howToTotalTime);
      expect(copy.faq.length).toBeGreaterThanOrEqual(7);
    },
  );

  it("uses official 14-week finish facts and does not invent threshold sessions", () => {
    const copy = plan("en");
    expect(copy.weeks).toContain(String(HALF_MARATHON_PLAN_FACTS.weeks));
    expect(copy.weeklyVolume).toContain(String(HALF_MARATHON_PLAN_FACTS.runsPerWeek));
    expect(blob(copy)).toContain(String(HALF_MARATHON_PLAN_FACTS.peakLongRunMinutes));
    expect(blob(copy)).toContain(String(HALF_MARATHON_PLAN_FACTS.openingEasyMinutes));
    expect(blob(copy).toLowerCase()).not.toMatch(
      /threshold interval|cruise interval|goal-pace repeats/,
    );
  });

  it("cross-links improve/target, AI half, marathon, pace calculator, and workout editor", () => {
    for (const locale of SEO_INDEXED_LANGUAGES) {
      const hrefs = plan(locale).relatedLinks?.map((link) => link[1]) ?? [];
      expect(hrefs).toEqual(
        expect.arrayContaining([
          "/half-marathon-training-plan/improve",
          "/half-marathon-training-plan/target",
          "/ai-half-marathon-training-plan",
          "/marathon-training-plan",
          "/running-pace-calculator",
          "/workout-editor",
        ]),
      );
      const aiAnchor = plan(locale)
        .relatedLinks?.find((link) => link[1] === "/ai-half-marathon-training-plan")?.[0]
        .toLowerCase();
      expect(aiAnchor).toMatch(/ai|智能/);
    }
  });

  it("keeps AI modifiers off this URL's primary metadata", () => {
    for (const locale of SEO_INDEXED_LANGUAGES) {
      const copy = plan(locale);
      expect(copy.metaTitle).not.toMatch(/AI half marathon training plan/i);
      expect(copy.keywords.join(" ")).not.toMatch(
        /AI half marathon training plan|智能半马训练计划|AIハーフマラソントレーニング計画|AI 半馬訓練計畫/,
      );
    }
  });

  it("renders HowTo JSON-LD from the same how-to steps as the page", () => {
    const source = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    const component = readFileSync(
      new URL("../../../../components/RunningPlanPage.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("createDistanceTrainingPlan");
    expect(component).toContain("howToSchema");
    expect(component).toContain('id="how-to"');
    expect(component).toContain("plan.howToSteps");
    expect(component).toContain("plan.faq");
  });
});
