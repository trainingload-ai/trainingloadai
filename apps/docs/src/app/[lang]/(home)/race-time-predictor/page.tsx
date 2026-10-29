import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { RaceTimePredictorClient } from "./client";
import { RaceAppPromo } from "./promo";
import { RaceEducation, RaceSources } from "./education";
import { readRaceTimeShare } from "./share-inputs";
import styles from "./race-time-predictor.module.css";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { TrackedLink } from "@/components/TrackedLink";
import {
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
  normalizeFaqItems,
  normalizeFeatureList,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const pageUrl = `${siteUrl}${prefix}/race-time-predictor`;
  const ogImageUrl = `${siteUrl}/og/race-time-predictor.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "calculator",
    title: t("title"),
    description: t("description"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/race-time-predictor"),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
  };
}

export default async function RaceTimePredictorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialInputs = readRaceTimeShare(await searchParams);
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "raceTimePredictor.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    jump: Record<string, string>;
    related: string;
  };
  const howToSteps = [
    {
      name: tPage("howTo.steps.inputs.title"),
      text: tPage("howTo.steps.inputs.body"),
    },
    {
      name: tPage("howTo.steps.formula.title"),
      text: tPage("howTo.steps.formula.body"),
    },
    {
      name: tPage("howTo.steps.next.title"),
      text: tPage("howTo.steps.next.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}/race-time-predictor`;
  const appId = schemaId(pageUrl, "app");
  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("name"),
      description: t("description"),
      lang,
      mainEntityId: appId,
    }),
    webApplicationSchema({
      id: appId,
      url: pageUrl,
      name: t("name"),
      applicationCategory: t("applicationCategory"),
      description: t("description"),
      featureList: normalizeFeatureList(t.raw("featureList")),
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
        { name: t("breadcrumb.tools"), item: `${siteUrl}${prefix}/tools` },
        { name: t("name"), item: pageUrl },
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(pageFaq),
    }),
  ]);

  const relatedLinks = [
    [`${prefix}/vdot-calculator`, tCommon("vdotCalculatorAction")],
    [
      `${prefix}/running-pace-calculator`,
      tCommon("runningPaceCalculatorAction"),
    ],
    [`${prefix}/10k-training-plan`, tPage("links.tenK")],
    [`${prefix}/half-marathon-training-plan`, tPage("links.half")],
    [`${prefix}/marathon-training-plan`, tPage("links.marathon")],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <RaceTimePredictorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            hero={
              <div>
                <p className={styles.kicker}>{ui.badge}</p>
                <h1 className={styles.heroTitle}>{tPage("title")}</h1>
                <p className={styles.heroSubtitle}>{tPage("subtitle")}</p>
                <ul className={styles.proofList}>
                  {readProof(tPage.raw("proof")).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <nav
                  aria-label={tPage("ui.onThisPage")}
                  className={styles.jumpList}
                >
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      ["#what-is-race-time-prediction", ui.jump.definition],
                      ["#marathon-time-predictor", ui.jump.marathon],
                      ["#prediction-examples", ui.jump.examples],
                      ["#prediction-accuracy", ui.jump.accuracy],
                      ["#choose-race-result", ui.jump.input],
                      ["#method", ui.jump.formula],
                      ["#faq", ui.jump.faq],
                      ["#related", ui.jump.related],
                    ] as const
                  ).map(([href, label]) => (
                    <a key={href} href={href} className={styles.jumpItem}>
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
            }
            method={
              <>
                <RaceEducation lang={lang} />
                <section id="method" className={styles.section}>
                  <div className={styles.sectionHeading}>
                    <h2 className={styles.sectionTitle}>
                      {tPage("sections.answer.title")}
                    </h2>
                    <p className={styles.sectionBody}>
                      {tPage("sections.answer.description")}
                    </p>
                  </div>
                  <ol className={styles.stepList}>
                    {howToSteps.map((step, index) => (
                      <li key={step.name} className={styles.stepItem}>
                        <span className={styles.stepIndex}>{index + 1}</span>
                        <p>
                          <strong>{step.name}</strong> {step.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <div className={styles.formulaBlock}>
                    <p className={styles.note}>
                      {tPage("sections.answer.body")}
                    </p>
                    <pre className={styles.formulaPre}>
                      {tPage("sections.answer.formula")}
                    </pre>
                    <p className={styles.note}>
                      {tPage("sections.answer.limits")}
                    </p>
                    <p className={styles.sourceNote}>
                      {tPage("sections.answer.source")}{" "}
                      <a
                        href="https://vdoto2.com/calculator/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tPage("sections.answer.sourceLink")}
                      </a>
                    </p>
                  </div>
                </section>
                <RaceSources lang={lang} />
              </>
            }
          />
        </div>
      </div>

      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="faq" className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.sectionTitle}>{tPage("faqTitle")}</h2>
            </div>
            <div className={styles.faqList}>
              {pageFaq.map((item) => (
                <details key={item.question} className={styles.faqItem}>
                  <summary>{item.question}</summary>
                  <div className={styles.faqAnswer}>
                    {item.answer.split(/\n\n+/).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section id="related" className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.sectionTitle}>{ui.related}</h2>
            </div>
            <div className={styles.relatedGrid}>
              {relatedLinks.map(([href, label]) => (
                <TrackedLink
                  key={href}
                  href={href}
                  eventName="related_tool_clicked"
                  eventProperties={{
                    href,
                    label,
                    location: "tool_related_links",
                  }}
                  className={styles.relatedLink}
                >
                  {label}
                </TrackedLink>
              ))}
            </div>
            <TrackedLink
              href={`${prefix}/tools`}
              eventName="related_tool_clicked"
              eventProperties={{
                href: `${prefix}/tools`,
                location: "tool_related_links",
              }}
              className={styles.relatedMore}
            >
              {tCommon("allToolsAction")} <span aria-hidden="true">→</span>
            </TrackedLink>
          </section>
        </div>
      </div>
      <RaceAppPromo lang={lang} />
    </div>
  );
}
