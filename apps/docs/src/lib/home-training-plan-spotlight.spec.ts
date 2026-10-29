import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { SEO_METADATA_LIMITS, seoDisplayUnits } from "./seo-metadata";

const locales = [
  "en",
  "zh",
  "zh-hant",
  "ja",
  "de",
  "es",
  "fr",
  "it",
  "ko",
  "pt-BR",
] as const;

const planRoutes = [
  "/couch-to-5k-training-plan",
  "/5k-training-plan",
  "/10k-training-plan",
  "/half-marathon-training-plan",
  "/marathon-training-plan",
] as const;

const localizedSeoPositioning: Record<
  (typeof locales)[number],
  { titleTerm: string; keywords: [string, string] }
> = {
  en: {
    titleTerm: "AI Coach",
    keywords: ["running and cycling training app", "training load"],
  },
  zh: {
    titleTerm: "智能教练",
    keywords: ["跑步与骑行训练应用", "训练负荷"],
  },
  "zh-hant": {
    titleTerm: "智能教練",
    keywords: ["跑步與騎行訓練應用", "訓練負荷"],
  },
  ja: {
    titleTerm: "AIコーチ",
    keywords: [
      "ランニング・サイクリングトレーニングアプリ",
      "トレーニング負荷",
    ],
  },
  de: {
    titleTerm: "KI-Coach",
    keywords: ["Lauf- und Radtrainings-App", "Trainingsbelastung"],
  },
  es: {
    titleTerm: "entrenador con IA",
    keywords: [
      "app de entrenamiento para running y ciclismo",
      "carga de entrenamiento",
    ],
  },
  fr: {
    titleTerm: "coach IA",
    keywords: [
      "application d'entraînement course à pied et cyclisme",
      "charge d'entraînement",
    ],
  },
  it: {
    titleTerm: "coach AI",
    keywords: [
      "app di allenamento per corsa e ciclismo",
      "carico di allenamento",
    ],
  },
  ko: {
    titleTerm: "AI 코치",
    keywords: ["러닝·사이클링 훈련 앱", "훈련 부하"],
  },
  "pt-BR": {
    titleTerm: "treinador de IA",
    keywords: ["app de treino para corrida e ciclismo", "carga de treino"],
  },
};

function messages(locale: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../../../packages/messages/docs/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );
}

