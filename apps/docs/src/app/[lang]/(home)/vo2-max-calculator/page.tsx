import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { applyVo2Search } from "@/lib/vo2-field";
import { Vo2ResultPromo, Vo2FooterCta } from "./promo";
import { getTranslations } from "next-intl/server";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
  normalizeFeatureList,
  normalizeFaqItems,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";
import { Vo2MaxCalculatorClient } from "./client";
import { Vo2ReferenceTable } from "./reference-table";
import styles from "./vo2-max-calculator.module.css";

type ProtocolRow = {
  method: string;
  input: string;
  effort: string;
  repeatability: string;
  bestFor: string;
};

type MethodRow = {
  method: string;
  need: string;
  pros: string | null;
  prosStrong: string | null;
  cons: string;
  bestFor: string;
};

const references = [
  {
    key: "fitness",
    label:
      "Ross et al. (2016). Importance of Assessing Cardiorespiratory Fitness in Clinical Practice. American Heart Association.",
    href: "https://pubmed.ncbi.nlm.nih.gov/27881567/",
  },
  {
    key: "cooper",
    label:
      "Cooper (1968). A means of assessing maximal oxygen intake. Correlation between field and treadmill testing.",
    href: "https://pubmed.ncbi.nlm.nih.gov/5694044/",
  },
  {
    key: "rockport",
    label:
      "Kline et al. (1987). Estimation of VO2max from a one-mile track walk, gender, age, and body weight.",
    href: "https://pubmed.ncbi.nlm.nih.gov/3600239/",
  },
  {
    key: "heartRate",
    label:
      "Uth et al. (2004). Estimation of VO2max from the ratio between HRmax and HRrest—the Heart Rate Ratio Method.",
    href: "https://pubmed.ncbi.nlm.nih.gov/14624296/",
  },
  {
    key: "training",
    label:
      "Helgerud et al. (2007). Aerobic high-intensity intervals improve VO2max more than moderate training.",
    href: "https://pubmed.ncbi.nlm.nih.gov/17414804/",
  },
  {
    key: "vdot",
    label: "V.O2. VDOT Running Calculator.",
    href: "https://vdoto2.com/calculator",
  },
  {
    key: "beep",
    label:
      "Léger et al. (1988). The multistage 20 metre shuttle run test for aerobic fitness.",
    href: "https://pubmed.ncbi.nlm.nih.gov/3184250/",
  },
  {
    key: "garmin",
    label: "Garmin. What Is VO2 Max Estimate and How Does It Work?",
    href: "https://support.garmin.com/en-IE/?faq=lWqSVlq3w76z5WoihLy5f8",
  },
  {
    key: "apple",
    label: "Apple. Track your cardio fitness levels.",
    href: "https://support.apple.com/en-us/108790",
  },
  {
    key: "trainingDefinitions",
    label: "Jack Daniels. Running Intensities Built Into V.O2—What And Why?",
    href: "https://vdoto2.com/learn-more/training-definitions",
  },
] as const;

const methodSources = {
  cooper: { key: "cooper", number: 2 },
  rockport: { key: "rockport", number: 3 },
  restingHr: { key: "heartRate", number: 4 },
  race: { key: "vdot", number: 6 },
  beep: { key: "beep", number: 7 },
} as const;

function readStrings(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readProtocolRows(raw: unknown): ProtocolRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<ProtocolRow>;
    if (
      typeof item.method !== "string" ||
      typeof item.input !== "string" ||
      typeof item.effort !== "string" ||
      typeof item.repeatability !== "string" ||
      typeof item.bestFor !== "string"
    ) {
      return [];
    }
    return [item as ProtocolRow];
  });
}

function readMethodRows(raw: unknown): MethodRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    if (
      typeof item.method !== "string" ||
      typeof item.need !== "string" ||
      typeof item.cons !== "string" ||
      typeof item.bestFor !== "string"
    ) {
      return [];
    }
    return [
      {
        method: item.method,
        need: item.need,
        pros: typeof item.pros === "string" ? item.pros : null,
        prosStrong:
          typeof item.prosStrong === "string" ? item.prosStrong : null,
        cons: item.cons,
        bestFor: item.bestFor,
      },
    ];
  });
}

