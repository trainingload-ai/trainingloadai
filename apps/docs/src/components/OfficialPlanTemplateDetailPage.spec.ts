import "@/i18n/mock-server-translations";
import { describe, expect, it } from "vitest";

import {
  officialPlanTemplateHeading,
  officialPlanTemplateMetadata,
  type OfficialPlanSlug,
} from "./OfficialPlanTemplateDetailPage";

const routes: Array<{
  slug: OfficialPlanSlug;
  path: string;
  titleIntent: string;
}> = [
  {
    slug: "improve-10k",
    path: "/10k-training-plan/improve",
    titleIntent: "10公里进阶训练计划",
  },
  {
    slug: "target-10k",
    path: "/10k-training-plan/target",
    titleIntent: "10公里目标成绩训练计划",
  },
  {
    slug: "improve-half-marathon",
    path: "/half-marathon-training-plan/improve",
    titleIntent: "半马进阶训练计划",
  },
  {
    slug: "target-half-marathon",
    path: "/half-marathon-training-plan/target",
    titleIntent: "半马目标成绩训练计划",
  },
  {
    slug: "improve-marathon",
    path: "/marathon-training-plan/improve",
    titleIntent: "马拉松进阶训练计划",
  },
  {
    slug: "target-marathon",
    path: "/marathon-training-plan/target",
    titleIntent: "马拉松目标成绩训练计划",
  },
];

describe("official race-plan long-tail SEO", () => {
  it.each(routes)(
    "owns a distinct intent and canonical URL for $slug",
    async ({ slug, path, titleIntent }) => {
      const metadata = await officialPlanTemplateMetadata({ lang: "zh", slug });

      expect(String(metadata.title)).toContain(titleIntent);
      expect(await officialPlanTemplateHeading({ lang: "zh", slug })).toBe(
        titleIntent,
      );
      expect(String(metadata.alternates?.canonical)).toBe(
        `https://www.trainingload.ai/zh${path}`,
      );
      expect(metadata.alternates?.languages).toMatchObject({
        en: `https://www.trainingload.ai${path}`,
        "zh-Hans": `https://www.trainingload.ai/zh${path}`,
        "zh-Hant": `https://www.trainingload.ai/zh-hant${path}`,
        ja: `https://www.trainingload.ai/ja${path}`,
      });
    },
  );

  it("keeps all six Chinese long-tail titles distinct", async () => {
    const metadata = await Promise.all(
      routes.map(({ slug }) => officialPlanTemplateMetadata({ lang: "zh", slug })),
    );
    const titles = metadata.map(({ title }) => String(title));

    expect(new Set(titles).size).toBe(routes.length);
  });

  it("keeps non-indexed locales out of the index", async () => {
    const metadata = await officialPlanTemplateMetadata({
      lang: "nl",
      slug: "improve-10k",
    });

    expect(metadata.robots).toMatchObject({ index: false, follow: true });
    expect(
      (await officialPlanTemplateMetadata({ lang: "fr", slug: "improve-10k" })).robots,
    ).toMatchObject({ index: false, follow: true });
  });
});