describe("homepage training plan spotlight", () => {
  it.each(locales)("publishes complete spotlight copy for %s", (locale) => {
    const copy = messages(locale).home.planSpotlight;

    expect(copy.plans).toHaveLength(5);
    expect(copy.plans.every((plan: { title?: string }) => plan.title)).toBe(
      true,
    );
    expect(copy.browseAll).toBeTruthy();
    expect(copy.freeTitle).toBeTruthy();
    expect(copy.aiTitle).toBeTruthy();
  });

  it("links the homepage directly to every primary running plan", () => {
    const component = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/HomeTrainingPlanSpotlight.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    for (const route of planRoutes) expect(component).toContain(`"${route}"`);
    expect(component).toContain('id="free-running-plans"');
    expect(component).toContain('eventName="home_plan_distance_click"');
  });

  it("adds the spotlight, hero entry, and ItemList data to the homepage", () => {
    const page = readFileSync(
      new URL("../app/[lang]/(home)/page.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("<HomeTrainingPlanSpotlight");
    expect(page).toContain('eventProperties={{ placement: "hero" }}');
    expect(page).toContain('schemaId(pageUrl, "free-running-plans")');
  });
});

describe("homepage product positioning", () => {
  it.each(locales)(
    "localizes the product category and coach SEO intent for %s",
    (locale) => {
      const metadata = messages(locale).home.metadata;
      const expected = localizedSeoPositioning[locale];

      expect(metadata.title).toContain(expected.titleTerm);
      expect(metadata.openGraph.title).toBe(metadata.title);
      expect(metadata.keywords).toHaveLength(7);
      expect(metadata.keywords).toEqual(
        expect.arrayContaining(expected.keywords),
      );
    },
  );

  it.each(locales)("publishes the complete training loop for %s", (locale) => {
    const home = messages(locale).home;

    expect(home.hero.titleLines).toHaveLength(2);
    expect(home.trainingLoop.steps).toHaveLength(4);
    expect(home.aiEvidence.signals).toHaveLength(4);
    expect(home.aiEvidence.evidence).toHaveLength(6);
    expect(home.aiEvidence.controlNote).toBeTruthy();
    expect(home.planSpotlight.aiLabel).not.toMatch(/PLUS|PRO/i);
    expect(home.pricingPreview.title).toBeTruthy();
    expect(home.bottomCta.secondaryButton).toBeTruthy();
    for (const moduleIndex of [0, 2, 3]) {
      expect(home.pageModules.modules[moduleIndex].cta).toBeTruthy();
    }
  });

  it.each(locales)(
    "keeps homepage metadata within snippet guidance for %s",
    (locale) => {
      const metadata = messages(locale).home.metadata;

      expect(seoDisplayUnits(metadata.title)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.title.min,
      );
      expect(seoDisplayUnits(metadata.title)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.title.max,
      );
      expect(seoDisplayUnits(metadata.description)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.description.min,
      );
      expect(seoDisplayUnits(metadata.description)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.description.max,
      );
    },
  );

  it("keeps the Chinese plan access boundary and coach name explicit", () => {
    const zh = messages("zh");
    const home = zh.home;
    const visibleCopy = JSON.stringify({
      home,
      pricingItems: zh.pricingPage.plans.plus.items.slice(0, 4),
    });

    expect(home.planSpotlight.subtitle).toContain("无需注册");
    expect(home.planSpotlight.subtitle).toContain(
      "创建账户后，即可将计划加入日历并按需调整",
    );
    expect(visibleCopy).not.toContain("Free 账户");
    expect(visibleCopy).not.toContain("AI 教练");
    expect(visibleCopy).toContain("智能教练");
    expect(zh.pricingPage.plans.plus.items[3]).not.toContain("确认");
    expect(zh.pricingPage.plans.pro.desc).toContain("与 PLUS 完全相同");
    expect(home.pricingPreview.subtitle).toContain("功能完全相同");
    expect(home.pricingPreview.subtitle).toContain("积分额度不同");
  });

  it("keeps the free-plan promise static and the homepage capability story focused", () => {
    const home = messages("en").home;
    const page = readFileSync(
      new URL("../app/[lang]/(home)/page.tsx", import.meta.url),
      "utf8",
    );
    const showcase = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/HomeProductShowcase.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const mcp = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/HomeMcpShowcase.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(home.hero.titleLines.join(" ")).toMatch(/\bplan\b/i);
    expect(home.planSpotlight.subtitle).toContain("12");
    expect(home.metadata.title).toMatch(/Running.*Cycling.*Training App/i);
    expect(page).not.toContain("HomeSportTyper");
    expect(page).toContain("PAGE_MODULE_ORDER = [2, 1, 3, 0]");
    expect(page).not.toContain("<HomeTrainingLoop");
    expect(page).not.toContain("<HomeAiEvidence");
    expect(page).toContain("<HomeProductShowcase");
    expect(page).toContain("<HomeMcpShowcase");
    expect(page.indexOf("<HomeProductShowcase")).toBeLessThan(
      page.indexOf("<HomeMcpShowcase"),
    );
    expect(showcase).toContain('role="tablist"');
    expect(showcase).toContain("ProductScreens");
    expect(mcp).toContain("home_mcp_feature_click");
  });

  it("keeps the English hero concise, natural, and keyword-specific", () => {
    const home = messages("en").home;

    expect(home.hero.title).toBe("A training plan that keeps up with you");
    expect(home.hero.titleLines).toEqual([
      "A training plan that",
      "keeps up with you",
    ]);
    expect(home.hero.subtitle).toBe(home.heroVisible.subtitle);
    expect(home.hero.subtitle).toContain("runners and cyclists");
    expect(home.hero.subtitle).toContain("training load");
    expect(home.hero.subtitle).toContain("AI Coach");
    expect(home.hero.subtitle).not.toContain("based on that context");
  });

  it("keeps the embedded home preview aligned with the current client UI", () => {
    const demo = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/HomeProductDemo.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const chart = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/home-product-demo-weekly-load-chart.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const lightbox = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/HomeDemoLightbox.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const dayTypes = readFileSync(
      new URL(
        "../app/[lang]/(home)/_components/home-day-demo/types.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const enDemoCopy = demo.slice(
      demo.indexOf("const enCopy"),
      demo.indexOf("const zhCopy"),
    );

    expect(demo).toContain("function CoachSuggestionPreview");
    expect(demo).toContain("function CurrentPlanPreview");
    expect(demo).toContain("weeklyTrainingLoad");
    expect(demo).not.toContain("border-l-violet");
    expect(enDemoCopy).toContain("Ask AI Coach");
    expect(enDemoCopy).not.toContain("Smart Coach");
    expect(chart).toContain("useId");
    expect(chart).toContain("<pattern");
    expect(chart).toContain('orientation="right"');
    expect(chart).toContain('type="linear"');
    expect(lightbox).toContain('aria-hidden="true" inert');
    expect(dayTypes).not.toContain("readiness:");
  });

  it("keeps embedded product demos from introducing extra H1 headings", () => {
    const demoFiles = [
      "../app/[lang]/(home)/_components/HomeProductDemo.tsx",
      "../app/[lang]/(home)/_components/plan-demo/plan-demo-panels.tsx",
      "../app/[lang]/(home)/_components/home-day-demo/home-day-demo-panels.tsx",
    ];

    for (const file of demoFiles) {
      expect(
        readFileSync(new URL(file, import.meta.url), "utf8"),
      ).not.toContain("<h1");
    }
  });

  it("prioritizes Plans, AI Coach, and Training Load in the global navigation", () => {
    const header = readFileSync(
      new URL("../components/CustomHeader.tsx", import.meta.url),
      "utf8",
    );
    const plansIndex = header.indexOf("href={`${prefix}/plan`}");
    const aiCoachIndex = header.indexOf("href={`${prefix}/ai-coach`}");
    const trainingLoadIndex = header.indexOf(
      "href={`${prefix}/training-load`}",
    );

    expect(plansIndex).toBeGreaterThan(-1);
    expect(aiCoachIndex).toBeGreaterThan(plansIndex);
    expect(trainingLoadIndex).toBeGreaterThan(aiCoachIndex);
  });
});
