import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TenKBridgePage,
  tenKBridgeMetadata,
} from "@/components/TenKBridgePage";
import { RunningPlanIntentGuide } from "@/components/RunningPlanIntentGuide";
import {
  getPlanTemplateVariant,
  getRunPlanTemplate,
} from "@shared/plan-templates";
import {
  BRIDGE_PLAN_PATHS,
  getPlanIntentGuide,
  goalPaceRows,
  runningPlanIntentContent,
  type BridgePlanSlug,
} from "./running-plan-intents";

const locales = ["en", "zh", "zh-hant", "ja"];

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, shape(entry)]),
    );
  return typeof value;
}

describe("running-plan long-tail content", () => {
  it.each(locales)(
    "has complete localized content and working route targets in %s",
    (lang) => {
      const copy = runningPlanIntentContent(lang);
      expect(shape(copy)).toEqual(shape(runningPlanIntentContent("en")));
      for (const [slug, guide] of Object.entries(copy.guides)) {
        expect(guide.title.trim()).not.toBe("");
        expect(guide.items.length).toBeGreaterThanOrEqual(2);
        if (lang !== "en")
          expect(guide.title).not.toBe(getPlanIntentGuide(slug, "en")?.title);
        for (const item of guide.items) {
          expect(
            existsSync(
              new URL(
                `../app/[lang]/(home)${item.href}/page.tsx`,
                import.meta.url,
              ),
            ),
          ).toBe(true);
        }
      }
      for (const path of BRIDGE_PLAN_PATHS) {
        const slug = path.slice(1) as BridgePlanSlug;
        const page = copy.bridges[slug];
        expect(page.metaDescription.length).toBeLessThanOrEqual(160);
        const metadata = tenKBridgeMetadata(lang, slug);
        const prefix = lang === "en" ? "" : `/${lang}`;
        expect(metadata.alternates?.canonical).toBe(
          `https://www.trainingload.ai${prefix}${path}`,
        );
        expect(Object.keys(metadata.alternates?.languages ?? {})).toEqual(
          expect.arrayContaining(["en", "zh-Hans", "zh-Hant", "ja"]),
        );
      }
    },
  );

  it("uses real 9-week and 10-week templates, without inventing a combined template", () => {
    for (const [slug, weeks] of [
      ["first-5k", 9],
      ["finish-10k", 10],
    ] as const) {
      const variant = getPlanTemplateVariant(getRunPlanTemplate(slug)!);
      expect(variant?.periodWeeks).toBe(weeks);
      expect(variant?.trainingDaysPerWeek).toBe(3);
    }
    const html = renderToStaticMarkup(
      <TenKBridgePage lang="zh" slug="couch-to-10k-training-plan" />,
    );
    expect(html).toContain("/plans/templates/first-5k?");
    expect(html).toContain("/plans/templates/finish-10k?");
    expect(html).not.toContain("/plans/templates/couch-to-10k");
    expect(html.match(/data-plan-week=/g)).toHaveLength(19);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("foundation-week-9");
    expect(ids).toContain("week-10");
    expect(html).toContain('href="/zh/5k-training-plan"');
    expect(html).toContain('href="/zh/10k-training-plan"');
  });

  it.each(locales)(
    "renders full bridge schedules and localized light/dark screenshots in %s",
    (lang) => {
      const html = renderToStaticMarkup(
        <TenKBridgePage lang={lang} slug="5k-to-10k-training-plan" />,
      );
      expect(html.match(/data-plan-week=/g)).toHaveLength(10);
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
      expect(html).toContain(`web-plan-v2-${lang}.png`);
      expect(html).toContain(`web-plan-dark-v2-${lang}.png`);
      expect(html).toContain(`mobile-calendar-dark-v2-${lang}.png`);
      expect(html).toContain(
        runningPlanIntentContent(lang).bridges["5k-to-10k-training-plan"]
          .faq[0][0],
      );
    },
  );

  it("keeps unsupported language variants out of the index", () => {
    expect(
      tenKBridgeMetadata("fr", "couch-to-10k-training-plan").robots,
    ).toMatchObject({ index: false, follow: true });
  });

  it("computes race averages with official distances and labels them as rounded boundaries", () => {
    expect(goalPaceRows("target-10k")).toEqual([
      { time: "0:40:00", perKm: "4:00", perMile: "6:26" },
      { time: "0:45:00", perKm: "4:30", perMile: "7:15" },
      { time: "0:50:00", perKm: "5:00", perMile: "8:03" },
    ]);
    expect(goalPaceRows("target-half-marathon")[0]).toEqual({
      time: "2:00:00",
      perKm: "5:41",
      perMile: "9:09",
    });
    expect(goalPaceRows("target-marathon")[0]).toEqual({
      time: "3:00:00",
      perKm: "4:16",
      perMile: "6:52",
    });
    const html = renderToStaticMarkup(
      <RunningPlanIntentGuide slug="target-marathon" lang="zh" />,
    );
    expect(html).toContain("四舍五入");
    expect(html).toContain("5:41");
    expect(goalPaceRows("improve-10k")).toEqual([]);
  });

  it("adds both new pages and all six existing improvement/target pages to sitemap paths", () => {
    const source = readFileSync(
      new URL("../app/sitemap.ts", import.meta.url),
      "utf8",
    );
    const paths = source.split("const staticPaths = [")[1].split("];", 1)[0];
    for (const path of [
      ...BRIDGE_PLAN_PATHS,
      ...["10k", "half-marathon", "marathon"].flatMap((distance) =>
        ["improve", "target"].map(
          (intent) => `/${distance}-training-plan/${intent}`,
        ),
      ),
    ]) {
      expect(paths).toContain(`"${path}"`);
    }
  });
});
