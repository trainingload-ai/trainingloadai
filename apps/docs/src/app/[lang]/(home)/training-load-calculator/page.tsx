import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
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
import { readTrainingLoadInputs } from "./share-inputs";
import { TrainingLoadCalculatorClient } from "./client";
import { TrainingLoadAppPromo, TrainingLoadFooterCta } from "./promo";
import styles from "./training-load-calculator.module.css";

type WorkedRow = {
  line: string;
  update: string;
  result: string;
};

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readWorkedRows(raw: unknown): WorkedRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is WorkedRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as WorkedRow;
    return (
      typeof item.line === "string" &&
      typeof item.update === "string" &&
      typeof item.result === "string"
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
  const pageUrl = `${siteUrl}${prefix}/training-load-calculator`;
  const ogImageUrl = `${siteUrl}/og/training-load-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "trainingLoadCalculator.metadata",
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
      languages: absoluteAlternatesForPath(
        siteUrl,
        "/training-load-calculator",
      ),
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

export default async function TrainingLoadCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialInputs = readTrainingLoadInputs(await searchParams);
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "trainingLoadCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "trainingLoadCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const workedRows = readWorkedRows(tPage.raw("sections.formula.rows"));
  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jumpLabel: string;
    jump: Record<string, string>;
    related: string;
  };

  const howToSteps = [
    {
      name: tPage("howTo.steps.start.title"),
      text: tPage("howTo.steps.start.body"),
    },
    {
      name: tPage("howTo.steps.days.title"),
      text: tPage("howTo.steps.days.body"),
    },
    {
      name: tPage("howTo.steps.read.title"),
      text: tPage("howTo.steps.read.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}/training-load-calculator`;
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
    [`${prefix}/tss-calculator`, tPage("links.tss")],
    [`${prefix}/features/pmc-fitness-chart`, tPage("links.chart")],
    [`${prefix}/blog/what-are-ctl-atl-tsb`, tPage("links.blog")],
    [`${prefix}/docs/metrics/pmc/chronic-training-load`, tPage("links.docs")],
    [`${prefix}/training-load`, tPage("links.trainingLoad")],
    [`${prefix}/ftp-calculator`, tPage("links.ftp")],
    [`${prefix}/css-calculator`, tCommon("cssCalculatorAction")],
    [`${prefix}/swim-training-plan`, tCommon("swimTrainingPlanAction")],
    [`${prefix}/cycling-training-plan`, tCommon("cyclingTrainingPlanAction")],
    [
      `${prefix}/ironman-70-3-training-plan`,
      tCommon("ironman703TrainingPlanAction"),
    ],
    [`${prefix}/plan`, tPage("links.plans")],
    [`${prefix}/ai-training-plan`, tPage("links.aiCoach")],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <TrainingLoadCalculatorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            hero={
              <div key="training-load-hero">
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
                  href={`${prefix}/training-load`}
                  cta={tPage("heroProduct.cta")}
                />
                <nav aria-label={ui.jumpLabel} className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      ["#formula", ui.jump.formula],
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
            id="formula"
            title={tPage("sections.formula.title")}
            description={tPage("sections.formula.description")}
          >
            <p className={styles.formulaBlock}>{tPage("formula")}</p>
            <p className={styles.note}>{tPage("sections.formula.caption")}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  {tPage("sections.formula.caption")}
                </caption>
                <thead>
                  <tr>
                    {(["line", "update", "result"] as const).map((header) => (
                      <th key={header} scope="col">
                        {tPage(`sections.formula.headers.${header}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workedRows.map((row) => (
                    <tr key={row.line}>
                      <th scope="row">{row.line}</th>
                      <td className={styles.mono}>{row.update}</td>
                      <td className={styles.mono}>{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{tPage("sections.formula.note")}</p>
            <p className={styles.note}>{tPage("sections.formula.rest")}</p>
            <p className={styles.note}>
              {tPage("sections.formula.source")}{" "}
              <a
                href="https://help.trainingpeaks.com/hc/en-us/articles/204071884-Fitness-CTL"
                target="_blank"
                rel="noopener noreferrer"
              >
                TrainingPeaks · CTL
              </a>{" "}
              ·{" "}
              <a
                href="https://help.trainingpeaks.com/hc/en-us/articles/204071894-Fatigue-ATL"
                target="_blank"
                rel="noopener noreferrer"
              >
                ATL
              </a>{" "}
              ·{" "}
              <a
                href="https://help.trainingpeaks.com/hc/en-us/articles/204071764-Form-TSB"
                target="_blank"
                rel="noopener noreferrer"
              >
                TSB
              </a>
            </p>
          </Section>
        </div>
      </div>

      <TrainingLoadAppPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="faq" className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.sectionTitle}>{tPage("faqTitle")}</h2>
            </div>
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
              {tCommon("allToolsAction")} <span aria-hidden="true">→</span>
            </TrackedLink>
          </Section>
          <TrainingLoadFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
