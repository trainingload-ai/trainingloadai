import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { CriticalPowerCalculatorClient } from "./client";
import { CpAppPromo, CpFooterCta } from "./promo";
import styles from "./critical-power-calculator.module.css";
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

type MethodRow = {
  method: string;
  formula: string;
  bestFor: string;
  limit: string;
};

type MethodDetail = {
  id: string;
  title: string;
  formula: string;
  method: string;
  basis: string;
  limits: string;
};

type PageLinks = {
  ftp: string;
  powerZones: string;
  criticalPowerDocs: string;
  wPrimeDocs: string;
};

function readMethodRows(raw: unknown): MethodRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is MethodRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as MethodRow;
    return (
      typeof item.method === "string" &&
      typeof item.formula === "string" &&
      typeof item.bestFor === "string" &&
      typeof item.limit === "string"
    );
  });
}

function readMethodDetails(raw: unknown): MethodDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is MethodDetail => {
    if (!row || typeof row !== "object") return false;
    const item = row as MethodDetail;
    return (
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.formula === "string" &&
      typeof item.method === "string" &&
      typeof item.basis === "string" &&
      typeof item.limits === "string"
    );
  });
}

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readPageLinks(raw: unknown): PageLinks {
  const links = raw as Partial<PageLinks> | null;
  return {
    ftp: typeof links?.ftp === "string" ? links.ftp : "",
    powerZones: typeof links?.powerZones === "string" ? links.powerZones : "",
    criticalPowerDocs:
      typeof links?.criticalPowerDocs === "string"
        ? links.criticalPowerDocs
        : "",
    wPrimeDocs: typeof links?.wPrimeDocs === "string" ? links.wPrimeDocs : "",
  };
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
  const pageUrl = `${siteUrl}${prefix}/critical-power-calculator`;
  const ogImageUrl = `${siteUrl}/og/critical-power-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "criticalPowerCalculator.metadata",
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
        "/critical-power-calculator",
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

export default async function CriticalPowerCalculatorPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "criticalPowerCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "criticalPowerCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const definitionFaq = pageFaq[0];
  const remainingFaq = pageFaq.slice(1);
  const methodRows = readMethodRows(tPage.raw("sections.methods.rows"));
  const methodDetails = readMethodDetails(
    tPage.raw("sections.methods.details"),
  );
  const pageLinks = readPageLinks(tPage.raw("links"));
  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
  };

  const pageUrl = `${siteUrl}${prefix}/critical-power-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.efforts.title"),
      text: tPage("howTo.steps.efforts.body"),
    },
    {
      name: tPage("howTo.steps.card.title"),
      text: tPage("howTo.steps.card.body"),
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
        { name: t("breadcrumb.home"), item: `${siteUrl}${prefix}/` },
        { name: t("breadcrumb.tools"), item: `${siteUrl}${prefix}/tools` },
        { name: tPage("title"), item: pageUrl },
      ],
    }),
  ]);

  const relatedLinks = [
    [`${prefix}/ftp-calculator`, pageLinks.ftp],
    [`${prefix}/power-zones-calculator`, pageLinks.powerZones],
    [
      `${prefix}/docs/metrics/power/critical-power`,
      pageLinks.criticalPowerDocs,
    ],
    [
      `${prefix}/docs/metrics/power/anaerobic-work-capacity`,
      pageLinks.wPrimeDocs,
    ],
  ] as const;

  const detailLabels = ["formula", "method", "basis", "limits"] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <CriticalPowerCalculatorClient
            methods={
              <Fragment key="cp-methods">
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className="sr-only">
                      {tPage("sections.methods.caption")}
                    </caption>
                    <thead>
                      <tr>
                        {(
                          ["method", "formula", "bestFor", "limit"] as const
                        ).map((header) => (
                          <th key={header} scope="col">
                            {tPage(`sections.methods.headers.${header}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {methodRows.map((row) => (
                        <tr key={row.method}>
                          <th scope="row">{row.method}</th>
                          <td className={styles.mono}>{row.formula}</td>
                          <td className={styles.mutedCell}>{row.bestFor}</td>
                          <td className={styles.mutedCell}>{row.limit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.note}>
                  {tPage("sections.methods.example")}
                </p>
                <div className={styles.detailList}>
                  {methodDetails.map((detail) => (
                    <details key={detail.id} className={styles.detail}>
                      <summary>
                        <span>
                          {detail.title}
                          <span className={styles.detailFormula}>
                            {detail.formula}
                          </span>
                        </span>
                      </summary>
                      <div className={styles.detailBody}>
                        {detailLabels
                          .filter((label) => label !== "formula")
                          .map((label) => (
                            <p key={label}>
                              <span className={styles.detailLabel}>
                                {tPage(
                                  `sections.methods.detailLabels.${label}`,
                                )}
                                :{" "}
                              </span>
                              {detail[label]}
                            </p>
                          ))}
                      </div>
                    </details>
                  ))}
                </div>
                <p className={styles.sourceNote}>
                  {tPage("sections.methods.source")}{" "}
                  <a
                    href="https://pubmed.ncbi.nlm.nih.gov/20195180/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {tPage("sections.methods.sourceLink")}
                  </a>
                </p>
              </Fragment>
            }
            hero={
              <div key="cp-hero">
                <p className={styles.kicker}>{ui.badge}</p>
                <h1 className={styles.heroTitle}>{tPage("title")}</h1>
                <p className={styles.heroSubtitle}>{tPage("subtitle")}</p>
                <ul className={styles.proofList}>
                  {readProof(tPage.raw("proof")).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className={styles.heroProduct}>
                  <div className={styles.heroDevices}>
                    <div className={styles.heroPhone}>
                      <img
                        src={`/ftp-calculator/recording-${["zh", "zh-hant", "ja"].includes(lang) ? lang : "en"}.png`}
                        alt={tPage("heroProduct.phoneAlt")}
                        width={786}
                        height={1704}
                        decoding="async"
                      />
                    </div>
                    <div className={styles.heroWatch}>
                      <img
                        src={`/ftp-calculator/watch-${["zh", "zh-hant", "ja"].includes(lang) ? lang : "en"}.png`}
                        alt={tPage("heroProduct.watchAlt")}
                        width={416}
                        height={496}
                        decoding="async"
                      />
                    </div>
                  </div>
                  <div className={styles.heroProductCopy}>
                    <p className={styles.kicker}>Trainingload.ai</p>
                    <h2>{tPage("heroProduct.title")}</h2>
                    <p>{tPage("heroProduct.body")}</p>
                    <ul>
                      {readProof(tPage.raw("heroProduct.benefits")).map(
                        (item) => (
                          <li key={item}>{item}</li>
                        ),
                      )}
                    </ul>
                    <TrackedLink
                      href={`${prefix}/ai-coach`}
                      eventName="related_tool_clicked"
                      eventProperties={{
                        href: `${prefix}/ai-coach`,
                        location: "critical_power_calculator_hero",
                      }}
                      className={styles.heroProductLink}
                    >
                      {tPage("heroProduct.cta")}{" "}
                      <span aria-hidden="true">→</span>
                    </TrackedLink>
                  </div>
                </div>
                <nav aria-label="On this page" className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      [
                        "#what-is-critical-power",
                        definitionFaq?.question ?? ui.jump.methods,
                      ],
                      ["#methods", ui.jump.methods],
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

          {definitionFaq ? (
            <Section
              id="what-is-critical-power"
              title={definitionFaq.question}
            >
              {definitionFaq.answer.split(/\n\n+/).map((paragraph) => (
                <p key={paragraph} className={styles.sectionBody}>
                  {paragraph}
                </p>
              ))}
            </Section>
          ) : null}
        </div>
      </div>

      <CpAppPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="faq" className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.sectionTitle}>{tPage("faqTitle")}</h2>
            </div>
            <div className={styles.faqList}>
              {remainingFaq.map((item, index) => (
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
          <CpFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
