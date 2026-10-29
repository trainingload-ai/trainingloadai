import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { FtpCalculatorClient } from "./client";
import { FtpTableHighlight } from "./highlight";
import { FtpAppPromo, FtpFooterCta } from "./promo";
import styles from "./ftp-calculator.module.css";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { TrackedLink } from "@/components/TrackedLink";
import { ALLEN_COGGAN_FTP_CATEGORIES } from "@/lib/ftp-field";
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

type FieldProtocolRow = {
  protocol: string;
  multiplier: string;
  bestFor: string;
  risk: string;
};

type ProtocolDetail = {
  id: string;
  title: string;
  formula: string;
  method: string;
  basis: string;
  limits: string;
};

type BandRow = {
  band: string;
  range: string;
  meaning: string;
};

const LEVEL_BAND_IDS = [
  "recreational",
  "club",
  "strong_club",
  "competitive",
] as const;

type PageLinks = {
  powerZones: string;
  criticalPower: string;
  lactate: string;
};

function readProtocolRows(raw: unknown): FieldProtocolRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is FieldProtocolRow =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as FieldProtocolRow).protocol === "string" &&
      typeof (row as FieldProtocolRow).multiplier === "string" &&
      typeof (row as FieldProtocolRow).bestFor === "string" &&
      typeof (row as FieldProtocolRow).risk === "string",
  );
}