function readFaq(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : null;
    const accepted =
      row.acceptedAnswer && typeof row.acceptedAnswer === "object"
        ? (row.acceptedAnswer as Record<string, unknown>)
        : null;
    const text =
      accepted && typeof accepted.text === "string" ? accepted.text : null;
    if (!name || !text) return [];
    return [{ name, text }];
  });
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
  const path = "/vo2-max-calculator";
  const pageUrl = `${siteUrl}${prefix}${path}`;
  const ogImageUrl = `${siteUrl}/og/vo2max-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "vo2MaxCalculator.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  // Locked snippets. optimizeSeoText would pad the English description.
  const title = t("title");
  const description = t("description");

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
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {description ? <p className={styles.sectionBody}>{description}</p> : null}
      {children}
    </section>
  );
}

export default async function Vo2MaxCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const initialDraft = applyVo2Search(query.toString());
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const tPage = await getTranslations({
    locale: lang,
    namespace: "vo2MaxCalculator.page",
  });
  const tLd = await getTranslations({
    locale: lang,
    namespace: "vo2MaxCalculator.jsonLd",
  });

  const faqItems = readFaq(tLd.raw("faq"));
  const differenceFaq = normalizeFaqItems(
    tPage.raw("education.differences.faq"),
  );
  const protocolRows = readProtocolRows(tPage.raw("protocolGuide.rows"));
  const methodRows = readMethodRows(tPage.raw("methodsTable.rows"));
  const proof = readStrings(tPage.raw("proof"));
  const pageUrl = `${siteUrl}${prefix}/vo2-max-calculator`;
  const appId = schemaId(pageUrl, "app");
  const testKeys = ["cooper", "rockport", "beep", "restingHr", "race"] as const;
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
    ...testKeys.map((key) =>
      howToSchema({
        id: schemaId(pageUrl, `howto-${key}`),
        name: tPage(`tests.${key}.title`),
        description: tPage(`education.testing.${key}.setup`),
        steps: readStrings(tPage.raw(`education.testing.${key}.steps`)).map(
          (text) => ({ name: text, text }),
        ),
      }),
    ),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: [
        ...normalizeSchemaFaqItems(tLd.raw("faq")),
        ...normalizeSchemaFaqItems(tPage.raw("education.differences.faq")),
      ],
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

  const jumps = [
    ["#calculator", tPage("jumpLinks.calculator")],
    ["#vo2-scorecard", tPage("jumpLinks.scorecard")],
    ["#what-is-vo2-max", tPage("education.navigation.whatIs")],
    ["#why-vo2-max-matters", tPage("education.navigation.why")],
    ["#levels", tPage("jumpLinks.levels")],
    ["#protocols", tPage("jumpLinks.protocols")],
    ["#tests", tPage("education.navigation.testing")],
    ["#accuracy", tPage("education.navigation.accuracy")],
    ["#why-results-differ", tPage("education.navigation.differences")],
    ["#improve-vo2-max", tPage("education.navigation.improve")],
    ["#faq", tPage("jumpLinks.faq")],
    ["#sources", tPage("education.navigation.sources")],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="calculator" className={styles.section}>
            <Vo2MaxCalculatorClient
              initialDraft={initialDraft}
              hero={
                <header>
                  <p className={styles.kicker}>{tPage("kicker")}</p>
                  <h1 className={styles.heroTitle}>{tPage("title")}</h1>
                  <p className={styles.heroSubtitle}>{tPage("subtitle")}</p>
                  {proof.length > 0 ? (
                    <ul className={styles.proofList}>
                      {proof.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className={styles.heroProduct}>
                    <div className={styles.heroDevices}>
                      <div className={styles.heroPhone}>
                        <Image
                          src={`/ftp-calculator/recording-${["en", "zh", "zh-hant", "ja"].includes(lang) ? lang : "en"}.png`}
                          alt={tPage("heroProduct.phoneAlt")}
                          width={786}
                          height={1704}
                          sizes="184px"
                          loading="eager"
                        />
                      </div>
                      <div className={styles.heroWatch}>
                        <Image
                          src={`/ftp-calculator/watch-${["en", "zh", "zh-hant", "ja"].includes(lang) ? lang : "en"}.png`}
                          alt={tPage("heroProduct.watchAlt")}
                          width={416}
                          height={496}
                          sizes="128px"
                        />
                      </div>
                    </div>
                    <div className={styles.heroProductCopy}>
                      <p className={styles.kicker}>Trainingload.ai</p>
                      <h2>{tPage("heroProduct.title")}</h2>
                      <p>{tPage("heroProduct.body")}</p>
                      <Link
                        href={`${prefix}/ai-coach`}
                        className={styles.inlineLink}
                      >
                        {tPage("heroProduct.link")}{" "}
                        <ArrowRight size={16} aria-hidden />
                      </Link>
                    </div>
                  </div>
                  <nav
                    aria-label={tPage("jumpLinks.calculator")}
                    className={styles.jumpList}
                  >
                    {jumps.map(([href, label]) => (
                      <a key={href} href={href} className={styles.jumpItem}>
                        {label}
                      </a>
                    ))}
                  </nav>
                </header>
              }
            />
          </section>

          <Section
            id="what-is-vo2-max"
            title={tPage("education.definition.title")}
          >
            <div className={styles.shortAnswer}>
              <p>{tPage("education.definition.answer")}</p>
            </div>
            <p className={styles.articleBody}>
              {tPage("education.definition.oxygen")}{" "}
              <a href="#vo2-source-fitness" className={styles.inlineLink}>
                [1]
              </a>
            </p>
            <p className={styles.articleBody}>
              {tPage("education.definition.units")}
            </p>
            <p className={styles.articleBody}>
              <Link
                href={`${prefix}/docs/metrics/maximal-oxygen-uptake`}
                className={styles.inlineLink}
              >
                {tPage("learnMore.vo2Doc")}
              </Link>
            </p>
          </Section>

          <Section
            id="why-vo2-max-matters"
            title={tPage("education.importance.title")}
          >
            <dl className={styles.explanationList}>
              {(["endurance", "progress", "context"] as const).map((key) => (
                <div key={key}>
                  <dt>{tPage(`education.importance.${key}.title`)}</dt>
                  <dd>{tPage(`education.importance.${key}.text`)}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            id="levels"
            title={tPage("education.interpretation.title")}
            description={tPage("levels.intro")}
          >
            <Vo2ReferenceTable />
            <p className={styles.sectionBody}>
              <a
                href="https://www8.garmin.com/manuals/webhelp/GUID-CB71AAE9-99E6-47B4-AB7F-F14BA316E7C6/EN-US/GUID-1FBCCD9E-19E1-4E4C-BD60-1793B5B97EB3.html"
                className={styles.inlineLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                The Cooper Institute / Garmin
              </a>
              {" · "}
              <Link
                href={`${prefix}/docs/metrics/maximal-oxygen-uptake/levels`}
                className={styles.inlineLink}
              >
                {tPage("levels.link")}
              </Link>
            </p>
            <p className={styles.articleBody}>
              {tPage("education.interpretation.example")}
            </p>
            <p className={styles.articleBody}>
              {tPage("education.interpretation.factors")}
            </p>
          </Section>

          <Section
            id="protocols"
            title={tPage("protocolGuide.title")}
            description={tPage("protocolGuide.lead")}
          >
            {protocolRows.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {(
                        [
                          "method",
                          "input",
                          "effort",
                          "repeatability",
                          "bestFor",
                        ] as const
                      ).map((header) => (
                        <th key={header} scope="col">
                          {tPage(`protocolGuide.headers.${header}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {protocolRows.map((row) => (
                      <tr key={row.method}>
                        <th scope="row">{row.method}</th>
                        <td>{row.input}</td>
                        <td className={styles.cellMuted}>{row.effort}</td>
                        <td className={styles.cellMuted}>
                          {row.repeatability}
                        </td>
                        <td>{row.bestFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className={styles.note}>{tPage("safety.body")}</p>
          </Section>

          <Section
            id="tests"
            title={tPage("education.testing.title")}
            description={tPage("tests.subtitle")}
          >
            <p className={styles.articleBody}>
              {tPage("education.calculation")}
            </p>
            <div className={styles.faqList}>
              {testKeys.map((key) => (
                <details
                  key={key}
                  className={styles.faqItem}
                  open={key === "cooper"}
                >
                  <summary>
                    <span>{tPage(`tests.${key}.title`)}</span>
                    <span className={styles.faqIcon} aria-hidden />
                  </summary>
                  <div className={styles.testInstructions}>
                    <p>
                      <strong>
                        {tPage("education.testing.labels.setup")}:{" "}
                      </strong>
                      {tPage(`education.testing.${key}.setup`)}
                    </p>
                    <ol className={styles.instructionSteps}>
                      {readStrings(
                        tPage.raw(`education.testing.${key}.steps`),
                      ).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <p>
                      <strong>
                        {tPage("education.testing.labels.record")}:{" "}
                      </strong>
                      {tPage(`education.testing.${key}.record`)}
                    </p>
                    <p>
                      <strong>
                        {tPage("education.testing.labels.mistake")}:{" "}
                      </strong>
                      {tPage(`education.testing.${key}.mistake`)}
                    </p>
                  </div>
                  <p>{tPage(`tests.${key}.text`)}</p>
                  <div className={styles.formula}>
                    {tPage(`formulas.${key}.equation`)}
                  </div>
                  <p>{tPage(`formulas.${key}.explanation`)}</p>
                  <p>
                    <a
                      href={`#vo2-source-${methodSources[key].key}`}
                      className={styles.inlineLink}
                    >
                      [{methodSources[key].number}]
                    </a>
                  </p>
                </details>
              ))}
            </div>
          </Section>

          {methodRows.length > 0 ? (
            <Section
              id="accuracy"
              title={tPage("education.accuracy.title")}
              description={tPage("education.accuracy.intro")}
            >
              <p className={styles.articleBody}>
                {tPage("education.accuracy.population")}{" "}
                <a href="#vo2-source-rockport" className={styles.inlineLink}>
                  [3]
                </a>{" "}
                <a href="#vo2-source-heartRate" className={styles.inlineLink}>
                  [4]
                </a>
              </p>
              <h3 id="methods" className={styles.articleSubtitle}>
                {tPage("methodsTable.title")}
              </h3>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.methodComparison}`}>
                  <thead>
                    <tr>
                      {(
                        ["method", "need", "pros", "cons", "bestFor"] as const
                      ).map((header) => (
                        <th key={header} scope="col">
                          {tPage(`methodsTable.headers.${header}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {methodRows.map((row) => (
                      <tr key={row.method}>
                        <th scope="row">{row.method}</th>
                        <td>{row.need}</td>
                        <td>
                          {row.prosStrong ? (
                            <strong>{row.prosStrong}</strong>
                          ) : null}
                          {row.prosStrong && row.pros ? " " : null}
                          {row.pros}
                        </td>
                        <td className={styles.cellMuted}>{row.cons}</td>
                        <td>{row.bestFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.note}>{tPage("methodsTable.shortcut")}</p>
              <p className={styles.articleBody}>
                {tPage("education.accuracy.vdot")}{" "}
                <Link
                  href={`${prefix}/vdot-calculator`}
                  className={styles.inlineLink}
                >
                  {tPage("relatedTools.vdot")}
                </Link>
              </p>
            </Section>
          ) : null}

          <Section
            id="why-results-differ"
            title={tPage("education.differences.title")}
            description={tPage("education.differences.intro")}
          >
            <div className={styles.faqList}>
              {differenceFaq.map((item, index) => (
                <details
                  key={item.question}
                  className={styles.faqItem}
                  open={index === 0}
                >
                  <summary>
                    {item.question}
                    <span className={styles.faqIcon} aria-hidden />
                  </summary>
                  {item.answer.split("\n\n").map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </details>
              ))}
            </div>
            <p className={styles.articleBody}>
              {tPage("education.differences.sources")}{" "}
              <a href="#vo2-source-garmin" className={styles.inlineLink}>
                [8]
              </a>{" "}
              <a href="#vo2-source-apple" className={styles.inlineLink}>
                [9]
              </a>
            </p>
          </Section>

          <Section
            id="improve-vo2-max"
            title={tPage("education.improvement.title")}
            description={tPage("education.improvement.intro")}
          >
            <dl className={styles.explanationList}>
              {(["consistency", "intensity", "recovery"] as const).map(
                (key) => (
                  <div key={key}>
                    <dt>{tPage(`education.improvement.${key}.title`)}</dt>
                    <dd>
                      {tPage(`education.improvement.${key}.text`)}
                      {key === "intensity" ? (
                        <>
                          {" "}
                          <a
                            href="#vo2-source-training"
                            className={styles.inlineLink}
                          >
                            [5]
                          </a>
                        </>
                      ) : null}
                    </dd>
                  </div>
                ),
              )}
            </dl>
            <p className={styles.articleBody}>
              {tPage("education.improvement.progress")}
            </p>
            <h3 className={styles.articleSubtitle}>
              {tPage("education.training.title")}
            </h3>
            <p className={styles.articleBody}>
              {tPage("education.training.intro")}
            </p>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.trainingTable}`}>
                <caption className="sr-only">
                  {tPage("education.training.title")}
                </caption>
                <thead>
                  <tr>
                    {(["type", "purpose", "example", "intensity"] as const).map(
                      (key) => (
                        <th key={key} scope="col">
                          {tPage(`education.training.headers.${key}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(["easy", "threshold", "interval"] as const).map((key) => (
                    <tr key={key}>
                      <th scope="row">
                        {tPage(`education.training.rows.${key}.type`)}
                      </th>
                      {(["purpose", "example", "intensity"] as const).map(
                        (column) => (
                          <td key={column}>
                            {tPage(`education.training.rows.${key}.${column}`)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.articleBody}>
              {tPage("education.training.note")}{" "}
              <a href="#vo2-source-training" className={styles.inlineLink}>
                [5]
              </a>{" "}
              <a
                href="#vo2-source-trainingDefinitions"
                className={styles.inlineLink}
              >
                [10]
              </a>
            </p>
            <p className={styles.articleBody}>
              <Link
                href={`${prefix}/vdot-calculator`}
                className={styles.inlineLink}
              >
                {tPage("relatedTools.vdot")}
              </Link>
              {" · "}
              <Link
                href={`${prefix}/lactate-threshold-calculator`}
                className={styles.inlineLink}
              >
                {tPage("relatedTools.threshold")}
              </Link>
            </p>
          </Section>

          <Vo2ResultPromo />
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {tPage("relatedTools.title")}
            </h2>
            <div className={styles.related}>
              {(
                [
                  ["vdot", "/vdot-calculator"],
                  ["load", "/training-load-calculator"],
                  ["threshold", "/lactate-threshold-calculator"],
                  ["tools", "/tools"],
                ] as const
              ).map(([key, path]) => (
                <Link key={key} href={`${prefix}${path}`}>
                  <span>{tPage(`relatedTools.${key}`)}</span>
                  <p>{tPage(`relatedDescriptions.${key}`)}</p>
                  <ArrowRight size={18} aria-hidden />
                </Link>
              ))}
            </div>
          </section>

          <Section
            id="sources"
            title={tPage("education.sources.title")}
            description={tPage("education.sources.intro")}
          >
            <ol className={styles.referenceList}>
              {references.map((reference) => (
                <li key={reference.key} id={`vo2-source-${reference.key}`}>
                  <a
                    href={reference.href}
                    className={styles.inlineLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {reference.label}
                  </a>
                  <p>{tPage(`education.sources.notes.${reference.key}`)}</p>
                </li>
              ))}
            </ol>
          </Section>

          {faqItems.length > 0 ? (
            <Section
              id="faq"
              title={tPage("faq.title")}
              description={tPage("faq.subtitle")}
            >
              <div className={styles.faqList}>
                {faqItems.map((item) => (
                  <details key={item.name} className={styles.faqItem}>
                    <summary>
                      {item.name}
                      <span className={styles.faqIcon} aria-hidden />
                    </summary>
                    {item.text.split("\n\n").map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </details>
                ))}
              </div>
            </Section>
          ) : null}
          <Vo2FooterCta />
        </div>
      </div>
    </div>
  );
}
