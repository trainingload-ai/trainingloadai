import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { MaxHeartRateCalculatorClient } from "./client";
import { MaxHrAppPromo, MaxHrFooterCta } from "./promo";
import { readMaxHeartRateInputs } from "./share-inputs";
import styles from "./max-heart-rate-calculator.module.css";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { TrackedLink } from "@/components/TrackedLink";
import {
  estimateMaxHr,
  roundBpm,
  type MaxHrFormulaKey,
} from "@/lib/max-heart-rate";
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

const FORMULAS = ["tanaka", "gulati", "hunt", "arena", "fox"] as const;

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description ? (
          <p className={styles.sectionBody}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function formulaBpm(formula: MaxHrFormulaKey, age: number) {
  const estimate = estimateMaxHr(formula, age);
  return estimate == null ? "—" : roundBpm(estimate);
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
  const pageUrl = `${siteUrl}${prefix}/max-heart-rate-calculator`;
  const ogImageUrl = `${siteUrl}/og/max-heart-rate-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "maxHeartRateCalculator.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const sourceTitle = t("title");
  const sourceDescription = t("description");
  const seo = optimizeSeoText({
    locale: lang,
    context: "calculator",
    title: sourceTitle,
    description: sourceDescription,
  });
  const title = lang === "en" ? sourceTitle : seo.title;
  const description = lang === "en" ? sourceDescription : seo.description;

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(
        siteUrl,
        "/max-heart-rate-calculator",
      ),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function MaxHeartRateCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const initialInputs = readMaxHeartRateInputs(await searchParams);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "maxHeartRateCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "maxHeartRateCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    jump: Record<string, string>;
    related: string;
  };

  const ageExamples = [20, 30, 40, 50, 60, 70, 80].map((age) => ({
    age,
    tanaka: formulaBpm("tanaka", age),
    fox: formulaBpm("fox", age),
    gulati: formulaBpm("gulati", age),
  }));

  const pageUrl = `${siteUrl}${prefix}/max-heart-rate-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.age.title"),
      text: tPage("howTo.steps.age.body"),
    },
    {
      name: tPage("howTo.steps.compare.title"),
      text: tPage("howTo.steps.compare.body"),
    },
    {
      name: tPage("howTo.steps.zones.title"),
      text: tPage("howTo.steps.zones.body"),
    },
  ];
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
      description: t("description"),
      applicationCategory: t("applicationCategory"),
      featureList: normalizeFeatureList(t.raw("featureList")),
    }),
    howToSchema({
      id: schemaId(pageUrl, "howto"),
      name: tPage("howTo.title"),
      description: tPage("subtitle"),
      steps: howToSteps,
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(pageFaq),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tCommon("home"), item: `${siteUrl}${prefix}/` },
        { name: tCommon("tools"), item: `${siteUrl}${prefix}/tools` },
        { name: tPage("title"), item: pageUrl },
      ],
    }),
  ]);

  const relatedLinks = [
    [
      `${prefix}/heart-rate-zones-calculator`,
      tCommon("heartRateZonesCalculatorAction"),
    ],
    [
      `${prefix}/zone-2-heart-rate-calculator`,
      tCommon("zone2HeartRateCalculatorAction"),
    ],
    [
      `${prefix}/lactate-threshold-calculator`,
      tCommon("lactateThresholdCalculatorAction"),
    ],
    [
      `${prefix}/training-load-calculator`,
      tCommon("trainingLoadCalculatorAction"),
    ],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <MaxHeartRateCalculatorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            methods={
              <>
                <section id="definition" className={styles.section}>
                  <div className={styles.sectionHeading}>
                    <p className={styles.kicker}>
                      {tPage("quickAnswer.label")}
                    </p>
                    <h2 className={styles.sectionTitle}>
                      {tPage("quickAnswer.title")}
                    </h2>
                    <p className={styles.sectionBody}>
                      {tPage.rich("quickAnswer.body", {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </p>
                    <p className={styles.note}>{tPage("quickAnswer.note")}</p>
                  </div>
                  <div className={styles.formulaGrid}>
                    {(["adults", "women", "measured"] as const).map(
                      (key) => (
                        <article className={styles.formulaCard} key={key}>
                          <h3>
                            {tPage(`quickAnswer.bestFormula.${key}.label`)}
                          </h3>
                          <p>
                            {tPage(`quickAnswer.bestFormula.${key}.value`)}
                          </p>
                        </article>
                      ),
                    )}
                  </div>
                </section>

                <Section
                  id="methods"
                  title={tPage("methodsTitle")}
                  description={tPage("methodsBody")}
                >
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <caption className="sr-only">
                        {tPage("formulasTable.title")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{tPage("methodsHeaders.formula")}</th>
                          <th scope="col">{tPage("methodsHeaders.equation")}</th>
                          <th scope="col">{tPage("methodsHeaders.bestFor")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FORMULAS.map((key) => (
                          <tr key={key}>
                            <th scope="row">{tPage(`formulas.${key}.name`)}</th>
                            <td className={styles.equation}>
                              {tPage(`formulas.${key}.equation`)}
                            </td>
                            <td>{tPage(`formulas.${key}.bestFor`)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className={styles.researchList}>
                    <li>
                      <a href="https://pubmed.ncbi.nlm.nih.gov/11153730/">
                        {tPage("research.tanaka")}
                      </a>
                    </li>
                    <li>
                      <a href="https://pubmed.ncbi.nlm.nih.gov/20585008/">
                        {tPage("research.gulati")}
                      </a>
                    </li>
                    <li>
                      <a href="https://pubmed.ncbi.nlm.nih.gov/22376273/">
                        {tPage("research.hunt")}
                      </a>
                    </li>
                  </ul>
                </Section>

                <Section
                  id="limitations"
                  title={tPage("limitations.title")}
                  description={tPage("limitations.body")}
                >
                  <ul className={styles.plainList}>
                    {(tPage.raw("limitations.items") as string[]).map(
                      (item) => (
                        <li key={item}>{item}</li>
                      ),
                    )}
                  </ul>
                </Section>

                <Section
                  id="measure"
                  title={tPage("measure.title")}
                  description={tPage("measure.body")}
                >
                  <ol className={styles.stepList}>
                    {(tPage.raw("measure.steps") as string[]).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className={styles.note}>{tPage("measure.safety")}</p>
                </Section>
              </>
            }
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
                <ProductPreview
                  lang={lang}
                  title={tPage("heroProduct.title")}
                  body={tPage("heroProduct.body")}
                  cta={tPage("heroProduct.cta")}
                  href={`${prefix}/ai-coach`}
                />
                <nav aria-label="On this page" className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      ["#definition", ui.jump.definition],
                      ["#methods", ui.jump.methods],
                      ["#measure", ui.jump.measure],
                      ["#by-age", ui.jump.byAge],
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

          <Section
            id="by-age"
            title={tPage("byAge.title")}
            description={tPage("byAge.body")}
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">{tPage("byAge.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{tPage("byAge.headers.age")}</th>
                    <th scope="col">{tPage("byAge.headers.tanaka")}</th>
                    <th scope="col">{tPage("byAge.headers.fox")}</th>
                    <th scope="col">{tPage("byAge.headers.gulati")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ageExamples.map((row) => (
                    <tr key={row.age}>
                      <th scope="row">{row.age}</th>
                      <td>{row.tanaka}</td>
                      <td>{row.fox}</td>
                      <td>{row.gulati}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{tPage("byAge.note")}</p>
          </Section>
        </div>
      </div>

      <MaxHrAppPromo lang={lang} />

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

          <Section id="related" title={ui.related}>
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
              {tPage("ui.allTools")} <span aria-hidden="true">→</span>
            </TrackedLink>
          </Section>
          <MaxHrFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
