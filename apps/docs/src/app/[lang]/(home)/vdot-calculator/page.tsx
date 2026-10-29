import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { TrackedLink } from "@/components/TrackedLink";
import { VdotCalculatorClient } from "./client";
import { VdotAppPromo, VdotFooterCta } from "./promo";
import { readVdotInputs } from "./share-inputs";
import styles from "./vdot-calculator.module.css";
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

type ExampleRow = {
  vdot: string;
  fiveK: string;
  threshold: string;
  marathon: string;
};

const PACE_GUIDES = [
  "easy",
  "marathon",
  "threshold",
  "interval",
  "repetition",
] as const;

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readExamples(raw: unknown): ExampleRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is ExampleRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as ExampleRow;
    return (
      typeof item.vdot === "string" &&
      typeof item.fiveK === "string" &&
      typeof item.threshold === "string" &&
      typeof item.marathon === "string"
    );
  });
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
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description ? (
          <p className={styles.sectionBody}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
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
  const path = "/vdot-calculator";
  const pageUrl = `${siteUrl}${prefix}${path}`;
  const ogImageUrl = `${siteUrl}/og/vdot-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "vdotCalculator.metadata",
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
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
  };
}

export default async function VdotCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialInputs = readVdotInputs(await searchParams);
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const tPage = await getTranslations({
    locale: lang,
    namespace: "vdotCalculator.page",
  });
  const tLd = await getTranslations({
    locale: lang,
    namespace: "vdotCalculator.jsonLd",
  });
  const pageFaq = normalizeFaqItems(tPage.raw("faqItems"));
  const examples = readExamples(tPage.raw("method.rows"));
  const pageUrl = `${siteUrl}${prefix}/vdot-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.result.title"),
      text: tPage("howTo.steps.result.body"),
    },
    {
      name: tPage("howTo.steps.calculate.title"),
      text: tPage("howTo.steps.calculate.body"),
    },
    {
      name: tPage("howTo.steps.apply.title"),
      text: tPage("howTo.steps.apply.body"),
    },
  ];
  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: tLd("name"),
      description: tLd("description"),
      lang,
      mainEntityId: appId,
    }),
    webApplicationSchema({
      id: appId,
      url: pageUrl,
      name: tLd("name"),
      description: tLd("description"),
      applicationCategory: tLd("applicationCategory"),
      featureList: normalizeFeatureList(tLd.raw("featureList")),
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
        { name: tLd("breadcrumb.home"), item: `${siteUrl}${prefix}/` },
        { name: tLd("breadcrumb.tools"), item: `${siteUrl}${prefix}/tools` },
        { name: tPage("title"), item: pageUrl },
      ],
    }),
  ]);

  const jump = [
    ["#calculator", tPage("jump.calculator")],
    ["#result", tPage("jump.result")],
    ["#paces", tPage("jump.paces")],
    ["#equivalents", tPage("jump.equivalents")],
    ["#method", tPage("jump.method")],
    ["#what-is-vdot", tPage("jump.whatIs")],
    ["#vdot-vs-vo2", tPage("jump.vdotVsVo2")],
    ["#faq", tPage("jump.faq")],
  ] as const;

  const related = [
    [`${prefix}/race-time-predictor`, tPage("relatedTools.raceTime")],
    [`${prefix}/daniels-running-formula`, tPage("relatedTools.daniels")],
    [`${prefix}/running-pace-calculator`, tPage("relatedTools.pace")],
    [`${prefix}/lactate-threshold-calculator`, tPage("relatedTools.lactate")],
    [`${prefix}/vo2-max-calculator`, tPage("relatedTools.vo2")],
  ] as const;
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const methods = (
    <Section
      id="method"
      title={tPage("method.title")}
      description={tPage("method.description")}
    >
      <p className={styles.formula}>{tPage("method.formula")}</p>
      <h3 className={styles.examplesTitle}>{tPage("method.examplesTitle")}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">{tPage("method.examplesTitle")}</caption>
          <thead>
            <tr>
              {(["vdot", "fiveK", "threshold", "marathon"] as const).map(
                (header) => (
                  <th key={header} scope="col">
                    {tPage(`method.headers.${header}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {examples.map((row) => (
              <tr key={row.vdot}>
                <th scope="row">{row.vdot}</th>
                <td className={styles.mono}>{row.fiveK}</td>
                <td className={styles.mono}>{row.threshold}</td>
                <td className={styles.mono}>{row.marathon}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>{tPage("method.examplesNote")}</p>
      <p className={styles.note}>{tPage("method.assumptions")}</p>
      <p className={styles.note}>{tPage("method.limits")}</p>
      <p className={styles.sourceNote}>
        {tPage("method.source")}{" "}
        <a
          href="https://vdoto2.com/calculator"
          target="_blank"
          rel="noopener noreferrer"
        >
          {tPage("method.officialLink")}
        </a>
        {" · "}
        <a
          href="https://us.humankinetics.com/products/daniels-running-formula-4th-edition-pdf-with-web-resource"
          target="_blank"
          rel="noopener noreferrer"
        >
          {tPage("method.danielsLink")}
        </a>
      </p>
    </Section>
  );

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <VdotCalculatorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            methods={methods}
            hero={
              <div>
                <p className={styles.kicker}>{tPage("kicker")}</p>
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
                  href={`${prefix}/daniels-running-formula`}
                />

                <nav
                  aria-label={tPage("onThisPage")}
                  className={styles.jumpList}
                >
                  {jump.map(([href, label]) => (
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

      <VdotAppPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <Section id="what-is-vdot" title={tPage("whatIs.title")}>
            <div className={styles.shortAnswer}>
              <h2>{tPage("shortAnswer.title")}</h2>
              <p>{tPage("shortAnswer.body")}</p>
            </div>
            <p className={styles.sectionBody}>{tPage("whatIs.intro")}</p>
            <ul className={styles.bulletList}>
              <li>{tPage("whatIs.bullets.performance")}</li>
              <li>{tPage("whatIs.bullets.pacing")}</li>
              <li>{tPage("whatIs.bullets.trend")}</li>
            </ul>
          </Section>

          <Section id="training-paces" title={tPage("trainingPaces.title")}>
            <p className={styles.sectionBody}>{tPage("trainingPaces.intro")}</p>
            <div className={styles.guideGrid}>
              {PACE_GUIDES.map((key) => (
                <article key={key} className={styles.guideCard}>
                  <h3>{tPage(`trainingPaces.${key}.title`)}</h3>
                  <p>{tPage(`trainingPaces.${key}.text`)}</p>
                </article>
              ))}
            </div>
            <p className={styles.note}>{tPage("trainingPaces.note")}</p>
          </Section>

          <Section id="vdot-vs-vo2" title={tPage("vdotVsVo2.title")}>
            <p className={styles.sectionBody}>{tPage("vdotVsVo2.intro")}</p>
            <ul className={styles.bulletList}>
              <li>{tPage("vdotVsVo2.bullets.vdot")}</li>
              <li>{tPage("vdotVsVo2.bullets.vo2")}</li>
              <li>{tPage("vdotVsVo2.bullets.use")}</li>
            </ul>
            <p className={styles.inlineLinks}>
              <a href={`${prefix}/docs/metrics/maximal-oxygen-uptake`}>
                {tPage("vdotVsVo2.links.vo2Doc")}
              </a>
              <a href={`${prefix}/vo2-max-calculator`}>
                {tPage("vdotVsVo2.links.vo2Tool")}
              </a>
              <a href={`${prefix}/docs/metrics/pace/zones`}>
                {tPage("vdotVsVo2.links.paceZones")}
              </a>
            </p>
          </Section>

          <Section id="how-to" title={tPage("howTo.title")}>
            <ol className={styles.bulletList}>
              {howToSteps.map((step) => (
                <li key={step.name}>
                  <strong>{step.name}. </strong>
                  {step.text}
                </li>
              ))}
            </ol>
          </Section>

          <section id="faq" className={styles.section}>
            <h2 className={styles.sectionTitle}>{tPage("faq.title")}</h2>
            <p className={styles.sectionBody}>{tPage("faq.subtitle")}</p>
            <div className={styles.faqList}>
              {pageFaq.map((item, index) => (
                <details
                  key={item.question}
                  className={styles.faqItem}
                  open={index < 4}
                >
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

          <Section id="related" title={tPage("relatedTools.title")}>
            <div className={styles.relatedGrid}>
              {related.map(([href, label]) => (
                <TrackedLink
                  key={href}
                  href={href}
                  className={styles.relatedLink}
                  eventName="related_tool_clicked"
                  eventProperties={{
                    href,
                    label,
                    location: "tool_related_links",
                  }}
                >
                  {label}
                </TrackedLink>
              ))}
            </div>
            <TrackedLink
              href={`${prefix}/tools`}
              className={styles.relatedMore}
              eventName="related_tool_clicked"
              eventProperties={{
                href: `${prefix}/tools`,
                location: "tool_related_links",
              }}
            >
              {tCommon("allToolsAction")} <span aria-hidden="true">→</span>
            </TrackedLink>
          </Section>
          <VdotFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
