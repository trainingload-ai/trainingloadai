import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { formatClock, formatPaceClock, KM_PER_MILE } from "@/lib/running-pace";
import {
  buildThresholdPaceChart,
  type StandardRacePreset,
} from "@/lib/lactate-threshold";
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
import { LactateThresholdCalculatorClient } from "./client";
import { LactateAppPromo, LactateFooterCta } from "./promo";
import styles from "./lactate-threshold-calculator.module.css";

const THRESHOLD_PACE_CHART = buildThresholdPaceChart();

type ExplainedCard = {
  title: string;
  meaning: string;
  when: string;
  mapping: string;
};

type ProtocolRow = {
  protocol: string;
  bestFor: string;
  risk: string;
  notes: string;
};

type ThresholdPairCard = {
  title: string;
  body: string;
};

function readExplainedCards(raw: unknown): ExplainedCard[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw as Record<string, ExplainedCard>).filter(
    (card) =>
      Boolean(card) &&
      typeof card.title === "string" &&
      typeof card.meaning === "string" &&
      typeof card.when === "string" &&
      typeof card.mapping === "string",
  );
}

function readProtocolRows(raw: unknown): ProtocolRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is ProtocolRow =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as ProtocolRow).protocol === "string" &&
      typeof (row as ProtocolRow).bestFor === "string" &&
      typeof (row as ProtocolRow).risk === "string" &&
      typeof (row as ProtocolRow).notes === "string",
  );
}

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function formatPacePer(secPerKm: number, unit: "km" | "mi") {
  const seconds = unit === "mi" ? secPerKm * KM_PER_MILE : secPerKm;
  return formatPaceClock(seconds);
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
  const pageUrl = `${siteUrl}${prefix}/lactate-threshold-calculator`;
  const ogImageUrl = `${siteUrl}/og/lactate-threshold-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "lactateThresholdCalculator.metadata",
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
        "/lactate-threshold-calculator",
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

export default async function LactateThresholdCalculatorPage({
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
    namespace: "lactateThresholdCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "lactateThresholdCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const definitionFaq = pageFaq[0];
  const remainingFaq = pageFaq.slice(1);
  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
  };
  const phoneLocale = ["en", "zh", "zh-hant", "ja"].includes(lang)
    ? lang
    : "en";

  const pageUrl = `${siteUrl}${prefix}/lactate-threshold-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.metric.title"),
      text: tPage("howTo.steps.metric.body"),
    },
    {
      name: tPage("howTo.steps.test.title"),
      text: tPage("howTo.steps.test.body"),
    },
    {
      name: tPage("howTo.steps.update.title"),
      text: tPage("howTo.steps.update.body"),
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
        { name: tPage("title"), item: pageUrl },
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(pageFaq),
    }),
  ]);

  const explainedCards = readExplainedCards(
    tPage.raw("sections.explained.cards"),
  );
  const pairRaw = tPage.raw("sections.explained.pair") as {
    lt1?: ThresholdPairCard;
    lt2?: ThresholdPairCard;
  };
  const pairCards = [pairRaw?.lt1, pairRaw?.lt2].filter(
    (card): card is ThresholdPairCard =>
      Boolean(card) &&
      typeof card?.title === "string" &&
      typeof card?.body === "string",
  );
  const protocolRows = readProtocolRows(tPage.raw("sections.protocols.rows"));
  const chartDistances = tPage.raw("sections.chart.distances") as Record<
    StandardRacePreset,
    string
  >;

  const relatedLinks = [
    [
      `${prefix}/heart-rate-zones-calculator`,
      tCommon("heartRateZonesCalculatorAction"),
    ],
    [`${prefix}/power-zones-calculator`, tCommon("powerZonesCalculatorAction")],
    [`${prefix}/ftp-calculator`, tCommon("ftpCalculatorAction")],
    [
      `${prefix}/critical-power-calculator`,
      tCommon("criticalPowerCalculatorAction"),
    ],
    [`${prefix}/vdot-calculator`, tCommon("vdotCalculatorAction")],
    [
      `${prefix}/zone-2-heart-rate-calculator`,
      tCommon("zone2HeartRateCalculatorAction"),
    ],
    [
      `${prefix}/docs/metrics/physiology/lactate-threshold`,
      tPage("relatedLinks.physiology"),
    ],
    [`${prefix}/docs/metrics/pace/zones`, tPage("relatedLinks.paceZones")],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <LactateThresholdCalculatorClient
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
                        location: "lactate_threshold_calculator_hero",
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
                        "#what-is-lactate-threshold",
                        definitionFaq?.question ?? ui.jump.explained,
                      ],
                      ["#explained", ui.jump.explained],
                      ["#pace-chart", ui.jump.chart],
                      ["#protocols", ui.jump.protocols],
                      ["#workouts", ui.jump.workouts],
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
              id="what-is-lactate-threshold"
              title={definitionFaq.question}
            >
              {definitionFaq.answer.split(/\n\n+/).map((paragraph) => (
                <p key={paragraph} className={styles.sectionBody}>
                  {paragraph}
                </p>
              ))}
            </Section>
          ) : null}

          <Section
            id="explained"
            title={tPage("sections.explained.title")}
            description={tPage("sections.explained.description")}
          >
            <div className={styles.pairGrid}>
              {pairCards.map((card) => (
                <div key={card.title} className={styles.infoCard}>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              ))}
            </div>
            <p className={styles.note}>
              {tPage("sections.explained.leadDescription")}
            </p>
            <div className={styles.infoGrid}>
              {explainedCards.map((card) => (
                <div key={card.title} className={styles.infoCard}>
                  <h3>{card.title}</h3>
                  {(
                    [
                      ["meaning", card.meaning],
                      ["when", card.when],
                      ["mapping", card.mapping],
                    ] as const
                  ).map(([labelKey, body]) => (
                    <p key={labelKey}>
                      <span className={styles.infoLabel}>
                        {tPage(`sections.explained.labels.${labelKey}`)}.{" "}
                      </span>
                      {body}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="pace-chart"
            title={tPage("sections.chart.title")}
            description={tPage("sections.chart.description")}
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  {tPage("sections.chart.caption")}
                </caption>
                <thead>
                  <tr>
                    {(
                      [
                        "race",
                        "finish",
                        "lt2Km",
                        "lt2Mi",
                        "split400",
                        "split1600",
                      ] as const
                    ).map((header) => (
                      <th key={header} scope="col">
                        {tPage(`sections.chart.headers.${header}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {THRESHOLD_PACE_CHART.map((row) => (
                    <tr key={`${row.preset}-${row.timeSeconds}`}>
                      <th scope="row">{chartDistances[row.preset]}</th>
                      <td className={styles.mono}>
                        {formatClock(row.timeSeconds)}
                      </td>
                      <td className={styles.mono}>
                        {formatPacePer(row.secPerKm, "km")}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {formatPacePer(row.secPerKm, "mi")}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {formatPaceClock(row.split400Seconds)}
                      </td>
                      <td className={`${styles.mono} ${styles.mutedCell}`}>
                        {formatPaceClock(row.split1600Seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{tPage("sections.chart.note")}</p>
          </Section>

          <Section
            id="protocols"
            title={tPage("sections.protocols.title")}
            description={tPage("sections.protocols.description")}
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  {tPage("sections.protocols.caption")}
                </caption>
                <thead>
                  <tr>
                    {(["protocol", "bestFor", "risk", "notes"] as const).map(
                      (header) => (
                        <th key={header} scope="col">
                          {tPage(`sections.protocols.headers.${header}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {protocolRows.map((row) => (
                    <tr key={row.protocol}>
                      <th scope="row">{row.protocol}</th>
                      <td className={styles.mutedCell}>{row.bestFor}</td>
                      <td className={styles.mutedCell}>{row.risk}</td>
                      <td className={styles.mutedCell}>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.sourceLinks}>
              <span>{tPage("sections.protocols.sources")}:</span>
              <a
                href="https://joefrieltraining.com/determining-your-lthr/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Joe Friel · LTHR
              </a>
              <a
                href="https://pubmed.ncbi.nlm.nih.gov/19453206/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Faude et al. (2009)
              </a>
              <a href={`${prefix}/docs/metrics/physiology/lactate-threshold`}>
                {tPage("relatedLinks.physiology")}
              </a>
            </div>
          </Section>

          <Section id="answer" title={tPage("sections.answer.title")}>
            <p className={styles.sectionBody}>
              {tPage("sections.answer.description")}
            </p>
            <div className={styles.detailList}>
              <details className={styles.detail}>
                <summary>{tPage("sections.answer.moreLabel")}</summary>
                <div className={styles.detailBody}>
                  <p>{tPage("sections.answer.more")}</p>
                </div>
              </details>
            </div>
          </Section>
        </div>
      </div>

      <LactateAppPromo lang={lang} />

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
              className={styles.relatedMore}
              eventName="related_tool_clicked"
              eventProperties={{
                location: "lactate_threshold_calculator_related",
              }}
            >
              {tCommon("allToolsAction")} <span aria-hidden>→</span>
            </TrackedLink>
          </Section>
          <LactateFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
