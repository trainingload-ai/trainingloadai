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
import { HeartRateZonesCalculatorClient } from "./client";
import { HeartRateZonesFooterCta, HeartRateZonesPromo } from "./promo";
import { readHeartRateZonesInputs } from "./share-inputs";
import styles from "./heart-rate-zones-calculator.module.css";

type FaqLink = "maxHr" | "zone2";

type FaqItem = {
  question: string;
  answer: string;
  links?: FaqLink[];
};

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function readFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      question?: unknown;
      answer?: unknown;
      links?: unknown;
    };
    if (typeof row.question !== "string" || typeof row.answer !== "string")
      return [];
    const links = Array.isArray(row.links)
      ? row.links.filter(
          (link): link is FaqLink => link === "maxHr" || link === "zone2",
        )
      : undefined;
    return [{ question: row.question, answer: row.answer, links }];
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
  const pageUrl = `${siteUrl}${prefix}/heart-rate-zones-calculator`;
  const ogImageUrl = `${siteUrl}/og/heart-rate-zones-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "heartRateZonesCalculator.metadata",
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
        "/heart-rate-zones-calculator",
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

export default async function HeartRateZonesCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialInputs = readHeartRateZonesInputs(await searchParams);
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "heartRateZonesCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "heartRateZonesCalculator.jsonLd",
  });

  const pageFaq = readFaq(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    jump: Record<string, string>;
    related: string;
    docs: string;
    onThisPage: string;
  };
  const pageUrl = `${siteUrl}${prefix}/heart-rate-zones-calculator`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.model.title"),
      text: tPage("howTo.steps.model.body"),
    },
    {
      name: tPage("howTo.steps.values.title"),
      text: tPage("howTo.steps.values.body"),
    },
    {
      name: tPage("howTo.steps.train.title"),
      text: tPage("howTo.steps.train.body"),
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
        { name: t("name"), item: pageUrl },
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(normalizeFaqItems(pageFaq)),
    }),
  ]);

  const faqHrefs: Record<FaqLink, { href: string; label: string }> = {
    maxHr: {
      href: `${prefix}/max-heart-rate-calculator`,
      label: tPage("links.estimateHrmax"),
    },
    zone2: {
      href: `${prefix}/zone-2-heart-rate-calculator`,
      label: tPage("links.zone2"),
    },
  };

  const relatedLinks = [
    [`${prefix}/max-heart-rate-calculator`, tPage("links.estimateHrmax")],
    [`${prefix}/zone-2-heart-rate-calculator`, tPage("links.zone2")],
    [
      `${prefix}/lactate-threshold-calculator`,
      tCommon("lactateThresholdCalculatorAction"),
    ],
    [`${prefix}/power-zones-calculator`, tCommon("powerZonesCalculatorAction")],
    [`${prefix}/docs/metrics/heart-rate/zones`, ui.docs],
  ] as const;

  const methods = (
    <section id="methods" className={styles.methods}>
      <h2 className={styles.boardLabel}>{tPage("methods.title")}</h2>
      <p className={styles.sectionBody}>{tPage("methods.body")}</p>
      <ul className={styles.sourceLinks}>
        <li>
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/13470504/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tPage("methods.karvonen")}
          </a>
        </li>
        <li>
          <a
            href="https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tPage("methods.friel")}
          </a>
        </li>
        <li>
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/21694556/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tPage("methods.maxHr")}
          </a>
        </li>
      </ul>
    </section>
  );

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <HeartRateZonesCalculatorClient
            key={JSON.stringify(initialInputs)}
            initialInputs={initialInputs}
            methods={methods}
            hero={
              <header>
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
                  href={`${prefix}/docs/metrics/heart-rate/zones`}
                />
                <nav aria-label={ui.onThisPage} className={styles.jumpList}>
                  {(
                    [
                      ["#calculator", ui.jump.calculator],
                      ["#result", ui.jump.result],
                      ["#explained", ui.jump.explained],
                      ["#models", ui.jump.models],
                      ["#methods", ui.jump.methods],
                      ["#faq", ui.jump.faq],
                    ] as const
                  ).map(([href, label]) => (
                    <a key={href} href={href} className={styles.jumpItem}>
                      {label}
                    </a>
                  ))}
                </nav>
              </header>
            }
          />
        </div>
      </div>

      <HeartRateZonesPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <Section id="how-to" title={tPage("howTo.title")}>
            <ol className={styles.stepList}>
              {(
                [
                  [
                    "model",
                    tPage("howTo.steps.model.title"),
                    tPage("howTo.steps.model.body"),
                  ],
                  [
                    "values",
                    tPage("howTo.steps.values.title"),
                    tPage("howTo.steps.values.body"),
                  ],
                  [
                    "train",
                    tPage("howTo.steps.train.title"),
                    tPage("howTo.steps.train.body"),
                  ],
                ] as const
              ).map(([key, title, body], index) => (
                <li key={key} className={styles.stepItem}>
                  <span className={styles.stepIndex}>{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p className={styles.sectionBody}>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            id="what-are-heart-rate-zones"
            title={tPage("sections.answer.title")}
            description={tPage("sections.answer.description")}
          >
            <p className={styles.sectionBody}>
              {tPage("sections.answer.body")}
            </p>
            <p className={styles.sectionBody}>
              {tPage("sections.answer.zone2Prompt")}{" "}
              <TrackedLink
                href={`${prefix}/zone-2-heart-rate-calculator`}
                className={styles.textLink}
                eventName="related_tool_clicked"
                eventProperties={{
                  href: `${prefix}/zone-2-heart-rate-calculator`,
                  location: "heart_rate_zones_definition",
                }}
              >
                {tPage("sections.answer.zone2Cta")} →
              </TrackedLink>
            </p>
          </Section>

          <Section
            id="models"
            title={tPage("sections.models.title")}
            description={tPage("sections.models.description")}
          >
            <div className={styles.modelGrid}>
              {(["karvonen", "friel", "mhr"] as const).map((model) => (
                <article key={model} className={styles.modelCard}>
                  <h3>{tPage(`sections.models.labels.${model}`)}</h3>
                  <p>{tPage(`sections.models.cards.${model}`)}</p>
                  <p className={styles.useWhen}>
                    {tPage(`sections.models.useWhen.${model}`)}
                  </p>
                </article>
              ))}
            </div>
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
                    {item.links?.map((link) => (
                      <p key={link}>
                        <TrackedLink
                          href={faqHrefs[link].href}
                          className={styles.textLink}
                          eventName="related_tool_clicked"
                          eventProperties={{
                            href: faqHrefs[link].href,
                            location: "heart_rate_zones_faq",
                          }}
                        >
                          {faqHrefs[link].label}
                        </TrackedLink>
                      </p>
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
          <HeartRateZonesFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
