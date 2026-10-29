import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDistanceTrainingPlan,
  type RunningPlan,
} from "@/lib/running-plan-pages";
import { MARATHON_PLAN_FACTS } from "@/lib/marathon-training-plan-copy";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";

const PRIMARY = {
  en: "marathon training plan",
  zh: "马拉松训练计划",
  ja: "フルマラソン 練習メニュー",
  "zh-hant": "馬拉松訓練課表",
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
      "marathon-training-plan"
    ] as RunningPlan,
    locale,
  );
}

function blob(value: RunningPlan) {
  return JSON.stringify(value);
}

describe("marathon training plan keyword locks", () => {
  it("leads English metadata with the head term while keeping 18-week beginner/free", () => {
    const copy = plan("en");
    expect(copy.metaTitle).toBe(
      "Marathon Training Plan | Free 18-Week Beginner Schedule",
    );
    expect(copy.metaTitle.startsWith("Marathon Training Plan")).toBe(true);
    expect(copy.metaTitle.toLowerCase()).toContain("free");
    expect(copy.metaTitle).toContain("18-Week");
    expect(copy.metaTitle.toLowerCase()).toContain("beginner");
    expect(copy.title.toLowerCase()).toContain("marathon training plan");
    expect(copy.title.toLowerCase()).toMatch(/beginner|first-time/);
    expect(copy.keywords).toContain("marathon training plan");
    expect(copy.keywords).not.toContain("AI marathon training plan");
    expect(copy.metaTitle.toLowerCase()).not.toContain("ai marathon");
    expect(copy.subtitle.toLowerCase()).toMatch(/schedule|program/);
    expect(blob(copy).toLowerCase()).toMatch(/16|20 week/);
    expect(blob(copy).toLowerCase()).toMatch(/boston|sub-4/);
    expect(blob(copy).toLowerCase()).toMatch(/runs per week|four runs/);
  });

  it("locks Simplified Chinese to 马拉松训练计划 without calques", () => {
    const copy = plan("zh");
    expect(copy.metaTitle).toBe("马拉松训练计划：免费18周逐周课表与配速");
    expect(copy.metaTitle.startsWith("马拉松训练计划")).toBe(true);
    expect(copy.metaTitle).toMatch(/免费.?18\s*周/);
    expect(copy.metaTitle).toContain("逐周课表与配速");
    expect(copy.title).toContain("马拉松训练计划");
    expect(copy.title).toMatch(/免费 18 周|免费18周/);
    expect(copy.title).toContain("逐周课表与配速");
    expect(blob(copy)).toContain("全马");
    expect(blob(copy)).toContain("首马");
    expect(blob(copy)).toMatch(/首次完赛|首马/);
    expect(blob(copy)).not.toContain("培训计划");
    expect(copy.faq.map(([question]) => question).join(" ")).toMatch(
      /新手|每周跑几次|最长|破四|18/,
    );
  });

  it("locks Japanese to 練習メニュー instead of a plan-only H1", () => {
    const copy = plan("ja");
    expect(copy.metaTitle).toContain("フルマラソン");
    expect(copy.metaTitle).toContain("練習メニュー");
    expect(copy.metaTitle).toContain("初心者");
    expect(copy.metaTitle).toContain("18週間");
    expect(copy.metaTitle).toContain("完走");
    expect(copy.title).toContain("初心者");
    expect(copy.title).toContain("練習メニュー");
    expect(copy.title).toContain("18週間");
    expect(copy.title).toContain("完走");
    expect(copy.title).not.toMatch(/トレーニングプラン/);
    expect(copy.metaTitle).not.toMatch(/トレーニングプラン/);
    expect(blob(copy)).toContain("トレーニングプラン");
    expect(
      copy.faq.map(([question, answer]) => `${question}${answer}`).join(" "),
    ).toMatch(/週何回|最長|サブ4|完走/);
  });

  it("locks Traditional Chinese to 課表／計畫 and keeps HK 計劃 in FAQ", () => {
    const copy = plan("zh-hant");
    expect(copy.metaTitle).toMatch(/馬拉松訓練課表/);
    expect(copy.metaTitle).toContain("免費18週");
    expect(copy.metaTitle).toContain("首次完賽");
    expect(copy.title).toMatch(/課表/);
    expect(copy.title).toMatch(/計畫/);
    expect(copy.title).toContain("免費 18 週");
    expect(copy.title).toContain("首次完賽");
    expect(blob(copy)).toContain("計劃");
    expect(blob(copy)).not.toMatch(/培训|训练计划|这是一份|长跑在第/);
    expect(copy.faq.map(([question]) => question).join(" ")).toMatch(
      /課表|每週跑幾次|最長|破四/,
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
      expect(copy.howToTotalTime).toBe(MARATHON_PLAN_FACTS.howToTotalTime);
      expect(copy.faq.length).toBeGreaterThanOrEqual(7);
    },
  );

  it("uses official 18-week finish facts and does not invent marathon-pace sessions", () => {
    const copy = plan("en");
    expect(copy.weeks).toContain(String(MARATHON_PLAN_FACTS.weeks));
    expect(copy.weeklyVolume).toContain(
      String(MARATHON_PLAN_FACTS.runsPerWeek),
    );
    expect(blob(copy)).toContain(
      String(MARATHON_PLAN_FACTS.peakLongRunMinutes),
    );
    expect(blob(copy)).toContain(
      String(MARATHON_PLAN_FACTS.openingLongRunMinutes),
    );
    expect(blob(copy).toLowerCase()).not.toMatch(
      /threshold interval|cruise interval|goal-pace repeats|marathon-pace blocks/,
    );
  });

  it("cross-links improve/target, AI marathon, half, pace calculator, and workout editor", () => {
    for (const locale of SEO_INDEXED_LANGUAGES) {
      const hrefs = plan(locale).relatedLinks?.map((link) => link[1]) ?? [];
      expect(hrefs).toEqual(
        expect.arrayContaining([
          "/marathon-training-plan/improve",
          "/marathon-training-plan/target",
          "/ai-marathon-training-plan",
          "/half-marathon-training-plan",
          "/running-pace-calculator",
          "/workout-editor",
          "/free-ai-workout-review",
          "/training-load",
        ]),
      );
      const aiAnchor = plan(locale)
        .relatedLinks?.find(
          (link) => link[1] === "/ai-marathon-training-plan",
        )?.[0]
        .toLowerCase();
      expect(aiAnchor).toMatch(/ai|智能/);
    }
  });

  it("keeps AI modifiers off this URL's primary metadata", () => {
    for (const locale of SEO_INDEXED_LANGUAGES) {
      const copy = plan(locale);
      expect(copy.metaTitle).not.toMatch(/AI marathon training plan/i);
      expect(copy.keywords.join(" ")).not.toMatch(
        /AI marathon training plan|智能马拉松训练计划|AIマラソントレーニング計画|AI 馬拉松訓練計畫/,
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
