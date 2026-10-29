import { ProductPreview } from "@/components/calculators/product-preview";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { isSeoIndexedLanguage } from "@/lib/i18n";
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
import { WorkoutEditorClient } from "./client";
import { WorkoutAppPromo, WorkoutFooterCta } from "./promo";
import { readWorkoutShare, serializeWorkoutWorkflow } from "./share-inputs";
import styles from "./workout-editor.module.css";

function readProof(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function isExample(paragraph: string) {
  const text = paragraph.trim();
  return (
    text.startsWith("{") || text.startsWith("warmup") || text.startsWith("Z1 ")
  );
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
  children?: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {description ? <p className={styles.sectionBody}>{description}</p> : null}
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
  const pageUrl = `${siteUrl}${prefix}/workout-editor`;
  const t = await getTranslations({
    locale: lang,
    namespace: "workoutEditor.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "calculator",
    title: t("title"),
    description: t("description"),
  });
  const isIndexedLocale = isSeoIndexedLanguage(lang);

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/workout-editor"),
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
    robots: {
      index: isIndexedLocale,
      follow: true,
      googleBot: {
        index: isIndexedLocale,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function WorkoutEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const initialInputs = readWorkoutShare(await searchParams);
  const shareKey =
    initialInputs.example ??
    serializeWorkoutWorkflow(initialInputs.draft) ??
    "empty";
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "workoutEditor.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "workoutEditor.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const ui = tPage.raw("ui") as {
    badge: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
  };
  const docsHref = `${prefix}/docs/planning/manual-workout-editor`;
  const dslHref = `${prefix}/docs/planning/workout-dsl`;

  const pageUrl = `${siteUrl}${prefix}/workout-editor`;
  const appId = schemaId(pageUrl, "app");
  const howToSteps = [
    {
      name: tPage("howTo.steps.sport.title"),
      text: tPage("howTo.steps.sport.body"),
    },
    {
      name: tPage("howTo.steps.structure.title"),
      text: tPage("howTo.steps.structure.body"),
    },
    {
      name: tPage("howTo.steps.export.title"),
      text: tPage("howTo.steps.export.body"),
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
    [`${prefix}/cycling-training-plan`, tCommon("cyclingTrainingPlanAction")],
    [`${prefix}/brick-workout`, tCommon("brickWorkoutAction")],
    [`${prefix}/css-calculator`, tCommon("cssCalculatorAction")],
    [`${prefix}/ftp-calculator`, tCommon("ftpCalculatorAction")],
    [dslHref, tCommon("workoutDslAction")],
  ] as const;

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.shell}>
        <div className={styles.stack}>
          <div className={styles.lead}>
            <header>
              <div className={styles.leadCopy}>
                <p className={styles.kicker}>{ui.badge}</p>
                <h1 className={styles.heroTitle}>{tPage("title")}</h1>
                <p className={styles.heroSubtitle}>{tPage("subtitle")}</p>
                <ul className={styles.benefitStrip}>
                  {readProof(tPage.raw("proof")).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <nav aria-label="On this page" className={styles.jumpList}>
                  {(
                    [
                      ["#builder", ui.jump.builder],
                      ["#result", ui.jump.export],
                      ["#how-to", ui.jump.howTo],
                      ["#limits", ui.jump.limits],
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
              <ProductPreview
                lang={lang}
                title={tPage("heroProduct.title")}
                body={tPage("heroProduct.body")}
                cta={tPage("heroProduct.cta")}
                href={docsHref}
                variant="plan"
              />
            </header>
            <WorkoutEditorClient
              key={`${shareKey}:${initialInputs.draft.sport}:${initialInputs.draft.name}`}
              docsHref={docsHref}
              dslHref={dslHref}
              lang={lang}
              initialInputs={initialInputs}
            />
          </div>

          <Section id="how-to" title={tPage("howTo.title")}>
            <ol className={styles.stepList}>
              {(
                [
                  [
                    "sport",
                    tPage("howTo.steps.sport.title"),
                    tPage("howTo.steps.sport.body"),
                  ],
                  [
                    "structure",
                    tPage("howTo.steps.structure.title"),
                    tPage("howTo.steps.structure.body"),
                  ],
                  [
                    "export",
                    tPage("howTo.steps.export.title"),
                    tPage("howTo.steps.export.body"),
                  ],
                ] as const
              ).map(([key, title, body], index) => (
                <li key={key} className={styles.stepItem}>
                  <span className={styles.stepIndex}>{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            id="limits"
            title={tPage("sections.limits.title")}
            description={tPage("sections.limits.description")}
          >
            <TrackedLink
              href={docsHref}
              eventName="related_tool_clicked"
              eventProperties={{
                href: docsHref,
                location: "workout_editor_handoff",
              }}
              className={styles.docsLink}
            >
              {ui.docs}
              <span aria-hidden="true"> →</span>
            </TrackedLink>
          </Section>
        </div>
      </div>

      <WorkoutAppPromo lang={lang} />

      <div className={styles.shell}>
        <div className={styles.stack}>
          <section id="faq" className={styles.section}>
            <h2 className={styles.sectionTitle}>{tPage("faqTitle")}</h2>
            <div className={styles.faqList}>
              {pageFaq.map((item, index) => (
                <details
                  key={item.question}
                  className={styles.faqItem}
                  open={index === 0}
                >
                  <summary>{item.question}</summary>
                  <div className={styles.faqAnswer}>
                    {item.answer.split(/\n\n+/).map((paragraph) =>
                      isExample(paragraph) ? (
                        <pre key={paragraph} className={styles.faqCode}>
                          {paragraph.trim()}
                        </pre>
                      ) : (
                        <p key={paragraph}>{paragraph}</p>
                      ),
                    )}
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
          <WorkoutFooterCta lang={lang} />
        </div>
      </div>
    </div>
  );
}
