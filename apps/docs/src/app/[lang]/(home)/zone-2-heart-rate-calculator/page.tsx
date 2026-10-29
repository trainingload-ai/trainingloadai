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
import { Zone2HeartRateCalculatorClient } from "./client";
import { Zone2AppPromo, Zone2FooterCta } from "./promo";
import { readZone2Inputs } from "./share-inputs";
import {
  calculateZone2FromAge,
  estimateMaxHrFromAge,
  formatAnchorBpm,
} from "@/lib/zone-2-heart-rate";
import styles from "./zone-2-heart-rate-calculator.module.css";

const PATH = "/zone-2-heart-rate-calculator";

type MethodRow = {
  method: string;
  band: string;
  formula: string;
  use: string;
};

type SourceLink = {
  label: string;
  href: string;
};

type EducationCard = {
  title: string;
  body: string;
};

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readSourceLinks(raw: unknown): SourceLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is SourceLink => {
    if (!row || typeof row !== "object") return false;
    const item = row as SourceLink;
    return typeof item.label === "string" && typeof item.href === "string";
  });
}

function readMethodRows(raw: unknown): MethodRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is MethodRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as MethodRow;
    return (
      typeof item.method === "string" &&
      typeof item.band === "string" &&
      typeof item.formula === "string" &&
      typeof item.use === "string"
    );
  });
}

