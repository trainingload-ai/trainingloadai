import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("5K training plan experience", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const component = readFileSync(
    new URL("../../../../components/DistancePlanExperience.tsx", import.meta.url),
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

  const systemPreview = readFileSync(
    new URL("./_components/FiveKSystemPreview.tsx", import.meta.url),
    "utf8",
  );
  const previewAssets = readFileSync(
    new URL("./_components/plan-preview-assets.ts", import.meta.url),
    "utf8",
  );

  it("connects the public schedule to the real product system", () => {
    expect(page).toContain("DistancePlanExperience");
    expect(component).toContain('tHome.raw("pageModules.modules")');
    expect(component).toContain('tHome("planSpotlight.freeTitle")');
    expect(component).toContain("<FiveKProductPreview");
    expect(component).toContain("<FiveKSystemShowcase");
    expect(systemShowcase).toContain('role="tablist"');
    expect(systemShowcase).toContain('aria-orientation="vertical"');
    expect(systemShowcase).toContain("<FiveKSystemPreview");
    expect(component).toContain("<RunningPlanSchedule");
    expect(component).toContain("overviewAfter=");
    expect(productPreview).toContain('from "next/image"');
    expect(previewAssets).toContain("function previewLocale");
    expect(systemPreview).toContain(
      'previewAsset("web-calendar-dark", lang, planSlug)',
    );
    expect(systemPreview).toContain(
      'previewAsset("web-plan-dark", lang, planSlug)',
    );
    expect(systemPreview).toContain(
      'previewAsset("mobile-analysis-dark", lang)',
    );
    expect(systemPreview).toContain(
      'previewAsset("mobile-calendar-dark", lang)',
    );
    expect(systemPreview).toContain('previewAsset("web-coach-dark", lang)');
    expect(systemPreview).toContain(
      'previewAsset("mobile-coach-dark", lang)',
    );
    expect(productPreview).toContain("styles.themeLightImage");
    expect(productPreview).toContain("styles.themeDarkImage");
    expect(previewAssets).toContain("${surface}-v2-${locale}.png");
    expect(productPreview).toContain(
      'surface={showPlan ? "web-plan" : "web-calendar"}',
    );
    expect(component).toContain('variant="workflow"');
  });

  it("keeps registration benefits and structured search data in the flow", () => {
    expect(component).toContain("newUserGiftValues");
    expect(component).toContain("formatNewUserGiftCredits");
    expect(component).toContain("howToSchema");
    expect(component).toContain('"@type": "FAQPage"');
    expect(component).toContain("breadcrumbSchema");
    expect(component).toContain('placement: "final"');
  });
});