function readProtocolDetails(raw: unknown): ProtocolDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is ProtocolDetail => {
    if (!row || typeof row !== "object") return false;
    const item = row as ProtocolDetail;
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

function readBandRows(raw: unknown): BandRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is BandRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as BandRow;
    return (
      typeof item.band === "string" &&
      typeof item.range === "string" &&
      typeof item.meaning === "string"
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
    powerZones: typeof links?.powerZones === "string" ? links.powerZones : "",
    criticalPower:
      typeof links?.criticalPower === "string" ? links.criticalPower : "",
    lactate: typeof links?.lactate === "string" ? links.lactate : "",
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
  const pageUrl = `${siteUrl}${prefix}/ftp-calculator`;
  const ogImageUrl = `${siteUrl}/og/ftp-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "estimateCp.metadata",
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
      languages: absoluteAlternatesForPath(siteUrl, "/ftp-calculator"),
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

export default async function FtpCalculatorPage({
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
    namespace: "estimateCp.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "estimateCp.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const definitionFaq = pageFaq[0];
  const zonesFaq = pageFaq[3];
  const remainingFaq = pageFaq.filter(
    (_, index) => index !== 0 && index !== 3,
  );
  const protocolRows = readProtocolRows(tPage.raw("sections.protocols.rows"));
  const protocolDetails = readProtocolDetails(
    tPage.raw("sections.protocols.details"),
  );
  const curveDetails = readProtocolDetails(
    tPage.raw("sections.protocols.groups.curve.details"),
  ).filter((detail) => detail.id !== "ten_km");
  const phoneLocale = ["en", "zh", "zh-hant", "ja"].includes(lang)
    ? lang
    : "en";
  const bandRows = readBandRows(tPage.raw("sections.levels.rows"));
  const pageLinks = readPageLinks(tPage.raw("links"));

  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
  };

  const pageUrl = `${siteUrl}${prefix}/ftp-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.test.title"),
      text: tPage("howTo.steps.test.body"),
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
        {
          name: t("breadcrumb.home"),
          item: `${siteUrl}${prefix}/`,
        },
        {
          name: t("breadcrumb.tools"),
          item: `${siteUrl}${prefix}/tools`,
        },
        {
          name: tPage("title"),
          item: pageUrl,
        },
      ],
    }),
  ]);

  const relatedLinks = [
    [`${prefix}/power-zones-calculator`, pageLinks.powerZones],
    [`${prefix}/critical-power-calculator`, pageLinks.criticalPower],
    [`${prefix}/lactate-threshold-calculator`, pageLinks.lactate],
    [`${prefix}/tss-calculator`, tCommon("tssCalculatorAction")],
    [`${prefix}/cycling-training-plan`, tCommon("cyclingTrainingPlanAction")],
    [`${prefix}/docs/metrics/power/functional-threshold-power`, ui.docs],
    [`${prefix}/tools`, tCommon("allToolsAction")],
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
          <FtpCalculatorClient
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
                <div className={styles.heroProduct}>
                  <div className={styles.heroDevices}>
                    <div className={styles.heroPhone}>
                      <img
                        src={`/ftp-calculator/recording-${phoneLocale}.png`}
                        alt={tPage("heroProduct.phoneAlt")}
                        width={786}
                        height={1704}
                        decoding="async"
                      />
                    </div>
                    <div className={styles.heroWatch}>
                      <img
                        src={`/ftp-calculator/watch-${phoneLocale}.png`}
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
                        location: "ftp_calculator_hero",
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
                        "#what-is-ftp",
                        definitionFaq?.question ?? ui.jump.protocols,
                      ],
                      ["#protocols", ui.jump.protocols],
                      ["#levels", ui.jump.levels],
                      ["#categories", ui.jump.categories],
                      [
                        "#using-ftp",
                        zonesFaq?.question ?? ui.jump.levels,
                      ],
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
            <Section id="what-is-ftp" title={definitionFaq.question}>
              {definitionFaq.answer.split(/\n\n+/).map((paragraph) => (
                <p key={paragraph} className={styles.sectionBody}>
                  {paragraph}
                </p>
              ))}
            </Section>
          ) : null}

          <Section
            id="protocols"
            title={tPage("sections.protocols.title")}
            description={tPage("sections.protocols.description")}
          >
            <div className={styles.methodGroup}>
              <h3 className={styles.methodGroupTitle}>
                {tPage("sections.protocols.groups.direct.title")}
              </h3>
              <p className={styles.methodGroupLead}>
                {tPage("sections.protocols.groups.direct.description")}
              </p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.tableWide}`}>
                  <caption className="sr-only">
                    {tPage("sections.protocols.caption")}
                  </caption>
                  <thead>
                    <tr>
                      {(
                        ["protocol", "multiplier", "bestFor", "risk"] as const
                      ).map((header) => (
                        <th key={header} scope="col">
                          {tPage(`sections.protocols.headers.${header}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {protocolRows.map((row) => (
                      <tr key={row.protocol}>
                        <th scope="row">{row.protocol}</th>
                        <td className={styles.mono}>{row.multiplier}</td>
                        <td className={styles.mutedCell}>{row.bestFor}</td>
                        <td className={styles.mutedCell}>{row.risk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.note}>
                {tPage("sections.protocols.example")}
              </p>
              <div className={styles.detailList}>
                {protocolDetails.map((detail) => (
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
                                `sections.protocols.detailLabels.${label}`,
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
            </div>
            <div className={styles.methodGroup}>
              <h3 className={styles.methodGroupTitle}>
                {tPage("sections.protocols.groups.curve.title")}
              </h3>
              <p className={styles.methodGroupLead}>
                {tPage("sections.protocols.groups.curve.description")}
              </p>
              <div className={styles.detailList}>
                {curveDetails.map((detail) => (
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
                                `sections.protocols.detailLabels.${label}`,
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
              <p className={styles.note}>
                {tPage("sections.protocols.groups.curve.note")}
              </p>
            </div>
          </Section>

          <Section id="levels" title={tPage("sections.levels.title")}>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.tableMid}`}>
                <caption className="sr-only">
                  {tPage("sections.levels.caption")}
                </caption>
                <thead>
                  <tr>
                    {(["band", "range", "meaning"] as const).map((header) => (
                      <th key={header} scope="col">
                        {tPage(`sections.levels.headers.${header}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bandRows.map((row, index) => (
                    <tr key={row.band} data-band={LEVEL_BAND_IDS[index]}>
                      <th scope="row">{row.band}</th>
                      <td className={styles.mono}>{row.range}</td>
                      <td className={styles.mutedCell}>{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.sourceNote}>
              {tPage("sections.levels.source")}
            </p>
          </Section>

          <Section
            id="categories"
            title={tPage("sections.categories.title")}
            description={tPage("sections.categories.description")}
          >
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.tableWide}`}>
                <caption className="sr-only">
                  {tPage("sections.categories.caption")}
                </caption>
                <thead>
                  <tr>
                    {(
                      ["category", "men", "women", "w65", "w70", "w75"] as const
                    ).map((header) => (
                      <th key={header} scope="col">
                        {tPage(`sections.categories.headers.${header}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALLEN_COGGAN_FTP_CATEGORIES.map((row) => (
                    <tr key={row.id} data-category={row.id}>
                      <th scope="row">
                        {tPage(`sections.categories.names.${row.id}`)}
                      </th>
                      <td className={styles.mono} data-sex="men">
                        {row.men}
                      </td>
                      <td className={styles.mono} data-sex="women">
                        {row.women}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {row.w65}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {row.w70}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {row.w75}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              {tPage("sections.categories.wattNote")}
            </p>
            <p className={styles.sourceNote}>
              {tPage("sections.categories.citation")}{" "}
              <a
                href="https://www8.garmin.com/manuals/webhelp/GUID-2DA54DF8-8084-40ED-954F-EDA09C13B47F/EN-US/GUID-1F58FA8E-09FF-4E51-B9B4-C4B83ED1D6CE.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tPage("sections.categories.sourceLink")}
              </a>
            </p>
          </Section>

          {zonesFaq ? (
            <Section id="using-ftp" title={zonesFaq.question}>
              {zonesFaq.answer.split(/\n\n+/).map((paragraph) => (
                <p key={paragraph} className={styles.sectionBody}>
                  {paragraph}
                </p>
              ))}
            </Section>
          ) : null}
        </div>
      </div>

      <FtpAppPromo lang={lang} />

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
          </Section>
          <FtpFooterCta lang={lang} />
        </div>
      </div>
      <FtpTableHighlight />
    </div>
  );
}