function readEducationCards(raw: unknown): EducationCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is EducationCard => {
    if (!row || typeof row !== "object") return false;
    const item = row as EducationCard;
    return typeof item.title === "string" && typeof item.body === "string";
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
  const pageUrl = `${siteUrl}${prefix}${PATH}`;
  const t = await getTranslations({
    locale: lang,
    namespace: "zone2HeartRateCalculator.metadata",
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
  };
}

export default async function Zone2HeartRateCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = readZone2Inputs(await searchParams);
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "zone2HeartRateCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "zone2HeartRateCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const methodRows = readMethodRows(tPage.raw("sections.methods.rows"));
  const sourceLinks = readSourceLinks(tPage.raw("sections.methods.sources"));
  const feelCards = readEducationCards(tPage.raw("education.feel.cards"));
  const ui = tPage.raw("ui") as {
    badge: string;
    jump: Record<string, string>;
    onThisPage: string;
    related: string;
  };
  const pageLinks = tPage.raw("links") as {
    maxHr: string;
    zones: string;
    customZones: string;
    aiCoach: string;
    lactate: string;
    docs: string;
  };

  const howToSteps = [
    {
      name: tPage("howTo.steps.anchor.title"),
      text: tPage("howTo.steps.anchor.body"),
    },
    {
      name: tPage("howTo.steps.range.title"),
      text: tPage("howTo.steps.range.body"),
    },
    {
      name: tPage("howTo.steps.next.title"),
      text: tPage("howTo.steps.next.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}${PATH}`;
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
    [`${prefix}/max-heart-rate-calculator`, pageLinks.maxHr],
    [`${prefix}/heart-rate-zones-calculator`, pageLinks.zones],
    [`${prefix}/features/custom-zones`, pageLinks.customZones],
    [`${prefix}/ai-coach`, pageLinks.aiCoach],
    [`${prefix}/lactate-threshold-calculator`, pageLinks.lactate],
    [`${prefix}/docs/metrics/heart-rate/zones`, pageLinks.docs],
  ] as const;
  const ageRows = [20, 30, 40, 50, 60, 70].flatMap((age) => {
    const maxHr = estimateMaxHrFromAge(age, "tanaka");
    const range = calculateZone2FromAge(age, "tanaka");
    return maxHr == null || range == null ? [] : [{ age, maxHr, range }];
  });

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <Zone2HeartRateCalculatorClient
            key={JSON.stringify(initial)}
            initial={initial}
            methods={
              <Section
                id="methods"
                title={tPage("sections.methods.title")}
                description={tPage("sections.methods.description")}
              >
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className="sr-only">
                      {tPage("sections.methods.caption")}
                    </caption>
                    <thead>
                      <tr>
                        {(["method", "band", "formula", "use"] as const).map(
                          (header) => (
                            <th key={header} scope="col">
                              {tPage(`sections.methods.headers.${header}`)}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {methodRows.map((row) => (
                        <tr key={row.method}>
                          <th scope="row">{row.method}</th>
                          <td className={styles.mono}>{row.band}</td>
                          <td className={styles.mono}>{row.formula}</td>
                          <td className={styles.mutedCell}>{row.use}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.note}>{tPage("sections.methods.note")}</p>
                <p className={styles.sourceNote}>
                  {sourceLinks.map((source, index) => (
                    <span key={source.href}>
                      {index > 0 ? <span aria-hidden="true"> · </span> : null}
                      <a
                        href={source.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.label}
                      </a>
                    </span>
                  ))}
                </p>
                <p className={styles.note}>
                  <TrackedLink
                    href={`${prefix}/max-heart-rate-calculator`}
                    eventName="related_tool_clicked"
                    eventProperties={{
                      href: `${prefix}/max-heart-rate-calculator`,
                      location: "zone2_methods",
                    }}
                    className={styles.inlineLink}
                  >
                    {tPage("sections.methods.handoffLink")}
                  </TrackedLink>
                </p>
              </Section>
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
                <nav aria-label={ui.onThisPage} className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      ["#methods", ui.jump.methods],
                      ["#what-is-zone-2-heart-rate", ui.jump.definition],
                      ["#zone-2-heart-rate-by-age", ui.jump.byAge],
                      ["#how-zone-2-should-feel", ui.jump.feel],
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
          />
        </div>
      </div>

      <Zone2AppPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <Section
            id="what-is-zone-2-heart-rate"
            title={tPage("education.definition.title")}
          >
            <p className={styles.shortAnswer}>
              {tPage("education.definition.answer")}
            </p>
            <p className={styles.sectionBody}>
              {tPage("education.definition.detail")}
            </p>
          </Section>

          <Section
            id="zone-2-heart-rate-by-age"
            title={tPage("education.ageTable.title")}
            description={tPage("education.ageTable.body")}
          >
            <div
              className={styles.tableWrap}
              role="region"
              tabIndex={0}
              aria-label={tPage("education.ageTable.caption")}
            >
              <table className={`${styles.table} ${styles.ageTable}`}>
                <caption className="sr-only">
                  {tPage("education.ageTable.caption")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{tPage("education.ageTable.age")}</th>
                    <th scope="col">{tPage("education.ageTable.maxHr")}</th>
                    <th scope="col">{tPage("education.ageTable.range")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ageRows.map(({ age, maxHr, range }) => (
                    <tr key={age}>
                      <th scope="row">{age}</th>
                      <td className={styles.mono}>{formatAnchorBpm(maxHr)}</td>
                      <td className={styles.mono}>
                        {range.bpmMin}–{range.bpmMax} bpm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{tPage("education.ageTable.note")}</p>
          </Section>

          <Section
            id="how-zone-2-should-feel"
            title={tPage("education.feel.title")}
            description={tPage("education.feel.body")}
          >
            <div className={styles.educationGrid}>
              {feelCards.map((card) => (
                <article key={card.title} className={styles.educationCard}>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section
            id="all-heart-rate-zones"
            title={tPage("education.handoff.title")}
            description={tPage("education.handoff.body")}
          >
            <TrackedLink
              href={`${prefix}/heart-rate-zones-calculator`}
              eventName="related_tool_clicked"
              eventProperties={{
                href: `${prefix}/heart-rate-zones-calculator`,
                location: "zone2_education_handoff",
              }}
              className={styles.inlineLink}
            >
              {tPage("education.handoff.cta")} <span aria-hidden="true">→</span>
            </TrackedLink>
          </Section>

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
          <Zone2FooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
