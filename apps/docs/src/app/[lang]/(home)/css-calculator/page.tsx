import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { CSS_ZONES } from "@/lib/css";
import { CssCalculatorClient } from "./client";
import { CssAppPromo, CssFooterCta } from "./promo";
import styles from "./css-calculator.module.css";
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
  swimPlan: string;
  tss: string;
  trainingLoad: string;
  aiPlan: string;
  workoutEditor: string;
  stssDocs: string;
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
    swimPlan: typeof links?.swimPlan === "string" ? links.swimPlan : "",
    tss: typeof links?.tss === "string" ? links.tss : "",
    trainingLoad:
      typeof links?.trainingLoad === "string" ? links.trainingLoad : "",
    aiPlan: typeof links?.aiPlan === "string" ? links.aiPlan : "",
    workoutEditor:
      typeof links?.workoutEditor === "string" ? links.workoutEditor : "",
    stssDocs: typeof links?.stssDocs === "string" ? links.stssDocs : "",
  };
}

function formatOffset(start: number, end: number) {
  if (start === 0 && end === 0) return "0";
  const fmt = (value: number) => (value > 0 ? `+${value}` : String(value));
  return `${fmt(start)}–${fmt(end)}`;
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
  const pageUrl = `${siteUrl}${prefix}/css-calculator`;
  const ogImageUrl = `${siteUrl}/og/css-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "cssCalculator.metadata",
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
      languages: absoluteAlternatesForPath(siteUrl, "/css-calculator"),
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

export default async function CssCalculatorPage({
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
    namespace: "cssCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "cssCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const methodRows = readMethodRows(tPage.raw("sections.method.rows"));
  const methodDetails = readMethodDetails(tPage.raw("sections.method.details"));
  const pageLinks = readPageLinks(tPage.raw("links"));
  const phoneLocale = ["en", "zh", "zh-hant", "ja"].includes(lang)
    ? lang
    : "en";
  const ui = tPage.raw("ui") as {
    badge: string;
    jump: Record<string, string>;
    related: string;
  };

  const pageUrl = `${siteUrl}${prefix}/css-calculator`;
  const appId = schemaId(pageUrl, "app");
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
    [`${prefix}/swim-training-plan`, pageLinks.swimPlan],
    [`${prefix}/tss-calculator`, pageLinks.tss],
    [`${prefix}/training-load-calculator`, pageLinks.trainingLoad],
    [`${prefix}/ai-training-plan`, pageLinks.aiPlan],
    [`${prefix}/workout-editor`, pageLinks.workoutEditor],
    [
      `${prefix}/docs/metrics/training-load/training-stress-score`,
      pageLinks.stssDocs,
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
          <CssCalculatorClient
            method={
              <div key="css-method-details">
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className="sr-only">
                      {tPage("sections.method.caption")}
                    </caption>
                    <thead>
                      <tr>
                        {(
                          ["method", "formula", "bestFor", "limit"] as const
                        ).map((header) => (
                          <th key={header} scope="col">
                            {tPage(`sections.method.headers.${header}`)}
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
                  {tPage("sections.method.example")}
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
                                {tPage(`sections.method.detailLabels.${label}`)}
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
                  {tPage("sections.method.source")}{" "}
                  <a
                    href="https://pubmed.ncbi.nlm.nih.gov/1555562/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wakayoshi et al. (1992)
                  </a>
                  <span aria-hidden="true"> · </span>
                  <a
                    href="https://www.swimsmooth.guru/css/calcsingle"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Swim Smooth
                  </a>
                </p>
              </div>
            }
            hero={
              <div key="css-hero">
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
                      <Image
                        src={`/ftp-calculator/recording-${phoneLocale}.png`}
                        sizes="(max-width: 640px) 36vw, 184px"
                        alt={tPage("heroProduct.phoneAlt")}
                        width={786}
                        height={1704}
                        decoding="async"
                      />
                    </div>
                    <div className={styles.heroWatch}>
                      <Image
                        src={`/ftp-calculator/watch-${phoneLocale}.png`}
                        sizes="(max-width: 640px) 22vw, 128px"
                        alt={tPage("heroProduct.watchAlt")}
                        width={416}
                        height={496}
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
                        location: "css_calculator_hero",
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
                      ["#method", ui.jump.method],
                      ["#zones", ui.jump.zones],
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
            id="zones"
            title={tPage("sections.zones.title")}
            description={tPage("sections.zones.description")}
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  {tPage("sections.zones.caption")}
                </caption>
                <thead>
                  <tr>
                    {(["zone", "offset", "meaning"] as const).map((header) => (
                      <th key={header} scope="col">
                        {tPage(`sections.zones.headers.${header}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CSS_ZONES.map((zone) => (
                    <tr key={zone.id}>
                      <th scope="row">{tPage(`zones.${zone.id}`)}</th>
                      <td className={styles.mono}>
                        {formatOffset(zone.offsetStart, zone.offsetEnd)}{" "}
                        {tPage("sections.zones.seconds")}
                      </td>
                      <td className={styles.mutedCell}>
                        {tPage(`sections.zones.meanings.${zone.id}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{tPage("sections.zones.example")}</p>
            <p className={styles.sourceNote}>
              {tPage("sections.zones.source")}
            </p>
          </Section>
        </div>
      </div>

      <CssAppPromo lang={lang} />

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
          <CssFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
