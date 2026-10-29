import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { TrackedLink } from "@/components/TrackedLink";
import { RunningPaceCalculatorClient } from "./client";
import { RunningPaceAppPromo } from "./promo";
import { PaceEducation } from "./education";
import { readPaceCalculatorInputs } from "./share-inputs";
import styles from "./running-pace-calculator.module.css";
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
  const pageUrl = `${siteUrl}${prefix}/running-pace-calculator`;
  const ogImageUrl = `${siteUrl}/og/running-pace-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPaceCalculator.metadata",
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
      languages: absoluteAlternatesForPath(siteUrl, "/running-pace-calculator"),
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

export default async function RunningPaceCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialInputs = readPaceCalculatorInputs(await searchParams);
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "runningPaceCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPaceCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    primary: string;
    docs: string;
    onThisPage: string;
    jump: Record<string, string>;
    related: string;
  };
  const proof = readProof(tPage.raw("proof"));

  const howToSteps = [
    {
      name: tPage("howTo.steps.known.title"),
      text: tPage("howTo.steps.known.body"),
    },
    {
      name: tPage("howTo.steps.solve.title"),
      text: tPage("howTo.steps.solve.body"),
    },
    {
      name: tPage("howTo.steps.chart.title"),
      text: tPage("howTo.steps.chart.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}/running-pace-calculator`;
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

  const related = [
    [`${prefix}/5k-training-plan`, tPage("related.fiveK")],
    [`${prefix}/10k-training-plan`, tPage("related.tenK")],
    [`${prefix}/half-marathon-training-plan`, tPage("related.half")],
    [`${prefix}/marathon-training-plan`, tPage("related.marathon")],
    [`${prefix}/vdot-calculator`, tPage("related.vdot")],
    [`${prefix}/race-time-predictor`, tPage("related.predictor")],
  ] as const;

  const method: ReactNode = (
    <div key="pace-method" className={styles.methodBlock}>
      <section id="how-to" className={styles.section}>
        <h2 className={styles.sectionTitle}>{tPage("howTo.title")}</h2>
        <ol className={styles.stepList}>
          {howToSteps.map((step, index) => (
            <li key={step.name} className={styles.stepItem}>
              <span className={styles.stepIndex}>{index + 1}</span>
              <div>
                <strong>{step.name}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <PaceEducation lang={lang} />
    </div>
  );

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <RunningPaceCalculatorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            lang={lang}
            method={method}
            hero={
              <div key="pace-hero">
                <p className={styles.kicker}>{ui.badge}</p>
                <h1 className={styles.heroTitle}>{tPage("title")}</h1>
                <p className={styles.heroSubtitle}>{tPage("subtitle")}</p>
                {proof.length > 0 ? (
                  <p className={styles.proof}>
                    {proof.map((item, index) => (
                      <span key={item}>
                        {index > 0 ? (
                          <span className={styles.dot}> · </span>
                        ) : null}
                        {item}
                      </span>
                    ))}
                  </p>
                ) : null}
                <div className={styles.heroActions}>
                  <a className={styles.heroLink} href="#calculator">
                    {ui.primary}
                  </a>
                  <a
                    className={styles.heroLinkQuiet}
                    href={`${prefix}/docs/metrics/pace/zones`}
                  >
                    {ui.docs}
                  </a>
                </div>
                <ProductPreview
                  lang={lang}
                  title={tPage("heroProduct.title")}
                  body={tPage("heroProduct.body")}
                  cta={tPage("heroProduct.cta")}
                  href={`${prefix}/marathon-training-plan`}
                />
                <nav aria-label={ui.onThisPage} className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.scorecard],
                      ["#race-pace-charts", ui.jump.charts],
                      ["#pace-conversion", ui.jump.conversion],
                      ["#what-is-running-pace", ui.jump.definition],
                      ["#faq", ui.jump.faq],
                    ] as const
                  ).map(([href, label]) => (
                    <a key={href} href={href} className={styles.jumpItem}>
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
            }
          />
        </div>
      </div>
      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="faq" className={styles.section}>
            <h2 className={styles.sectionTitle}>{tPage("faqTitle")}</h2>
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
            <h2 className={styles.sectionTitle}>{ui.related}</h2>
            <div className={styles.relatedGrid}>
              {related.map(([href, label]) => (
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
      <RunningPaceAppPromo lang={lang} />
    </div>
  );
}
