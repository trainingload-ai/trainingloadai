import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { PowerZonesCalculatorClient } from "./client";
import { PowerZonesAppPromo, PowerZonesFooterCta } from "./promo";
import { readPowerZonesInputs } from "./share-inputs";
import styles from "./power-zones-calculator.module.css";
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

type CogganRow = {
  zone: string;
  name: string;
  percent: string;
  example: string;
};

type ModelCard = {
  id: string;
  body: string;
};

type WorkoutTargetRow = {
  target: string;
  percent: string;
  use: string;
};

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readCogganRows(raw: unknown): CogganRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is CogganRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as CogganRow;
    return (
      typeof item.zone === "string" &&
      typeof item.name === "string" &&
      typeof item.percent === "string" &&
      typeof item.example === "string"
    );
  });
}

const MODEL_CARD_ORDER = ["coggan", "friel", "vance", "stryd"] as const;

function readModelCards(raw: unknown): ModelCard[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  return MODEL_CARD_ORDER.flatMap((id) =>
    typeof record[id] === "string" ? [{ id, body: record[id] }] : [],
  );
}

function readWorkoutTargets(raw: unknown): WorkoutTargetRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is WorkoutTargetRow => {
    if (!row || typeof row !== "object") return false;
    const item = row as WorkoutTargetRow;
    return (
      typeof item.target === "string" &&
      typeof item.percent === "string" &&
      typeof item.use === "string"
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
  const pageUrl = `${siteUrl}${prefix}/power-zones-calculator`;
  const ogImageUrl = `${siteUrl}/og/power-zones-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "powerZonesCalculator.metadata",
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
      languages: absoluteAlternatesForPath(siteUrl, "/power-zones-calculator"),
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

export default async function PowerZonesCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const initial = readPowerZonesInputs(await searchParams);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "powerZonesCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "powerZonesCalculator.jsonLd",
  });
  const tModel = await getTranslations({
    locale: lang,
    namespace: "powerZonesCalculator.client.inputs.model.options",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const cogganRows = readCogganRows(tPage.raw("sections.coggan.rows"));
  const modelCards = readModelCards(tPage.raw("sections.models.cards"));
  const workoutTargets = readWorkoutTargets(
    tPage.raw("sections.targets.rows"),
  );

  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
  };

  const pageUrl = `${siteUrl}${prefix}/power-zones-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.reference.title"),
      text: tPage("howTo.steps.reference.body"),
    },
    {
      name: tPage("howTo.steps.model.title"),
      text: tPage("howTo.steps.model.body"),
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

  const relatedLinks = [
    [`${prefix}/ftp-calculator`, tCommon("ftpCalculatorAction")],
    [
      `${prefix}/critical-power-calculator`,
      tCommon("criticalPowerCalculatorAction"),
    ],
    [
      `${prefix}/lactate-threshold-calculator`,
      tCommon("lactateThresholdCalculatorAction"),
    ],
    [`${prefix}/tss-calculator`, tCommon("tssCalculatorAction")],
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
          <PowerZonesCalculatorClient
            key={JSON.stringify(initial)}
            initial={initial}
            methods={
              <>
                <Section
                  id="definition"
                  title={tPage("sections.definition.title")}
                  description={tPage("sections.definition.answer")}
                >
                  <p className={styles.note}>
                    {tPage("sections.definition.detail")}
                  </p>
                </Section>

                <Section
                  id="coggan"
                  title={tPage("sections.coggan.title")}
                  description={tPage("sections.coggan.description")}
                >
                  <p className={styles.exampleLabel}>
                    {tPage("sections.coggan.exampleLabel")}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <caption className="sr-only">
                        {tPage("sections.coggan.caption")}
                      </caption>
                      <thead>
                        <tr>
                          {(
                            ["zone", "name", "percent", "example"] as const
                          ).map((header) => (
                            <th key={header} scope="col">
                              {tPage(`sections.coggan.headers.${header}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cogganRows.map((row) => (
                          <tr key={row.zone}>
                            <th scope="row">{row.zone}</th>
                            <td>{row.name}</td>
                            <td className={styles.mono}>{row.percent}</td>
                            <td
                              className={`${styles.mono} ${styles.mutedCell}`}
                            >
                              {row.example}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.note}>{tPage("sections.coggan.note")}</p>
                  <p className={styles.sourceNote}>
                    {tPage("sections.coggan.source")}{" "}
                    <a
                      href="https://www.trainingpeaks.com/blog/power-training-levels/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Andrew Coggan · Power Training Levels ↗
                    </a>
                  </p>
                </Section>

                <Section
                  id="targets"
                  title={tPage("sections.targets.title")}
                  description={tPage("sections.targets.description")}
                >
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <caption className="sr-only">
                        {tPage("sections.targets.caption")}
                      </caption>
                      <thead>
                        <tr>
                          {(["target", "percent", "use"] as const).map(
                            (header) => (
                              <th key={header} scope="col">
                                {tPage(
                                  `sections.targets.headers.${header}`,
                                )}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {workoutTargets.map((row) => (
                          <tr key={row.target}>
                            <th scope="row">{row.target}</th>
                            <td className={styles.mono}>{row.percent}</td>
                            <td>{row.use}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.note}>
                    {tPage("sections.targets.note")}
                  </p>
                </Section>

                <Section
                  id="reference"
                  title={tPage("sections.reference.title")}
                  description={tPage("sections.reference.description")}
                >
                  <div className={styles.cardGrid}>
                    {(["ftp", "cp", "models"] as const).map((key) => (
                      <article className={styles.infoCard} key={key}>
                        <h3>{tPage(`sections.reference.cards.${key}.title`)}</h3>
                        <p>{tPage(`sections.reference.cards.${key}.body`)}</p>
                      </article>
                    ))}
                  </div>
                </Section>

                <Section
                  id="models"
                  title={tPage("sections.models.title")}
                  description={tPage("sections.models.description")}
                >
                  <div className={styles.modelGroups}>
                    {(
                      [
                        ["cycling", ["coggan", "friel"]],
                        ["running", ["vance", "stryd"]],
                      ] as const
                    ).map(([sport, ids]) => (
                      <div className={styles.modelGroup} key={sport}>
                        <h3>{tPage(`sections.models.groups.${sport}`)}</h3>
                        {modelCards
                          .filter((card) => ids.some((id) => id === card.id))
                          .map((card) => (
                            <article key={card.id} className={styles.infoCard}>
                              <h4>{tModel(card.id)}</h4>
                              <p>{card.body}</p>
                            </article>
                          ))}
                      </div>
                    ))}
                  </div>
                  <p className={styles.sourceNote}>
                    {tPage("sections.models.sourceLabel")}{" "}
                    <a
                      href="https://www.trainingpeaks.com/blog/power-training-levels/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Coggan
                    </a>
                    {" · "}
                    <a
                      href="https://joefrieltraining.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Joe Friel
                    </a>
                    {" · "}
                    <a
                      href="https://www.velopress.com/books/run-with-power/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Jim Vance, Run with Power
                    </a>
                    {" · "}
                    <a
                      href="https://www.stryd.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Stryd
                    </a>
                  </p>
                  <details className={styles.formulaDetails}>
                    <summary>{tPage("formula.title")}</summary>
                    <div className={styles.faqAnswer}>
                      <p className={styles.formula}>
                        {tPage("formula.equation")}
                      </p>
                      <p>{tPage("formula.body")}</p>
                    </div>
                  </details>
                </Section>

                <Section
                  id="limits"
                  title={tPage("sections.limits.title")}
                  description={tPage("sections.limits.description")}
                >
                  <ul className={styles.plainList}>
                    {(tPage.raw("sections.limits.items") as string[]).map(
                      (item) => (
                        <li key={item}>{item}</li>
                      ),
                    )}
                  </ul>
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
                      ["#coggan", ui.jump.explained],
                      ["#targets", ui.jump.targets],
                      ["#models", ui.jump.models],
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

      <PowerZonesAppPromo lang={lang} />
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
              {relatedLinks.map(([href, label], index) => (
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
                  <strong>{label}</strong>
                  <span>{tPage(`relatedDescriptions.${index}`)}</span>
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
          <PowerZonesFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
