import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("5K training plan experience", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const experience = readFileSync(
    new URL("./_components/FiveKPlanExperience.tsx", import.meta.url),
    "utf8",
  );
  const sharedExperience = readFileSync(
    new URL(
      "../../../../components/DistancePlanExperience.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const component = readFileSync(
    new URL("./_components/FiveKTrainingPlanPage.tsx", import.meta.url),
    "utf8",
  );
  const productPreview = readFileSync(
    new URL("./_components/FiveKProductPreview.tsx", import.meta.url),
    "utf8",
  );
  const systemShowcase = readFileSync(
    new URL("./_components/FiveKSystemShowcase.tsx", import.meta.url),
    "utf8",
  );

  it("connects the public schedule to the real product system", () => {
    expect(page).toContain("FiveKPlanExperience");
    expect(experience).toContain("DistancePlanExperience");
    expect(sharedExperience).toContain('tHome.raw("pageModules")');
    expect(sharedExperience).toContain('tHome.raw("planSpotlight")');
    expect(component).toContain("<FiveKProductPreview");
    expect(component).toContain("<FiveKSystemShowcase");
    expect(systemShowcase).toContain('role="tablist"');
    expect(systemShowcase).toContain('aria-orientation="vertical"');
    expect(systemShowcase).toContain("<FiveKSystemPreview");
    expect(component).toContain("<RunningPlanSchedule");
    expect(component).toContain("overviewAfter=");
    expect(productPreview).toContain('from "next/image"');
    expect(productPreview).toContain("function previewLocale");
    expect(productPreview).toContain('surface = "web-plan"');
    expect(productPreview).toContain('surface = "mobile-plan"');
    expect(productPreview).toContain(
      'planPreviewAsset("web-calendar-dark", locale, planSlug)',
    );
    expect(productPreview).toContain(
      'planPreviewAsset("web-plan-dark", locale, planSlug)',
    );
    expect(productPreview).toContain(
      'previewAsset("mobile-analysis-dark", locale)',
    );
    expect(productPreview).toContain(
      'previewAsset("mobile-calendar-dark", locale)',
    );
    expect(productPreview).toContain('previewAsset("web-coach-dark", locale)');
    expect(productPreview).toContain(
      'previewAsset("mobile-coach-dark", locale)',
    );
    expect(productPreview).toContain("styles.themeLightImage");
    expect(productPreview).toContain("styles.themeDarkImage");
    expect(productPreview).toContain("${surface}-v2-${locale}.png");
    expect(productPreview).toContain("usesPlanDetail");
    expect(productPreview).toContain(
      'surface={showPlan ? "web-plan" : "web-calendar"}',
    );
    expect(component).toContain("<FiveKWorkflowPreview");
  });

  it("keeps registration benefits and structured search data in the flow", () => {
    expect(sharedExperience).toContain("newUserGiftValues");
    expect(sharedExperience).toContain("formatNewUserGiftCredits");
    expect(component).toContain("howToSchema");
    expect(component).toContain('"@type": "FAQPage"');
    expect(component).toContain("breadcrumbSchema");
    expect(component).toContain('placement: "final"');
  });
});
