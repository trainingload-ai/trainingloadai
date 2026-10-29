import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bike, Footprints, Gauge, Waves } from "lucide-react";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import layout from "@/components/calculators/tool-page.module.css";
import {
  ToolCard,
  ToolFaqSection,
  ToolHero,
  ToolHowToSection,
  ToolJumpNav,
  ToolPageMain,
  ToolRelatedLinks,
  ToolSection,
} from "@/components/ToolPageLayout";
import {
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
  normalizeFaqItems,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webPageSchema,
} from "@/lib/seo-schema";

const PATH = "/brick-workout";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${prefix}${PATH}`;
  const t = await getTranslations({
    locale: lang,
    namespace: "brickWorkout.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: t("title"),
    description: t("description"),
  });
  const indexed = isSeoIndexedLanguage(lang);

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, PATH),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
    },
    robots: indexed ? undefined : { index: false, follow: true },
  };
}

export default async function BrickWorkoutPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "brickWorkout.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "brickWorkout.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    primary: string;
    plan: string;
    jump: Record<string, string>;
    related: string;
    visual: { signal: string; bike: string; run: string };
  };
  const formats = tPage.raw("sections.formats.cards") as Array<{
    title: string;
    body: string;
  }>;
  const loadNotes = tPage.raw("sections.load.items") as string[];
  const formatIcons = [Bike, Footprints, Waves, Gauge];
  const appCreateUrl = `https://app.trainingload.ai/${lang}/plans/create?source=brick-workout&sport=triathlon&placement=hero_secondary`;

  const howToSteps = [
    {
      name: tPage("howTo.steps.purpose.title"),
      text: tPage("howTo.steps.purpose.body"),
    },
    {
      name: tPage("howTo.steps.format.title"),
      text: tPage("howTo.steps.format.body"),
    },
    {
      name: tPage("howTo.steps.load.title"),
      text: tPage("howTo.steps.load.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}${PATH}`;
  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("name"),
      description: t("description"),
      lang,
    }),
    howToSchema({
      id: schemaId(pageUrl, "howto"),
      name: tPage("howTo.title"),
      description: tPage("subtitle"),
      steps: howToSteps,
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: t("breadcrumb.home"), item: `${siteUrl}${prefix}/` },
        { name: t("breadcrumb.plans"), item: `${siteUrl}${prefix}/plan` },
        { name: t("name"), item: pageUrl },
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(pageFaq),
    }),
  ]);

  return (
    <ToolPageMain maxWidth="max-w-7xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ToolHero
        badge={ui.badge}
        title={tPage("title")}
        subtitle={tPage("subtitle")}
        primary={{ href: "#what-is", label: ui.primary }}
        secondary={{ href: appCreateUrl, label: ui.plan }}
        visual={<ToolProductPreview lang={lang} kind="plans" />}
      />

      <ToolJumpNav
        links={[
          { href: "#what-is", label: ui.jump.whatIs },
          { href: "#formats", label: ui.jump.formats },
          { href: "#load", label: ui.jump.load },
          { href: "#how-to", label: ui.jump.howTo },
          { href: "#faq", label: ui.jump.faq },
          { href: "#related", label: ui.jump.related },
        ]}
      />

      <ToolSection
        id="what-is"
        title={tPage("sections.answer.title")}
        description={tPage("sections.answer.description")}
      >
        <ToolCard className="space-y-3">
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {tPage("sections.answer.body")}
          </p>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {tPage("sections.answer.why")}
          </p>
        </ToolCard>
      </ToolSection>

      <ToolSection
        id="formats"
        title={tPage("sections.formats.title")}
        description={tPage("sections.formats.description")}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {formats.map((card, index) => {
            const Icon = formatIcons[index] ?? Bike;
            return (
              <ToolCard key={card.title} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-emerald-600 dark:text-emerald-300" />
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {card.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {card.body}
                </p>
              </ToolCard>
            );
          })}
        </div>
      </ToolSection>

      <ToolSection
        id="load"
        title={tPage("sections.load.title")}
        description={tPage("sections.load.description")}
      >
        <ToolCard>
          <ul className="space-y-3">
            {loadNotes.map((item) => (
              <li
                key={item}
                className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </ToolCard>
      </ToolSection>

      <ToolHowToSection
        title={tPage("howTo.title")}
        steps={[
          {
            title: tPage("howTo.steps.purpose.title"),
            body: tPage("howTo.steps.purpose.body"),
          },
          {
            title: tPage("howTo.steps.format.title"),
            body: tPage("howTo.steps.format.body"),
          },
          {
            title: tPage("howTo.steps.load.title"),
            body: tPage("howTo.steps.load.body"),
          },
        ]}
      />

      <ToolFaqSection id="faq" title={tPage("faqTitle")} items={pageFaq} />

      <div id="related" className="scroll-mt-24">
        <ToolRelatedLinks
          title={ui.related}
          links={[
            {
              href: `${prefix}/olympic-triathlon-training-plan`,
              label: tCommon("olympicTriathlonTrainingPlanAction"),
            },
            {
              href: `${prefix}/ironman-70-3-training-plan`,
              label: tCommon("ironman703TrainingPlanAction"),
            },
            {
              href: `${prefix}/workout-editor`,
              label: tCommon("workoutEditorAction"),
            },
            {
              href: `${prefix}/tss-calculator`,
              label: tCommon("tssCalculatorAction"),
            },
            {
              href: `${prefix}/training-load-calculator`,
              label: tCommon("trainingLoadCalculatorAction"),
            },
            {
              href: `${prefix}/ftp-calculator`,
              label: tCommon("ftpCalculatorAction"),
            },
          ]}
        />
      </div>

      <div className={layout.bleed}>
        <CalculatorPromo
          lang={lang}
          namespace="toolExperience.plans.promo"
          appHref={`https://app.trainingload.ai/${lang}/plans/create?source=brick-workout&sport=triathlon&placement=final`}
        />
      </div>
    </ToolPageMain>
  );
}
